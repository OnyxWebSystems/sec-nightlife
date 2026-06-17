import { useEffect, useState } from 'react';

export function useIsDesktop(breakpoint = 1024) {
  const query = `(min-width: ${breakpoint}px)`;
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia(query);
    const sync = () => setIsDesktop(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [query]);
  return isDesktop;
}

export function useIsMobile(breakpoint = 1024) {
  const isDesktop = useIsDesktop(breakpoint);
  return !isDesktop;
}
