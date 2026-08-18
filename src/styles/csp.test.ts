import { describe, expect, it } from 'vitest';

import firebaseJson from '../../firebase.json';
import { productionCsp, developmentCsp } from '../../config/csp.mjs';

/**
 * Drift guard between `config/csp.mjs` and `firebase.json` (KAN-36).
 *
 * The CSP used to live only in firebase.json, where nothing exercised it until
 * after a deploy. That is how `font-src 'self'` shipped while Vite was inlining
 * fonts as `data:` URIs — perfect on localhost, broken in production.
 */
function hostingCsp(): string {
  for (const block of firebaseJson.hosting.headers) {
    for (const header of block.headers) {
      if (header.key === 'Content-Security-Policy') return header.value;
    }
  }
  throw new Error('No Content-Security-Policy header in firebase.json');
}

describe('content security policy', () => {
  it('is identical in firebase.json and config/csp.mjs', () => {
    expect(hostingCsp()).toBe(productionCsp);
  });

  it('never allows inline or eval scripts in production', () => {
    // The one directive that turns a defacement into code execution.
    expect(productionCsp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
  });

  it('allows exactly the script hosts sign-in and analytics require, and no others', () => {
    // Pinned as an explicit list so widening it is a deliberate edit with a
    // test to justify, not something that accretes. apis.google.com is where
    // the Firebase Auth SDK loads gapi from; without it the popup flow dies.
    // www.googletagmanager.com serves gtag.js — the loader only; everything it
    // then sends goes out over connect-src.
    const scriptSrc = productionCsp.match(/script-src ([^;]*)/)![1]!.trim();
    expect(scriptSrc.split(/\s+/).sort()).toEqual([
      "'self'",
      'https://apis.google.com',
      'https://www.googletagmanager.com',
    ]);
  });

  it('does not allow a Tag Manager container to be loaded', () => {
    // gtag.js is a fixed script we ask for by measurement id. A GTM container
    // (`/gtm.js`) is a different thing: it injects whatever a web console says
    // to, which in a health application is an open door to third-party
    // scripts nobody reviewed. Nothing in the app requests one, and this is
    // the reminder not to start.
    expect(productionCsp).not.toContain('gtm.js');
    expect(productionCsp).not.toContain('https://tagmanager.google.com');
  });

  it('frames the auth handler and the Google account chooser', () => {
    // authDomain is our own Hosting domain, so /__/auth/iframe is same-origin
    // and needs 'self' — that is easy to miss when moving authDomain.
    const frameSrc = productionCsp.match(/frame-src ([^;]*)/)![1]!;
    expect(frameSrc).toContain("'self'");
    expect(frameSrc).toContain('https://accounts.google.com');
  });

  it('keeps font-src locked to self, which requires fonts never be inlined', () => {
    // If this ever needs `data:`, the real fix is build.assetsInlineLimit in
    // vite.config.ts, not loosening the policy.
    expect(productionCsp).toContain("font-src 'self'");
    expect(productionCsp).not.toMatch(/font-src[^;]*data:/);
  });

  it('keeps the anti-clickjacking and injection directives', () => {
    for (const directive of [
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ]) {
      expect(productionCsp).toContain(directive);
    }
  });

  it('relaxes only scripts and the websocket for the dev server', () => {
    // Dev needs HMR. It must not quietly relax anything else.
    expect(developmentCsp).toMatch(/script-src[^;]*unsafe-inline/);
    expect(developmentCsp).toMatch(/connect-src[^;]*ws:/);
    expect(developmentCsp).toContain("font-src 'self'");
    expect(developmentCsp).toContain("object-src 'none'");
  });
});
