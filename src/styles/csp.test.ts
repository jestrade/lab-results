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
    expect(productionCsp).toContain("script-src 'self'");
    expect(productionCsp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
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
