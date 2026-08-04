import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(cleanup);

// jsdom implements neither of these, and components legitimately use both.
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      ...globalThis.crypto,
      randomUUID: () => `test-${Math.random().toString(16).slice(2)}`,
    },
    configurable: true,
  });
}

// `<dialog>` has no layout in jsdom; showModal/close are undefined.
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal =
    HTMLDialogElement.prototype.showModal ??
    function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
  HTMLDialogElement.prototype.close =
    HTMLDialogElement.prototype.close ??
    function close(this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    };
}

// Fail a test that logs an unexpected React error (e.g. an act() warning or a
// prop-type violation) rather than letting it scroll past in the output.
const originalError = console.error;
vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
  originalError(...(args as []));
});
