import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { createRoot } from 'react-dom/client';
import lottie from 'lottie-web';
import animconData from './animcon.json';
import { DynamicIsland } from './dynamic-island';

type LoginView = 'intro' | 'signin';
type ResLogin = { ok: boolean; nextRoute?: string; pesan?: string };

function cekvwprtmbl(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(max-width: 820px)').matches;
}

async function krmlgn(username: string, password: string): Promise<ResLogin> {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  return (await res.json()) as ResLogin;
}

function Hrltv(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const anim = lottie.loadAnimation({
      container: hostRef.current,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: animconData,
      rendererSettings: {
        preserveAspectRatio: 'xMidYMid meet',
      },
    });
    return () => {
      anim.destroy();
    };
  }, []);

  return <div className="auth-hero-lottie" ref={hostRef} />;
}

function Lgnapp(): React.JSX.Element {
  const reduceMotion = useReducedMotion();
  const [isMobile, setIsMobile] = useState(() => cekvwprtmbl());
  const [view, setView] = useState<LoginView>(() => (cekvwprtmbl() ? 'intro' : 'signin'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [toast, setToast] = useState('');
  const [islandIconMode, setIslandIconMode] = useState<'locked' | 'unlocked'>('locked');
  const [islandActivity, setIslandActivity] = useState<'idle' | 'pulse'>('idle');
  const [islandShakeKey, setIslandShakeKey] = useState(0);
  const [islandVisible, setIslandVisible] = useState(false);
  const islandHideTimerRef = useRef<number | null>(null);
  const islandSettleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 1700);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const media = window.matchMedia('(max-width: 820px)');
    const syncx = (): void => {
      const mobile = media.matches;
      setIsMobile(mobile);
      setView(mobile ? 'intro' : 'signin');
    };

    syncx();
    media.addEventListener('change', syncx);
    return () => media.removeEventListener('change', syncx);
  }, []);

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

  function resetIslandTimers(): void {
    if (islandHideTimerRef.current !== null) {
      window.clearTimeout(islandHideTimerRef.current);
      islandHideTimerRef.current = null;
    }
    if (islandSettleTimerRef.current !== null) {
      window.clearTimeout(islandSettleTimerRef.current);
      islandSettleTimerRef.current = null;
    }
  }

  useEffect(
    () => () => {
      resetIslandTimers();
    },
    [],
  );

  function picuIslandError(): void {
    resetIslandTimers();
    setIslandIconMode('locked');
    setIslandActivity('idle');
    setIslandVisible(true);
    setIslandShakeKey((prev) => prev + 1);
    islandHideTimerRef.current = window.setTimeout(
      () => {
        islandHideTimerRef.current = null;
        setIslandVisible(false);
      },
      reduceMotion ? 680 : 1240,
    );
  }

  async function aksmsk(): Promise<void> {
    const user = username.trim();
    const pass = password;
    resetIslandTimers();
    setIslandIconMode('locked');
    setIslandActivity('idle');
    setIslandVisible(false);

    if (!user || !pass) {
      setErrorText('Username and password are required');
      setToast('Fill username and password');
      picuIslandError();
      return;
    }

    setLoading(true);
    setErrorText('');

    try {
      const hasil = await krmlgn(user, pass);
      if (!hasil.ok) {
        setErrorText(hasil.pesan || 'Login failed');
        setToast('Login failed');
        picuIslandError();
        return;
      }

      resetIslandTimers();
      setIslandIconMode('unlocked');
      setIslandActivity('pulse');
      setIslandVisible(true);
      islandSettleTimerRef.current = window.setTimeout(() => {
        islandSettleTimerRef.current = null;
        setIslandActivity('idle');
      }, reduceMotion ? 180 : 760);
      setToast('Login success');
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, reduceMotion ? 220 : 960);
      });
      window.location.href = hasil.nextRoute || '/dashboard';
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
      setToast('Network error');
      picuIslandError();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell auth-shell--login">
      <DynamicIsland iconMode={islandIconMode} activity={islandActivity} shakeKey={islandShakeKey} visible={islandVisible} />
      <motion.mnx
        className="auth-stage"
        initial={reduceMotion ? undefined : { opacity: 0, y: 18 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={spring}
      >
        <section className="auth-card auth-card--login">
          <aside className="auth-desktop-hero" aria-hidden="true">
            <div className="auth-hero-fallback auth-hero-fallback--lottie" aria-hidden="true">
              <Hrltv />
            </div>
            <h2 className="auth-desktop-hero-title">Welcome to Nchat</h2>
            <p className="auth-desktop-hero-subtitle">Need schedule your message or status? Start from here!</p>
            <div className="auth-dots auth-dots--desktop">
              <span className="auth-dot" />
              <span className="auth-dot is-active" />
              <span className="auth-dot" />
            </div>
          </aside>

          <AnimatePresence mode="wait" initial={false}>
            {view === 'intro' ? (
              <motion.section
                key="intro"
                className="auth-screen auth-screen--intro"
                initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -14 }}
                transition={spring}
              >
                <div className="auth-intro-main">
                  <div className="auth-hero-fallback auth-hero-fallback--intro auth-hero-fallback--lottie" aria-hidden="true">
                    <Hrltv />
                  </div>
                  <div className="auth-intro-copy">
                    <p className="auth-brand">Nchat</p>
                    <h1 className="auth-intro-title">Welcome to Nchat</h1>
                    <p className="auth-intro-subtitle">Need schedule your message or status? Get started here</p>
                    <div className="auth-dots">
                      <span className="auth-dot" />
                      <span className="auth-dot is-active" />
                      <span className="auth-dot" />
                    </div>
                  </div>
                </div>

                <div className="auth-mobile-footer auth-mobile-footer--intro">
                  <motion.button
                    type="button"
                    className="auth-btn auth-btn--accent auth-btn--primary"
                    whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                    onClick={() => setView('signin')}
                  >
                    Get Started
                  </motion.button>
                </div>
              </motion.section>
            ) : (
              <motion.section
                key="signin"
                className="auth-screen auth-screen--signin"
                initial={reduceMotion ? undefined : { opacity: 0, y: 16 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -14 }}
                transition={spring}
              >
                <div className="auth-topbar">
                  {isMobile ? (
                    <button
                      type="button"
                      className="auth-back-btn"
                      aria-label="Back to intro"
                      onClick={() => setView('intro')}
                    >
                      <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                    </button>
                  ) : null}
                  <span className="auth-brand auth-brand--inline">Get Started</span>
                </div>

                <h1 className="auth-heading">
                  Hey,
                  <br />
                  Welcome Back
                </h1>

                <form
                  className="auth-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void aksmsk();
                  }}
                >
                  <label htmlFor="login-username" className="auth-visually-hidden">
                    Username
                  </label>
                  <div className="auth-input-shell">
                    <span className="auth-input-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="5" width="18" height="14" rx="3" />
                        <path d="M3 9l9 5 9-5" />
                      </svg>
                    </span>
                    <input
                      id="login-username"
                      placeholder="Enter your username"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={loading}
                    />
                  </div>

                  <label htmlFor="login-password" className="auth-visually-hidden">
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
                      id="login-password"
                      placeholder="Enter your password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
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

                  <button type="button" className="auth-forgot-link" aria-disabled="true" disabled>
                    Forgot Password?
                  </button>

                  <p className="auth-error">{errorText}</p>

                  <div className="auth-mobile-footer auth-mobile-footer--signin">
                    <motion.button
                      type="submit"
                      className="auth-btn auth-btn--accent auth-btn--primary"
                      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                      disabled={loading}
                    >
                      {loading ? 'Logging In...' : 'Login'}
                    </motion.button>
                    <p className="auth-switch-copy">
                      Don't have an account?{' '}
                      <a href="/register" className="auth-switch-link">
                        Sign Up
                      </a>
                    </p>
                  </div>
                </form>
              </motion.section>
            )}
          </AnimatePresence>
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

const host = document.getElementById('app-login');
if (host) {
  createRoot(host).render(<Lgnapp />);
}
