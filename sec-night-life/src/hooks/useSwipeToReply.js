import { useRef } from 'react';

export function useSwipeToReply(onReply, { threshold = 60 } = {}) {
  const startX = useRef(null);
  const startY = useRef(null);

  function onTouchStart(e) {
    startX.current = e.touches[0]?.clientX ?? null;
    startY.current = e.touches[0]?.clientY ?? null;
  }

  function onTouchEnd(e, message) {
    if (startX.current == null || startY.current == null) return;
    const endX = e.changedTouches[0]?.clientX ?? startX.current;
    const endY = e.changedTouches[0]?.clientY ?? startY.current;
    const dx = endX - startX.current;
    const dy = Math.abs(endY - startY.current);
    startX.current = null;
    startY.current = null;
    if (dx >= threshold && dy < 40) onReply?.(message);
  }

  return { onTouchStart, onTouchEnd };
}
