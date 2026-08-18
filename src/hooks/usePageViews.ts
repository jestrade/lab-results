import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { trackPageView } from '@/lib/analytics';

/**
 * Sends one analytics page view per navigation.
 *
 * A single-page application changes the URL without loading a document, so the
 * tag's own page-view tracking fires once, on the first paint, and never
 * again. This is what replaces it — and it is also the reason automatic page
 * views are switched off in `lib/analytics.ts` rather than merely supplemented:
 * the automatic one would send the real path, identifiers and all.
 *
 * Keyed on `pathname` alone. The search string is deliberately excluded, both
 * from the dependency and from what is sent: a navigation that only changes a
 * query is the same screen, and query strings are the likeliest place for
 * something identifying to appear.
 */
export function usePageViews(): void {
  const { pathname } = useLocation();

  useEffect(() => {
    trackPageView(pathname);
  }, [pathname]);
}
