import { useRef, useCallback, useState } from 'react';

interface PullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  disabled?: boolean;
}

export function usePullToRefresh({ onRefresh, threshold = 60, disabled = false }: PullToRefreshOptions) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pullDist = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    const scrollTop = containerRef.current?.scrollTop ?? 0;
    if (scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    pullDist.current = 0;
    setPulling(false);
  }, [disabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (disabled || refreshing) return;
    const currentY = e.touches[0].clientY;
    const delta = currentY - startY.current;
    if (delta <= 0) return;
    const scrollTop = containerRef.current?.scrollTop ?? 0;
    if (scrollTop > 0) return;
    pullDist.current = Math.min(delta * 0.5, 120);
    if (pullDist.current > 10) {
      setPulling(true);
    }
  }, [disabled, refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (disabled || !pulling) {
      pullDist.current = 0;
      setPulling(false);
      return;
    }
    if (pullDist.current >= threshold) {
      setRefreshing(true);
      setPulling(false);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        pullDist.current = 0;
      }
    } else {
      pullDist.current = 0;
      setPulling(false);
    }
  }, [disabled, pulling, threshold, onRefresh]);

  const pullStyle = pulling
    ? { transform: `translateY(${pullDist.current}px)`, transition: 'transform 0.1s linear' }
    : { transform: 'translateY(0)', transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' };

  return {
    containerRef,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
    pullStyle,
    pulling,
    refreshing,
  };
}
