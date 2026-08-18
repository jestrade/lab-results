import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { DataTable, type Column } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { Field, TextInput } from '@/components/Field';
import { Modal } from '@/components/Modal';
import { Skeleton } from '@/components/Skeleton';
import { Tag } from '@/components/Tag';
import { useToast } from '@/components/useToast';
import {
  filterAccounts,
  filterParams,
  hasActiveFilters,
  isSelf,
  readFilters,
  sortAccounts,
  type AccessFilter,
  type AccountFilters,
  type AccountRow,
  type RoleFilter,
} from '@/domain/adminUsers';
import type { UserRole } from '@/domain/types';
import { formatShortDate } from '@/i18n/dates';
import { useI18n } from '@/i18n/useI18n';
import type { I18nContextValue } from '@/i18n/I18nContext';
import type { MessageKey } from '@/i18n/messages';
import {
  ACCOUNT_PAGE_SIZE,
  setUserDisabled,
  setUserRole,
  subscribeToAccounts,
} from '@/services/adminUsers';

/**
 * User administration (KAN-50, KAN-2).
 *
 * Two operations, and they are the two most privileged things this system can
 * do from a browser: granting admin, and taking away someone's access. Both go
 * through callables — `setUserRole` and `setUserDisabled` — rather than through
 * the profile document, even though `firestore.rules` would let an admin write
 * both fields directly. The fields on `users/{uid}` are display mirrors; the
 * `role` custom claim and the Auth record's `disabled` flag are the real thing,
 * and only the Admin SDK can set those. A console that wrote the mirror would
 * show a state the system it administers does not share.
 *
 * ── What this screen deliberately cannot see ──────────────────────────────
 *
 * Results. The rules grant an admin read access to a user's `variableSeries`
 * for support and migration work, and nothing here uses it: the rows carry an
 * address, a name, a role, an access state and a date (see `AccountRow`, which
 * exists to make that a type-level fact rather than a habit). An admin looking
 * up an account to answer a question about it does not need that person's
 * blood work on screen while they do.
 *
 * ── Why neither action is instant, and why the dialogs say so ─────────────
 *
 * A role change travels in the ID token, so it reaches an open session on its
 * next refresh — within the hour. Disabling blocks sign-in and token renewal
 * immediately, but an already-minted token keeps working until it expires,
 * because the rules read the token rather than the Auth record. Both dialogs
 * state their own window. An interface that implied either was immediate would
 * be teaching an admin to expect something the system does not do.
 */
