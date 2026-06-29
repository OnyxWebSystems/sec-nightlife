import { useState, useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]';

const FOCUS_OUT_DEBOUNCE_MS = 180;
const KEYBOARD_HEIGHT_DELTA = 120;

function isFocusableElement(el) {
  return el?.matches?.(FOCUSABLE_SELECTOR);
}

/** Hide floating bottom nav while typing or when the mobile keyboard is open. */
export function useMobileNavFormHide() {
  const [hidden, setHidden] = useState(false);
  const keyboardOpenRef = useRef(false);
  const focusOutTimerRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const vv = window.visualViewport;
    let baselineHeight = vv?.height ?? window.innerHeight;

    const clearFocusOutTimer = () => {
      if (focusOutTimerRef.current) {
        window.clearTimeout(focusOutTimerRef.current);
        focusOutTimerRef.current = null;
      }
    };

    const syncHidden = () => {
      if (keyboardOpenRef.current || isFocusableElement(document.activeElement)) {
        setHidden(true);
        return;
      }
      setHidden(false);
    };

    const onFocusIn = (e) => {
      clearFocusOutTimer();
      if (isFocusableElement(e.target)) setHidden(true);
    };

    const onFocusOut = () => {
      clearFocusOutTimer();
      focusOutTimerRef.current = window.setTimeout(() => {
        focusOutTimerRef.current = null;
        if (keyboardOpenRef.current) {
          setHidden(true);
          return;
        }
        syncHidden();
      }, FOCUS_OUT_DEBOUNCE_MS);
    };

    const onViewportResize = () => {
      if (!vv) return;
      const keyboardLikelyOpen = baselineHeight - vv.height > KEYBOARD_HEIGHT_DELTA;
      keyboardOpenRef.current = keyboardLikelyOpen;
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
      clearFocusOutTimer();
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      vv?.removeEventListener('resize', onViewportResize);
    };
  }, []);

  return hidden;
}
