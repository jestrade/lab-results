/**
 * Firebase auth error codes → the messages the design board specifies (KAN-1).
 *
 * Two rules shape this table.
 *
 * **Do not confirm whether an account exists.** `auth/user-not-found` and
 * `auth/wrong-password` both produce the same sentence, because telling the
 * difference apart hands an attacker a free account-enumeration oracle. Modern
 * Firebase projects collapse both into `auth/invalid-credential` for the same
 * reason; the older codes are mapped identically so the behaviour does not
 * depend on a project setting.
 *
 * **Say what to do next.** Every message ends with an action the user can
 * actually take, rather than restating that something went wrong.
 */

export interface AuthErrorMessage {
  message: string;
  /** Set when the UI should offer a specific recovery path alongside the text. */
  action?: 'reset-password' | 'sign-in-with-password' | 'contact-support' | 'retry';
}

const GENERIC: AuthErrorMessage = {
  message:
    'Something went wrong while signing you in. Please try again, and contact support if it keeps happening.',
  action: 'retry',
};

const MESSAGES: Record<string, AuthErrorMessage> = {
  'auth/invalid-credential': {
    message:
      "That email and password don't match. Check them and try again, or reset your password.",
    action: 'reset-password',
  },
  'auth/wrong-password': {
    message:
      "That email and password don't match. Check them and try again, or reset your password.",
    action: 'reset-password',
  },
  'auth/user-not-found': {
    message:
      "That email and password don't match. Check them and try again, or reset your password.",
    action: 'reset-password',
  },
  'auth/invalid-email': {
    message: "That doesn't look like an email address. Check it and try again.",
  },
  'auth/user-disabled': {
    message: 'This account has been disabled. Contact support if you think this is a mistake.',
    action: 'contact-support',
  },
  'auth/email-already-in-use': {
    message:
      'An account already exists for this email address. Sign in instead, or reset your password if you have forgotten it.',
    action: 'reset-password',
  },
  'auth/account-exists-with-different-credential': {
    message:
      "This email already has a password account. Sign in with your password once and we'll link your Google account to it.",
    action: 'sign-in-with-password',
  },
  'auth/credential-already-in-use': {
    message: 'That Google account is already linked to a different LabResults account.',
  },
  'auth/weak-password': {
    message: 'That password is too easy to guess. Use at least 10 characters.',
  },
  'auth/too-many-requests': {
    message:
      'Too many attempts from this device. Wait a few minutes before trying again, or reset your password.',
    action: 'reset-password',
  },
  'auth/network-request-failed': {
    message: 'We could not reach the server. Check your connection and try again.',
    action: 'retry',
  },
  'auth/popup-closed-by-user': {
    message: 'The Google sign-in window closed before finishing. Try again when you are ready.',
    action: 'retry',
  },
  'auth/cancelled-popup-request': {
    message: 'The Google sign-in window closed before finishing. Try again when you are ready.',
    action: 'retry',
  },
  'auth/popup-blocked': {
    message:
      'Your browser blocked the Google sign-in window. Allow pop-ups for this site, or sign in with your email and password.',
  },
  'auth/requires-recent-login': {
    message: 'For your security, sign in again before making this change.',
  },
  'auth/expired-action-code': {
    message: 'That link has expired. Request a new one and use it within an hour.',
  },
  'auth/invalid-action-code': {
    message:
      'That link is no longer valid — it may already have been used. Request a new one.',
  },
};

function codeOf(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error as { code: unknown };
    if (typeof code === 'string') return code;
  }
  return null;
}

export function toAuthErrorMessage(error: unknown): AuthErrorMessage {
  const code = codeOf(error);
  return (code && MESSAGES[code]) || GENERIC;
}

export const __messagesForTests = MESSAGES;