export function AdminUsers() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const { push } = useToast();

  const [pageSize, setPageSize] = useState(ACCOUNT_PAGE_SIZE);
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changingRole, setChangingRole] = useState<AccountRow | null>(null);
  const [changingAccess, setChangingAccess] = useState<AccountRow | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => readFilters(searchParams), [searchParams]);

  const updateFilters = useCallback(
    (change: Partial<AccountFilters>) => {
      setSearchParams(
        (current) =>
          filterParams({
            ...readFilters(current),
            ...change,
            // Any change other than the page itself returns to the first page
            // — see the same note on the catalog screen.
            page: change.page ?? 1,
          }),
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(
    () =>
      subscribeToAccounts(
        pageSize,
        (next) => {
          setAccounts(next);
          setError(null);
        },
        () => setError(t('adminUsers.loadFailed')),
      ),
    [pageSize, t],
  );

  const all = useMemo(() => accounts ?? [], [accounts]);
  const rows = useMemo(
    () => sortAccounts(filterAccounts(all, filters)),
    [all, filters],
  );
  /** Whether the query filled its limit, and so may be hiding older accounts. */
  const maybeMore = all.length >= pageSize;

  const columns: Column<AccountRow>[] = [
    {
      key: 'account',
      header: t('adminUsers.columnAccount'),
      sortValue: (row) => row.email.toLowerCase(),
      render: (row) => (
        <div className="admin-cell-stack">
          <span className="admin-cell-title">{row.email}</span>
          <span className="muted admin-cell-sub">
            {row.displayName ?? t('adminUsers.noName')}
            {isSelf(row, user?.uid) ? ` · ${t('adminUsers.you')}` : ''}
          </span>
          {/* The identifier every log line and support ticket names. */}
          <code className="admin-code">{row.uid}</code>
        </div>
      ),
    },
    {
      key: 'role',
      header: t('adminUsers.columnRole'),
      sortValue: (row) => row.role,
      render: (row) =>
        row.role === 'admin' ? (
          <Tag tone="accent">{t('adminUsers.roleAdmin')}</Tag>
        ) : (
          <Tag tone="neutral">{t('adminUsers.roleUser')}</Tag>
        ),
    },
    {
      key: 'access',
      header: t('adminUsers.columnStatus'),
      sortValue: (row) => (row.disabled ? 0 : 1),
      render: (row) =>
        row.disabled ? (
          <Tag tone="accent-2">{t('adminUsers.statusDisabled')}</Tag>
        ) : (
          <Tag tone="outline">{t('adminUsers.statusActive')}</Tag>
        ),
    },
    {
      key: 'joined',
      header: t('adminUsers.columnJoined'),
      sortValue: (row) => row.createdAt?.toMillis?.() ?? 0,
      render: (row) =>
        row.createdAt ? (
          formatShortDate(row.createdAt.toDate(), locale)
        ) : (
          <span className="muted">{t('adminUsers.unknownDate')}</span>
        ),
    },
    {
      key: 'actions',
      header: t('adminUsers.columnActions'),
      align: 'right',
      render: (row) => {
        const self = isSelf(row, user?.uid);
        const name = row.email || row.uid;

        // Both refusals are enforced in the callables; the interface explains
        // the rule rather than offering a button that comes back an error.
        if (self) {
          return (
            <span className="muted admin-cell-sub">{t('adminUsers.selfActions')}</span>
          );
        }

        return (
          <div className="admin-row-actions">
            <Button
              variant="secondary"
              onClick={() => setChangingRole(row)}
              aria-label={t('adminUsers.changeRoleLabel', { name })}
            >
              {t('adminUsers.changeRole')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setChangingAccess(row)}
              aria-label={t(row.disabled ? 'adminUsers.enableLabel' : 'adminUsers.disableLabel', {
                name,
              })}
            >
              {t(row.disabled ? 'adminUsers.enable' : 'adminUsers.disable')}
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">{t('nav.administration')}</div>
          <h1>{t('nav.adminUsers')}</h1>
        </div>
        <div className="spacer" />
        <div style={{ width: 260 }}>
          <Field label={t('adminUsers.search')}>
            {(props) => (
              <TextInput
                {...props}
                type="search"
                placeholder={t('adminUsers.searchPlaceholder')}
                value={filters.query}
                onChange={(event) => updateFilters({ query: event.target.value })}
              />
            )}
          </Field>
        </div>
      </div>

      <p className="muted admin-intro">{t('adminUsers.intro')}</p>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      {accounts === null ? (
        <div role="status" aria-label={t('adminUsers.loadingLabel')}>
          <Skeleton height={320} radius="var(--r-card)" />
        </div>
      ) : all.length === 0 ? (
        <EmptyState icon="users-three" title={t('adminUsers.emptyTitle')}>
          {t('adminUsers.emptyBody')}
        </EmptyState>
      ) : (
        <>
          <div className="variable-filters">
            <div role="group" aria-label={t('adminUsers.filterRole')} className="variable-chips">
              {ROLES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="chip"
                  aria-pressed={filters.role === option.id}
                  onClick={() => updateFilters({ role: option.id })}
                >
                  {t(option.label)}
                </button>
              ))}
            </div>

            <div role="group" aria-label={t('adminUsers.filterStatus')} className="variable-chips">
              {ACCESS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="chip"
                  aria-pressed={filters.access === option.id}
                  onClick={() => updateFilters({ access: option.id })}
                >
                  {t(option.label)}
                </button>
              ))}
            </div>
          </div>

          {/* Two bounds, and they answer different questions. This one pages
              what has been loaded, so a long list is readable; `Load more`
              below widens what is loaded at all, because accounts grow without
              limit and the search only reaches what has been fetched. */}
          <DataTable
            caption={t('adminUsers.tableCaption')}
            columns={columns}
            rows={rows}
            rowKey={(row) => row.uid}
            initialSort={{ key: 'joined', direction: 'descending' }}
            pagination={{
              page: filters.page,
              onPageChange: (page) => updateFilters({ page }),
              label: t('pagination.accountPages'),
            }}
            empty={
              <EmptyState icon="funnel" title={t('adminUsers.noMatchTitle')}>
                {t('adminUsers.noMatchBody')}
              </EmptyState>
            }
          />

          {hasActiveFilters(filters) && rows.length > 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {t('adminUsers.showing', { visible: rows.length, total: all.length })}
            </p>
          ) : null}

          {/* Said out loud rather than left to be inferred: a search that comes
              back empty on a list that is silently truncated reads as "this
              account does not exist", which is the one wrong answer this
              screen must not give. */}
          {maybeMore ? (
            <div className="admin-more">
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                {t('adminUsers.limitNote', { count: all.length })}
              </p>
              <Button
                variant="secondary"
                onClick={() => setPageSize((size) => size + ACCOUNT_PAGE_SIZE)}
              >
                {t('adminUsers.loadMore')}
              </Button>
            </div>
          ) : null}
        </>
      )}

      {/* One dialog at a time — `Modal` labels itself with a fixed element id. */}
      {changingRole ? (
        <RoleDialog
          account={changingRole}
          onClose={() => setChangingRole(null)}
          onChanged={(message) => {
            push(message, 'success');
            setChangingRole(null);
          }}
          t={t}
        />
      ) : changingAccess ? (
        <AccessDialog
          account={changingAccess}
          onClose={() => setChangingAccess(null)}
          onChanged={(message) => {
            push(message, 'success');
            setChangingAccess(null);
          }}
          t={t}
        />
      ) : null}
    </>
  );
}

