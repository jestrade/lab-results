import { createContext } from 'react';
import type { User } from 'firebase/auth';

import type { UserRole } from '@/domain/types';

export interface RegistrationConsents {
  acceptedTerms: boolean;
  acceptedAiProcessing: boolean;
}

export interface AuthContextValue {
  user: User | null;
  role: UserRole | null;
  /** True until the persisted session has been resolved one way or the other. */
  loading: boolean;
  isAuthenticated: boolean;
  isEmailVerified: boolean;
  isAdmin: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  register: (
    input: { name: string; email: string; password: string } & RegistrationConsents,
  ) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  signOutUser: () => Promise<void>;
  /** Re-reads the ID token, picking up a freshly granted role or verification. */
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
