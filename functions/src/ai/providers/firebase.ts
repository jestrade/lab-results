/**
 * Firebase AI Logic implementation of `AiProvider` (KAN-16).
 *
 * https://firebase.google.com/docs/ai-logic/get-started?platform=web
 *
 * The request goes to Firebase, which proxies it to the Gemini Developer API
 * (`GoogleAIBackend`, the default) or to Vertex AI (`VertexAIBackend`). The
 * difference from `providers/gemini.ts` is not the model — both reach the same
 * Gemini — it is the credential: this path authenticates with the Firebase web
 * config, which is public by design and already in the browser bundle, so there
 * is no additional secret to mint, rotate, bind at deploy time or leak.
 *
 * ── Why a client SDK runs in a Cloud Function ────────────────────────────
 *
 * `firebase/ai` is documented for web apps, and it ships a Node build that this
 * uses. Calling it from a function rather than the browser is deliberate and is
 * the same decision the rest of this layer already made: redaction happens in
 * `registry.ts`, before anything leaves the process, and it can only be a
 * guarantee if the process is one we control. Moving AI calls into the browser
 * would put the report text on the wire before any redaction had run.
 *
 * ── App Check, from a caller that cannot be attested ─────────────────────
 *
 * Firebase AI Logic requires an App Check token, and the browser SDK gets one
 * by attesting that it is a genuine app instance. A Cloud Function is not an
 * app instance and cannot produce that attestation; without a token the API
 * answers `401 Firebase App Check token is invalid` and nothing works.
 *
 * The supported way out is the pair of hooks Firebase provides for exactly this
 * shape of caller: `firebase-admin` mints a token for the registered app with
 * `appCheck().createToken()`, and the client SDK accepts it through a
 * `CustomProvider`. The trust does not come from attestation here — it comes
 * from holding the service account, which is a stronger claim, not a weaker one.
 *
 * Minting is best-effort. A project with enforcement switched off does not need
 * the token, and failing the whole AI pipeline because a token could not be
 * minted would turn an optional control into a hard dependency.
 */

import { getAppCheck } from 'firebase-admin/app-check';
import * as logger from 'firebase-functions/logger';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAIBackend,
  VertexAIBackend,
  getAI,
  getGenerativeModel,
  type Backend,
  type SchemaRequest,
} from 'firebase/ai';
import { CustomProvider, initializeAppCheck } from 'firebase/app-check';

import type { AiConfig, FirebaseAiCredentials } from '../config';
import {
  AiProviderError,
  type AiGenerateOptions,
  type AiProvider,
  type AiResult,
} from '../types';
import { BLOCKED_FINISH_REASONS, callWithRetry, withTimeout } from './shared';

/**
 * A named app, not the default one.
 *
 * `firebase-admin` owns the default app in this runtime and initialises it with
 * service-account credentials for an entirely different purpose. Sharing a name
 * with it would be an intermittent, warm-instance-dependent failure — exactly
 * the kind that never reproduces locally.
 */
const APP_NAME = 'lab-results-ai-logic';

function firebaseApp(credentials: FirebaseAiCredentials): FirebaseApp {
  // Cloud Functions reuse warm instances, and `initializeApp` with a name that
  // already exists throws `app/duplicate-app`. Returning the existing app also
  // keeps its App Check registration, which may only be attached once.
  if (getApps().some((app) => app.name === APP_NAME)) return getApp(APP_NAME);

  const app = initializeApp(credentials, APP_NAME);
  attachAppCheck(app, credentials.appId);
  return app;
}

/**
 * Registers a token source the AI Logic SDK will call before each request.
 *
 * `isTokenAutoRefreshEnabled: false` because a function is not a long-lived
 * page: a background refresh timer would keep an instance from being reclaimed
 * to renew a token nobody is waiting on. Tokens last an hour and are minted on
 * demand instead.
 */
