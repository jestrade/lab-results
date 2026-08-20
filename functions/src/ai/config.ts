/**
 * AI provider configuration (KAN-16, KAN-17).
 *
 * Everything provider-specific is decided here, from environment variables, so
 * changing model or vendor is a config change and a redeploy — not a code
 * change. `AI_MODEL=firebase` is the default; `AI_MODEL=gemini` keeps the
 * direct Gemini API path available, and adding a third means adding one file
 * under `providers/` and one case in `registry.ts`.
 *
 * ── The two paths to the same model ──────────────────────────────────────
 *
 *   firebase  Firebase AI Logic. The request goes to Firebase, which proxies
 *             it to the Gemini Developer API (or Vertex AI). Authenticated by
 *             the Firebase web config — no separate API key to mint, rotate or
 *             leak — and it is the path that can later be opened to App Check
 *             and on-device inference.
 *
 *   gemini    The Gemini Developer API directly, via `@google/genai` and a
 *             `GEMINI_API_KEY`. Fewer moving parts, one more secret.
 *
 * Both end up at the same model. The choice is about who holds the credential.
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
 *
 * The Firebase web config is the deliberate exception: it identifies the
 * project rather than granting access to it, is already public in the browser
 * bundle, and is mirrored to the functions environment by `sync:env` precisely
 * because it is not a secret.
 */

import { defineSecret } from 'firebase-functions/params';

/**
 * Declared at module load so the Firebase CLI can bind it at deploy time.
 * Read it with `.value()` inside a handler, never at module scope — at module
 * scope it is not populated yet.
 *
 * Still declared when `AI_MODEL=firebase`, which does not need it: the point of
 * keeping both providers is being able to flip the variable and redeploy, and
 * a secret that is only bound on one of the two branches turns that flip into a
 * failed deploy at the worst moment.
 */
export const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

/** Secrets every AI-invoking function must declare in its runtime options. */
export const AI_SECRETS = [GEMINI_API_KEY];

export type AiProviderId = 'firebase' | 'gemini';

/**
 * Which service Firebase AI Logic proxies to.
 *
 * `googleai` is the Gemini Developer API — a free tier, no Cloud billing
 * required, and the `api=dev` path in Firebase's own documentation.
 * `vertexai` is Vertex AI: enterprise controls and data-residency, requires
 * the Blaze plan, never trains on submitted content.
 */
export type FirebaseAiBackend = 'googleai' | 'vertexai';

