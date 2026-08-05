import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/auth/useAuth';
import { recordAiProcessingConsent, subscribeToConsents } from '@/services/profiles';
import type { UserConsents } from '@/domain/types';

export interface AiConsentState {
  loading: boolean;
  /** True once the user has agreed to third-party AI processing. */
  granted: boolean;
  grant: () => Promise<void>;
  saving: boolean;
  error: string | null;
}

/**
 * Whether this account has consented to third-party AI processing (spec §54).
 *
 * The registration form asks for it explicitly, but a Google sign-up never
 * sees that form — it goes straight from Google's own consent screen into the
 * app. Google's screen covers Google's terms, not ours, so those accounts
 * arrive having agreed to nothing about their report text being sent to a
 * third-party model. This hook is what lets the upload page notice.
 */
export function useAiConsent(): AiConsentState {
  const { user } = useAuth();
  const [consents, setConsents] = useState<UserConsents | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribeToConsents(
      user.uid,
      (next) => {
        setConsents(next);
        setLoading(false);
      },
      () => {
        setError('We could not check your preferences. Please reload the page.');
        setLoading(false);
      },
    );
  }, [user]);

  const grant = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await recordAiProcessingConsent(user.uid);
    } catch {
      setError('We could not save your choice. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [user]);

  return {
    loading,
    // Absent means not granted. Consent is something we must be able to point
    // at, never something inferred from silence.
    granted: consents?.aiProcessingAcceptedAt != null,
    grant,
    saving,
    error,
  };
}
