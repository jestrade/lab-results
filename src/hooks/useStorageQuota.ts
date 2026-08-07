import { useEffect, useState } from 'react';

import { useAuth } from '@/auth/useAuth';
import {
  GLOBAL_STORAGE_BYTES,
  PER_USER_STORAGE_BYTES,
  PER_USER_UPLOADS_PER_MONTH,
  quotaState,
  uploadsUsedThisMonth,
  type QuotaState,
  type QuotaUsage,
} from '@/domain/quotas';
import { subscribeToSystemUsage, subscribeToUsage, type SystemUsage } from '@/services/usage';

export interface StorageQuota {
  loading: boolean;
  usage: QuotaUsage | null;
  system: SystemUsage | null;
  storage: QuotaState;
  uploads: { used: number; limit: number; remaining: number };
  systemStorage: QuotaState;
  uploadsDisabled: boolean;
}

/**
 * Live quota state for the signed-in user (spec §79).
 *
 * Note this never *blocks* anything — it reports. The block lives in
 * `storage.rules`. If these subscriptions fail (offline, permission), the hook
 * reports zero usage and the upload still gets attempted, because failing open
 * in the UI merely means the user sees the server's refusal instead of ours.
 */
export function useStorageQuota(): StorageQuota {
  const { user } = useAuth();
  const [usage, setUsage] = useState<QuotaUsage | null>(null);
  const [system, setSystem] = useState<SystemUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setUsage(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribeUsage = subscribeToUsage(user.uid, (next) => {
      setUsage(next);
      setLoading(false);
    });
    const unsubscribeSystem = subscribeToSystemUsage(setSystem);
    return () => {
      unsubscribeUsage();
      unsubscribeSystem();
    };
  }, [user]);

  const uploadsUsed = uploadsUsedThisMonth(usage);

  return {
    loading,
    usage,
    system,
    storage: quotaState(usage?.storageBytes ?? 0, PER_USER_STORAGE_BYTES),
    uploads: {
      used: uploadsUsed,
      limit: PER_USER_UPLOADS_PER_MONTH,
      remaining: Math.max(0, PER_USER_UPLOADS_PER_MONTH - uploadsUsed),
    },
    systemStorage: quotaState(system?.storageBytes ?? 0, GLOBAL_STORAGE_BYTES),
    uploadsDisabled: system?.uploadsDisabled ?? false,
  };
}
