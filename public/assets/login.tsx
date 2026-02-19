import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createRoot } from 'react-dom/client';

type ResLogin = { ok: boolean; nextRoute?: string; pesan?: string };

async function kirimLogin(username: string, password: string): Promise<ResLogin> {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  return (await res.json()) as ResLogin;
}

function LoginApp(): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 1700);
    return () => window.clearTimeout(t);
  }, [toast]);

  const spring = useMemo(
    () =>
      reduceMotion
        ? { duration: 0 }
        : {
            type: 'spring' as const,
            stiffness: 210,
            damping: 24,
            mass: 0.7,
          },
    [reduceMotion],
  );

  async function aksiMasuk(): Promise<void> {
    const user = username.trim();
    const pass = password;
    if (!user || !pass) {
      setErrorText('Username and password are required');
      setToast('Fill username and password');
      return;
    }

    setLoading(true);
    setErrorText('');

    try {
      const hasil = await kirimLogin(user, pass);
      if (!hasil.ok) {
        setErrorText(hasil.pesan || 'Login failed');
        setToast('Login failed');
        return;
      }

      setToast('Login success');
      window.location.href = hasil.nextRoute || '/dashboard';
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
      setToast('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="appShell">
      <motion.main
        className="appContainer appContainerLogin"
        initial={reduceMotion ? undefined : { opacity: 0, filter: 'blur(12px)', y: 20 }}
        animate={reduceMotion ? undefined : { opacity: 1, filter: 'blur(0px)', y: 0 }}
        transition={spring}
      >
        <motion.section className="surfaceCard heroCard" layout transition={spring}>
          <p className="heroTag">Nobodyzz</p>
          <h1 className="heroTitle">Welcome</h1>
          <p className="heroSubtitle">Sign In First</p>
          <div className="heroActions">
          </div>
        </motion.section>

        <motion.section
          className="surfaceCard loginPanel"
          initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ ...spring, delay: reduceMotion ? 0 : 0.08 }}
        >
          <label className="fieldLabel" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            className="input"
            placeholder="admin"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <label className="fieldLabel" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="input"
            placeholder="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void aksiMasuk();
            }}
          />

          <div className="spacer12" />

          <motion.button
            type="button"
            className="btn btnPrimary btnWide"
            onClick={() => void aksiMasuk()}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            disabled={loading}
          >
            {loading ? 'Signing in' : 'Sign in'}
          </motion.button>

          <div className="spacer12" />

          <motion.button
            type="button"
            className="btn btnGhost btnWide"
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            onClick={() => {
              window.location.href = '/register';
            }}
            disabled={loading}
          >
            Register
          </motion.button>

          <p className="dangerText">{errorText}</p>
        </motion.section>

        <p className="metaText footerNote">Don't Have Account? Register First</p>
      </motion.main>

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

const host = document.getElementById('app-login');
if (host) {
  createRoot(host).render(<LoginApp />);
}
