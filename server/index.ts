
import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import path from 'path';

import {
  krmhlmnathrz,
  krmhlmndshbrd,
  krmhlmnlgn,
  krmhlmnrgstr,
} from './halaman';
import { bthlgn, tntknrutedarisssn } from './auth';
import { buatrtrapi } from './rute-api';
import { DbBusyError, pstkndtbsada, tmbhlog } from '../db/penyimpanan';
import { amblgrdinstnc, InstanceLockedError } from '../shared/instance-guard';

const port = Number(process.env.PORT || 3000);
let sudahPasangHandlerShutdown = false;

type HandlerAsync = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) => Promise<void>;

function bngksasync(handler: HandlerAsync): express.RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}

export async function buatsrvr(): Promise<express.Express> {
  await pstkndtbsada();

  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false,
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

  const ekstensiAssetDiizinkan = new Set(['.js', '.css', '.svg', '.lottie', '.json']);
  app.use('/assets', (req, res, next) => {
    const ekstensi = path.extname(req.path || '').toLowerCase();
    if (!ekstensiAssetDiizinkan.has(ekstensi)) {
      res.status(404).end();
      return;
    }
    next();
  });

  app.use('/assets', express.static(path.join(process.cwd(), 'public', 'assets')));

  app.get('/', bngksasync(async (req, res) => {
    const nextRoute = await tntknrutedarisssn(req);
    if (nextRoute === '/login') {
      krmhlmnlgn(res);
      return;
    }
    res.redirect(nextRoute);
  }));

  app.get('/login', bngksasync(async (req, res) => {
    const nextRoute = await tntknrutedarisssn(req);
    if (nextRoute === '/login') {
      krmhlmnlgn(res);
      return;
    }
    res.redirect(nextRoute);
  }));

  app.get('/login.html', bngksasync(async (req, res) => {
    const nextRoute = await tntknrutedarisssn(req);
    if (nextRoute === '/login') {
      krmhlmnlgn(res);
      return;
    }
    res.redirect(nextRoute);
  }));

  app.get('/register', bngksasync(async (req, res) => {
    const nextRoute = await tntknrutedarisssn(req);
    if (nextRoute === '/login') {
      krmhlmnrgstr(res);
      return;
    }
    res.redirect(nextRoute);
  }));

  app.get('/register.html', bngksasync(async (req, res) => {
    const nextRoute = await tntknrutedarisssn(req);
    if (nextRoute === '/login') {
      krmhlmnrgstr(res);
      return;
    }
    res.redirect(nextRoute);
  }));

  app.get('/authorize', bthlgn, bngksasync(async (req, res) => {
    const nextRoute = await tntknrutedarisssn(req);
    if (nextRoute === '/dashboard') {
      res.redirect('/dashboard');
      return;
    }
    krmhlmnathrz(res);
  }));

  app.get('/authorize.html', bthlgn, bngksasync(async (req, res) => {
    const nextRoute = await tntknrutedarisssn(req);
    if (nextRoute === '/dashboard') {
      res.redirect('/dashboard');
      return;
    }
    krmhlmnathrz(res);
  }));

  app.get('/dashboard', bthlgn, bngksasync(async (req, res) => {
    const nextRoute = await tntknrutedarisssn(req);
    if (nextRoute === '/authorize') {
      res.redirect('/authorize');
      return;
    }
    krmhlmndshbrd(res);
  }));

  app.get('/dashboard-frame', bthlgn, (_req, res) => krmhlmndshbrd(res));
  app.get('/dashboard-frame.html', bthlgn, (_req, res) => krmhlmndshbrd(res));

  app.get('/dashboard.html', bthlgn, bngksasync(async (req, res) => {
    const nextRoute = await tntknrutedarisssn(req);
    if (nextRoute === '/authorize') {
      res.redirect('/authorize');
      return;
    }
    krmhlmndshbrd(res);
  }));

  app.use('/api', buatrtrapi());

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const pesan = err instanceof Error ? err.message : 'Terjadi error.';

    // eslint-disable-next-line no-console
    console.error('[server] error:', err);

    if (req.path.startsWith('/api/')) {
      if (err instanceof DbBusyError) {
        void tmbhlog('db_busy', {
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

  app.get('*', (_req, res) => res.redirect('/'));

  return app;
}

function psnghndlrshtdwn(aksiLepas: () => Promise<void>): void {
  if (sudahPasangHandlerShutdown) return;
  sudahPasangHandlerShutdown = true;

  let sedangLepas = false;
  const lpsskl = async (): Promise<void> => {
    if (sedangLepas) return;
    sedangLepas = true;
    await aksiLepas().catch(() => null);
  };

  process.once('SIGINT', () => {
    void lpsskl().finally(() => process.exit(0));
  });

  process.once('SIGTERM', () => {
    void lpsskl().finally(() => process.exit(0));
  });

  process.once('exit', () => {
    void lpsskl();
  });
}

export async function jlnknsrvr(): Promise<void> {
  try {
    const guard = await amblgrdinstnc('server');

    psnghndlrshtdwn(async () => {
      await guard.lepas();
    });
  } catch (err) {
    if (err instanceof InstanceLockedError) {
      await tmbhlog('instance_guard', {
        proses: 'server',
        status: 'ditolak',
        pesan: err.message,
      }).catch(() => null);
    }
    throw err;
  }

  const app = await buatsrvr();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] jalan di http://localhost:${port}`);
  });
}

if (require.main === module) {
  jlnknsrvr().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[server] gagal start:', err);
    process.exit(1);
  });
}
