import { useEffect, useState } from 'react';

/**
 * The current time, re-read on an interval (KAN-20).
 *
 * The processing queue is the one screen in this app whose figures change
 * without anything arriving from Firestore: a job that has been running for
 * fourteen minutes becomes a job that has been running for sixteen, and — at
 * the point the policy in `config/retry.json` calls it — a job that has lost
 * its worker and can be reprocessed. The document does not change when that
 * happens, so a snapshot listener never fires and the row would sit there
 * saying the same wrong thing until the operator reloaded the page.
 *
 * Returning the instant rather than an elapsed span keeps every duration on
 * screen consistent with every other: they are all differences against this
 * one clock, so two rows started a second apart cannot round to the same
 * figure in one render and different figures in the next.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
