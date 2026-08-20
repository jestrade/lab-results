/**
 * Cross-provider call plumbing.
 *
 * Timeouts and retry/backoff are not vendor concepts — every provider needs the
 * same two guarantees (a hung call must not hold the function open; a transient
 * fault is worth one more attempt, a safety block is not). Keeping them here
 * means a second provider inherits the behaviour that was tuned for the first,
 * rather than a subtly different copy of it.
 *
 * What stays provider-specific is the *classification*: only the vendor's file
 * knows that its 429 is a quota error and its `api-not-enabled` is a setup
 * mistake. That is why `callWithRetry` takes the mapper rather than owning one.
 */

import type { AiConfig } from '../config';
import { AiProviderError } from '../types';

/** No SDK here is guaranteed to time out on its own; a hung call would hold the function open. */
export async function withTimeout<T>(ms: number, promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new AiProviderError(`AI request exceeded ${ms}ms`, 'timeout')),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function callWithRetry<T>(
  config: Pick<AiConfig, 'maxRetries'>,
  toProviderError: (caught: unknown) => AiProviderError,
  run: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    try {
      return await run();
    } catch (caught) {
      lastError = caught;
      const error = toProviderError(caught);

      // A safety block or a malformed response will fail identically on retry;
      // only transient faults are worth spending another call on.
      if (!error.retryable || attempt === config.maxRetries) throw error;

      // Exponential backoff with jitter, so a batch of reports failing at once
      // does not retry in lockstep and re-create the rate limit it hit.
      const backoff = 2 ** attempt * 500;
      await new Promise((resolve) => setTimeout(resolve, backoff + Math.random() * 250));
    }
  }

  throw toProviderError(lastError);
}

/**
 * `finishReason` values that mean "the model stopped for a reason you need to
 * handle", rather than "it finished normally". The vocabulary is Gemini's and
 * is shared by both backends that serve it.
 */
export const BLOCKED_FINISH_REASONS = new Set([
  'SAFETY',
  'RECITATION',
  'PROHIBITED_CONTENT',
  'BLOCKLIST',
]);
