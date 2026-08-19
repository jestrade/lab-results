/**
 * A page's actions, behind one icon.
 *
 * For the controls a page needs to offer but should not lead with: the ones
 * that are occasional, destructive, or both. Left in the open they compete
 * with the page for attention and — being the widest thing in a header — read
 * as the primary action they are the opposite of.
 *
 * ── Why this is a disclosure and not a `role="menu"` ──────────────────────
 *
 * Same reasoning as `AccountMenu`, and worth repeating because here it is a
 * closer call: this panel really does hold nothing but commands, which is what
 * `menu`/`menuitem` describes. What that role brings with it is a keyboard
 * contract — arrow keys move between items, Tab leaves the whole widget — that
 * has to be implemented to be true. A button with `aria-expanded` controlling
 * a region of ordinary buttons is honest about what it is, keeps Tab working
 * the way it does everywhere else, and does not promise semantics the code
 * does not deliver. If this ever grows to the size where arrow-key navigation
 * earns its keep, that is the moment to add the role and the handlers
 * together.
 *
 * ── Why the trigger carries no visible text ───────────────────────────────
 *
 * It sits in a page header beside a search field, and a labelled button there
 * is exactly the prominence being taken away. The name is on `aria-label` and
 * `title`, so it is announced, hoverable, and — with the caret beside the
 * glyph — visibly a thing that opens.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { Icon } from './Icon';

export interface ActionsMenuProps {
  /** Names the trigger. Announced and shown on hover; never rendered inline. */
  label: string;
  /** Buttons and links. Anything activated in here closes the panel. */
  children: ReactNode;
}

export function ActionsMenu({ label, children }: ActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      // Focus goes back where it came from, so dismissing the panel does not
      // drop a keyboard reader at the top of the document.
      triggerRef.current?.focus();
    }

    // `pointerdown` rather than `click`, so a drag or a text selection that
    // starts inside the panel and ends outside it does not read as "dismiss".
    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  return (
    <div className="actions-menu" ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        className="actions-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        title={label}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="dots-three-vertical" size={18} />
        <Icon name={open ? 'caret-up' : 'caret-down'} size={11} />
      </button>

      {/* Rendered only when open. A panel hidden with CSS keeps its buttons in
          the tab order, which is a keyboard reader tabbing through controls
          they cannot see — and these are the controls that delete things. */}
      {open ? (
        <div
          className="actions-panel"
          id={panelId}
          // Anything in here is a command, and a command that leaves the panel
          // sitting open behind whatever it opened is a panel the user has to
          // dismiss twice. Closing on the way out also means an item that
          // opens a dialog must render that dialog outside this panel — see
          // `ClearDataButton`, which does.
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
