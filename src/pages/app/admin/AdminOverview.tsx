import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { ProgressBar } from '@/components/ProgressBar';
import { Skeleton } from '@/components/Skeleton';
import { Tag } from '@/components/Tag';
import {
  auditLabel,
  HEALTH_LABEL,
  HEALTH_TONE,
  storageFraction,
  systemHealth,
  type AdminOverview as Overview,
  type AuditEntry,
} from '@/domain/adminOverview';
import { formatBytes } from '@/domain/quotas';
import { formatShortDate } from '@/i18n/dates';
import { useI18n } from '@/i18n/useI18n';
import type { I18nContextValue } from '@/i18n/I18nContext';
import type { Locale } from '@/domain/locales';
import { fetchAdminOverview, UNKNOWN_COUNT } from '@/services/adminOverview';

/**
 * The administrator's dashboard (KAN-18).
 *
 * This is where an admin lands after signing in, rather than on the variables
 * grid a reader gets. The two answer different questions and share no figure:
 * a reader's home page is their own results, and this is the state of the
 * system that holds everybody's.
 *
 * ── The line this page does not cross ─────────────────────────────────────
 *
 * Nothing here is a laboratory value, and nothing names whose data any figure
 * came from. That is not a matter of taste. An admin holds a token the rules
 * let read every account, and the discipline that keeps that power narrow is
 * built out of screens that do not use it: this one is assembled from counts
 * (`getCountFromServer` returns a number without transferring a document), a
 * capacity total, and an audit trail whose entries name accounts by uid and
 * carry no health data at all.
 *
 * ── Why a figure can read as a dash ───────────────────────────────────────
 *
 * Each count is fetched independently and a refused read becomes `UNKNOWN_COUNT`
 * rather than zero. A rules change, a missing index or a partially-configured
 * project should leave this page saying "I could not count that" — a dashboard
 * that reported an empty system when it had merely been refused would send an
 * admin looking for a data-loss incident that never happened.
 */
export function AdminOverview() {
  const { t, locale } = useI18n();

  const [overview, setOverview] = useState<Overview | null>(null);
  const [partial, setPartial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await fetchAdminOverview();
      setOverview(result.overview);
      setPartial(result.partial);
      setError(null);
    } catch {
      setError(t('adminOverview.loadFailed'));
    } finally {
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const health = overview ? systemHealth(overview) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">{t('nav.administration')}</div>
          <h1>{t('nav.adminOverview')}</h1>
        </div>
        <div className="spacer" />
        {/* Aggregate queries cannot be subscribed to, so the page is a
            snapshot and says as much by offering the reload rather than
            pretending the figures are live. */}
        <Button
          variant="secondary"
          icon="arrows-clockwise"
          onClick={() => void load()}
          loading={refreshing}
          loadingLabel={t('adminOverview.refreshing')}
        >
          {t('adminOverview.refresh')}
        </Button>
      </div>

      <p className="muted admin-intro">{t('adminOverview.intro')}</p>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      {overview === null ? (
        <div role="status" aria-label={t('adminOverview.loadingLabel')}>
          <Skeleton height={280} radius="var(--r-card)" />
        </div>
      ) : (
        <>
          {health ? (
            <Alert tone={HEALTH_TONE[health]} title={t(HEALTH_LABEL[health])}>
              {t(
                health === 'blocked'
                  ? 'adminOverview.healthBlockedBody'
                  : health === 'attention'
                    ? 'adminOverview.healthAttentionBody'
                    : 'adminOverview.healthOkBody',
              )}
            </Alert>
          ) : null}

          {/* Said plainly rather than left to be inferred from a dash: a
              figure that is missing because the read was refused must not be
              read as a figure that is genuinely zero. */}
          {partial ? (
            <Alert tone="warning">{t('adminOverview.loadFailed')}</Alert>
          ) : null}

          <div className="admin-stat-grid">
            <StatCard
              icon="users-three"
              heading={t('adminOverview.accountsHeading')}
              link={{ to: '/admin/users', label: t('adminOverview.accountsLink') }}
            >
              <Figure label={t('adminOverview.accountsTotal')} value={overview.accounts.total} />
              <Figure label={t('adminOverview.accountsAdmins')} value={overview.accounts.admins} />
              <Figure
                label={t('adminOverview.accountsDisabled')}
                value={overview.accounts.disabled}
              />
            </StatCard>

            <StatCard icon="files" heading={t('adminOverview.reportsHeading')}>
              <Figure label={t('adminOverview.reportsTotal')} value={overview.reports.total} />
              <Figure
                label={t('adminOverview.reportsProcessed')}
                value={overview.reports.processed}
              />
              <Figure
                label={t('adminOverview.reportsFailed')}
                value={overview.reports.failed}
                alarming={overview.reports.failed > 0}
              />
              {overview.reports.failed > 0 ? (
                <p className="muted admin-stat-note">
                  {t('adminOverview.reportsFailedNote', { ticket: 'KAN-20' })}
                </p>
              ) : null}
            </StatCard>

            <StatCard
              icon="flask"
              heading={t('adminOverview.catalogHeading')}
              link={{ to: '/admin/variables', label: t('adminOverview.catalogLink') }}
            >
              <Figure label={t('adminOverview.catalogTotal')} value={overview.catalog.total} />
              <Figure
                label={t('adminOverview.catalogNeedsReview')}
                value={overview.catalog.needsReview}
              />
            </StatCard>

            <StatCard icon="hard-drives" heading={t('adminOverview.storageHeading')}>
              <p className="admin-stat-line">
                {t('adminOverview.storageUsed', {
                  used: formatBytes(overview.storage.bytesUsed),
                  limit: formatBytes(overview.storage.limitBytes),
                })}
              </p>
              <ProgressBar
                value={Math.round(storageFraction(overview.storage) * 100)}
                label={t('adminOverview.storageHeading')}
              />
              <div>
                {overview.storage.uploadsDisabled ? (
                  <Tag tone="accent-2">{t('adminOverview.storageUploadsOff')}</Tag>
                ) : (
                  <Tag tone="outline">{t('adminOverview.storageUploadsOn')}</Tag>
                )}
              </div>
            </StatCard>
          </div>

          <section className="admin-audit">
            <h2 className="admin-section-heading">{t('adminOverview.auditHeading')}</h2>
            {overview.audit.length === 0 ? (
              <p className="muted">{t('adminOverview.auditEmpty')}</p>
            ) : (
              <ul className="admin-audit-list">
                {overview.audit.map((entry) => (
                  <AuditRow key={entry.id} entry={entry} t={t} locale={locale} />
                ))}
              </ul>
            )}
            <p className="muted admin-stat-note">{t('adminOverview.auditNote')}</p>
          </section>
        </>
      )}
    </>
  );
}

