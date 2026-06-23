import { useState, useEffect } from 'react';

const FOCUSABLE_SELECTOR =
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]';

function isFocusableElement(el) {
  return el?.matches?.(FOCUSABLE_SELECTOR);
}

/** Hide floating bottom nav while typing or when the mobile keyboard is open. */
export function useMobileNavFormHide() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const vv = window.visualViewport;
    let baselineHeight = vv?.height ?? window.innerHeight;

    const onFocusIn = (e) => {
      if (isFocusableElement(e.target)) setHidden(true);
    };

    const onFocusOut = () => {
      requestAnimationFrame(() => {
        if (!isFocusableElement(document.activeElement)) {
          setHidden(false);
        }
      });
    };

    const onViewportResize = () => {
      if (!vv) return;
      const keyboardLikelyOpen = baselineHeight - vv.height > 120;
      if (keyboardLikelyOpen) {
        setHidden(true);
      } else if (!isFocusableElement(document.activeElement)) {
        setHidden(false);
        baselineHeight = vv.height;
      }
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    vv?.addEventListener('resize', onViewportResize);

    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      vv?.removeEventListener('resize', onViewportResize);
    };
  }, []);

  return hidden;
}
