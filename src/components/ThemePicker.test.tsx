import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

import type { Theme, ThemePreference } from '@/domain/themes';
import { CATALOGS } from '@/i18n/catalogs';
import { format } from '@/i18n/format';
import { I18nContext, type I18nContextValue } from '@/i18n/I18nContext';
import { ThemeContext, type ThemeContextValue } from '@/theme/ThemeContext';
import { render } from '@testing-library/react';

import { ThemePicker } from './ThemePicker';

/**
 * Rendered against a hand-built context rather than `renderWithProviders`,
 * because these tests are about what the picker does *with* the context — the
 * shared helper deliberately supplies an inert one.
 */
function renderPicker(overrides: Partial<ThemeContextValue> = {}) {
  const setPreference = vi.fn(async () => {});
  const theme: ThemeContextValue = {
    preference: 'system',
    theme: 'light',
    setPreference,
    saving: false,
    error: null,
    ...overrides,
  };
  const i18n: I18nContextValue = {
    locale: 'en',
    t: (key, values) => format(CATALOGS.en[key], values),
    setLocale: async () => {},
    saving: false,
    error: null,
  };

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nContext.Provider value={i18n}>
        <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
      </I18nContext.Provider>
    );
  }

  render(<ThemePicker />, { wrapper: Wrapper });
  return { setPreference };
}

describe('ThemePicker', () => {
  it('offers all three choices as radios in one group', () => {
    renderPicker();

    // A radio group, not three checkboxes and not a two-state switch: the
    // choices are mutually exclusive and "device setting" is one of them.
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    for (const label of ['Device setting', 'Light', 'Dark']) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument();
    }
  });

  it.each<[ThemePreference, string]>([
    ['system', 'Device setting'],
    ['light', 'Light'],
    ['dark', 'Dark'],
  ])('marks %s as the checked option', (preference, label) => {
    renderPicker({ preference });
    expect(screen.getByRole('radio', { name: label })).toBeChecked();
  });

  it('asks for the chosen preference, not the resolved theme', async () => {
    // The distinction the whole feature turns on: choosing "device setting"
    // while the device is dark must store `system`, never `dark`. Storing the
    // resolved value would freeze the reader at today's device setting.
    const { setPreference } = renderPicker({ preference: 'light', theme: 'light' });

    await userEvent.click(screen.getByRole('radio', { name: 'Device setting' }));

    expect(setPreference).toHaveBeenCalledWith('system');
  });

  it.each<[Theme, string]>([
    ['dark', 'Following your device, which is currently set to dark.'],
    ['light', 'Following your device, which is currently set to light.'],
  ])('says what following the device currently means in %s', (theme, expected) => {
    renderPicker({ preference: 'system', theme });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('does not explain the device setting when the choice was explicit', () => {
    renderPicker({ preference: 'dark', theme: 'dark' });
    expect(screen.queryByText(/Following your device/)).not.toBeInTheDocument();
  });

  it('locks the control while the choice is being saved', () => {
    renderPicker({ saving: true });
    for (const label of ['Device setting', 'Light', 'Dark']) {
      expect(screen.getByRole('radio', { name: label })).toBeDisabled();
    }
  });

  it('surfaces a failed save without reverting the choice', () => {
    // The theme still applied locally — the alert says the *saving* failed, and
    // `dark` stays selected. Reverting would be the app arguing with a reader
    // about what they are looking at.
    renderPicker({ preference: 'dark', theme: 'dark', error: 'Could not save' });

    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  });
});
