/**
 * AI provider configuration (KAN-16, KAN-17).
 *
 * Everything provider-specific is decided here, from environment variables, so
 * changing model or vendor is a config change and a redeploy — not a code
 * change. `AI_PROVIDER=gemini` today; adding `openai` or `anthropic` means
 * adding one file under `providers/` and one case in `registry.ts`.
 *
 * ── Where the API key lives, and where it must not ───────────────────────
 *
 * `GEMINI_API_KEY` is declared as a Firebase **secret**, which stores it in
 * Google Secret Manager and injects it into the function at runtime. It is
 * never in the repository, never in `firebase.json`, and — most importantly —
 * never in anything the browser downloads.
 *
 * A Vite `VITE_`-prefixed variable is inlined into the client bundle at build
 * time and is readable by anyone who opens devtools. An AI provider key there
 * is a key you have published. That is why every AI call in this product is
 * made from a Cloud Function and none from the browser, and why the web app
 * has no code path that could hold this value.
 */

import { defineSecret } from 'firebase-functions/params';

/**
 * Declared at module load so the Firebase CLI can bind it at deploy time.
 * Read it with `.value()` inside a handler, never at module scope — at module
 * scope it is not populated yet.
 */
export const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

/** Secrets every AI-invoking function must declare in its runtime options. */
export const AI_SECRETS = [GEMINI_API_KEY];

export type AiProviderId = 'gemini';

export interface AiConfig {
  provider: AiProviderId;
  model: string;
  /** Hard ceiling per call. Also the main lever on cost per report. */
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
  maxRetries: number;
  /**
   * Whether the configured tier may train on submitted content. Gemini's free
   * tier does; a billed project does not. Surfaced in metadata, and the reason
   * redaction is mandatory rather than advisory.
   */
  contentUsedForTraining: boolean;
}

const DEFAULTS = {
  provider: 'gemini' as AiProviderId,
  model: 'gemini-2.5-flash',
  maxOutputTokens: 2048,
  // Zero. Explanations of laboratory results should be reproducible, and a
  // model that phrases a range differently on each run is a support burden
  // and an inconsistency the user will reasonably read as significance.
  temperature: 0,
  timeoutMs: 30_000,
  maxRetries: 2,
} as const;

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function isProviderId(value: string | undefined): value is AiProviderId {
  return value === 'gemini';
}

export function loadAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const provider = isProviderId(env.AI_PROVIDER) ? env.AI_PROVIDER : DEFAULTS.provider;

  // Default to "yes, it may be trained on", because that is what the free tier
  // does and an unset variable most likely means nobody has enabled billing.
  // The safe default for a privacy flag is the pessimistic one.
  const contentUsedForTraining = env.GEMINI_BILLING_ENABLED !== 'true';

  return {
    provider,
    model: env.GEMINI_MODEL?.trim() || DEFAULTS.model,
    maxOutputTokens: readInt('AI_MAX_OUTPUT_TOKENS', DEFAULTS.maxOutputTokens),
    temperature: readFloat('AI_TEMPERATURE', DEFAULTS.temperature),
    timeoutMs: readInt('AI_TIMEOUT_MS', DEFAULTS.timeoutMs),
    maxRetries: readInt('AI_MAX_RETRIES', DEFAULTS.maxRetries),
    contentUsedForTraining,
  };
}

/**
 * Resolves the API key for the configured provider.
 *
 * Reads the Firebase secret first and falls back to a plain environment
 * variable, which is how the local emulator picks it up from `functions/.env`.
 */
export function resolveApiKey(provider: AiProviderId): string {
  if (provider === 'gemini') {
    const fromSecret = safeSecretValue(GEMINI_API_KEY);
    const key = fromSecret || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error(
        'GEMINI_API_KEY is not set. For deploys run: firebase functions:secrets:set GEMINI_API_KEY. ' +
          'For the emulator, put it in functions/.env (gitignored).',
      );
    }
    return key;
  }
  throw new Error(`Unknown AI provider: ${provider}`);
}

/** `.value()` throws when a secret is not bound — outside a deployed handler. */
function safeSecretValue(secret: { value: () => string }): string | undefined {
  try {
    return secret.value() || undefined;
  } catch {
    return undefined;
  }
}
