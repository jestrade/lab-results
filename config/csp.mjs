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
  //
  // apis.google.com is REQUIRED for Google sign-in: the Firebase Auth SDK
  // loads gapi from there to drive the popup and the auth iframe. Without it
  // the flow dies with
  //   Loading the script 'https://apis.google.com/js/api.js?onload=...'
  //   violates ... "script-src 'self'"
  // and the user sees a generic failure. There is no way to run the Google
  // popup flow without this host; the alternative is dropping Google sign-in.
  // It is a Google-operated origin we already trust by using Firebase Auth.
  //
  // www.googletagmanager.com is where gtag.js is served from (KAN — analytics).
  // Only the loader host is allowed: the tag's own requests go out over
  // connect-src/img-src below, and Tag Manager containers — which can inject
  // arbitrary third-party scripts from a web console — are not used here.
  'script-src': ["'self'", 'https://apis.google.com', 'https://www.googletagmanager.com'],
  // React inline styles and the design system's style attributes need this.
  // Style injection is a defacement risk, not a code-execution one.
  'style-src': ["'self'", "'unsafe-inline'"],
  // GA still falls back to an image beacon in browsers that refuse its fetch.
  'img-src': [
    "'self'",
    'data:',
    'https://*.googleusercontent.com',
    'https://*.google-analytics.com',
  ],
  // 'self' only: fonts are self-hosted, and `build.assetsInlineLimit` is
  // configured never to inline them, so no `data:` exception is needed.
  'font-src': ["'self'"],
  'connect-src': [
    "'self'",
    'https://*.googleapis.com',
    'https://*.firebaseio.com',
    'https://*.cloudfunctions.net',
    'https://*.run.app',
    // Sentry's ingest hosts are regional — a DSN points at
    // `o<org>.ingest.us.sentry.io`, not `o<org>.ingest.sentry.io`. A CSP
    // wildcard matches the labels to its right, so `*.ingest.sentry.io` does
    // not cover the regional form and blocked every report this project ever
    // tried to send. `*.sentry.io` covers each region without enumerating
    // them, which is what Sentry's own CSP guidance recommends.
    'https://*.sentry.io',
    'wss://*.firebaseio.com',
    // Where the measurement hits go. Both hosts are needed: GA4 collects on
    // google-analytics.com and, for some regions and consent modes, on
    // *.analytics.google.com.
    'https://*.google-analytics.com',
    'https://*.analytics.google.com',
  ],
  // The auth flow frames three things: our own /__/auth/iframe (same-origin
  // now that authDomain is the Hosting domain — hence 'self'), Google's
  // account chooser, and the legacy *.firebaseapp.com handler, kept so that
  // reverting authDomain does not silently break sign-in again.
  //
  // firebasestorage.googleapis.com is the fourth, and it is a product decision
  // rather than an auth one: the reports list shows a stored PDF in a dialog
  // instead of throwing the reader into a new tab, and the download URL is
  // what the frame points at. The host serves the object with
  // `Content-Disposition: inline` and no X-Frame-Options, so the browser's own
  // PDF viewer renders it. It is not a wildcard: only the Firebase Storage
  // download endpoint, which already only answers for a URL carrying the
  // object's token.
  'frame-src': [
    "'self'",
    'https://accounts.google.com',
    'https://*.firebaseapp.com',
    'https://firebasestorage.googleapis.com',
  ],
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
  // Against the emulators, a stored PDF lives on the Storage emulator rather
  // than on firebasestorage.googleapis.com — see connectStorageEmulator in
  // src/lib/firebase.ts. Without this the report viewer works in production
  // and shows an empty frame on every developer's machine.
  'frame-src': [...STRICT['frame-src'], 'http://127.0.0.1:9199', 'http://localhost:9199'],
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
