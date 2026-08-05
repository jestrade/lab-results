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

export interface StorageErrorMessage {
  message: string;
  /** Whether retrying the identical upload could plausibly succeed. */
  retryable: boolean;
  /** Raw code, carried when we had no specific message for it. */
  code?: string;
}

const MESSAGES: Record<string, StorageErrorMessage> = {
  'storage/unauthorized': {
    // Deliberately does not blame the user or their file. By the time a
    // request reaches Storage the client has already checked size, type and
    // quota, so a refusal here is almost always a configuration problem on our
    // side — and telling the user to "try a different file" would waste their
    // time on something that cannot help.
    message:
      'The server refused this upload. This is usually a configuration problem on our side rather than anything wrong with your file — please contact support and quote the reference below. Nothing was stored.',
    retryable: false,
  },
  'storage/quota-exceeded': {
    message:
      'There is no storage space available for this report. Delete a report you no longer need and try again. Nothing was stored.',
    retryable: false,
  },
  'storage/unauthenticated': {
    message: 'Your session has expired. Sign in again and retry the upload.',
    retryable: false,
  },
  'storage/retry-limit-exceeded': {
    message:
      'The upload kept timing out. Check your connection and try again — nothing was stored.',
    retryable: true,
  },
  'storage/canceled': {
    message: 'Upload cancelled. Nothing was stored.',
    retryable: true,
  },
  'storage/invalid-checksum': {
    message:
      'The file changed while it was uploading. Try again without editing it — nothing was stored.',
    retryable: true,
  },
  'storage/server-file-wrong-size': {
    message: 'The upload did not arrive intact. Please try again — nothing was stored.',
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

export function toStorageErrorMessage(error: unknown): StorageErrorMessage {
  // Our own cancellation, thrown before any Storage code exists.
  if (error instanceof Error && error.message === 'Upload cancelled') {
    return MESSAGES['storage/canceled']!;
  }

  const code = codeOf(error);
  const known = code ? MESSAGES[code] : undefined;
  if (known) return code ? { ...known, code } : known;

  if (code) {
    // An unmapped storage code is usually configuration, which means it is
    // failing for everyone rather than for one person.
    Sentry.captureMessage(`Unmapped storage error: ${code}`, 'warning');
    if (import.meta.env.DEV) console.error('Unmapped storage error code:', code, error);
  }

  return {
    message:
      'The upload did not finish. Please try again, and contact support if it keeps happening. Nothing was stored.' +
      (code ? ` (reference: ${code})` : ''),
    retryable: true,
    ...(code ? { code } : {}),
  };
}
