/**
 * Firebase AI Logic provider.
 *
 * The SDK is mocked rather than called: these tests are about the translation
 * layer — what the provider does with a blocked candidate, a truncated JSON
 * response, a 429 — and none of that is worth a network round trip to observe.
 * Whether the real endpoint answers is what `aiHealthCheck` is for.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();
const getGenerativeModel = vi.fn(() => ({ generateContent }));
const initializeApp = vi.fn(() => ({ name: 'lab-results-ai-logic' }));
const getApps = vi.fn(() => [] as Array<{ name: string }>);
const initializeAppCheck = vi.fn();
const createToken = vi.fn(async () => ({ token: 'app-check-token', ttlMillis: 3_600_000 }));

vi.mock('firebase/app', () => ({
  initializeApp: (...args: unknown[]) => initializeApp(...(args as [])),
  getApps: () => getApps(),
  getApp: (name: string) => ({ name }),
}));

vi.mock('firebase/app-check', () => ({
  initializeAppCheck: (...args: unknown[]) => initializeAppCheck(...(args as [])),
  // Keeps the token callback reachable, which is the half worth testing.
  CustomProvider: class CustomProvider {
    constructor(readonly options: { getToken: () => Promise<unknown> }) {}
  },
}));

vi.mock('firebase-admin/app-check', () => ({
  getAppCheck: () => ({ createToken }),
}));

vi.mock('firebase/ai', () => ({
  getAI: vi.fn(() => ({ backend: 'fake' })),
  getGenerativeModel: (...args: unknown[]) => getGenerativeModel(...(args as [])),
  GoogleAIBackend: class GoogleAIBackend {},
  VertexAIBackend: class VertexAIBackend {},
}));

const { createFirebaseAiProvider, toProviderError } = await import('../providers/firebase');
const { HEALTH_CHECK } = await import('../prompts');
const { AiProviderError } = await import('../types');
import type { AiConfig } from '../config';

const CONFIG: AiConfig = {
  provider: 'firebase',
  model: 'gemini-2.5-flash',
  firebaseBackend: 'googleai',
  maxOutputTokens: 2048,
  temperature: 0,
  timeoutMs: 5_000,
  // Zero, so a test of a terminal failure does not also sit through backoff.
  maxRetries: 0,
  contentUsedForTraining: true,
};

const CREDENTIALS = { apiKey: 'k', projectId: 'p', appId: 'a' };

function provider(overrides: Partial<AiConfig> = {}) {
  return createFirebaseAiProvider({ ...CONFIG, ...overrides }, CREDENTIALS);
}

function reply(body: {
  text?: string;
  finishReason?: string;
  blockReason?: string;
  usage?: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number };
}) {
  return {
    response: {
      text: () => {
        if (body.text === undefined) throw new Error('Text not available.');
        return body.text;
      },
      candidates: [{ finishReason: body.finishReason ?? 'STOP' }],
      promptFeedback: body.blockReason ? { blockReason: body.blockReason } : undefined,
      usageMetadata: body.usage,
    },
  };
}

const OK_SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };
const parseOk = (raw: unknown) => raw as { ok: boolean };

beforeEach(() => {
  vi.clearAllMocks();
  getApps.mockReturnValue([]);
  initializeAppCheck.mockReturnValue(undefined);
  createToken.mockResolvedValue({ token: 'app-check-token', ttlMillis: 3_600_000 });
});

/** The `getToken` the provider handed to the SDK's CustomProvider. */
function registeredTokenSource(): () => Promise<{ token: string; expireTimeMillis: number }> {
  const options = initializeAppCheck.mock.calls[0]?.[1] as {
    provider: { options: { getToken: () => Promise<{ token: string; expireTimeMillis: number }> } };
  };
  return options.provider.options.getToken;
}

