/**
 * Public surface of the AI layer.
 *
 * Import from here, not from the files beneath. In particular the provider
 * constructors are not re-exported: `getAiProvider()` is the only way in, and
 * it is what guarantees redaction (see registry.ts).
 */

export { getAiProvider } from './registry';
export { loadAiConfig, AI_SECRETS, GEMINI_API_KEY, type AiConfig } from './config';
export { redact, redactionTotal, type RedactionCategory } from './redaction';
export * as prompts from './prompts';
export {
  AiProviderError,
  type AiCallMetadata,
  type AiGenerateOptions,
  type AiProvider,
  type AiPrompt,
  type AiResult,
  type AiTask,
  type AiUsage,
} from './types';
