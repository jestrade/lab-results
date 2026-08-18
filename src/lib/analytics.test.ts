import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ gaMeasurementId: 'G-TEST123' }));
vi.mock('./env', () => env);

import { redactPath, resetAnalyticsForTests, trackPageView, trackingRefused } from './analytics';

/** The `gtag` calls the module queued, in order. */
function dataLayer(): unknown[][] {
  return (window.dataLayer ?? []) as unknown[][];
}

function pageViews(): Record<string, unknown>[] {
  return dataLayer()
    .filter((entry) => entry[0] === 'event' && entry[1] === 'page_view')
    .map((entry) => entry[2] as Record<string, unknown>);
}

beforeEach(() => {
  env.gaMeasurementId = 'G-TEST123';
  resetAnalyticsForTests();
});

afterEach(() => {
  resetAnalyticsForTests();
  vi.unstubAllGlobals();
});

describe('redactPath', () => {
  it('replaces a variable id with the parameter it filled', () => {
    // `/variables/hemoglobin` states which tests this person has had. It is
    // the single most sensitive string this app puts in a URL.
    expect(redactPath('/variables/hemoglobin')).toBe('/variables/:variableId');
  });

  it('replaces a report id', () => {
    expect(redactPath('/files/8f14e45f-ceea-467a-9b30-7c2fd0d1f3ab')).toBe('/files/:reportId');
  });

  it('drops the query string whole', () => {
    // Query strings are the likeliest place for something identifying to
    // appear, and nothing on these screens needs one recorded.
    expect(redactPath('/variables?q=hemoglobin')).toBe('/variables');
  });

  it('keeps the legal slug, which describes a public document', () => {
    // Which of the five public documents someone read says nothing about their
    // health, and telling them apart is the point of measuring them.
    expect(redactPath('/legal/privacy')).toBe('/legal/privacy');
  });

  it('keeps the plain screens as they are', () => {
    expect(redactPath('/variables')).toBe('/variables');
    expect(redactPath('/upload')).toBe('/upload');
    expect(redactPath('/files')).toBe('/files');
    expect(redactPath('/')).toBe('/');
  });

  it('sends an unrecognised path as the root rather than passing it through', () => {
    // A route nobody has checked for identifiers is a route that might carry
    // one. Defaulting to `/` loses a data point; defaulting to the real path
    // would be how a leak ships.
    expect(redactPath('/some/new/feature/user-42')).toBe('/');
    expect(redactPath('/whatever')).toBe('/');
  });
});

describe('trackingRefused', () => {
  it('honours Do Not Track and Global Privacy Control', () => {
    expect(trackingRefused({ doNotTrack: '1' })).toBe(true);
    expect(trackingRefused({ globalPrivacyControl: true })).toBe(true);
  });

  it('is false when neither is set', () => {
    expect(trackingRefused({ doNotTrack: null })).toBe(false);
    expect(trackingRefused({})).toBe(false);
  });
});

describe('trackPageView', () => {
  it('loads the tag and records the route pattern', () => {
    trackPageView('/variables/hemoglobin');

    const script = document.getElementById('ga4') as HTMLScriptElement | null;
    expect(script?.src).toContain('googletagmanager.com/gtag/js?id=G-TEST123');
    expect(pageViews()).toEqual([
      {
        page_path: '/variables/:variableId',
        page_location: `${window.location.origin}/variables/:variableId`,
        page_title: '/variables/:variableId',
      },
    ]);
  });

  it('turns the tag’s own page views off', () => {
    trackPageView('/variables');

    const config = dataLayer().find((entry) => entry[0] === 'config')?.[2] as Record<
      string,
      unknown
    >;
    // Left on, gtag sends document.location itself — identifiers and all — and
    // every redaction above would be decoration.
    expect(config.send_page_view).toBe(false);
    expect(config.anonymize_ip).toBe(true);
  });

  it('refuses to feed an advertising profile', () => {
    trackPageView('/variables');

    const config = dataLayer().find((entry) => entry[0] === 'config')?.[2] as Record<
      string,
      unknown
    >;
    expect(config.allow_google_signals).toBe(false);
    expect(config.allow_ad_personalization_signals).toBe(false);
  });

  it('loads the tag once across many navigations', () => {
    trackPageView('/variables');
    trackPageView('/upload');
    trackPageView('/files');

    expect(document.querySelectorAll('#ga4')).toHaveLength(1);
    expect(pageViews()).toHaveLength(3);
  });

  it('does nothing at all when no measurement id is configured', () => {
    env.gaMeasurementId = '';
    trackPageView('/variables');

    // Unconfigured is a supported state, like an absent Sentry DSN.
    expect(document.getElementById('ga4')).toBeNull();
    expect(window.dataLayer).toBeUndefined();
  });

  it('does not load the tag for a reader who asked not to be tracked', () => {
    vi.stubGlobal('navigator', { ...navigator, doNotTrack: '1' });
    trackPageView('/variables');

    // Nothing loaded means no request was made — the refusal is honoured
    // before Google is contacted, not after.
    expect(document.getElementById('ga4')).toBeNull();
    expect(window.dataLayer).toBeUndefined();
  });

  it('never puts an identifier in what it sends', () => {
    trackPageView('/files/8f14e45f-ceea-467a-9b30-7c2fd0d1f3ab?from=upload');

    const sent = JSON.stringify(pageViews());
    expect(sent).not.toContain('8f14e45f');
    expect(sent).not.toContain('from=upload');
  });
});
