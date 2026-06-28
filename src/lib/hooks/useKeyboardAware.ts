import { useState, useEffect } from 'react';

export function useKeyboardAware() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    const initialHeight = visualViewport.height;

    const handler = () => {
      const heightDiff = initialHeight - visualViewport.height;
      if (heightDiff > 100) {
        setIsKeyboardOpen(true);
        setKeyboardHeight(heightDiff);
      } else {
        setIsKeyboardOpen(false);
        setKeyboardHeight(0);
      }
    };

    visualViewport.addEventListener('resize', handler);
    return () => visualViewport.removeEventListener('resize', handler);
  }, []);

  return { keyboardHeight, isKeyboardOpen };
}