describe('createFirebaseAiProvider', () => {
  it('returns parsed data and provenance the pipeline can store', async () => {
    generateContent.mockResolvedValue(
      reply({
        text: '{"ok":true}',
        usage: { promptTokenCount: 11, candidatesTokenCount: 3, totalTokenCount: 14 },
      }),
    );

    const result = await provider().generate({
      prompt: HEALTH_CHECK,
      input: 'ping',
      responseSchema: OK_SCHEMA,
      parse: parseOk,
    });

    expect(result.data).toEqual({ ok: true });
    expect(result.metadata.provider).toBe('firebase');
    expect(result.metadata.model).toBe('gemini-2.5-flash');
    expect(result.metadata.promptVersion).toBe(HEALTH_CHECK.version);
    expect(result.metadata.usage).toEqual({ inputTokens: 11, outputTokens: 3, totalTokens: 14 });
    expect(result.metadata.contentUsedForTraining).toBe(true);
  });

  it('asks for JSON constrained by the caller schema', async () => {
    generateContent.mockResolvedValue(reply({ text: '{"ok":true}' }));

    await provider().generate({
      prompt: HEALTH_CHECK,
      input: 'ping',
      responseSchema: OK_SCHEMA,
      parse: parseOk,
      maxOutputTokens: 64,
    });

    const params = getGenerativeModel.mock.calls[0]?.[1] as {
      systemInstruction: string;
      generationConfig: Record<string, unknown>;
    };
    expect(params.systemInstruction).toBe(HEALTH_CHECK.system);
    expect(params.generationConfig.responseMimeType).toBe('application/json');
    expect(params.generationConfig.responseSchema).toEqual(OK_SCHEMA);
    expect(params.generationConfig.maxOutputTokens).toBe(64);
    expect(params.generationConfig.temperature).toBe(0);
  });

  it('leaves the response unconstrained when no schema is given', async () => {
    generateContent.mockResolvedValue(reply({ text: 'plain text' }));

    const result = await provider().generate({
      prompt: HEALTH_CHECK,
      input: 'ping',
      parse: (raw) => raw as string,
    });

    expect(result.data).toBe('plain text');
    const params = getGenerativeModel.mock.calls[0]?.[1] as {
      generationConfig: Record<string, unknown>;
    };
    expect(params.generationConfig.responseMimeType).toBeUndefined();
  });

  it('reports a safety block distinctly, so the pipeline can fall back', async () => {
    // A safety block on a laboratory report is usually a false positive on
    // clinical vocabulary, not a failed report.
    generateContent.mockResolvedValue(reply({ finishReason: 'SAFETY' }));

    await expect(
      provider().generate({ prompt: HEALTH_CHECK, input: 'ping', parse: parseOk }),
    ).rejects.toMatchObject({ code: 'blocked' });
  });

  it('reports a blocked prompt before it reads the missing text', async () => {
    generateContent.mockResolvedValue(reply({ blockReason: 'SAFETY' }));

    await expect(
      provider().generate({ prompt: HEALTH_CHECK, input: 'ping', parse: parseOk }),
    ).rejects.toMatchObject({ code: 'blocked' });
  });

  it('calls a truncated JSON response truncated, not malformed', async () => {
    // The distinction matters: 'truncated' tells the caller to raise the token
    // ceiling or split the request. Retrying the same bytes cannot help.
    generateContent.mockResolvedValue(reply({ text: '{"ok":tr', finishReason: 'MAX_TOKENS' }));

    await expect(
      provider().generate({
        prompt: HEALTH_CHECK,
        input: 'ping',
        responseSchema: OK_SCHEMA,
        parse: parseOk,
      }),
    ).rejects.toMatchObject({ code: 'truncated' });
  });

  it('does not leak response text into the error when parsing fails', async () => {
    // These errors go to logs and Sentry, and the text can contain report data.
    generateContent.mockResolvedValue(reply({ text: '{"patient":"Ada Lovelace"}' }));

    const caught = await provider()
      .generate({
        prompt: HEALTH_CHECK,
        input: 'ping',
        responseSchema: OK_SCHEMA,
        parse: () => {
          throw new Error('missing ok');
        },
      })
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(AiProviderError);
    expect((caught as Error).message).not.toContain('Ada Lovelace');
    expect(caught).toMatchObject({ code: 'invalid-response' });
  });

  it('retries a rate limit rather than failing the report on the first 429', async () => {
    const rateLimited = Object.assign(new Error('quota exceeded'), {
      code: 'AI/fetch-error',
      customErrorData: { status: 429 },
    });
    generateContent
      .mockRejectedValueOnce(rateLimited)
      .mockResolvedValueOnce(reply({ text: '{"ok":true}' }));

    const result = await provider({ maxRetries: 1 }).generate({
      prompt: HEALTH_CHECK,
      input: 'ping',
      responseSchema: OK_SCHEMA,
      parse: parseOk,
    });

    expect(result.data).toEqual({ ok: true });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('reuses the named app across warm invocations instead of redeclaring it', async () => {
    // `initializeApp` with a name that already exists throws `duplicate-app`,
    // which on a warm instance is an intermittent failure that never reproduces
    // locally.
    getApps.mockReturnValue([{ name: 'lab-results-ai-logic' }]);
    provider();
    expect(initializeApp).not.toHaveBeenCalled();
  });

  it('does not share the default app with firebase-admin', () => {
    provider();
    expect(initializeApp).toHaveBeenCalledWith(CREDENTIALS, 'lab-results-ai-logic');
  });

  it('spends the token budget on the answer rather than on reasoning', async () => {
    // These tasks are extraction and plain-language explanation. Thinking is
    // billed as output tokens and is the main lever on cost per report.
    generateContent.mockResolvedValue(reply({ text: '{"ok":true}' }));
    await provider().generate({ prompt: HEALTH_CHECK, input: 'ping', parse: parseOk });

    const params = getGenerativeModel.mock.calls[0]?.[1] as {
      generationConfig: { thinkingConfig?: { thinkingBudget?: number } };
    };
    expect(params.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });
});

describe('App Check', () => {
  it('registers a token source, without which every call is a 401', () => {
    // Firebase AI Logic requires an App Check token and a Cloud Function cannot
    // attest itself. `firebase-admin` mints one instead; the trust comes from
    // holding the service account rather than from attestation.
    provider();
    expect(initializeAppCheck).toHaveBeenCalledTimes(1);
    expect(initializeAppCheck.mock.calls[0]?.[1]).toMatchObject({
      // A background refresh timer would keep an instance alive to renew a
      // token nobody is waiting on.
      isTokenAutoRefreshEnabled: false,
    });
  });

  it('mints against the registered app id and converts the SDK ttl to a deadline', async () => {
    provider();
    const before = Date.now();
    const token = await registeredTokenSource()();

    expect(createToken).toHaveBeenCalledWith('a');
    expect(token.token).toBe('app-check-token');
    expect(token.expireTimeMillis).toBeGreaterThanOrEqual(before + 3_600_000);
  });

  it('does not register twice on a warm instance', () => {
    getApps.mockReturnValue([{ name: 'lab-results-ai-logic' }]);
    provider();
    expect(initializeAppCheck).not.toHaveBeenCalled();
  });

  it('warns and carries on when App Check cannot be attached', async () => {
    // A project with enforcement switched off does not need the token, and
    // failing the pipeline here would turn an optional control into a hard
    // dependency.
    initializeAppCheck.mockImplementation(() => {
      throw new Error('app-check unavailable');
    });
    generateContent.mockResolvedValue(reply({ text: '{"ok":true}' }));

    const result = await provider().generate({
      prompt: HEALTH_CHECK,
      input: 'ping',
      responseSchema: OK_SCHEMA,
      parse: parseOk,
    });
    expect(result.data).toEqual({ ok: true });
  });
});

describe('toProviderError', () => {
  it('turns the commonest first-run failure into the sentence that fixes it', () => {
    const error = toProviderError(
      Object.assign(new Error('The Firebase AI SDK requires…'), {
        code: 'AI/api-not-enabled',
      }),
    );
    expect(error.code).toBe('unauthenticated');
    expect(error.message).toMatch(/AI Logic/);
  });

  it('points a 403 at App Check, which a Cloud Function cannot satisfy', () => {
    const error = toProviderError(
      Object.assign(new Error('forbidden'), {
        code: 'AI/fetch-error',
        customErrorData: { status: 403 },
      }),
    );
    expect(error.code).toBe('unauthenticated');
    expect(error.message).toMatch(/App Check/);
  });

  it('marks transient faults retryable and everything else not', () => {
    const status = (value: number) =>
      toProviderError(
        Object.assign(new Error('x'), { code: 'AI/fetch-error', customErrorData: { status: value } }),
      );
    expect(status(429).code).toBe('rate-limited');
    expect(status(429).retryable).toBe(true);
    expect(status(503).code).toBe('unavailable');
    expect(status(503).retryable).toBe(true);
    expect(toProviderError(new AiProviderError('nope', 'blocked')).retryable).toBe(false);
  });

  it('distinguishes a depleted balance from a rate limit, since waiting fixes only one', () => {
    const error = toProviderError(
      Object.assign(new Error('Your prepayment credits are depleted.'), {
        code: 'AI/fetch-error',
        customErrorData: { status: 429 },
      }),
    );
    expect(error.code).toBe('rate-limited');
    expect(error.message).toMatch(/credits left/);
  });

  it('passes an AiProviderError through untouched', () => {
    const original = new AiProviderError('already classified', 'truncated');
    expect(toProviderError(original)).toBe(original);
  });

  it('survives an error object that is not shaped the way it expects', () => {
    // Error handling that throws is worse than no error handling.
    expect(toProviderError('a string').code).toBe('unavailable');
    expect(toProviderError(undefined).code).toBe('unavailable');
  });
});
