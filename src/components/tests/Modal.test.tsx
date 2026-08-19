import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

// Raw text, so the assertion reads the stylesheet that actually ships.
import appCss from '@/styles/app.css?raw';
import broadsheetCss from '@/styles/broadsheet.css?raw';
import { Modal } from '../Modal';

describe('Modal', () => {
  it('is closed until asked to open', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Delete this report?">
        body
      </Modal>,
    );
    // A native <dialog> without the `open` attribute is hidden by the UA
    // stylesheet. This is the state that regressed once — see below.
    expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute('open');
  });

  it('opens when asked', () => {
    render(
      <Modal open onClose={() => {}} title="Delete this report?">
        body
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('open');
  });
});

/**
 * Regression guard for a bug that shipped: Broadsheet's `.dialog` sets
 * `display: flex` unconditionally, because it is written for a `<div>` inside
 * `.dialog-backdrop`. On the native `<dialog>` element this Modal uses, an
 * author-level `display` beats the UA stylesheet's
 * `dialog:not([open]) { display: none }` — so the dialog rendered permanently,
 * on every page, with empty content.
 *
 * jsdom cannot catch this: it applies no stylesheets to layout. So the
 * assertion is on the CSS text itself. Crude, but it is the difference between
 * someone deleting the override and finding out in review versus in production.
 */
describe('native dialog CSS override', () => {
  it('confirms Broadsheet still sets display unconditionally', () => {
    // If a design-system update removes this, the override below is dead code
    // and this test says so rather than leaving it to rot.
    expect(broadsheetCss).toMatch(/\.dialog \{[^}]*display: flex/);
  });

  it('restores the closed state for a real <dialog> element', () => {
    expect(appCss).toMatch(/dialog\.dialog:not\(\[open\]\)\s*\{\s*display:\s*none/);
  });

  it('styles ::backdrop, since a native dialog has no .dialog-backdrop div', () => {
    expect(appCss).toMatch(/dialog\.dialog::backdrop/);
  });
});
