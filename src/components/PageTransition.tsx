import { useRef, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [phase, setPhase] = useState<'enter' | 'idle'>('enter');
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    if (prevPath.current === location.pathname) return;
    prevPath.current = location.pathname;
    setPhase('enter');
    const timer = setTimeout(() => setPhase('idle'), 300);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  return (
    <div
      className={phase === 'enter' ? 'animate-fade-in-up' : undefined}
      key={location.key}
    >
      {children}
    </div>
  );
}
