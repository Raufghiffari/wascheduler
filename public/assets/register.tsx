import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createRoot } from 'react-dom/client';

type ResRegister = { ok: boolean; nextRoute?: string; pesan?: string };

function buatEncryptorAcak(): string {
  const alfabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  let hasil = '';
  for (let i = 0; i < 24; i += 1) {
    const idx = Math.floor(Math.random() * alfabet.length);
    hasil += alfabet[idx];
  }
  return hasil;
}

async function kirimRegister(payload: {
  name: string;
  password: string;
  developerAccess: string;
  encryptor: string;
}): Promise<ResRegister> {
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return (await res.json()) as ResRegister;
}

function RegisterApp(): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [developerAccess, setDeveloperAccess] = useState('');
  const [encryptor, setEncryptor] = useState(() => buatEncryptorAcak());
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

  async function aksiRegister(): Promise<void> {
    const nama = name.trim();
    const pass = password;
    const akses = developerAccess.trim();
    const enc = encryptor.trim();

    if (!nama || !pass || !akses) {
      setErrorText('Name, password, and developer access are required');
      setToast('Complete all required fields');
      return;
    }

    setLoading(true);
    setErrorText('');
    try {
      const hasil = await kirimRegister({
        name: nama,
        password: pass,
        developerAccess: akses,
        encryptor: enc || buatEncryptorAcak(),
      });

      if (!hasil.ok) {
        setErrorText(hasil.pesan || 'Register failed');
        setToast('Register failed');
        return;
      }

      setToast('Register success');
      window.location.href = hasil.nextRoute || '/authorize';
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
          <p className="heroTag">WA Status Scheduler</p>
          <h1 className="heroTitle">Register</h1>
          <p className="heroSubtitle">Create new user agent account with developer access code</p>
        </motion.section>

        <motion.section
          className="surfaceCard loginPanel"
          initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ ...spring, delay: reduceMotion ? 0 : 0.08 }}
        >
          <label className="fieldLabel" htmlFor="name">
            Name Of User
          </label>
          <input
            id="name"
            className="input"
            placeholder="new-user"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <label className="fieldLabel" htmlFor="encryptor">
            User Encryptor
          </label>
          <div className="row rowNoWrap">
            <input
              id="encryptor"
              className="input"
              placeholder="S!67sX1bb0X81244nshSx"
              value={encryptor}
              onChange={(e) => setEncryptor(e.target.value)}
            />
            <motion.button
              type="button"
              className="btn btnGhost btnCompact"
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              onClick={() => setEncryptor(buatEncryptorAcak())}
              disabled={loading}
            >
              Random
            </motion.button>
          </div>

          <label className="fieldLabel" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="input"
            placeholder="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <label className="fieldLabel" htmlFor="developerAccess">
            Developer Access
          </label>
          <input
            id="developerAccess"
            className="input"
            placeholder="access code from .env"
            value={developerAccess}
            onChange={(e) => setDeveloperAccess(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void aksiRegister();
            }}
          />

          <div className="spacer12" />
          <motion.button
            type="button"
            className="btn btnPrimary btnWide"
            onClick={() => void aksiRegister()}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            disabled={loading}
          >
            {loading ? 'Registering' : 'Register Now'}
          </motion.button>

          <div className="spacer12" />
          <motion.button
            type="button"
            className="btn btnGhost btnWide"
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            onClick={() => {
              window.location.href = '/login';
            }}
            disabled={loading}
          >
            Back to Login
          </motion.button>

          <p className="dangerText">{errorText}</p>
        </motion.section>
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

const host = document.getElementById('app-register');
if (host) {
  createRoot(host).render(<RegisterApp />);
}
