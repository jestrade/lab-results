/**
 * Google Analytics 4 (GA4).
 *
 * ── The one thing this file exists to get right ───────────────────────────
 *
 * The URLs in this application are health data. `/variables/hemoglobin` says
 * the person viewing it has had their haemoglobin measured; `/files/{id}`
 * is a handle to one of their laboratory documents. Google Analytics sends
 * `document.location` on every page view by default, so wiring it up the
 * ordinary way — the snippet Google gives you — would ship a per-user log of
 * which blood tests someone looks at to a third party. That is not a
 * hypothetical: it is what the default configuration does.
 *
 * So automatic page views are turned OFF, and every view this file sends
 * carries a *route pattern* rather than a path: `/variables/:variableId`,
 * never `/variables/hemoglobin`. Query strings are dropped whole. What
 * survives is what analytics is actually for — which screens get used, in
 * what order, how often — with nothing in it that describes a person.
 *
 * The same reasoning as `sentry.ts`, applied to a different sink.
 *
 * ── What is deliberately not sent ─────────────────────────────────────────
 *
 * No user id, no email, no report or variable identifiers, no values, no
 * filenames, no custom dimensions of any kind. Google Signals and ad
 * personalisation are switched off explicitly: they are what turns an
 * analytics hit into an advertising profile, and an advertising profile built
 * from a laboratory-results app is exactly the outcome this product must not
 * cause.
 *
 * ── When it does not run at all ───────────────────────────────────────────
 *
 * Unconfigured (no measurement id) is a supported state, like an absent
 * Sentry DSN. A reader who has asked not to be tracked — Do Not Track, or
 * Global Privacy Control — is honoured before the script is fetched, so
 * nothing loads and no request is made.
 */

import { gaMeasurementId } from './env';

const SCRIPT_ID = 'ga4';

/**
 * `gtag` pushes to this array; the loaded script drains it.
 *
 * The entries are `arguments` objects, not arrays — see `gtag` below for why
 * the distinction is the difference between analytics working and not.
 */
type DataLayerEntry = IArguments | unknown[];

declare global {
  interface Window {
    dataLayer?: DataLayerEntry[];
    // Set by us, not by the Google snippet — see `gtag` below.
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Has the reader asked not to be tracked?
 *
 * Both signals are advisory in most jurisdictions and honoured here anyway.
 * The cost of respecting them is a gap in a usage chart; the cost of ignoring
 * them is tracking someone through a health application after they asked not
 * to be.
 */
export function trackingRefused(
  nav: { doNotTrack?: string | null; globalPrivacyControl?: boolean } = navigator,
): boolean {
  return nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
}

/**
 * Path with every identifier replaced by the name of the parameter it filled.
 *
 * Built from the route table rather than guessed at: a new route with an id in
 * it must be added here, and the test for this function is where that is
 * caught. Anything unrecognised falls back to `/` rather than being sent
 * through — an unknown path is one nobody has checked for identifiers.
 */
export function redactPath(pathname: string): string {
  const [path = ''] = pathname.split('?');
  const segments = path.split('/').filter(Boolean);

  if (segments.length === 0) return '/';

  const [first, second] = segments;

  // Two segments where the second is an id or a slug. `/legal/:slug` is the
  // one case where the second segment is kept: the legal documents are the
  // same five public pages for everybody, and which one was read says nothing
  // about the reader's health.
  if (segments.length >= 2) {
    if (first === 'legal') return `/legal/${second}`;
    if (first === 'files') return '/files/:reportId';
    if (first === 'variables') return '/variables/:variableId';
    if (first === 'admin') return `/admin/${second}`;
    return '/';
  }

  const KNOWN_TOP_LEVEL = [
    'sign-in',
    'register',
    'forgot-password',
    'verify-email',
    'dashboard',
    'upload',
    'files',
    'variables',
    'trends',
    'profile',
    'settings',
    'admin',
    'legal',
  ];

  return KNOWN_TOP_LEVEL.includes(first!) ? `/${first}` : '/';
}

function gtag(...args: unknown[]): void {
  // `arguments`, NOT `args`. gtag.js only treats a data layer entry as a
  // command when `Object.prototype.toString` says `[object Arguments]`;
  // anything else — a plain array included — is merged into its model and
  // silently ignored. Pushing `args` here loaded the tag, queued `js`,
  // `config` and every `page_view`, and sent Google nothing at all: no
  // /g/collect request was ever made, and the property stayed empty.
  //
  // The rest parameter is kept because it types the call sites; it is
  // deliberately unused.
  void args;
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer?.push(arguments);
}

let started = false;

/**
 * Loads the tag, once, if it is wanted.
 *
 * Returns whether analytics is running, which is what the page-view hook uses
 * to decide whether to bother building an event.
 */
export function initAnalytics(): boolean {
  if (started) return true;
  if (!gaMeasurementId) return false;
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  if (trackingRefused()) return false;
  if (document.getElementById(SCRIPT_ID)) return false;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = gtag;

  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaMeasurementId)}`;
  document.head.appendChild(script);

  // Queued before the script arrives — the tag drains `dataLayer` on load, so
  // ordering here is the config being applied before the first event rather
  // than a race.
  gtag('js', new Date());
  gtag('config', gaMeasurementId, {
    // The whole point. With this left on, gtag sends document.location the
    // moment it loads — including the variable name or report id in it.
    send_page_view: false,
    anonymize_ip: true,
    // No advertising profile is to be built from a health application.
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  started = true;
  return true;
}

/**
 * Records one screen view, named by its route pattern.
 *
 * `page_location` is rebuilt from the origin and the redacted path rather than
 * passed through, because gtag falls back to the real `document.location` for
 * anything it is not given.
 */
export function trackPageView(pathname: string): void {
  if (!initAnalytics()) return;

  const path = redactPath(pathname);
  gtag('event', 'page_view', {
    page_path: path,
    page_location: `${window.location.origin}${path}`,
    // The document title is static in this application, but sending the route
    // keeps it that way even if a future page starts naming itself after the
    // variable it is showing.
    page_title: path,
  });
}

/** Test seam. The module is a singleton; the tests are not. */
export function resetAnalyticsForTests(): void {
  started = false;
  delete window.dataLayer;
  delete window.gtag;
  document.getElementById(SCRIPT_ID)?.remove();
}
