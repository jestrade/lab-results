/**
 * AI commentary on a single result (KAN-16, spec §14, §46, §47).
 *
 * The model receives facts that are already decided — the value, the range it
 * was reported with, and the status this code computed arithmetically — and is
 * asked to phrase them. It is not asked to judge anything, and its answer
 * cannot change a classification, because the classification is already
 * written by the time this runs.
 *
 * Cost is bounded deliberately: analysis is generated only for results that
 * are out of range or unclassifiable. A panel of 24 results where 22 are
 * normal produces two calls, not 24. Normal results need no commentary beyond
 * the number and the range, which the UI already shows.
 */

import * as logger from 'firebase-functions/logger';

import { getAiProvider } from './ai/registry';
import { RESULT_ANALYSIS } from './ai/prompts';
import { AiProviderError, type AiCallMetadata } from './ai/types';
import { isOutOfRange, type ResultStatus } from './classification';
import { CRITICAL_RESULT_NOTICE } from './copy';

export interface AnalysisInput {
  canonicalName: string;
  rawValue: string;
  unit?: string;
  rangeText: string;
  status: ResultStatus;
}

export interface AnalysisOutput {
  text: string;
  metadata: AiCallMetadata;
}

/**
 * Phrases that assert clinical urgency. Only a `critical` status — which the
 * laboratory's own panic thresholds produced, arithmetically — may carry them.
 */
const URGENCY = /prompt medical attention|seek (immediate|urgent)|emergency|urgently|right away/i;

/**
 * Makes the urgency of the text match the computed status.
 *
 * Observed in testing: given a `high` potassium the model appended the §46
 * critical notice on its own initiative. Clinically defensible, perhaps — but
 * it is not the model's call. Escalation is decided by the laboratory's stated
 * critical thresholds in `classification.ts`, and a model that can promote a
 * result to "seek help now" has taken over the one judgement this product
 * refuses to make.
 *
 * So: `critical` gets the §46 sentence exactly, appended if the model dropped
 * or reworded it. Anything else has the sentence removed, and if urgency
 * language survives the removal the analysis is discarded — a result shown
 * without commentary is safe; one carrying invented urgency is not.
 */
export function enforceUrgency(text: string, status: ResultStatus): string {
  if (status === 'critical') {
    return text.includes('prompt medical attention')
      ? text
      : `${text}\n\n${CRITICAL_RESULT_NOTICE}`;
  }

  const stripped = text.replace(CRITICAL_RESULT_NOTICE, '').replace(/\n{3,}/g, '\n\n').trim();
  if (URGENCY.test(stripped)) {
    logger.warn('Discarded analysis that asserted urgency for a non-critical result', { status });
    return '';
  }
  return stripped;
}

/** Which results are worth spending a call on. */
export function needsAnalysis(status: ResultStatus): boolean {
  return isOutOfRange(status) || status === 'unknown';
}

export async function analyseResult(input: AnalysisInput): Promise<AnalysisOutput | null> {
  const provider = getAiProvider();

  const described = [
    `Test: ${input.canonicalName}`,
    `Value: ${input.rawValue}${input.unit ? ` ${input.unit}` : ''}`,
    `Reference range as printed on this report: ${input.rangeText}`,
    `Status, already determined arithmetically: ${input.status}`,
    'Trend: insufficient data',
  ].join('\n');

  try {
    const { data, metadata } = await provider.generate<string>({
      prompt: RESULT_ANALYSIS,
      input: described,
      parse: (raw) => {
        const text = String(raw).trim();
        if (!text) throw new Error('empty analysis');
        return text;
      },
      maxOutputTokens: 400,
    });

    const text = enforceUrgency(data, input.status);
    return text ? { text, metadata } : null;
  } catch (error) {
    // A report with results and no commentary is still useful. A report that
    // failed entirely because one sentence could not be generated is not.
    if (error instanceof AiProviderError) {
      logger.warn('Analysis generation failed; continuing without it', {
        code: error.code,
        status: input.status,
      });
      return null;
    }
    throw error;
  }
}
