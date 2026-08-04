/**
 * Provider selection and the redaction guarantee (KAN-16, spec §54).
 *
 * `getAiProvider()` is the only way to obtain a provider anywhere in this
 * codebase. What it returns is always wrapped in `withRedaction`, and the raw
 * provider constructors are not exported from this module.
 *
 * That is deliberate. Redaction that each caller has to remember is redaction
 * that will eventually be forgotten — by the next person, in the next task,
 * under deadline. Making the wrapped provider the only reachable one turns the
 * promise on the landing page ("Identifiers redacted before AI") into a
 * property of the architecture rather than a convention.
 *
 * ── Adding a provider ────────────────────────────────────────────────────
 *
 *   1. Write `providers/<name>.ts` exporting a factory that returns AiProvider.
 *   2. Add the id to `AiProviderId` in config.ts.
 *   3. Add one case to the switch below.
 *
 * Nothing else changes. The pipeline, the prompts and the stored metadata are
 * all provider-agnostic by construction.
 */

import { logger } from 'firebase-functions';

import { loadAiConfig, resolveApiKey, type AiConfig } from './config';
import { createGeminiProvider } from './providers/gemini';
import { redact, redactionTotal } from './redaction';
import type { AiGenerateOptions, AiProvider, AiResult } from './types';

/**
 * Decorates a provider so every input passes through redaction on its way out
 * of the process.
 *
 * Only `input` is redacted. The system prompt is ours, is a constant, and
 * contains no report data — running it through the redactor would corrupt
 * instructions ("values below 7.0" is not an identifier) for no benefit.
 */
function withRedaction(provider: AiProvider): AiProvider {
  return {
    id: provider.id,
    model: provider.model,
    contentUsedForTraining: provider.contentUsedForTraining,

    async generate<T>(options: AiGenerateOptions<T>): Promise<AiResult<T>> {
      const { text, counts } = redact(options.input);
      const removed = redactionTotal(counts);

      if (removed > 0) {
        // Counts only. Logging what was removed would recreate, in the log,
        // exactly the exposure the redaction just prevented.
        logger.debug('Redacted identifiers before AI call', {
          task: options.prompt.task,
          removed,
          byCategory: counts,
        });
      }

      return provider.generate({ ...options, input: text });
    },
  };
}

function createProvider(config: AiConfig): AiProvider {
  switch (config.provider) {
    case 'gemini':
      return createGeminiProvider(config, resolveApiKey('gemini'));
    default: {
      // Exhaustiveness: adding an id to AiProviderId without a case here is a
      // compile error, not a runtime surprise.
      const unreachable: never = config.provider;
      throw new Error(`Unsupported AI provider: ${String(unreachable)}`);
    }
  }
}

let cached: { provider: AiProvider; config: AiConfig } | undefined;

/**
 * The configured provider, redaction included.
 *
 * Cached per warm instance so a burst of reports does not rebuild the client
 * each time, and re-resolved if configuration changes between invocations.
 */
export function getAiProvider(): AiProvider {
  const config = loadAiConfig();

  if (cached && cached.config.provider === config.provider && cached.config.model === config.model) {
    return cached.provider;
  }

  const provider = withRedaction(createProvider(config));
  cached = { provider, config };

  logger.info('AI provider initialised', {
    provider: provider.id,
    model: provider.model,
    contentUsedForTraining: provider.contentUsedForTraining,
  });

  return provider;
}

/** Test seam. Lets a suite exercise the redaction wrapper against a fake. */
export function __wrapForTests(provider: AiProvider): AiProvider {
  return withRedaction(provider);
}

/** Clears the warm-instance cache. Tests only. */
export function __resetProviderCache(): void {
  cached = undefined;
}
