import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyDocumentTheme, bootTheme, resolveInitialThemePreference, subscribeToSystemTheme } from '../resolve';
import { readStoredThemePreference, writeStoredThemePreference } from '../storage';

function stubMatchMedia(matches: boolean, listeners: { add?: unknown; remove?: unknown } = {}) {
  const query = {
    matches,
    addEventListener: listeners.add ?? vi.fn(),
    removeEventListener: listeners.remove ?? vi.fn(),
  };
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockReturnValue(query),
    configurable: true,
    writable: true,
  });
  return query;
}

describe('theme storage', () => {
  beforeEach(() => window.localStorage.clear());

  it('round-trips a preference', () => {
    writeStoredThemePreference('dark');
    expect(readStoredThemePreference()).toBe('dark');
  });

  it('reads nothing when nothing was stored', () => {
    expect(readStoredThemePreference()).toBeNull();
  });

  it('rejects a stored value that is not a preference', () => {
    // Hand-edited storage, or a value written by a future build that this one
    // does not understand. Either way it must not reach the stylesheet.
    window.localStorage.setItem('labresults.theme', 'midnight');
    expect(readStoredThemePreference()).toBeNull();
  });

  it('survives storage being unavailable', () => {
    // Safari private mode and "block all cookies" both throw from getItem.
    // This runs before first paint, so throwing would be a blank page.
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('denied');
      });
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('denied');
      });

    expect(() => writeStoredThemePreference('dark')).not.toThrow();
    expect(readStoredThemePreference()).toBeNull();

    getItem.mockRestore();
    setItem.mockRestore();
  });
});

describe('resolveInitialThemePreference', () => {
  beforeEach(() => window.localStorage.clear());

  it('prefers what this device remembers', () => {
    writeStoredThemePreference('light');
    expect(resolveInitialThemePreference()).toBe('light');
  });

  it('follows the device when nothing was ever chosen', () => {
    expect(resolveInitialThemePreference()).toBe('system');
  });
});

describe('applyDocumentTheme', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
    document.documentElement.style.colorScheme = '';
  });

  it('sets both the stylesheet hook and the browser hint', () => {
    applyDocumentTheme('dark');

    expect(document.documentElement.dataset.theme).toBe('dark');
    // `color-scheme` is what makes scrollbars, form controls and autofill
    // follow. Without it the page is dark but its widgets are not.
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('replaces the previous theme rather than accumulating', () => {
    applyDocumentTheme('dark');
    applyDocumentTheme('light');

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
});

describe('bootTheme', () => {
  beforeEach(() => window.localStorage.clear());

  afterEach(() => {
    delete document.documentElement.dataset.theme;
    document.documentElement.style.colorScheme = '';
  });

  it('paints the remembered choice over the device setting', () => {
    stubMatchMedia(true); // device says dark
    writeStoredThemePreference('light');

    bootTheme();

    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('paints the device setting when nothing was chosen', () => {
    stubMatchMedia(true);

    bootTheme();

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('resolves system to a concrete theme, never leaving `system` on the element', () => {
    // The stylesheet only knows `light` and `dark`; `data-theme="system"` would
    // match no rule and silently render the light theme.
    stubMatchMedia(true);
    writeStoredThemePreference('system');

    bootTheme();

    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('subscribeToSystemTheme', () => {
  it('reports device changes as themes, and unsubscribes', () => {
    let handler: ((event: MediaQueryListEvent) => void) | undefined;
    const add = vi.fn((_: string, fn: (event: MediaQueryListEvent) => void) => {
      handler = fn;
    });
    const remove = vi.fn();
    stubMatchMedia(false, { add, remove });

    const onChange = vi.fn();
    const unsubscribe = subscribeToSystemTheme(onChange);

    handler?.({ matches: true } as MediaQueryListEvent);
    expect(onChange).toHaveBeenCalledWith('dark');

    handler?.({ matches: false } as MediaQueryListEvent);
    expect(onChange).toHaveBeenCalledWith('light');

    unsubscribe();
    expect(remove).toHaveBeenCalled();
  });

  it('falls back to the deprecated listener API', () => {
    // Safari below 14. Feature-detected rather than version-sniffed, and
    // supported rather than dropped: without it the theme silently stops
    // following the device on those browsers.
    const addListener = vi.fn();
    const removeListener = vi.fn();
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockReturnValue({ matches: false, addListener, removeListener }),
      configurable: true,
      writable: true,
    });

    const unsubscribe = subscribeToSystemTheme(vi.fn());
    expect(addListener).toHaveBeenCalled();

    unsubscribe();
    expect(removeListener).toHaveBeenCalled();
  });

  it('is a no-op where matchMedia does not exist', () => {
    Object.defineProperty(window, 'matchMedia', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    expect(() => subscribeToSystemTheme(vi.fn())()).not.toThrow();
  });
});
