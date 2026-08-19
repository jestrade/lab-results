import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_THEME_PREFERENCE,
  detectSystemTheme,
  isThemePreference,
  resolveTheme,
  THEME_PREFERENCES,
} from '../themes';

describe('isThemePreference', () => {
  it.each(THEME_PREFERENCES)('accepts %s', (preference) => {
    expect(isThemePreference(preference)).toBe(true);
  });

  // Everything here is something that has actually reached this guard: a
  // Firestore field written by an older build, a hand-edited `localStorage`
  // value, a missing document.
  it.each([['Dark'], ['darkmode'], [''], [null], [undefined], [0], [true], [{}]])(
    'rejects %o',
    (value) => {
      expect(isThemePreference(value)).toBe(false);
    },
  );

  it('rejects the resolved theme name that is not a preference', () => {
    // `Theme` and `ThemePreference` overlap on light/dark but not on system,
    // and nothing else may leak in through this guard.
    expect(isThemePreference('auto')).toBe(false);
  });
});

describe('resolveTheme', () => {
  it('follows the device when the preference is system', () => {
    expect(resolveTheme('system', 'dark')).toBe('dark');
    expect(resolveTheme('system', 'light')).toBe('light');
  });

  it('ignores the device when the reader chose explicitly', () => {
    // The point of an explicit choice: a reader on a dark device who asked for
    // light gets light, and is not overridden by their operating system.
    expect(resolveTheme('light', 'dark')).toBe('light');
    expect(resolveTheme('dark', 'light')).toBe('dark');
  });

  it('defaults to following the device', () => {
    expect(resolveTheme(DEFAULT_THEME_PREFERENCE, 'dark')).toBe('dark');
  });
});

describe('detectSystemTheme', () => {
  const original = window.matchMedia;

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      value: original,
      configurable: true,
      writable: true,
    });
  });

  function stubMatchMedia(matches: boolean) {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockReturnValue({ matches }),
      configurable: true,
      writable: true,
    });
  }

  it('reads the device preference', () => {
    stubMatchMedia(true);
    expect(detectSystemTheme()).toBe('dark');

    stubMatchMedia(false);
    expect(detectSystemTheme()).toBe('light');
  });

  it('falls back to light where matchMedia does not exist', () => {
    // jsdom without a stub, and old browsers. This runs before first paint, so
    // throwing here would take the whole app down rather than degrade a colour.
    Object.defineProperty(window, 'matchMedia', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(detectSystemTheme()).toBe('light');
  });
});
