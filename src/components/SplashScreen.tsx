import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../lib/core/auth-context';
import { useTheme } from '../lib/core/theme-context';
import { Capacitor } from '@capacitor/core';
import { SplashScreen as CapacitorSplash } from '@capacitor/splash-screen';
import logoSrc from '../assets/logo.png';

export function SplashScreen() {
  const { loading } = useAuth();
  const { theme } = useTheme();
  const [phase, setPhase] = useState<'entering' | 'ready' | 'exiting' | 'hidden'>('entering');
  const mountTime = useRef(Date.now());
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const elapsed = Date.now() - mountTime.current;
    const remaining = Math.max(0, 600 - elapsed);
    const enterTimer = setTimeout(() => setPhase('ready'), remaining);
    return () => clearTimeout(enterTimer);
  }, []);

  useEffect(() => {
    if (phase !== 'ready') return;
    const elapsed = Date.now() - mountTime.current;

    const advance = () => {
      const elapsed2 = Date.now() - mountTime.current;
      const pct = Math.min(90, Math.round((elapsed2 / 3000) * 90));
      setProgress(pct);
    };

    const interval = setInterval(advance, 120);

    if (!loading) {
      const minDisplay = Math.max(0, 2000 - elapsed);
      const exitTimer = setTimeout(() => {
        clearInterval(interval);
        setProgress(100);
        setTimeout(() => setPhase('exiting'), 300);
        setTimeout(() => setPhase('hidden'), 900);
      }, minDisplay);
      return () => {
        clearInterval(interval);
        clearTimeout(exitTimer);
      };
    }

    return () => clearInterval(interval);
  }, [phase, loading]);

  useEffect(() => {
    if (phase === 'exiting') {
      const timer = setTimeout(() => setPhase('hidden'), 600);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  useEffect(() => {
    if (phase === 'hidden' && Capacitor.isNativePlatform()) {
      CapacitorSplash.hide();
    }
  }, [phase]);

  if (phase === 'hidden') return null;

  const isDark = theme === 'dark';

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center transition-all duration-700 ease-in-out"
      style={{
        backgroundColor: isDark ? '#0f0f0f' : '#ffffff',
        opacity: phase === 'exiting' ? 0 : 1,
      }}
    >
      <div className="flex flex-col items-center gap-6 px-8 max-w-sm w-full">
        <div
          className="transition-all duration-700 ease-out"
          style={{
            opacity: phase === 'entering' ? 0 : 1,
            transform: phase === 'entering'
              ? 'scale(0.6) translateY(20px)'
              : 'scale(1) translateY(0)',
          }}
        >
          <div className="relative">
            <div
              className="absolute inset-0 rounded-full blur-3xl"
              style={{
                backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                transform: 'scale(1.8)',
              }}
            />
            <img
              src={logoSrc}
              alt="Highlands Cafe & Motel Inn"
              className="h-24 w-24 rounded-2xl object-cover shadow-2xl relative"
              style={{
                boxShadow: isDark
                  ? '0 8px 40px rgba(0,0,0,0.5)'
                  : '0 8px 40px rgba(0,0,0,0.1)',
              }}
            />
          </div>
        </div>

        <div
          className="flex flex-col items-center gap-1.5 transition-all duration-700 ease-out delay-200"
          style={{
            opacity: phase === 'entering' ? 0 : 1,
            transform: phase === 'entering' ? 'translateY(12px)' : 'translateY(0)',
          }}
        >
          <h1
            className="text-2xl font-bold text-center tracking-tight"
            style={{ color: isDark ? '#f0ebe4' : '#1a1a1a' }}
          >
            Highlands Cafe<br />& Motel Inn
          </h1>
          <p
            className="text-sm text-center font-medium tracking-wide"
            style={{ color: isDark ? 'rgba(240,235,228,0.5)' : 'rgba(0,0,0,0.4)' }}
          >
            Point of Sale System
          </p>
        </div>

        <div
          className="w-full max-w-[200px] transition-all duration-500 ease-out delay-500"
          style={{
            opacity: phase === 'entering' ? 0 : 1,
          }}
        >
          <div
            className="h-1 rounded-full overflow-hidden"
            style={{
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            }}
          >
            <div
              className="h-full rounded-full transition-all duration-300 ease-out"
              style={{
                width: `${progress}%`,
                backgroundColor: isDark ? '#f0ebe4' : '#1a1a1a',
                opacity: phase === 'exiting' ? 0 : 1,
              }}
            />
          </div>
          <p
            className="text-[11px] text-center mt-2 font-medium tracking-wider uppercase"
            style={{
              color: isDark ? 'rgba(240,235,228,0.3)' : 'rgba(0,0,0,0.25)',
            }}
          >
            {loading ? 'Loading...' : 'Ready'}
          </p>
        </div>
      </div>

      <div
        className="absolute bottom-12 left-0 right-0 flex justify-center"
        style={{
          opacity: phase === 'entering' ? 0 : phase === 'exiting' ? 0 : 0.3,
          transition: 'opacity 0.5s ease',
        }}
      >
        <p
          className="text-[10px] font-mono tracking-widest uppercase"
          style={{ color: isDark ? '#f0ebe4' : '#000' }}
        >
          v{import.meta.env.VITE_APP_VERSION || '1.5.1'}
        </p>
      </div>
    </div>
  );
}