const ROLES: { id: RoleFilter; label: MessageKey }[] = [
  { id: 'all', label: 'adminUsers.roleAll' },
  { id: 'user', label: 'adminUsers.roleUser' },
  { id: 'admin', label: 'adminUsers.roleAdmin' },
];

const ACCESS: { id: AccessFilter; label: MessageKey }[] = [
  { id: 'all', label: 'adminUsers.statusAll' },
  { id: 'active', label: 'adminUsers.statusActive' },
  { id: 'disabled', label: 'adminUsers.statusDisabled' },
];

/**
 * Granting or removing admin.
 *
 * The dialog states what the role can reach before it asks, because "admin" is
 * a word whose meaning is entirely specific to this system: it is read access
 * to every account in it. Someone deciding needs the sentence, not the label.
 */
function RoleDialog({
  account,
  onClose,
  onChanged,
  t,
}: {
  account: AccountRow;
  onClose: () => void;
  onChanged: (message: string) => void;
  t: I18nContextValue['t'];
}) {
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const promoting = account.role !== 'admin';
  const nextRole: UserRole = promoting ? 'admin' : 'user';
  const name = account.email || account.uid;

  async function handleConfirm() {
    setSaving(true);
    setFailure(null);
    try {
      await setUserRole(account.uid, nextRole);
      onChanged(
        t('adminUsers.roleChanged', {
          name,
          role: t(promoting ? 'adminUsers.roleAdmin' : 'adminUsers.roleUser'),
        }),
      );
    } catch {
      setFailure(t('adminUsers.roleFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => (saving ? undefined : onClose())}
      title={t('adminUsers.roleTitle', { name })}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleConfirm()}
            loading={saving}
            loadingLabel={t('adminUsers.roleSaving')}
          >
            {t(promoting ? 'adminUsers.promoteConfirm' : 'adminUsers.demoteConfirm')}
          </Button>
        </>
      }
    >
      {failure ? (
        <Alert tone="danger" live>
          {failure}
        </Alert>
      ) : null}

      <p>{t(promoting ? 'adminUsers.promoteBody' : 'adminUsers.demoteBody')}</p>
      <p className="muted" style={{ marginBottom: 0, fontSize: 13 }}>
        {t('adminUsers.roleClaimNote')}
      </p>
    </Modal>
  );
}

/**
 * Blocking or restoring sign-in.
 *
 * The reason field is optional and goes only to the audit log. It is asked for
 * here rather than left to a separate note because the moment someone is
 * deciding is the moment they know why, and an audit entry that records what
 * happened without why is the half that is easy to reconstruct.
 */
function AccessDialog({
  account,
  onClose,
  onChanged,
  t,
}: {
  account: AccountRow;
  onClose: () => void;
  onChanged: (message: string) => void;
  t: I18nContextValue['t'];
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const disabling = !account.disabled;
  const name = account.email || account.uid;

  async function handleConfirm() {
    setSaving(true);
    setFailure(null);
    try {
      await setUserDisabled(account.uid, disabling, reason.trim() || undefined);
      onChanged(
        t(disabling ? 'adminUsers.disabledToast' : 'adminUsers.enabledToast', { name }),
      );
    } catch {
      setFailure(t('adminUsers.accessFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => (saving ? undefined : onClose())}
      title={t(disabling ? 'adminUsers.disableTitle' : 'adminUsers.enableTitle', { name })}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleConfirm()}
            loading={saving}
            loadingLabel={t(disabling ? 'adminUsers.disabling' : 'adminUsers.enabling')}
          >
            {t(disabling ? 'adminUsers.disableConfirm' : 'adminUsers.enableConfirm')}
          </Button>
        </>
      }
    >
      {failure ? (
        <Alert tone="danger" live>
          {failure}
        </Alert>
      ) : null}

      <p>{t(disabling ? 'adminUsers.disableBody' : 'adminUsers.enableBody')}</p>

      {disabling ? (
        <>
          {/* What survives is as much a part of the decision as what does not:
              disabling is not deletion, and an admin should know that before
              choosing between them. */}
          <p>{t('adminUsers.disableKeeps')}</p>
          <p className="muted" style={{ fontSize: 13 }}>
            {t('adminUsers.disableWindow')}
          </p>

          <Field label={t('adminUsers.disableReason')} hint={t('adminUsers.disableReasonHint')}>
            {(props) => (
              <TextInput
                {...props}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </Field>
        </>
      ) : null}
    </Modal>
  );
}
