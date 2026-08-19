import { useEffect, useState } from 'react';

/**
 * How long something must stay busy before it is worth saying so.
 *
 * Under this, a spinner is not feedback — it is a flash. The eye registers
 * something appearing and vanishing without being able to read it, which
 * reads as a glitch rather than as progress, and it makes an instant action
 * feel less trustworthy than showing nothing at all.
 */
export const PENDING_DELAY_MS = 140;

/**
 * True once `active` has been true for long enough to be worth showing.
 *
 * ── Why this is not just `active` ─────────────────────────────────────────
 *
 * The two things this app waits on are of very different lengths and cannot
 * be told apart in advance. Signing out is a network round trip. Moving from
 * the landing page to the sign-in form is a synchronous render — there is
 * nothing to wait for, and a spinner would be an animation about nothing that
 * arrives after the destination has already painted.
 *
 * Gating on elapsed time means one control can serve both honestly: the
 * navigation shows nothing because it never crosses the threshold, and the
 * sign-out shows a spinner because it does. If a route is ever code-split and
 * genuinely starts taking time, the indicator appears on its own without
 * anybody remembering to add one.
 *
 * Falling back to `false` the moment `active` clears — rather than holding the
 * spinner for a minimum duration — is deliberate too. A spinner kept on screen
 * after the work finished is a spinner lying about the work.
 */
export function useDelayedPending(active: boolean, delayMs = PENDING_DELAY_MS): boolean {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return shown;
}