export interface AiConfig {
  provider: AiProviderId;
  model: string;
  /** Only meaningful when `provider === 'firebase'`. */
  firebaseBackend: FirebaseAiBackend;
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

/** The Firebase web config the AI Logic SDK authenticates with. */
export interface FirebaseAiCredentials {
  apiKey: string;
  projectId: string;
  appId: string;
}

const DEFAULTS = {
  // Firebase AI Logic. The direct Gemini path stays one environment variable
  // away, but the default should be the one that needs no separate secret.
  provider: 'firebase' as AiProviderId,
  backend: 'googleai' as FirebaseAiBackend,
  // Different defaults per path, and not by accident: as of this writing
  // Firebase AI Logic answers `gemini-2.5-flash` with "no longer available to
  // new users", while the direct API still serves it to keys that already had
  // it. One shared default would break whichever path was not tested last.
  firebaseModel: 'gemini-3.6-flash',
  geminiModel: 'gemini-2.5-flash',
  maxOutputTokens: 2048,
  // Zero. Explanations of laboratory results should be reproducible, and a
  // model that phrases a range differently on each run is a support burden
  // and an inconsistency the user will reasonably read as significance.
  temperature: 0,
  timeoutMs: 30_000,
  maxRetries: 2,
} as const;

function readInt(name: string, fallback: number, env: NodeJS.ProcessEnv): number {
  const raw = env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readFloat(name: string, fallback: number, env: NodeJS.ProcessEnv): number {
  const raw = env[name];
  if (!raw) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function isProviderId(value: string | undefined): value is AiProviderId {
  return value === 'gemini' || value === 'firebase';
}

function isFirebaseBackend(value: string | undefined): value is FirebaseAiBackend {
  return value === 'googleai' || value === 'vertexai';
}

/**
 * `AI_MODEL` selects the provider; `AI_PROVIDER` is the name it had before
 * Firebase AI Logic existed and is still honoured so that an environment
 * carrying only the old variable keeps working across the upgrade rather than
 * silently switching provider on deploy.
 */
function selectProvider(env: NodeJS.ProcessEnv): AiProviderId {
  const selector = env.AI_MODEL?.trim() || env.AI_PROVIDER?.trim();
  return isProviderId(selector) ? selector : DEFAULTS.provider;
}

/**
 * The model name for the selected provider.
 *
 * One variable per path, with no fallback between them. That looks like
 * duplication and is not: the two paths do not serve the same set of model
 * ids, so a `GEMINI_MODEL` pinned for the direct API following you onto the
 * Firebase one produces a 404 that reads as if the provider were broken.
 */
function selectModel(provider: AiProviderId, env: NodeJS.ProcessEnv): string {
  return provider === 'firebase'
    ? env.FIREBASE_AI_MODEL?.trim() || DEFAULTS.firebaseModel
    : env.GEMINI_MODEL?.trim() || DEFAULTS.geminiModel;
}

export function loadAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const provider = selectProvider(env);
  const firebaseBackend = isFirebaseBackend(env.FIREBASE_AI_BACKEND?.trim())
    ? (env.FIREBASE_AI_BACKEND!.trim() as FirebaseAiBackend)
    : DEFAULTS.backend;

  return {
    provider,
    model: selectModel(provider, env),
    firebaseBackend,
    maxOutputTokens: readInt('AI_MAX_OUTPUT_TOKENS', DEFAULTS.maxOutputTokens, env),
    temperature: readFloat('AI_TEMPERATURE', DEFAULTS.temperature, env),
    timeoutMs: readInt('AI_TIMEOUT_MS', DEFAULTS.timeoutMs, env),
    maxRetries: readInt('AI_MAX_RETRIES', DEFAULTS.maxRetries, env),
    contentUsedForTraining: resolveTrainingFlag(provider, firebaseBackend, env),
  };
}

/**
 * Whether the configured tier may train on what it is sent.
 *
 * Default to "yes, it may be", because that is what the free tier does and an
 * unset variable most likely means nobody has enabled billing. The safe default
 * for a privacy flag is the pessimistic one.
 *
 * Vertex AI is the one case that can be answered without a flag: it does not
 * use customer content for training under any tier, and Firebase AI Logic
 * cannot reach it without the Blaze plan in the first place.
 */
function resolveTrainingFlag(
  provider: AiProviderId,
  firebaseBackend: FirebaseAiBackend,
  env: NodeJS.ProcessEnv,
): boolean {
  if (provider === 'firebase' && firebaseBackend === 'vertexai') return false;
  const billing = env.AI_BILLING_ENABLED?.trim() || env.GEMINI_BILLING_ENABLED?.trim();
  return billing !== 'true';
}

/**
 * Resolves the API key for the direct Gemini provider.
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
  throw new Error(`No API key is required for AI provider: ${provider}`);
}

/**
 * Resolves the Firebase web config the AI Logic SDK needs.
 *
 * `sync:env` mirrors the three values it uses out of the `VITE_FIREBASE_*`
 * block into `functions/.env` unprefixed, so there is still exactly one place a
 * human edits. Explicit `FIREBASE_*` variables win, which is what lets a
 * deployment point the functions at a different Firebase app than the bundle.
 *
 * `projectId` has a third source: the Functions runtime injects `FIREBASE_CONFIG`
 * and `GCLOUD_PROJECT` on every instance, so a deploy that forgot to sync still
 * gets the right project rather than a confusing 404 against no project at all.
 */
export function resolveFirebaseAiCredentials(
  env: NodeJS.ProcessEnv = process.env,
): FirebaseAiCredentials {
  const apiKey = env.FIREBASE_API_KEY?.trim() || env.VITE_FIREBASE_API_KEY?.trim();
  const projectId =
    env.FIREBASE_PROJECT_ID?.trim() ||
    env.VITE_FIREBASE_PROJECT_ID?.trim() ||
    projectIdFromRuntime(env);
  const appId = env.FIREBASE_APP_ID?.trim() || env.VITE_FIREBASE_APP_ID?.trim();

  const missing = [
    ['FIREBASE_API_KEY', apiKey],
    ['FIREBASE_PROJECT_ID', projectId],
    ['FIREBASE_APP_ID', appId],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Firebase AI Logic is selected (AI_MODEL=firebase) but ${missing.join(', ')} ` +
        'is not set. These are mirrored from the VITE_FIREBASE_* block of the root .env ' +
        'by `npm run sync:env`; run it, or set AI_MODEL=gemini to use the direct Gemini API.',
    );
  }

  return { apiKey: apiKey!, projectId: projectId!, appId: appId! };
}

/** `FIREBASE_CONFIG` is injected into every deployed function by the runtime. */
function projectIdFromRuntime(env: NodeJS.ProcessEnv): string | undefined {
  const fromConfig = env.FIREBASE_CONFIG;
  if (fromConfig) {
    try {
      const parsed = JSON.parse(fromConfig) as { projectId?: unknown };
      if (typeof parsed.projectId === 'string' && parsed.projectId) return parsed.projectId;
    } catch {
      // Malformed FIREBASE_CONFIG is not worth failing over; fall through.
    }
  }
  return env.GCLOUD_PROJECT?.trim() || undefined;
}

/** `.value()` throws when a secret is not bound — outside a deployed handler. */
function safeSecretValue(secret: { value: () => string }): string | undefined {
  try {
    return secret.value() || undefined;
  } catch {
    return undefined;
  }
}
