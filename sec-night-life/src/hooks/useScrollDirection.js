import { useEffect, useRef, useState } from 'react';

/**
 * Shrinks mobile nav while scrolling; restores full size after scroll idle.
 * @param {{ enabled?: boolean, threshold?: number, idleMs?: number }} opts
 */
export function useScrollDirection({ enabled = true, threshold = 8, idleMs = 240 } = {}) {
  const [compact, setCompact] = useState(false);
  const lastY = useRef(0);
  const idleTimer = useRef(null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setCompact(false);
      return undefined;
    }

    lastY.current = window.scrollY;

    function onScroll() {
      const y = window.scrollY;
      if (y < 40) {
        setCompact(false);
        lastY.current = y;
      } else {
        const delta = y - lastY.current;
        if (Math.abs(delta) >= threshold) {
          setCompact(delta > 0);
          lastY.current = y;
        }
      }

      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => {
        setCompact(false);
      }, idleMs);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [enabled, threshold, idleMs]);

  return compact;
}
