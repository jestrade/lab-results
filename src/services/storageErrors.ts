/**
 * Cloud Storage error codes → messages a user can act on (KAN-3).
 *
 * This exists because of a real incident. An upload failed with HTTP 403
 * "Permission denied", and the app said:
 *
 *   "The upload did not finish. Check your connection and try again."
 *
 * The connection was fine. The message sent everyone looking in the wrong
 * place — a permission failure and a network failure have nothing in common,
 * and telling a user to check their wifi when the server refused them is
 * worse than saying nothing.
 *
 * The rule this file follows: never attribute a failure to a cause we have not
 * established. If the code is unrecognised, say so and carry the code, rather
 * than guessing at a friendly-sounding explanation.
 */

import * as Sentry from '@sentry/react';

import { DEFAULT_LOCALE, type Locale } from '@/domain/locales';
import { messageFor } from '@/i18n/catalogs';
import type { MessageKey } from '@/i18n/messages';

export interface StorageErrorMessage {
  message: string;
  /** Whether retrying the identical upload could plausibly succeed. */
  retryable: boolean;
  /** Raw code, carried when we had no specific message for it. */
  code?: string;
}

/**
 * The mapping is from a Storage code to a *message key* plus whether retrying
 * is worth the user's time. The retryable flag is a property of the failure,
 * not of the language, so it stays here; only the sentence moves.
 */
const MESSAGES: Record<string, { key: MessageKey; retryable: boolean }> = {
  'storage/unauthorized': {
    // Deliberately does not blame the user or their file. By the time a
    // request reaches Storage the client has already checked size, type and
    // quota, so a refusal here is almost always a configuration problem on our
    // side — and telling the user to "try a different file" would waste their
    // time on something that cannot help.
    key: 'storageError.unauthorized',
    retryable: false,
  },
  'storage/quota-exceeded': {
    key: 'storageError.quotaExceeded',
    retryable: false,
  },
  'storage/unauthenticated': {
    key: 'storageError.unauthenticated',
    retryable: false,
  },
  'storage/retry-limit-exceeded': {
    key: 'storageError.retryLimit',
    retryable: true,
  },
  'storage/canceled': {
    key: 'storageError.canceled',
    retryable: true,
  },
  'storage/invalid-checksum': {
    key: 'storageError.invalidChecksum',
    retryable: true,
  },
  'storage/server-file-wrong-size': {
    key: 'storageError.wrongSize',
    retryable: true,
  },
};

function codeOf(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error as { code: unknown };
    if (typeof code === 'string') return code;
  }
  return null;
}

export function toStorageErrorMessage(
  error: unknown,
  locale: Locale = DEFAULT_LOCALE,
): StorageErrorMessage {
  // Our own cancellation, thrown before any Storage code exists. The sentinel
  // is matched against the English literal the uploader throws, not against a
  // translated string — it is an internal marker, and making it depend on the
  // reader's language would break cancellation in Spanish.
  if (error instanceof Error && error.message === 'Upload cancelled') {
    const cancelled = MESSAGES['storage/canceled']!;
    return { message: messageFor(locale, cancelled.key), retryable: cancelled.retryable };
  }

  const code = codeOf(error);
  const known = code ? MESSAGES[code] : undefined;
  if (known) {
    return {
      message: messageFor(locale, known.key),
      retryable: known.retryable,
      ...(code ? { code } : {}),
    };
  }

  if (code) {
    // An unmapped storage code is usually configuration, which means it is
    // failing for everyone rather than for one person.
    Sentry.captureMessage(`Unmapped storage error: ${code}`, 'warning');
    if (import.meta.env.DEV) console.error('Unmapped storage error code:', code, error);
  }

  return {
    // The reference is appended rather than interpolated into the sentence:
    // it is a support handle, not prose, and it reads the same in every
    // language.
    message:
      messageFor(locale, 'storageError.unknown') +
      (code ? ` ${messageFor(locale, 'storageError.reference', { code })}` : ''),
    retryable: true,
    ...(code ? { code } : {}),
  };
}
