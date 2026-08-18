/**
 * The account menu in the top bar (KAN-25).
 *
 * Everything that used to sit spread across the top bar — the address, the
 * role, the verification state, the language and the way out — behind one
 * control. On a narrow screen those five items wrapped onto a second row and
 * pushed the page down; on a wide one they were five things competing for
 * attention with the page the reader came for.
 *
 * ── Why this is a disclosure and not a `role="menu"` ──────────────────────
 *
 * `menu`/`menuitem` describes a list of commands, and assistive tech treats it
 * as one: arrow keys move between items, Tab leaves the whole thing, and every
 * child is expected to be a `menuitem`. This panel holds a `<select>`, two
 * status labels and a button — not commands, and a `<select>` inside a `menu`
 * is a control the arrow keys are fighting over. A button with `aria-expanded`
 * controlling a plain region is the honest description, and it keeps Tab
 * working the way it does everywhere else.
 *
 * ── What deliberately stays visible ───────────────────────────────────────
 *
 * One thing: the dot on the trigger when the address is unverified. Grouping
 * status behind a control is fine for anything the reader already knows —
 * their own address, the language they are reading. An unverified address is
 * different in kind: it is a thing the account has to *act on* before it can
 * upload anything, and a warning nobody can see until they go looking for it
 * is not a warning. The role badge did not get the same treatment; it is a
 * privilege rather than a task, and it reads inside the panel.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { useI18n } from '@/i18n/useI18n';

import { Icon } from './Icon';
import { LanguageSwitcher } from './LanguagePicker';
import { Tag } from './Tag';

export interface AccountMenuProps {
  onSignOut: () => void;
}

export function AccountMenu({ onSignOut }: AccountMenuProps) {
  const { user, isAdmin, isEmailVerified } = useAuth();
  const { t } = useI18n();

  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const email = user?.email ?? '';

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      // Focus goes back where it came from. Without this it falls to the top
      // of the document, and a keyboard reader who pressed Escape to dismiss
      // the panel has to tab through the whole page to get back.
      triggerRef.current?.focus();
    }

    // `pointerdown` rather than `click`: a click that starts inside the panel
    // and finishes outside it — a drag across the language select, a text
    // selection over the address — should not read as "dismiss".
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
    <div className="account-menu" ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        className="account-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        // Names the account, so a reader who has two windows open on two
        // accounts can tell which one this is without opening it.
        aria-label={t('account.menuLabel', { email })}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="account-avatar" aria-hidden="true">
          {initialOf(email)}
          {!isEmailVerified ? <span className="account-dot" /> : null}
        </span>
        <Icon name={open ? 'caret-up' : 'caret-down'} size={12} />
      </button>

      {/* Rendered only when open. A hidden panel that stays in the DOM keeps
          its `<select>` and its sign-out button in the tab order, which is a
          keyboard reader tabbing through controls they cannot see. */}
      {open ? (
        <div className="account-panel" id={panelId}>
          <div className="account-panel-head">
            <span className="account-panel-label">{t('account.signedInAs')}</span>
            <span className="account-panel-email">{email}</span>
          </div>

          <div className="account-panel-tags">
            {isAdmin ? (
              <Tag tone="accent">
                <Icon name="shield-check" size={13} />
                <span style={{ marginLeft: 5 }}>{t('common.admin')}</span>
              </Tag>
            ) : null}
            {isEmailVerified ? (
              <Tag tone="neutral">
                <Icon name="seal-check" size={13} />
                <span style={{ marginLeft: 5 }}>{t('common.verified')}</span>
              </Tag>
            ) : (
              <Tag tone="accent-2">
                <Icon name="warning" size={13} />
                <span style={{ marginLeft: 5 }}>{t('common.unverified')}</span>
              </Tag>
            )}
          </div>

          {/* The one state in here that is a task rather than a fact gets a
              way to finish it, instead of only naming itself. */}
          {!isEmailVerified ? (
            <Link className="account-panel-link" to="/verify-email" onClick={() => setOpen(false)}>
              {t('account.verifyEmail')}
              <Icon name="arrow-right" size={13} />
            </Link>
          ) : null}

          <div className="account-panel-rule" />

          <div className="account-panel-row">
            <LanguageSwitcher />
          </div>

          <div className="account-panel-rule" />

          <button type="button" className="account-panel-action" onClick={onSignOut}>
            <Icon name="sign-out" size={15} />
            {t('common.signOut')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The letter on the avatar.
 *
 * Uppercased from the address rather than from the display name: the name is
 * optional and often absent, and a circle that is empty for some accounts and
 * lettered for others reads as a broken image. Falls back to a person glyph
 * when there is no address to take a letter from.
 */
function initialOf(email: string): string {
  const letter = email.trim().charAt(0);
  return letter ? letter.toUpperCase() : '·';
}