function StatCard({
  icon,
  heading,
  link,
  children,
}: {
  icon: string;
  heading: string;
  link?: { to: string; label: string };
  children: ReactNode;
}) {
  return (
    <section className="card admin-stat-card">
      <div className="admin-stat-head">
        <Icon name={icon} size={18} />
        <h2 className="card-title">{heading}</h2>
      </div>
      {children}
      {link ? (
        <Link to={link.to} className="admin-stat-link">
          {link.label}
        </Link>
      ) : null}
    </section>
  );
}

/**
 * One figure.
 *
 * `UNKNOWN_COUNT` draws an em dash with a screen-reader-visible explanation
 * rather than a number, because the honest answer to a refused query is "I do
 * not know" and every alternative reads as a measurement.
 */
function Figure({
  label,
  value,
  alarming = false,
}: {
  label: string;
  value: number;
  alarming?: boolean;
}) {
  const unknown = value === UNKNOWN_COUNT;

  return (
    <div className="admin-figure">
      <span className="admin-figure-label">{label}</span>
      <span className="admin-figure-value" data-alarming={alarming || undefined}>
        {unknown ? '—' : value.toLocaleString()}
      </span>
    </div>
  );
}

/**
 * One line of the audit trail.
 *
 * Accounts are named by uid and nothing else. Resolving them to email addresses
 * would mean a read per entry against `users`, and would put a list of people
 * and what was done to them on a screen whose whole claim is that it shows
 * counts — the uid is enough to carry into /admin/users, which is where a name
 * belongs.
 */
function AuditRow({
  entry,
  t,
  locale,
}: {
  entry: AuditEntry;
  t: I18nContextValue['t'];
  locale: Locale;
}) {
  return (
    <li className="admin-audit-row">
      <span className="admin-audit-action">{t(auditLabel(entry.action))}</span>
      <span className="muted admin-cell-sub">
        {entry.actorId
          ? t('adminOverview.auditActor', { actor: entry.actorId })
          : // Cleared by `deleteAccount` when the actor has since deleted
            // their own account. An empty cell would read as a missing value
            // rather than as the deliberate erasure it is.
            t('adminOverview.auditActorRedacted')}
        {' · '}
        {entry.targetId
          ? t('adminOverview.auditTarget', { target: entry.targetId })
          : t('adminOverview.auditNoTarget')}
      </span>
      <span className="muted admin-cell-sub">
        {entry.at ? formatShortDate(entry.at.toDate(), locale) : '—'}
      </span>
    </li>
  );
}
