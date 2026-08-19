/**
 * Provider-agnostic AI interface (KAN-16, KAN-17, spec §21, §47–§50).
 *
 * Nothing above this layer knows which model is answering. That is the whole
 * point: swapping Gemini for another provider — or running two side by side
 * during an evaluation — should touch one file in `providers/`, not the
 * pipeline, not the prompts, and not the data model.
 *
 * The interface is deliberately narrow. It offers structured generation and
 * nothing else: no streaming, no chat history, no tool calling. Every use in
 * this product is "read this text, return this shape", and a wider interface
 * would be a wider surface to reimplement for the next provider.
 */

/**
 * What the model is being asked to do. Recorded on every result so that a
 * stored analysis can be traced to the prompt that produced it (KAN-17), and
 * so usage can be attributed per task rather than as one undifferentiated bill.
 */
export type AiTask =
  /** Pull structured results off extracted report text (KAN-6). */
  | 'result-extraction'
  /** Pull report-level metadata: lab name, dates, patient identity (KAN-30). */
  | 'metadata-extraction'
  /** Explain what a laboratory variable measures (KAN-15). */
  | 'variable-explanation'
  /** Preliminary commentary on a result in context (KAN-16). */
  | 'result-analysis'
  /** Connectivity probe. Carries no report data. */
  | 'health-check';

export interface AiPrompt {
  task: AiTask;
  /**
   * Version of the prompt template, bumped whenever the wording changes.
   * Stored alongside generated content so output produced by an older prompt
   * can be found and regenerated (KAN-49, KAN-50).
   */
  version: string;
  /** Instructions that constrain the model. Never contains report data. */
  system: string;
}

export interface AiGenerateOptions<T> {
  prompt: AiPrompt;
  /**
   * The variable part of the request — report text, values, a variable name.
   * Everything here is treated as untrusted and is redacted before it leaves
   * the process. See `redaction.ts`.
   */
  input: string;
  /**
   * JSON schema describing the expected response. Providers that support
   * native structured output use it to constrain decoding; the result is
   * validated against `parse` regardless, because "supports" is not "guarantees".
   */
  responseSchema?: Record<string, unknown>;
  /**
   * Turns the raw response into `T`, or throws. This is the boundary where a
   * model's output stops being a string and starts being data — validate
   * properly here rather than casting.
   */
  parse: (raw: unknown) => T;
  maxOutputTokens?: number;
  /**
   * Overrides the provider's configured timeout for this call.
   *
   * Here rather than only in configuration because the tasks are not the same
   * shape. Classifying one result is a short question; asking for twelve
   * catalog entries is four dozen sentences, and it was measured at 38.8s
   * against a 30s default — every full enrichment batch timed out, silently,
   * for as long as the feature had existed. One global number cannot be both
   * a useful ceiling on the short calls and a workable one for the long.
   */
  timeoutMs?: number;
  /** 0 unless there is a reason. Clinical-adjacent text should not improvise. */
  temperature?: number;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Provenance for a generated artefact. Stored with every piece of AI content
 * so the interface can label it accurately and so a model change can be
 * audited after the fact (KAN-17, KAN-50).
 */
export interface AiCallMetadata {
  provider: string;
  model: string;
  task: AiTask;
  promptVersion: string;
  finishReason: string;
  latencyMs: number;
  usage: AiUsage;
  /** True when the provider's terms allow the content to train their models. */
  contentUsedForTraining: boolean;
  generatedAt: string;
}

export interface AiResult<T> {
  data: T;
  metadata: AiCallMetadata;
}

export interface AiProvider {
  /** Stable id, e.g. `gemini`. Recorded in metadata. */
  readonly id: string;
  /** Resolved model name, e.g. `gemini-2.5-flash`. */
  readonly model: string;
  /**
   * Whether this provider/tier may train on what it is sent. Drives the
   * disclosure the UI has to make, and whether redaction is merely prudent or
   * strictly required.
   */
  readonly contentUsedForTraining: boolean;

  generate<T>(options: AiGenerateOptions<T>): Promise<AiResult<T>>;
}

/** Thrown when a provider fails in a way the caller may want to distinguish. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'unauthenticated'
      | 'rate-limited'
      | 'timeout'
      | 'blocked'
      | 'invalid-response'
      | 'unavailable',
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AiProviderError';
  }

  /** Whether retrying the identical request could plausibly succeed. */
  get retryable(): boolean {
    return this.code === 'rate-limited' || this.code === 'timeout' || this.code === 'unavailable';
  }
}
