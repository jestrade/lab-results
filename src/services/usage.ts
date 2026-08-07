/**
 * Reading storage usage (spec §79).
 *
 * These documents are written only by the Cloud Functions; the client reads
 * them to draw the quota meter and to give an instant answer before starting
 * an upload that the rules would refuse anyway.
 */

import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { getDb } from '@/lib/firebase';
import type { QuotaUsage } from '@/domain/quotas';

export interface SystemUsage {
  storageBytes: number;
  uploadsDisabled: boolean;
}

const EMPTY_USAGE: QuotaUsage = {
  storageBytes: 0,
  uploadsThisMonth: 0,
  uploadPeriod: '',
};

/**
 * Live per-user usage. Subscribed rather than fetched so the meter moves as
 * soon as the finalize function lands, without the user reloading to find out
 * whether their upload counted.
 */
export function subscribeToUsage(
  userId: string,
  onChange: (usage: QuotaUsage) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getDb(), 'usage', userId),
    (snapshot) => {
      const data = snapshot.data();
      // A user who has never uploaded has no document. That is zero usage,
      // not an error state.
      if (!data) {
        onChange(EMPTY_USAGE);
        return;
      }
      onChange({
        storageBytes: Number(data.storageBytes ?? 0),
        uploadsThisMonth: Number(data.uploadsThisMonth ?? 0),
        uploadPeriod: String(data.uploadPeriod ?? ''),
      });
    },
    (error) => onError?.(error),
  );
}

export function subscribeToSystemUsage(
  onChange: (usage: SystemUsage) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getDb(), 'systemUsage', 'global'),
    (snapshot) => {
      const data = snapshot.data();
      onChange({
        storageBytes: Number(data?.storageBytes ?? 0),
        // Absent means not disabled — a missing document must not read as
        // "everything is switched off".
        uploadsDisabled: data?.uploadsDisabled === true,
      });
    },
    (error) => onError?.(error),
  );
}
