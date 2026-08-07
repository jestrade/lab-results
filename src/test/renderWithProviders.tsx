import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AuthContext, type AuthContextValue } from '@/auth/AuthContext';
import { ToastProvider } from '@/components/ToastProvider';
import type { Locale } from '@/domain/locales';
import { CATALOGS } from '@/i18n/catalogs';
import { format } from '@/i18n/format';
import { I18nContext, type I18nContextValue } from '@/i18n/I18nContext';
import type { Theme } from '@/domain/themes';
import { ThemeContext, type ThemeContextValue } from '@/theme/ThemeContext';

/**
 * Renders a component inside the providers it expects, with the auth state
 * supplied directly rather than through Firebase.
 *
 * Stubbing at the context boundary keeps these tests about the component: no
 * network, no emulator, no async session resolution to wait on. The real
 * provider is exercised separately by the e2e suite.
 */
export const anonymousAuth: AuthContextValue = {
  user: null,
  role: null,
  loading: false,
  isAuthenticated: false,
  isEmailVerified: false,
  isAdmin: false,
  signInWithEmail: async () => {},
  signInWithGoogle: async () => {},
  register: async () => {},
  sendPasswordReset: async () => {},
  resendVerification: async () => {},
  signOutUser: async () => {},
  refresh: async () => {},
};

export function signedInAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    ...anonymousAuth,
    user: { uid: 'test-uid', email: 'test@example.com', displayName: 'Test User' } as never,
    role: 'user',
    isAuthenticated: true,
    isEmailVerified: true,
    ...overrides,
  };
}

/**
 * A language context with the real catalogs but no persistence.
 *
 * The real `I18nProvider` subscribes to the profile document, which would put
 * a Firestore listener behind every component test. What these tests need from
 * it is the translation, not the plumbing — so the locale is fixed and
 * `setLocale` does nothing. Tests of the *switching* behaviour drive the
 * provider directly instead.
 */
function fixedI18n(locale: Locale): I18nContextValue {
  return {
    locale,
    t: (key, values) => format(CATALOGS[locale][key], values),
    setLocale: async () => {},
    saving: false,
    error: null,
  };
}

/**
 * A theme context with no persistence, for the same reason `fixedI18n` has none.
 *
 * Defaults to light because that is what a component test should be reasoning
 * about unless it says otherwise — and because the theme lives on `<html>`
 * rather than in the rendered markup, so for most tests this only needs to
 * exist, not to be any particular value.
 */
function fixedTheme(theme: Theme): ThemeContextValue {
  return {
    preference: theme,
    theme,
    setPreference: async () => {},
    saving: false,
    error: null,
  };
}

export interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  auth?: AuthContextValue;
  route?: string;
  /** Render in this language. Defaults to English, as the app does. */
  locale?: Locale;
  /** Render in this theme. Defaults to light. */
  theme?: Theme;
}

export function renderWithProviders(
  ui: ReactElement,
  {
    auth = anonymousAuth,
    route = '/',
    locale = 'en',
    theme = 'light',
    ...options
  }: ProviderOptions = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        <AuthContext.Provider value={auth}>
          <I18nContext.Provider value={fixedI18n(locale)}>
            <ThemeContext.Provider value={fixedTheme(theme)}>
              <ToastProvider>{children}</ToastProvider>
            </ThemeContext.Provider>
          </I18nContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}
