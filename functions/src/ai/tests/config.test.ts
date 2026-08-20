import { describe, expect, it } from 'vitest';

import { loadAiConfig, resolveFirebaseAiCredentials } from '../config';

/** A bare env, so a stray variable on the developer's machine cannot pass a test. */
function env(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return overrides as NodeJS.ProcessEnv;
}

describe('loadAiConfig', () => {
  it('defaults to Firebase AI Logic on a model that path actually serves', () => {
    const config = loadAiConfig(env());
    expect(config.provider).toBe('firebase');
    expect(config.model).toBe('gemini-3.6-flash');
    expect(config.firebaseBackend).toBe('googleai');
  });

  it('keeps the direct Gemini path on its own default', () => {
    // Firebase AI Logic answers `gemini-2.5-flash` with "no longer available
    // to new users"; the direct API still serves it. One shared default would
    // break whichever path was not tested last.
    expect(loadAiConfig(env({ AI_MODEL: 'gemini' })).model).toBe('gemini-2.5-flash');
  });

  it('selects the provider from AI_MODEL', () => {
    expect(loadAiConfig(env({ AI_MODEL: 'gemini' })).provider).toBe('gemini');
    expect(loadAiConfig(env({ AI_MODEL: 'firebase' })).provider).toBe('firebase');
  });

  it('still honours the superseded AI_PROVIDER name', () => {
    // An environment that predates AI_MODEL must keep the provider it was
    // deployed with rather than silently switching on the next deploy.
    expect(loadAiConfig(env({ AI_PROVIDER: 'gemini' })).provider).toBe('gemini');
  });

  it('lets AI_MODEL win when both names are set', () => {
    expect(loadAiConfig(env({ AI_MODEL: 'firebase', AI_PROVIDER: 'gemini' })).provider).toBe(
      'firebase',
    );
  });

  it('takes the model from the environment, so switching is config not code', () => {
    expect(loadAiConfig(env({ AI_MODEL: 'gemini', GEMINI_MODEL: 'gemini-2.5-pro' })).model).toBe(
      'gemini-2.5-pro',
    );
    expect(loadAiConfig(env({ FIREBASE_AI_MODEL: 'gemini-3.6-pro' })).model).toBe('gemini-3.6-pro');
  });

  it('does not let a model pinned for one path leak onto the other', () => {
    // The failure this prevents is a 404 that reads as a broken provider.
    expect(loadAiConfig(env({ AI_MODEL: 'firebase', GEMINI_MODEL: 'gemini-2.5-pro' })).model).toBe(
      'gemini-3.6-flash',
    );
    expect(
      loadAiConfig(env({ AI_MODEL: 'gemini', FIREBASE_AI_MODEL: 'gemini-3.6-pro' })).model,
    ).toBe('gemini-2.5-flash');
  });

  it('defaults temperature to zero', () => {
    // Explanations of laboratory results should be reproducible. A model that
    // rephrases on each run reads to a user as if something has changed.
    expect(loadAiConfig(env()).temperature).toBe(0);
  });

  it('ignores an unknown provider rather than failing at call time', () => {
    // A typo in AI_MODEL should not take the pipeline down mid-report; the
    // known-good default is the safer landing place.
    expect(loadAiConfig(env({ AI_MODEL: 'not-a-provider' })).provider).toBe('firebase');
    expect(loadAiConfig(env({ AI_PROVIDER: 'not-a-provider' })).provider).toBe('firebase');
  });

  it('ignores an unknown Firebase backend rather than failing at call time', () => {
    expect(loadAiConfig(env({ FIREBASE_AI_BACKEND: 'wat' })).firebaseBackend).toBe('googleai');
    expect(loadAiConfig(env({ FIREBASE_AI_BACKEND: 'vertexai' })).firebaseBackend).toBe('vertexai');
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
    expect(loadAiConfig(env({ AI_BILLING_ENABLED: 'false' })).contentUsedForTraining).toBe(true);
    expect(loadAiConfig(env({ AI_BILLING_ENABLED: 'true' })).contentUsedForTraining).toBe(false);
  });

  it('still reads the superseded GEMINI_BILLING_ENABLED name', () => {
    expect(loadAiConfig(env({ GEMINI_BILLING_ENABLED: 'true' })).contentUsedForTraining).toBe(
      false,
    );
  });

  it('only treats the exact string "true" as billing enabled', () => {
    // "1" or "yes" must not silently downgrade the privacy posture.
    for (const value of ['1', 'yes', 'TRUE', '']) {
      expect(loadAiConfig(env({ AI_BILLING_ENABLED: value })).contentUsedForTraining).toBe(true);
    }
  });

  it('knows Vertex AI never trains on submitted content, flag or no flag', () => {
    const config = loadAiConfig(env({ AI_MODEL: 'firebase', FIREBASE_AI_BACKEND: 'vertexai' }));
    expect(config.contentUsedForTraining).toBe(false);
  });
});

describe('resolveFirebaseAiCredentials', () => {
  const web = {
    VITE_FIREBASE_API_KEY: 'web-key',
    VITE_FIREBASE_PROJECT_ID: 'web-project',
    VITE_FIREBASE_APP_ID: 'web-app',
  };

  it('reads the mirrored server-side names', () => {
    expect(
      resolveFirebaseAiCredentials(
        env({
          FIREBASE_API_KEY: 'k',
          FIREBASE_PROJECT_ID: 'p',
          FIREBASE_APP_ID: 'a',
        }),
      ),
    ).toEqual({ apiKey: 'k', projectId: 'p', appId: 'a' });
  });

  it('falls back to the VITE_ names, which is what an un-synced checkout has', () => {
    expect(resolveFirebaseAiCredentials(env(web))).toEqual({
      apiKey: 'web-key',
      projectId: 'web-project',
      appId: 'web-app',
    });
  });

  it('prefers an explicit server-side override over the browser value', () => {
    // This is what lets the functions point at a different Firebase app than
    // the one compiled into the bundle.
    const resolved = resolveFirebaseAiCredentials(env({ ...web, FIREBASE_PROJECT_ID: 'server' }));
    expect(resolved.projectId).toBe('server');
  });

  it('recovers the project id from what the Functions runtime injects', () => {
    // A deploy that forgot to sync should not fail against no project at all.
    const resolved = resolveFirebaseAiCredentials(
      env({
        FIREBASE_API_KEY: 'k',
        FIREBASE_APP_ID: 'a',
        FIREBASE_CONFIG: JSON.stringify({ projectId: 'from-runtime' }),
      }),
    );
    expect(resolved.projectId).toBe('from-runtime');
  });

  it('falls back to GCLOUD_PROJECT when FIREBASE_CONFIG is malformed', () => {
    const resolved = resolveFirebaseAiCredentials(
      env({
        FIREBASE_API_KEY: 'k',
        FIREBASE_APP_ID: 'a',
        FIREBASE_CONFIG: 'not json',
        GCLOUD_PROJECT: 'from-gcloud',
      }),
    );
    expect(resolved.projectId).toBe('from-gcloud');
  });

  it('names every missing variable, and the way out', () => {
    // The failure mode this replaces is a 404 from an SDK that was handed an
    // empty string, which says nothing about which of three values is absent.
    expect(() => resolveFirebaseAiCredentials(env({ FIREBASE_API_KEY: 'k' }))).toThrow(
      /FIREBASE_PROJECT_ID, FIREBASE_APP_ID/,
    );
    expect(() => resolveFirebaseAiCredentials(env())).toThrow(/sync:env/);
  });
});
