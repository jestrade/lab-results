import { describe, expect, it } from 'vitest';

import { loadAiConfig } from './config';

/** A bare env, so a stray variable on the developer's machine cannot pass a test. */
function env(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return overrides as NodeJS.ProcessEnv;
}

describe('loadAiConfig', () => {
  it('defaults to Gemini 2.5 Flash', () => {
    const config = loadAiConfig(env());
    expect(config.provider).toBe('gemini');
    expect(config.model).toBe('gemini-2.5-flash');
  });

  it('takes the model from the environment, so switching is config not code', () => {
    expect(loadAiConfig(env({ GEMINI_MODEL: 'gemini-2.5-pro' })).model).toBe('gemini-2.5-pro');
  });

  it('defaults temperature to zero', () => {
    // Explanations of laboratory results should be reproducible. A model that
    // rephrases on each run reads to a user as if something has changed.
    expect(loadAiConfig(env()).temperature).toBe(0);
  });

  it('ignores an unknown provider rather than failing at call time', () => {
    // A typo in AI_PROVIDER should not take the pipeline down mid-report; the
    // known-good default is the safer landing place.
    expect(loadAiConfig(env({ AI_PROVIDER: 'not-a-provider' })).provider).toBe('gemini');
  });

  it('ignores junk numeric config instead of propagating NaN', () => {
    const config = loadAiConfig(env({ AI_MAX_OUTPUT_TOKENS: 'lots', AI_TIMEOUT_MS: '-5' }));
    expect(config.maxOutputTokens).toBe(2048);
    expect(config.timeoutMs).toBe(30_000);
  });

  it('assumes content IS used for training unless billing is explicitly enabled', () => {
    // The pessimistic default is the safe one for a privacy flag. An unset
    // variable almost certainly means nobody has enabled billing, and the free
    // tier's terms permit training on submitted content.
    expect(loadAiConfig(env()).contentUsedForTraining).toBe(true);
    expect(loadAiConfig(env({ GEMINI_BILLING_ENABLED: 'false' })).contentUsedForTraining).toBe(
      true,
    );
    expect(loadAiConfig(env({ GEMINI_BILLING_ENABLED: 'true' })).contentUsedForTraining).toBe(
      false,
    );
  });

  it('only treats the exact string "true" as billing enabled', () => {
    // "1" or "yes" must not silently downgrade the privacy posture.
    for (const value of ['1', 'yes', 'TRUE', '']) {
      expect(loadAiConfig(env({ GEMINI_BILLING_ENABLED: value })).contentUsedForTraining).toBe(
        true,
      );
    }
  });
});
