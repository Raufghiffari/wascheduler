import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createRoot } from 'react-dom/client';

type ResRegister = { ok: boolean; nextRoute?: string; pesan?: string };

function buatencryptrack(): string {
  const alfabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  let hasil = '';
  for (let i = 0; i < 24; i += 1) {
    const idx = Math.floor(Math.random() * alfabet.length);
    hasil += alfabet[idx];
  }
  return hasil;
}

async function krmrgstr(payload: {
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

function Rgstrapp(): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const [heroImageBroken, setHeroImageBroken] = useState(false);
  const [showAdvancedAccess, setShowAdvancedAccess] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [developerAccess, setDeveloperAccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showDeveloperAccess, setShowDeveloperAccess] = useState(false);
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

  const heroImageSrc = '/assets/auth-hero.svg?v=2';

  async function aksrgstr(): Promise<void> {
    const nama = name.trim();
    const pass = password;
    const akses = developerAccess.trim();

    if (!nama || !pass || !akses) {
      if (!akses) setShowAdvancedAccess(true);
      setErrorText('Name, password, and developer access are required');
      setToast('Complete all required fields');
      return;
    }

    setLoading(true);
    setErrorText('');
    try {
      const hasil = await krmrgstr({
        name: nama,
        password: pass,
        developerAccess: akses,
        encryptor: buatencryptrack(),
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
    <div className="auth-shell auth-shell--register">
      <motion.mnx
        className="auth-stage"
        initial={reduceMotion ? undefined : { opacity: 0, y: 18 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={spring}
      >
        <section className="auth-card auth-card--register">
          <aside className="auth-desktop-hero" aria-hidden="true">
            {heroImageBroken ? (
              <div className="auth-hero-fallback" aria-hidden="true">
                <span>N</span>
              </div>
            ) : (
              <img
                src={heroImageSrc}
                alt=""
                className="auth-desktop-hero-image"
                onError={() => setHeroImageBroken(true)}
              />
            )}
            <h2 className="auth-desktop-hero-title">Let's Create an Account</h2>
            <p className="auth-desktop-hero-subtitle">Create your account then continue to authorize your WhatsApp.</p>
            <div className="auth-dots auth-dots--desktop">
              <span className="auth-dot" />
              <span className="auth-dot" />
              <span className="auth-dot is-active" />
            </div>
          </aside>

          <motion.section
            className="auth-screen auth-screen--register"
            initial={reduceMotion ? undefined : { opacity: 0, y: 14 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={spring}
          >
            <div className="auth-topbar">
              <button
                type="button"
                className="auth-back-btn"
                aria-label="Back to login"
                onClick={() => {
                  window.location.href = '/login';
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <span className="auth-brand auth-brand--inline">Nchat</span>
            </div>

            <h1 className="auth-heading auth-heading--register">
              Let's Create
              <br />
              an Account
            </h1>

            <form
              className="auth-form"
              onSubmit={(e) => {
                e.preventDefault();
                void aksrgstr();
              }}
            >
              <label htmlFor="register-name" className="auth-visually-hidden">
                Username
              </label>
              <div className="auth-input-shell">
                <span className="auth-input-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 20a8 8 0 0116 0" />
                    <circle cx="18.5" cy="5.5" r="2.4" />
                  </svg>
                </span>
                <input
                  id="register-name"
                  placeholder="Enter your username"
                  autoComplete="username"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                />
              </div>

              <label htmlFor="register-password" className="auth-visually-hidden">
                Password
              </label>
              <div className="auth-input-shell">
                <span className="auth-input-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="11" width="14" height="10" rx="5" />
                    <path d="M8 11V8a4 4 0 118 0v3" />
                  </svg>
                </span>
                <input
                  id="register-password"
                  placeholder="Enter your password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="auth-eye-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  disabled={loading}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.6a3 3 0 004.2 4.2" />
                      <path d="M9.9 5.2A10.7 10.7 0 0112 5c5.5 0 9.4 3.4 10.8 7-0.6 1.6-1.7 3.1-3.2 4.3" />
                      <path d="M6.4 6.4C4.4 7.7 3 9.7 2.2 12c1.4 3.6 5.3 7 10.8 7 1.3 0 2.5-0.2 3.6-0.6" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.2 12C3.6 8.4 7.5 5 13 5s9.4 3.4 10.8 7c-1.4 3.6-5.3 7-10.8 7S3.6 15.6 2.2 12z" />
                      <circle cx="13" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>

              <button
                type="button"
                className="auth-advanced-toggle"
                onClick={() => setShowAdvancedAccess((prev) => !prev)}
                aria-expanded={showAdvancedAccess}
              >
                Advanced Options
              </button>

              {showAdvancedAccess ? (
                <>
                  <label htmlFor="register-access" className="auth-visually-hidden">
                    Developer access code
                  </label>
                  <div className="auth-input-shell auth-input-shell--advanced">
                    <span className="auth-input-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="5" y="11" width="14" height="10" rx="5" />
                        <path d="M8 11V8a4 4 0 118 0v3" />
                      </svg>
                    </span>
                    <input
                      id="register-access"
                      placeholder="Enter developer access code"
                      type={showDeveloperAccess ? 'text' : 'password'}
                      autoComplete="one-time-code"
                      value={developerAccess}
                      onChange={(e) => setDeveloperAccess(e.target.value)}
                      disabled={loading}
                    />
                    <button
                      type="button"
                      className="auth-eye-btn"
                      onClick={() => setShowDeveloperAccess((prev) => !prev)}
                      aria-label={showDeveloperAccess ? 'Hide access code' : 'Show access code'}
                      disabled={loading}
                    >
                      {showDeveloperAccess ? (
                        <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 3l18 18" />
                          <path d="M10.6 10.6a3 3 0 004.2 4.2" />
                          <path d="M9.9 5.2A10.7 10.7 0 0112 5c5.5 0 9.4 3.4 10.8 7-0.6 1.6-1.7 3.1-3.2 4.3" />
                          <path d="M6.4 6.4C4.4 7.7 3 9.7 2.2 12c1.4 3.6 5.3 7 10.8 7 1.3 0 2.5-0.2 3.6-0.6" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2.2 12C3.6 8.4 7.5 5 13 5s9.4 3.4 10.8 7c-1.4 3.6-5.3 7-10.8 7S3.6 15.6 2.2 12z" />
                          <circle cx="13" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <p className="auth-advanced-hint">Developer access code is required by admin.</p>
              )}

              <p className="auth-error">{errorText}</p>

              <div className="auth-mobile-footer auth-mobile-footer--register">
                <motion.button
                  type="submit"
                  className="auth-btn auth-btn--accent auth-btn--primary"
                  whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                  disabled={loading}
                >
                  {loading ? 'Creating...' : 'Create Account'}
                </motion.button>
                <p className="auth-switch-copy">
                  Already have an account?{' '}
                  <a href="/login" className="auth-switch-link">
                    Sign In
                  </a>
                </p>
              </div>
            </form>
          </motion.section>
        </section>
      </motion.mnx>

      <AnimatePresence>
        {toast ? (
          <motion.div
            className="auth-toast"
            initial={reduceMotion ? undefined : { opacity: 0, y: 12 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
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
  createRoot(host).render(<Rgstrapp />);
}
