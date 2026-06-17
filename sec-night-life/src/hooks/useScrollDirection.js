import { useEffect, useRef, useState } from 'react';

/**
 * Track scroll direction for auto-hiding mobile nav.
 * @param {{ enabled?: boolean, threshold?: number }} opts
 */
export function useScrollDirection({ enabled = true, threshold = 8 } = {}) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setHidden(false);
      return undefined;
    }

    lastY.current = window.scrollY;

    function onScroll() {
      const y = window.scrollY;
      if (y < 40) {
        setHidden(false);
        lastY.current = y;
        return;
      }
      const delta = y - lastY.current;
      if (Math.abs(delta) < threshold) return;
      setHidden(delta > 0);
      lastY.current = y;
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [enabled, threshold]);

  return hidden;
}
