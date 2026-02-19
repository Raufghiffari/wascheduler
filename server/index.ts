// server/index.ts
// Entrypoint Express untuk dashboard lokal.

import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import path from 'path';

import {
  kirimHalamanAuthorize,
  kirimHalamanDashboard,
  kirimHalamanLogin,
  kirimHalamanRegister,
} from './halaman';
import { butuhLogin, tentukanRuteDariSession } from './auth';
import { buatRouterApi } from './rute-api';
import { DbBusyError, pastikanDatabaseAda, tambahLog } from '../db/penyimpanan';
import { ambilGuardInstance, InstanceLockedError } from '../shared/instance-guard';

const port = Number(process.env.PORT || 3000);
let sudahPasangHandlerShutdown = false;

type HandlerAsync = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => Promise<void>;

function bungkusAsync(handler: HandlerAsync): express.RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}

// Fungsi ini membuat instance Express + semua middleware/routes.
export async function buatServer(): Promise<express.Express> {
  await pastikanDatabaseAda();

  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false, // biar gampang untuk UI lokal (bisa diketatkan nanti)
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
      originAgentCluster: false,
    }),
  );

  app.use(
    session({
      name: 'sid',
      secret: process.env.SESSION_SECRET || 'ganti_ini_dengan_acak_panjang',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
      },
    }),
  );

  const ekstensiFontDiizinkan = new Set(['.otf']);
  app.use('/fonts', (req, res, next) => {
    const ekstensi = path.extname(req.path || '').toLowerCase();
    if (!ekstensiFontDiizinkan.has(ekstensi)) {
      res.status(404).end();
      return;
    }
    next();
  });

  app.use('/fonts', express.static(path.join(process.cwd(), 'fonts')));

  const ekstensiAssetDiizinkan = new Set(['.js', '.css']);
  app.use('/assets', (req, res, next) => {
    const ekstensi = path.extname(req.path || '').toLowerCase();
    if (!ekstensiAssetDiizinkan.has(ekstensi)) {
      res.status(404).end();
      return;
    }
    next();
  });

  // Static assets UI
  app.use('/assets', express.static(path.join(process.cwd(), 'public', 'assets')));

  // Halaman
  app.get('/', bungkusAsync(async (req, res) => {
    const nextRoute = await tentukanRuteDariSession(req);
    if (nextRoute === '/login') {
      kirimHalamanLogin(res);
      return;
    }
    res.redirect(nextRoute);
  }));

  app.get('/login', bungkusAsync(async (req, res) => {
    const nextRoute = await tentukanRuteDariSession(req);
    if (nextRoute === '/login') {
      kirimHalamanLogin(res);
      return;
    }
    res.redirect(nextRoute);
  }));

  app.get('/login.html', bungkusAsync(async (req, res) => {
    const nextRoute = await tentukanRuteDariSession(req);
    if (nextRoute === '/login') {
      kirimHalamanLogin(res);
      return;
    }
    res.redirect(nextRoute);
  }));

  app.get('/register', bungkusAsync(async (req, res) => {
    const nextRoute = await tentukanRuteDariSession(req);
    if (nextRoute === '/login') {
      kirimHalamanRegister(res);
      return;
    }
    res.redirect(nextRoute);
  }));

  app.get('/register.html', bungkusAsync(async (req, res) => {
    const nextRoute = await tentukanRuteDariSession(req);
    if (nextRoute === '/login') {
      kirimHalamanRegister(res);
      return;
    }
    res.redirect(nextRoute);
  }));

  app.get('/authorize', butuhLogin, bungkusAsync(async (req, res) => {
    const nextRoute = await tentukanRuteDariSession(req);
    if (nextRoute === '/dashboard') {
      res.redirect('/dashboard');
      return;
    }
    kirimHalamanAuthorize(res);
  }));

  app.get('/authorize.html', butuhLogin, bungkusAsync(async (req, res) => {
    const nextRoute = await tentukanRuteDariSession(req);
    if (nextRoute === '/dashboard') {
      res.redirect('/dashboard');
      return;
    }
    kirimHalamanAuthorize(res);
  }));

  app.get('/dashboard', butuhLogin, bungkusAsync(async (req, res) => {
    const nextRoute = await tentukanRuteDariSession(req);
    if (nextRoute === '/authorize') {
      res.redirect('/authorize');
      return;
    }
    kirimHalamanDashboard(res);
  }));

  // Versi frame untuk ditaruh di belakang authorize gate.
  // Tetap butuh login, tapi tidak redirect meski WA belum terhubung.
  app.get('/dashboard-frame', butuhLogin, (_req, res) => kirimHalamanDashboard(res));
  app.get('/dashboard-frame.html', butuhLogin, (_req, res) => kirimHalamanDashboard(res));

  app.get('/dashboard.html', butuhLogin, bungkusAsync(async (req, res) => {
    const nextRoute = await tentukanRuteDariSession(req);
    if (nextRoute === '/authorize') {
      res.redirect('/authorize');
      return;
    }
    kirimHalamanDashboard(res);
  }));

  // API
  app.use('/api', buatRouterApi());

  // Error handler (penting untuk error upload/multer, dsb)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const pesan = err instanceof Error ? err.message : 'Terjadi error.';

    // eslint-disable-next-line no-console
    console.error('[server] error:', err);

    if (req.path.startsWith('/api/')) {
      if (err instanceof DbBusyError) {
        void tambahLog('db_busy', {
          proses: 'server_api',
          path: req.path,
          pesan: err.message,
        }).catch(() => null);
        res.status(503).json({ ok: false, pesan: 'Server sedang sibuk, coba lagi sebentar.' });
        return;
      }

      res.status(400).json({ ok: false, pesan });
      return;
    }

    res.status(500).send('Error');
  });

  // Fallback
  app.get('*', (_req, res) => res.redirect('/'));

  return app;
}

function pasangHandlerShutdown(aksiLepas: () => Promise<void>): void {
  if (sudahPasangHandlerShutdown) return;
  sudahPasangHandlerShutdown = true;

  let sedangLepas = false;
  const lepasSekali = async (): Promise<void> => {
    if (sedangLepas) return;
    sedangLepas = true;
    await aksiLepas().catch(() => null);
  };

  process.once('SIGINT', () => {
    void lepasSekali().finally(() => process.exit(0));
  });

  process.once('SIGTERM', () => {
    void lepasSekali().finally(() => process.exit(0));
  });

  process.once('exit', () => {
    void lepasSekali();
  });
}

// Fungsi ini menjalankan server HTTP.
export async function jalankanServer(): Promise<void> {
  try {
    const guard = await ambilGuardInstance('server');

    pasangHandlerShutdown(async () => {
      await guard.lepas();
    });
  } catch (err) {
    if (err instanceof InstanceLockedError) {
      await tambahLog('instance_guard', {
        proses: 'server',
        status: 'ditolak',
        pesan: err.message,
      }).catch(() => null);
    }
    throw err;
  }

  const app = await buatServer();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] jalan di http://localhost:${port}`);
  });
}

// Jalankan kalau file ini dieksekusi langsung.
if (require.main === module) {
  jalankanServer().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[server] gagal start:', err);
    process.exit(1);
  });
}
