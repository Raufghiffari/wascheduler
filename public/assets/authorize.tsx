import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createRoot } from 'react-dom/client';

type StatusWa = {
  status: 'mati' | 'menghubungkan' | 'terhubung' | 'logout';
  terakhirUpdateMs: number;
  nomor: string | null;
  catatan: string | null;
  qrDataUrl: string | null;
};

type ResWa = { ok: boolean; wa?: StatusWa; pesan?: string };
type ResSession = {
  ok: boolean;
  nextRoute?: '/login' | '/authorize' | '/dashboard';
  session?: { userId: string; username: string };
};

function frmthshusrid(userId: string): string {
  return `/authorize#Userid:${encodeURIComponent(userId)}`;
}

function trjmhcttnwa(catatan: string | null): string {
  const sumber = String(catatan || '').trim();
  if (!sumber) return 'Waiting for QR';
  const map: Record<string, string> = {
    'Membuat socket baru...': 'Wait And Relax Shouldn;t Take Long',
    'Scan QR di authorize page.': 'Scan This QR On Your Nchat Application',
    'Terhubung.': 'Connected',
    'Putus, mencoba reconnect...': 'Hmmp, Your Nchat Is Disconnecting, So We will Try Reconnecting Again',
    'Perangkat logout. Reset sesi otomatis lalu buat QR baru...': 'Recreating Nchat Pairing Code',
  };
  return map[sumber] || sumber;
}

async function amblsssn(): Promise<ResSession> {
  const res = await fetch('/api/session');
  if (res.status === 401) {
    window.location.href = '/login';
    return { ok: false, nextRoute: '/login' };
  }
  return (await res.json()) as ResSession;
}

async function amblsttswa(): Promise<StatusWa> {
  const res = await fetch('/api/wa/status');
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Session expired');
  }
  const json = (await res.json()) as ResWa;
  if (!res.ok || !json.ok || !json.wa) {
    throw new Error(json.pesan || 'Failed to load WA status');
  }
  return json.wa;
}

