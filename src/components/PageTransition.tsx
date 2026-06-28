import { useRef, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

export function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [animClass, setAnimClass] = useState('');
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setAnimClass('opacity-100');
      return;
    }
    setAnimClass('opacity-0');
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimClass('animate-fade-in-up');
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, reducedMotion]);

  return (
    <div ref={containerRef} className={animClass}>
      {children}
    </div>
  );
}
