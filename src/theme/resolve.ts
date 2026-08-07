/**
 * Theme resolution outside of React.
 *
 * Two callers cannot use the context: the boot step in `main.tsx`, which runs
 * before React exists precisely so the first paint is already correct, and the
 * provider's own initial state. They want the same answer, so it is computed
 * in one place — the same arrangement `@/i18n/resolve` has, for the same
 * reason.
 */

import {
  detectSystemTheme,
  resolveTheme,
  type Theme,
  type ThemePreference,
  DEFAULT_THEME_PREFERENCE,
} from '@/domain/themes';

import { readStoredThemePreference } from './storage';

/**
 * The preference to start from: what the reader last chose on this device,
 * else "follow the device".
 *
 * A signed-in account's stored preference is applied on top of this by
 * `ThemeProvider` once the profile arrives. It is not consulted here because
 * this has to answer synchronously, before first paint.
 */
export function resolveInitialThemePreference(): ThemePreference {
  return readStoredThemePreference() ?? DEFAULT_THEME_PREFERENCE;
}

/**
 * Paints a theme.
 *
 * `data-theme` is what the stylesheet keys off. `color-scheme` is what the
 * *browser* keys off, and it has to be set too — it is what makes form
 * controls, scrollbars, and the canvas behind the page follow along. Without
 * it a dark page keeps light scrollbars and white autofill boxes, which reads
 * as a half-finished theme rather than a styling detail.
 *
 * Always writes a concrete theme, never `system`: by this point the device's
 * answer has already been folded in.
 */
export function applyDocumentTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

/**
 * Applies the remembered theme before React starts.
 *
 * Called at the top of `main.tsx`. This is the whole no-flash story, and it is
 * shaped by the content security policy: the usual trick is a tiny inline
 * `<script>` in `index.html`, which `script-src` forbids here (see
 * `src/styles/csp.test.ts` — the policy allows no inline script, and a test
 * pins that). Running it as the first statement of the entry module is the
 * CSP-safe equivalent: it executes before the React tree renders, while the
 * stylesheet is still being fetched.
 *
 * `theme.css` additionally carries a `prefers-color-scheme` fallback for the
 * frames before this runs at all, so a reader on a dark device never sees a
 * white page even on a cold, slow load.
 */
export function bootTheme(): void {
  applyDocumentTheme(resolveTheme(resolveInitialThemePreference(), detectSystemTheme()));
}

/**
 * Watches the device setting.
 *
 * Only matters while the preference is `system` — but it is subscribed
 * regardless and filtered by the caller, because someone switching their OS to
 * night mode at sunset expects the app that says "follow my device" to follow
 * it right then, not at the next reload.
 *
 * Returns a no-op unsubscribe when `matchMedia` is unavailable, so callers do
 * not have to branch.
 */
export function subscribeToSystemTheme(onChange: (theme: Theme) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};

  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (event: MediaQueryListEvent) => onChange(event.matches ? 'dark' : 'light');

  // Safari below 14 only has the deprecated listener API. Feature-detected
  // rather than version-sniffed, and tolerated rather than dropped, because
  // failing here would mean the theme silently stops following the device.
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }

  query.addListener(handler);
  return () => query.removeListener(handler);
}
