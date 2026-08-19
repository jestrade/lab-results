import { Icon } from './Icon';

/**
 * The veil shown while a session is being torn down.
 *
 * Signing out is a network round trip followed by a route change, and until
 * now it looked like nothing at all: the menu stayed open, the page stayed
 * put, and the app changed underneath a second or so later. A reader who
 * clicked and saw nothing happen clicks again.
 *
 * Covering the screen rather than spinning inside the menu is the point. What
 * is about to change is not one control — it is who the application thinks
 * you are, and every number on the page behind it belongs to the session
 * being ended. Veiling it is the honest picture of that, and it also stops a
 * second click reaching anything mid-teardown.
 */
export function AuthTransition({ label }: { label: string }) {
  return (
    <div className="auth-transition" role="alert" aria-busy="true">
      <div className="auth-transition-card">
        {/* The glyph is decorative here. `Spinner` carries its own `status`
            role and a screen-reader label, and next to the visible sentence
            below that made the veil announce itself twice — the wrapper's
            `alert` already names it once, which is the right number. */}
        <Icon name="circle-notch" size={28} spin aria-hidden="true" />
        <p className="auth-transition-label">{label}</p>
      </div>
    </div>
  );
}
