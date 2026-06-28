import { useRef, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

export function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [animClass, setAnimClass] = useState('');

  useEffect(() => {
    setAnimClass('opacity-0');
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimClass('animate-fade-in-up');
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname]);

  return (
    <div ref={containerRef} className={animClass}>
      {children}
    </div>
  );
}