function attachAppCheck(app: FirebaseApp, appId: string): void {
  try {
    initializeAppCheck(app, {
      isTokenAutoRefreshEnabled: false,
      provider: new CustomProvider({
        getToken: async () => {
          const minted = await getAppCheck().createToken(appId);
          return {
            token: minted.token,
            expireTimeMillis: Date.now() + minted.ttlMillis,
          };
        },
      }),
    });
  } catch (caught) {
    // Best-effort by design: if enforcement is off the call succeeds without a
    // token, and if it is on the request fails with a message that says so.
    // Neither outcome is improved by taking the pipeline down here.
    logger.warn('Could not attach App Check to the Firebase AI Logic app', {
      message: caught instanceof Error ? caught.message : String(caught),
    });
  }
}

function backendFor(config: AiConfig): Backend {
  return config.firebaseBackend === 'vertexai' ? new VertexAIBackend() : new GoogleAIBackend();
}

export function createFirebaseAiProvider(
  config: AiConfig,
  credentials: FirebaseAiCredentials,
): AiProvider {
  const ai = getAI(firebaseApp(credentials), { backend: backendFor(config) });

  return {
    id: 'firebase',
    model: config.model,
    contentUsedForTraining: config.contentUsedForTraining,

    async generate<T>(options: AiGenerateOptions<T>): Promise<AiResult<T>> {
      const startedAt = Date.now();
      const wantsJson = options.responseSchema !== undefined;
      const timeoutMs = options.timeoutMs ?? config.timeoutMs;

      // Built per call rather than once: the system instruction, the schema and
      // the token ceiling differ per task, and a `GenerativeModel` is a plain
      // object over the shared `ai` handle — there is no client to rebuild.
      const model = getGenerativeModel(
        ai,
        {
          model: config.model,
          systemInstruction: options.prompt.system,
          generationConfig: {
            temperature: options.temperature ?? config.temperature,
            maxOutputTokens: options.maxOutputTokens ?? config.maxOutputTokens,
            ...(wantsJson
              ? {
                  responseMimeType: 'application/json',
                  responseSchema: options.responseSchema as unknown as SchemaRequest,
                }
              : {}),
            // Gemini reasons before answering and bills it as output tokens.
            // These tasks are extraction and plain-language explanation, not
            // multi-step reasoning, so the budget is spent on the answer —
            // the same decision `providers/gemini.ts` makes.
            //
            // Cast because `GenerationConfig` in firebase/ai does not declare
            // the field yet. It is not being smuggled past a validator: the
            // SDK forwards `generationConfig` verbatim, and the API rejects
            // unknown keys with a 400 (verified), so a name that stops being
            // accepted fails loudly rather than silently costing money.
            ...({ thinkingConfig: { thinkingBudget: 0 } } as object),
          },
        },
        // The SDK aborts the fetch at this deadline. `withTimeout` below is the
        // belt to that braces: it bounds the whole call, including anything the
        // SDK does after the response arrives.
        { timeout: timeoutMs },
      );

      const response = await callWithRetry(config, toProviderError, async () => {
        const result = await withTimeout(timeoutMs, model.generateContent(options.input));
        return result.response;
      });

      const blockReason = response.promptFeedback?.blockReason;
      if (blockReason) {
        throw new AiProviderError(
          `Firebase AI Logic blocked the prompt: ${blockReason}`,
          'blocked',
        );
      }

      const finishReason = response.candidates?.[0]?.finishReason ?? 'STOP';

      if (BLOCKED_FINISH_REASONS.has(finishReason)) {
        // Worth surfacing distinctly: a safety block on a laboratory report is
        // usually a false positive on clinical vocabulary, and the pipeline may
        // want to fall back rather than mark the report failed.
        throw new AiProviderError(
          `Firebase AI Logic stopped generating: ${finishReason}`,
          'blocked',
        );
      }

      // MAX_TOKENS on a JSON response means truncated, therefore unparseable —
      // a clearer error here than a confusing JSON syntax failure below. Its
      // own code rather than `invalid-response`, because the cause is known
      // and the user can act on it: this report is too long for one pass, and
      // no amount of retrying the same bytes will change that. Checked before
      // reading the text, because a truncated candidate still has some.
      if (finishReason === 'MAX_TOKENS' && wantsJson) {
        throw new AiProviderError(
          'Firebase AI Logic hit the output token limit before completing its JSON response. ' +
            'Raise AI_MAX_OUTPUT_TOKENS or split the request.',
          'truncated',
        );
      }

      // `text()` throws rather than returning empty when a candidate was
      // filtered, so the blocked cases above have to be handled first.
      let text: string;
      try {
        text = response.text();
      } catch (cause) {
        throw new AiProviderError(
          `Firebase AI Logic returned no usable content (finishReason: ${finishReason})`,
          'invalid-response',
          { cause },
        );
      }

      if (!text) {
        throw new AiProviderError(
          `Firebase AI Logic returned no content (finishReason: ${finishReason})`,
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
          `Firebase AI Logic response did not match the expected shape for task "${options.prompt.task}"`,
          'invalid-response',
          { cause },
        );
      }

      const usage = response.usageMetadata;

      return {
        data: parsed,
        metadata: {
          provider: 'firebase',
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

/**
 * Translates the SDK's failures into the codes the pipeline retries on.
 *
 * `AIError` carries a namespaced code (`AI/fetch-error`) and, for HTTP
 * failures, the status in `customErrorData`. Both are matched loosely on
 * purpose: this is error handling, and it must not itself throw because a
 * future SDK version reshaped an error object.
 */
export function toProviderError(caught: unknown): AiProviderError {
  if (caught instanceof AiProviderError) return caught;

  const message = caught instanceof Error ? caught.message : String(caught);
  const code = typeof (caught as { code?: unknown })?.code === 'string'
    ? (caught as { code: string }).code
    : '';
  const status = (caught as { customErrorData?: { status?: number } } | undefined)?.customErrorData
    ?.status;

  // The most common first-run failure by a distance, and the one whose default
  // message sends people to look at the wrong thing.
  if (code.endsWith('api-not-enabled')) {
    return new AiProviderError(
      'The Firebase AI Logic API is not enabled for this project, or the API key does not ' +
        'permit it. Enable it in the Firebase console under AI Logic, then retry.',
      'unauthenticated',
      { cause: caught },
    );
  }
  if (code.endsWith('no-api-key') || code.endsWith('no-project-id') || code.endsWith('no-app-id')) {
    return new AiProviderError(
      `Firebase AI Logic is missing web configuration: ${message}`,
      'unauthenticated',
      { cause: caught },
    );
  }

  if (status === 401 || status === 403) {
    return new AiProviderError(
      'Firebase AI Logic rejected the request as unauthorised. If the message names App Check, ' +
        'the function could not mint a token: check that the service account has the Firebase ' +
        'App Check Token Creator role and that FIREBASE_APP_ID names a registered web app. ' +
        `Underlying message: ${message}`,
      'unauthenticated',
      { cause: caught },
    );
  }
  if (status === 429 || /quota|rate limit/i.test(message)) {
    // A depleted balance arrives as a 429 alongside genuine rate limits, and
    // the two need very different responses: one clears by waiting, the other
    // never does. Still classified retryable — the retries are bounded and the
    // condition can be fixed while a batch is in flight — but the message has
    // to name the cause, or an admin spends the afternoon looking at quotas.
    const depleted = /credit|billing|prepay/i.test(message);
    return new AiProviderError(
      depleted
        ? 'Firebase AI Logic rejected the call: the project has no AI credits left. ' +
          'Top up billing for the Gemini API — waiting will not clear this.'
        : 'Firebase AI Logic rate limit reached',
      'rate-limited',
      { cause: caught },
    );
  }
  if (status !== undefined && status >= 500) {
    return new AiProviderError('Firebase AI Logic is unavailable', 'unavailable', { cause: caught });
  }
  if (/abort/i.test(message) || /timeout/i.test(message)) {
    return new AiProviderError(message, 'timeout', { cause: caught });
  }

  return new AiProviderError(message, 'unavailable', { cause: caught });
}
