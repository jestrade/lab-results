import * as Sentry from '@sentry/react';

import { DEFAULT_LOCALE, type Locale } from '@/domain/locales';
import { messageFor } from '@/i18n/catalogs';
import type { MessageKey } from '@/i18n/messages';

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
 *
 * The table maps a code to a message *key* and to an `action`. The action is a
 * property of the failure rather than of the language — which recovery path to
 * offer does not change when the reader does — so it stays here while the
 * sentence lives in the catalogs.
 */

export interface AuthErrorMessage {
  message: string;
  /** Set when the UI should offer a specific recovery path alongside the text. */
  action?: 'reset-password' | 'sign-in-with-password' | 'contact-support' | 'retry';
  /**
   * The raw Firebase code, present only when we had no specific message for it.
   *
   * This exists because of a real incident: Google sign-in failed on the
   * deployed site and showed only "Something went wrong", which told nobody
   * anything — not the user, not support, not the developer reading the
   * report. An auth error code carries no personal data, so surfacing it is
   * free, and it is the difference between a bug report that can be acted on
   * and one that cannot.
   */
  code?: string;
}

function generic(code: string | null, locale: Locale): AuthErrorMessage {
  return {
    // The reference is appended rather than woven in: it is a support handle,
    // identical in every language.
    message:
      messageFor(locale, 'authError.generic') +
      (code ? ` ${messageFor(locale, 'authError.reference', { code })}` : ''),
    action: 'retry',
    ...(code ? { code } : {}),
  };
}

type AuthErrorEntry = { key: MessageKey; action?: AuthErrorMessage['action'] };

const MESSAGES: Record<string, AuthErrorEntry> = {
  'auth/invalid-credential': { key: 'authError.invalidCredential', action: 'reset-password' },
  'auth/wrong-password': { key: 'authError.invalidCredential', action: 'reset-password' },
  'auth/user-not-found': { key: 'authError.invalidCredential', action: 'reset-password' },
  'auth/invalid-email': { key: 'authError.invalidEmail' },
  'auth/user-disabled': { key: 'authError.userDisabled', action: 'contact-support' },
  'auth/email-already-in-use': { key: 'authError.emailInUse', action: 'reset-password' },
  'auth/account-exists-with-different-credential': { key: 'authError.differentCredential', action: 'sign-in-with-password' },
  'auth/credential-already-in-use': { key: 'authError.credentialInUse' },
  'auth/weak-password': { key: 'authError.weakPassword' },
  'auth/too-many-requests': { key: 'authError.tooManyRequests', action: 'reset-password' },
  'auth/network-request-failed': { key: 'authError.network', action: 'retry' },
  'auth/popup-closed-by-user': { key: 'authError.popupClosed', action: 'retry' },
  'auth/cancelled-popup-request': { key: 'authError.popupClosed', action: 'retry' },
  'auth/popup-blocked': { key: 'authError.popupBlocked' },
  'auth/operation-not-allowed': { key: 'authError.notAllowed', action: 'contact-support' },
  'auth/unauthorized-domain': { key: 'authError.unauthorizedDomain', action: 'contact-support' },
  'auth/web-storage-unsupported': { key: 'authError.storageBlocked' },
  'auth/internal-error': { key: 'authError.internal', action: 'retry' },
  'auth/timeout': { key: 'authError.timeout', action: 'retry' },
  'auth/user-cancelled': { key: 'authError.cancelled', action: 'retry' },
  'auth/requires-recent-login': { key: 'authError.recentLogin' },
  'auth/expired-action-code': { key: 'authError.expiredCode' },
  'auth/invalid-action-code': { key: 'authError.invalidCode' },
};

function codeOf(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error as { code: unknown };
    if (typeof code === 'string') return code;
  }
  return null;
}

export function toAuthErrorMessage(
  error: unknown,
  locale: Locale = DEFAULT_LOCALE,
): AuthErrorMessage {
  const code = codeOf(error);
  const known = code ? MESSAGES[code] : undefined;
  if (known) {
    return {
      message: messageFor(locale, known.key),
      ...(known.action ? { action: known.action } : {}),
    };
  }

  // Unrecognised. Report it so it stops being invisible — an unmapped code is
  // usually a configuration problem, and configuration problems affect
  // everyone at once rather than one unlucky user.
  if (code) {
    Sentry.captureMessage(`Unmapped auth error: ${code}`, 'warning');
    if (import.meta.env.DEV) console.error('Unmapped auth error code:', code, error);
  }
  return generic(code, locale);
}

export const __messagesForTests = MESSAGES;
