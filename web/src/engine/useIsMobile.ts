import { useEffect, useState } from 'react';

/**
 * True on a phone-sized viewport (≤ maxWidth, default 640px). Used to switch the
 * voice screens to the "big centered avatar, no transcript" mobile layout while
 * keeping the desktop layout untouched. SSR-safe (defaults to false when there's
 * no window) and updates live on resize/orientation change.
 */
export function useIsMobile(maxWidth = 640): boolean {
  const query = `(max-width: ${maxWidth}px)`;
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    // addEventListener('change') is the modern API; older Safari needs addListener.
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, [query]);

  return isMobile;
}
