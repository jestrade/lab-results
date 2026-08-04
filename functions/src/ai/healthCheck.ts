/**
 * Admin-only AI connectivity probe.
 *
 * Exists because "is the key right, is the model name right, is the secret
 * actually bound in this environment" are three different failure modes that
 * all present identically as a failed report, hours later, in a queue. This
 * answers them in one call, before any real report depends on it.
 *
 * Sends a fixed nonsense prompt. No report data, no user content.
 */

import * as logger from 'firebase-functions/logger';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { AI_SECRETS } from './config';
import { getAiProvider } from './registry';
import { HEALTH_CHECK } from './prompts';
import { AiProviderError } from './types';
import { REGION } from '../region';


export const aiHealthCheck = onCall(
  { region: REGION, memory: '256MiB', secrets: AI_SECRETS, timeoutSeconds: 60 },
  async (request) => {
    if (request.auth?.token.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Not permitted.');
    }

    const provider = getAiProvider();

    try {
      const result = await provider.generate<{ ok: boolean }>({
        prompt: HEALTH_CHECK,
        input: 'ping',
        responseSchema: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
          required: ['ok'],
        },
        parse: (raw) => {
          const value = raw as { ok?: unknown };
          if (typeof value.ok !== 'boolean') throw new Error('missing ok');
          return { ok: value.ok };
        },
        maxOutputTokens: 64,
      });

      logger.info('AI health check passed', {
        provider: result.metadata.provider,
        model: result.metadata.model,
        latencyMs: result.metadata.latencyMs,
      });

      return {
        ok: true,
        provider: result.metadata.provider,
        model: result.metadata.model,
        latencyMs: result.metadata.latencyMs,
        usage: result.metadata.usage,
        // Surfaced so an admin can see at a glance whether this project is on
        // the free tier, where submitted content may be used for training.
        contentUsedForTraining: result.metadata.contentUsedForTraining,
      };
    } catch (caught) {
      if (caught instanceof AiProviderError) {
        logger.error('AI health check failed', { code: caught.code, message: caught.message });
        return {
          ok: false,
          provider: provider.id,
          model: provider.model,
          error: caught.code,
          message: caught.message,
        };
      }
      throw caught;
    }
  },
);
