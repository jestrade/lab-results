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
 * ── The record, and why hovering is not the only way in ───────────────────
 *
 * The panel also lists what the profile holds — the identity document and the
 * lists of what the reader lives with. Each row shows its heading and reveals
 * the value on hover, which is what was asked for and is a good way to keep a
 * summary this dense readable.
 *
 * The body mass index sits above that list rather than in it, and is always
 * drawn: the rows are "what you saved", the index is "what your account says
 * about your body", and one of those should not blink out of existence when a
 * field is cleared. Its traffic light never travels alone — the band's name is
 * beside it, and the adults-only caveat under it.
 *
 * It is not the *only* way in, because hover is not available to everyone. The
 * value is always in the accessibility tree — collapsed to zero height, never
 * `display: none` — so a screen reader reads "Past illnesses, pneumonia 2019"
 * from the row itself. The row is a button, so a tap opens it on a touch
 * screen and a keyboard reader gets it on focus. Hover is the convenience;
 * none of the three is the only door.
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

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { useI18n } from '@/i18n/useI18n';
import { BMI_BANDS } from '@/domain/bmi';
import { summariseBody, summariseProfile } from '@/domain/profileSummary';
import type { UserProfile } from '@/domain/types';
import { subscribeToProfile } from '@/services/profiles';

import { Icon } from './Icon';
import { LanguageSwitcher } from './LanguagePicker';
import { Skeleton } from './Skeleton';
import { Tag } from './Tag';

export interface AccountMenuProps {
  onSignOut: () => void;
}

export function AccountMenu({ onSignOut }: AccountMenuProps) {
  const { user, isAdmin, isEmailVerified } = useAuth();
  const { t, locale } = useI18n();

  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const email = user?.email ?? '';

  /**
   * Subscribed only while the panel is open.
   *
   * A listener held on every page would be a Firestore read on every
   * navigation, for a panel most readers never open, to draw rows nobody is
   * looking at. Opening it costs one read and the rows appear; closing it
   * releases the listener. The skeleton below is what that costs, and it is
   * the honest trade.
   */
  useEffect(() => {
    if (!open || !user) return;
    return subscribeToProfile(
      user.uid,
      (next) => setProfile(next),
      // A summary that cannot load is not worth an error banner in a menu —
      // the row list simply stays empty and the profile link still works.
      () => setProfile(null),
    );
  }, [open, user]);

  const summary = useMemo(() => summariseProfile(profile ?? null, locale), [profile, locale]);
  const body = useMemo(() => summariseBody(profile ?? null, locale), [profile, locale]);

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

          <div className="account-summary">
            <span className="account-panel-label">{t('account.summary.heading')}</span>

            {profile === undefined ? (
              <Skeleton height={84} radius="var(--radius-md)" />
            ) : (
              <>
                {/* Unconditional. The index reads `—` until there is something
                    to compute it from, rather than the row vanishing — a
                    figure that comes and goes reads as the app losing it. */}
                <div className="account-bmi" data-signal={body.band ? BMI_BANDS[body.band].signal : undefined}>
                  <span className="account-bmi-dot" aria-hidden="true" />
                  <span className="account-bmi-label">{t('profile.bmi')}</span>
                  <span className="account-bmi-value">{body.index ?? '—'}</span>
                  {body.band ? (
                    <span className="account-bmi-band">{t(BMI_BANDS[body.band].labelKey)}</span>
                  ) : null}
                </div>
                {body.measurements ? (
                  <p className="account-summary-hint">{body.measurements}</p>
                ) : null}
                {body.band ? (
                  <p className="account-summary-hint">{t('profile.bmiAdultsOnly')}</p>
                ) : null}

                <hr style={{ margin: '1px 0' }} />

                {summary.length > 0 ? (
                  <>
                    <p className="account-summary-hint">{t('account.summary.hint')}</p>
                    <ul className="account-summary-list">
                      {summary.map((item) => (
                        <SummaryRow
                          key={item.key}
                          itemKey={item.key}
                          label={item.label}
                          value={item.value}
                        />
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="account-summary-empty">{t('account.summary.empty')}</p>
                )}

                <Link className="account-panel-link" to="/profile" onClick={() => setOpen(false)}>
                  {summary.length === 0 ? t('account.summary.fillIn') : t('account.summary.edit')}
                  <Icon name="arrow-right" size={13} />
                </Link>
              </>
            )}
          </div>

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
 * One row of the record: a heading, and the value under it.
 *
 * A `<button>` rather than a styled `<div>` with a hover rule, for one reason:
 * a touch screen has no hover. The pointer reveal is CSS on `:hover`, the
 * keyboard reveal is CSS on `:focus-visible`, and the tap reveal is this state
 * — three routes to the same row, none of them the only one.
 *
 * The value is inside the button, so the button's accessible name is "Past
 * illnesses, pneumonia 2019" and a screen reader never has to trigger anything
 * to reach it. That is why the collapsed state is `height: 0; overflow:
 * hidden` and not `display: none` — the latter would take the value out of the
 * accessibility tree and make hover the only way to read a medical record.
 */
function SummaryRow({
  itemKey,
  label,
  value,
}: {
  itemKey: string;
  label: string;
  value: string;
}) {
  const [pinned, setPinned] = useState(false);

  return (
    <li>
      <button
        type="button"
        className="account-summary-item"
        data-item={itemKey}
        data-pinned={pinned ? 'true' : undefined}
        onClick={() => setPinned((current) => !current)}
      >
        <span className="account-summary-label">{label}</span>
        <span className="account-summary-value">{value}</span>
      </button>
    </li>
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
