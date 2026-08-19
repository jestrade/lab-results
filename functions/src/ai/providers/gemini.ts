/**
 * Gemini implementation of `AiProvider` (KAN-16).
 *
 * This is the only file in the project that knows Gemini exists. Everything
 * above it talks to the `AiProvider` interface, so replacing this — or running
 * a second provider beside it for an evaluation — does not reach the pipeline
 * or the prompts.
 *
 * Uses `@google/genai`, the current unified SDK. The older
 * `@google/generative-ai` package is superseded; do not reintroduce it.
 */

import { GoogleGenAI } from '@google/genai';

import type { AiConfig } from '../config';
import {
  AiProviderError,
  type AiGenerateOptions,
  type AiProvider,
  type AiResult,
} from '../types';

/**
 * Gemini's `finishReason` values that mean "the model stopped for a reason you
 * need to handle", rather than "it finished normally".
 */
const BLOCKED_REASONS = new Set(['SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'BLOCKLIST']);

export function createGeminiProvider(config: AiConfig, apiKey: string): AiProvider {
  const client = new GoogleGenAI({ apiKey });

  return {
    id: 'gemini',
    model: config.model,
    contentUsedForTraining: config.contentUsedForTraining,

    async generate<T>(options: AiGenerateOptions<T>): Promise<AiResult<T>> {
      const startedAt = Date.now();
      const wantsJson = options.responseSchema !== undefined;

      const response = await callWithRetry(config, () =>
        withTimeout(
          options.timeoutMs ?? config.timeoutMs,
          client.models.generateContent({
            model: config.model,
            contents: options.input,
            config: {
              systemInstruction: options.prompt.system,
              temperature: options.temperature ?? config.temperature,
              maxOutputTokens: options.maxOutputTokens ?? config.maxOutputTokens,
              ...(wantsJson
                ? {
                    responseMimeType: 'application/json',
                    responseSchema: options.responseSchema,
                  }
                : {}),
              // 2.5 models reason before answering, billed as output tokens.
              // These tasks are extraction and plain-language explanation, not
              // multi-step reasoning, so the budget is spent on the answer.
              // Raise deliberately if a task turns out to need it.
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
        ),
      );

      const finishReason = response.candidates?.[0]?.finishReason ?? 'STOP';

      if (BLOCKED_REASONS.has(finishReason)) {
        // Worth surfacing distinctly: a safety block on a laboratory report is
        // usually a false positive on clinical vocabulary, and the pipeline may
        // want to fall back rather than mark the report failed.
        throw new AiProviderError(
          `Gemini stopped generating: ${finishReason}`,
          'blocked',
        );
      }

      const text = response.text;
      if (!text) {
        throw new AiProviderError(
          `Gemini returned no content (finishReason: ${finishReason})`,
          'invalid-response',
        );
      }

      // MAX_TOKENS on a JSON response means truncated, therefore unparseable —
      // a clearer error here than a confusing JSON syntax failure below.
      if (finishReason === 'MAX_TOKENS' && wantsJson) {
        throw new AiProviderError(
          'Gemini hit the output token limit before completing its JSON response. ' +
            'Raise AI_MAX_OUTPUT_TOKENS or split the request.',
          'invalid-response',
        );
      }

      let parsed: T;
      try {
        parsed = options.parse(wantsJson ? JSON.parse(text) : text);
      } catch (cause) {
        // The raw text is deliberately not attached: it can contain report
        // content, and this error is going into logs and Sentry.
        throw new AiProviderError(
          `Gemini response did not match the expected shape for task "${options.prompt.task}"`,
          'invalid-response',
          { cause },
        );
      }

      const usage = response.usageMetadata;

      return {
        data: parsed,
        metadata: {
          provider: 'gemini',
          model: config.model,
          task: options.prompt.task,
          promptVersion: options.prompt.version,
          finishReason,
          latencyMs: Date.now() - startedAt,
          usage: {
            inputTokens: usage?.promptTokenCount ?? 0,
            outputTokens: usage?.candidatesTokenCount ?? 0,
            totalTokens: usage?.totalTokenCount ?? 0,
          },
          contentUsedForTraining: config.contentUsedForTraining,
          generatedAt: new Date().toISOString(),
        },
      };
    },
  };
}

/** The SDK has no timeout of its own; a hung call would hold the function open. */
async function withTimeout<T>(ms: number, promise: Promise<T>): Promise<T> {
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

async function callWithRetry<T>(config: AiConfig, run: () => Promise<T>): Promise<T> {
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

function toProviderError(caught: unknown): AiProviderError {
  if (caught instanceof AiProviderError) return caught;

  const message = caught instanceof Error ? caught.message : String(caught);
  const status = (caught as { status?: number } | undefined)?.status;

  if (status === 401 || status === 403 || /API key/i.test(message)) {
    return new AiProviderError('Gemini rejected the API key', 'unauthenticated', { cause: caught });
  }
  if (status === 429 || /quota|rate limit/i.test(message)) {
    return new AiProviderError('Gemini rate limit reached', 'rate-limited', { cause: caught });
  }
  if (status !== undefined && status >= 500) {
    return new AiProviderError('Gemini is unavailable', 'unavailable', { cause: caught });
  }
  return new AiProviderError(message, 'unavailable', { cause: caught });
}
