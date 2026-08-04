/**
 * Content Security Policy — one definition, used everywhere (KAN-36).
 *
 * This file exists because of a bug that reached production: the CSP lived
 * only in `firebase.json`, so it was never exercised until after a deploy.
 * Vite inlines assets under 4 KB as `data:` URIs, which turned the small
 * Plus Jakarta Sans subsets into `data:font/woff2` — blocked by
 * `font-src 'self'`, so every icon and several weights silently failed on the
 * live site while working perfectly on localhost.
 *
 * Two things prevent a repeat:
 *
 *   1. `vite preview` now serves the STRICT policy below, identical to the one
 *      Hosting sends. Preview serves the real build with no HMR, so anything
 *      the CSP breaks in production breaks there first.
 *   2. `csp.test.ts` asserts the string in `firebase.json` matches this file,
 *      so the two cannot drift.
 *
 * The dev server gets a deliberately relaxed variant — Vite's HMR client needs
 * inline scripts and a websocket, and forcing the strict policy there would
 * only teach everyone to ignore CSP errors.
 */

/** @type {Record<string, string[]>} */
const STRICT = {
  'default-src': ["'self'"],
  // No 'unsafe-inline', no 'unsafe-eval'. This is the directive that matters;
  // everything else is depth behind it.
  'script-src': ["'self'"],
  // React inline styles and the design system's style attributes need this.
  // Style injection is a defacement risk, not a code-execution one.
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'https://*.googleusercontent.com'],
  // 'self' only: fonts are self-hosted, and `build.assetsInlineLimit` is
  // configured never to inline them, so no `data:` exception is needed.
  'font-src': ["'self'"],
  'connect-src': [
    "'self'",
    'https://*.googleapis.com',
    'https://*.firebaseio.com',
    'https://*.cloudfunctions.net',
    'https://*.run.app',
    'https://*.ingest.sentry.io',
    'wss://*.firebaseio.com',
  ],
  // The Google sign-in popup renders from the Firebase auth domain.
  'frame-src': ['https://*.firebaseapp.com'],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
};

/** @param {Record<string, string[]>} directives */
function serialise(directives) {
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

/** The policy production sends. Must match `firebase.json` exactly. */
export const productionCsp = serialise(STRICT);

/** Same policy, minus what Vite's dev client cannot live without. */
export const developmentCsp = serialise({
  ...STRICT,
  'script-src': [...STRICT['script-src'], "'unsafe-inline'", "'unsafe-eval'"],
  'connect-src': [...STRICT['connect-src'], 'ws://localhost:*', 'ws://127.0.0.1:*'],
});

/** Headers shared by dev, preview and Hosting. HSTS is Hosting-only. */
export const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  // 'same-origin' would break the Google sign-in popup.
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
};
