import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AuthContext, type AuthContextValue } from '@/auth/AuthContext';
import { ToastProvider } from '@/components/ToastProvider';

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

export interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  auth?: AuthContextValue;
  route?: string;
}

export function renderWithProviders(
  ui: ReactElement,
  { auth = anonymousAuth, route = '/', ...options }: ProviderOptions = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        <AuthContext.Provider value={auth}>
          <ToastProvider>{children}</ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}
