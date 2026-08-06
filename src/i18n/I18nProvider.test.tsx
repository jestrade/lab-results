/**
 * The switch itself (KAN-8).
 *
 * `renderWithProviders` supplies a *fixed* locale, which is right for testing
 * a component's copy and useless for testing the thing this file is about. So
 * these drive the real provider, with the profile service and auth stubbed at
 * their module boundaries.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

import { AuthContext } from '@/auth/AuthContext';
import { LanguagePicker } from '@/components/LanguagePicker';
import { anonymousAuth, signedInAuth } from '@/test/renderWithProviders';

const updateLocalePreference = vi.fn(async () => {});
let emitStoredLocale: ((locale: 'en' | 'es' | null) => void) | null = null;

vi.mock('@/services/profiles', () => ({
  updateLocalePreference: (...args: unknown[]) =>
    updateLocalePreference(...(args as [])),
  subscribeToLocalePreference: (
    _uid: string,
    onChange: (locale: 'en' | 'es' | null) => void,
  ) => {
    emitStoredLocale = onChange;
    return () => {
      emitStoredLocale = null;
    };
  },
}));

const { I18nProvider } = await import('./I18nProvider');

function renderPicker(auth = anonymousAuth) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthContext.Provider value={auth}>
        <I18nProvider>{children}</I18nProvider>
      </AuthContext.Provider>
    );
  }
  return render(<LanguagePicker />, { wrapper: Wrapper });
}

beforeEach(() => {
  window.localStorage.clear();
  updateLocalePreference.mockClear();
  emitStoredLocale = null;
});

afterEach(() => {
  document.documentElement.removeAttribute('lang');
});

describe('choosing a language', () => {
  it('re-renders the interface in the chosen language immediately', async () => {
    const user = userEvent.setup();
    renderPicker();

    expect(screen.getByLabelText('Interface language')).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox'), 'es');

    expect(screen.getByLabelText('Idioma de la interfaz')).toBeInTheDocument();
  });

  it('names each language in its own language, not in the current one', () => {
    // Someone looking for Spanish is scanning for "Español". Translating the
    // language names would hide the option from the person who needs it.
    renderPicker();
    expect(screen.getByRole('option', { name: 'Español' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
  });

  it('remembers the choice on this device', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.selectOptions(screen.getByRole('combobox'), 'es');

    expect(window.localStorage.getItem('labresults.locale')).toBe('es');
  });

  it('sets the document language so screen readers switch pronunciation', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.selectOptions(screen.getByRole('combobox'), 'es');

    await waitFor(() => expect(document.documentElement.lang).toBe('es'));
  });

  it('saves to the profile when signed in', async () => {
    const user = userEvent.setup();
    renderPicker(signedInAuth());

    await user.selectOptions(screen.getByRole('combobox'), 'es');

    await waitFor(() => expect(updateLocalePreference).toHaveBeenCalledWith('test-uid', 'es'));
  });

  it('does not try to save when signed out', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.selectOptions(screen.getByRole('combobox'), 'es');

    expect(updateLocalePreference).not.toHaveBeenCalled();
  });

  it('keeps the chosen language when saving it fails', async () => {
    // A network blip must not strand someone in a language they cannot read.
    updateLocalePreference.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    renderPicker(signedInAuth());

    await user.selectOptions(screen.getByRole('combobox'), 'es');

    expect(screen.getByLabelText('Idioma de la interfaz')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo guardar/i),
    );
  });
});

describe('where the language comes from', () => {
  it('starts in the language remembered on this device', () => {
    window.localStorage.setItem('labresults.locale', 'es');
    renderPicker();
    expect(screen.getByLabelText('Idioma de la interfaz')).toBeInTheDocument();
  });

  it('adopts the account preference once the profile arrives', async () => {
    renderPicker(signedInAuth());
    expect(screen.getByLabelText('Interface language')).toBeInTheDocument();

    act(() => emitStoredLocale?.('es'));

    await waitFor(() =>
      expect(screen.getByLabelText('Idioma de la interfaz')).toBeInTheDocument(),
    );
  });

  it('leaves the device answer alone when the account never chose', async () => {
    window.localStorage.setItem('labresults.locale', 'es');
    renderPicker(signedInAuth());

    // `null` is "this account has no stored preference" — an account created
    // before the picker existed. Treating it as "English" would override a
    // choice the reader made on this device.
    act(() => emitStoredLocale?.(null));

    await waitFor(() =>
      expect(screen.getByLabelText('Idioma de la interfaz')).toBeInTheDocument(),
    );
  });

  it('ignores a stale snapshot arriving while our own write is in flight', async () => {
    let settle: () => void = () => {};
    updateLocalePreference.mockImplementationOnce(
      () => new Promise<void>((resolve) => (settle = resolve)),
    );

    const user = userEvent.setup();
    renderPicker(signedInAuth());
    await user.selectOptions(screen.getByRole('combobox'), 'es');

    // The listener can still deliver the pre-write value. Acting on it would
    // flip the language back under the reader a moment after they chose.
    act(() => emitStoredLocale?.('en'));
    expect(screen.getByLabelText('Idioma de la interfaz')).toBeInTheDocument();

    settle();
  });
});