function Athrzapp(): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const [wa, setWa] = useState<StatusWa | null>(null);
  const [username, setUsername] = useState('');
  const [userId, setUserId] = useState('');
  const [toast, setToast] = useState('');
  const [showGate, setShowGate] = useState(true);

  const spring = useMemo(
    () =>
      reduceMotion
        ? { duration: 0 }
        : {
            type: 'spring' as const,
            stiffness: 210,
            damping: 24,
            mass: 0.72,
          },
    [reduceMotion],
  );

  const springGate = useMemo(
    () =>
      reduceMotion
        ? { duration: 0 }
        : {
            type: 'spring' as const,
            stiffness: 160,
            damping: 20,
            mass: 0.92,
          },
    [reduceMotion],
  );

  const springMorph = useMemo(
    () =>
      reduceMotion
        ? { duration: 0 }
        : {
            type: 'spring' as const,
            stiffness: 118,
            damping: 17,
            mass: 0.98,
          },
    [reduceMotion],
  );

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 1800);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    let aktif = true;

    async function muatawl(): Promise<void> {
      const sesi = await amblsssn();
      if (!aktif) return;
      if (!sesi.ok) return;

      const sid = String(sesi.session?.userId || '').trim();
      setUsername(sesi.session?.username || '');
      setUserId(sid);

      if (sid) {
        window.history.replaceState(null, '', frmthshusrid(sid));
      }

      if (sesi.nextRoute === '/dashboard') {
        setShowGate(false);
      }

      const status = await amblsttswa();
      if (!aktif) return;
      setWa(status);
      if (status.status === 'terhubung') {
        setShowGate(false);
      }
    }

    void muatawl().catch((err) => setToast(err instanceof Error ? err.message : String(err)));

    return () => {
      aktif = false;
    };
  }, []);

  useEffect(() => {
    const poll = window.setInterval(() => {
      void amblsttswa()
        .then((status) => {
          setWa(status);
          if (status.status === 'terhubung') {
            setShowGate(false);
            return;
          }
          setShowGate(true);
        })
        .catch(() => null);
    }, 1500);

    return () => window.clearInterval(poll);
  }, []);

  useEffect(() => {
    if (!userId) return;
    window.history.replaceState(null, '', frmthshusrid(userId));
  }, [userId, showGate]);

  const waCatatan = trjmhcttnwa(wa?.catatan || null);
  const modeQr = wa?.qrDataUrl ? 'qr' : 'connecting';

  return (
    <div className="authorizeLayout">
      <iframe
        title="dashboard-background"
        src="/dashboard-frame?embed=1"
        className={`authorizeDashboardFrame${showGate ? ' isLocked' : ''}`}
      />

      <AnimatePresence>
        {showGate ? (
          <motion.div
            key="overlay"
            className="authorizeOverlay"
            initial={reduceMotion ? undefined : { opacity: 0 }}
            animate={reduceMotion ? undefined : { opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={springGate}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showGate ? (
          <motion.mnx
            key="gate"
            className="authorizeGate"
            initial={reduceMotion ? undefined : { opacity: 0, scale: 0.92, y: 24, filter: 'blur(14px)' }}
            animate={reduceMotion ? undefined : { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.88, y: -22, filter: 'blur(20px)' }}
            transition={springGate}
          >
            <section className="surfaceCard authorizeCard">
              <p className="heroTag">Authorize Your Nchat</p>
              <h1 className="heroTitle heroTitleSm">Scan With Your Nchat</h1>
              <p className="heroSubtitle">
                {username ? `User: ${username}` : 'User session active'}
              </p>

              <motion.div
                className="qrBarWrap qrMorphShell"
                initial={false}
                animate={
                  reduceMotion
                    ? undefined
                    : {
                        height: modeQr === 'qr' ? 356 : 156,
                        scale: modeQr === 'qr' ? 1 : 0.965,
                        filter: 'blur(0px)',
                      }
                }
                transition={springMorph}
              >
                <AnimatePresence mode="wait">
                  {modeQr === 'qr' ? (
                    <motion.div
                      key="qr"
                      className="qrState qrStateQr"
                      initial={reduceMotion ? undefined : { opacity: 0, scale: 1.14, y: 20, filter: 'blur(20px)' }}
                      animate={reduceMotion ? undefined : { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                      exit={reduceMotion ? undefined : { opacity: 0, scale: 0.8, y: -14, filter: 'blur(22px)' }}
                      transition={springMorph}
                    >
                      <motion.img
                        className="qrImage qrImageCenter"
                        src={wa?.qrDataUrl || ''}
                        alt="WhatsApp QR code"
                        initial={reduceMotion ? undefined : { scale: 1.08, filter: 'blur(12px)' }}
                        animate={reduceMotion ? undefined : { scale: 1, filter: 'blur(0px)' }}
                        exit={reduceMotion ? undefined : { scale: 0.86, filter: 'blur(20px)' }}
                        transition={springMorph}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="connecting"
                      className="qrState qrStateConnecting"
                      initial={reduceMotion ? undefined : { opacity: 0, scale: 0.9, y: 12, filter: 'blur(2px)' }}
                      animate={reduceMotion ? undefined : { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                      exit={reduceMotion ? undefined : { opacity: 0, scale: 1.04, y: -6, filter: 'blur(4px)' }}
                      transition={springMorph}
                    >
                      <div className="qrBarLoading">
                        <motion.div
                          className="qrBarFill"
                          initial={reduceMotion ? undefined : { scaleX: 0.86, filter: 'blur(0.5px)' }}
                          animate={reduceMotion ? undefined : { scaleX: 1, filter: 'blur(0px)' }}
                          exit={reduceMotion ? undefined : { scaleX: 1.08, filter: 'blur(2px)' }}
                          transition={springMorph}
                        />
                      </div>
                      <motion.div
                        className="qrConnectingText"
                        initial={reduceMotion ? undefined : { opacity: 0, y: 8, filter: 'blur(2px)' }}
                        animate={reduceMotion ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }}
                        exit={reduceMotion ? undefined : { opacity: 0, y: -6, filter: 'blur(2px)' }}
                        transition={springMorph}
                      >
                        Syncing Your Nchat Application, Shit Down And Relax | Shouldn't Take Long
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              <p className="metaText">{waCatatan}</p>
            </section>
          </motion.mnx>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {toast ? (
          <motion.div
            className="toast"
            initial={reduceMotion ? undefined : { opacity: 0, y: 16, filter: 'blur(8px)' }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 12 }}
            transition={spring}
          >
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

const host = document.getElementById('app-authorize');
if (host) {
  createRoot(host).render(<Athrzapp />);
}
