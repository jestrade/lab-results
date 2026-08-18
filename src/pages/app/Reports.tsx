import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/Alert';
import { Button, ButtonLink } from '@/components/Button';
import { DataTable, type Column } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { SkeletonTable } from '@/components/Skeleton';
import { ReportStatusBadge } from '@/components/StatusBadge';
import { Tag } from '@/components/Tag';
import { useToast } from '@/components/useToast';
import { present, REPORT_STATUS } from '@/domain/status';
import { Trans } from '@/i18n/Trans';
import { useI18n } from '@/i18n/useI18n';
import type { MessageKey } from '@/i18n/messages';
import { formatBytes } from '@/domain/quotas';
import { canRetryReport } from '@/domain/retry';
import type { Report, ReportStatus } from '@/domain/types';
import {
  deleteReport,
  deleteReports,
  effectiveDate,
  formatDate,
  getReportDownloadUrl,
  hasResults,
  reportSubtitle,
  retryErrorMessage,
  retryReport,
  subscribeToReports,
} from '@/services/reportsList';

/**
 * Reports list (KAN-13, KAN-43).
 *
 * A live subscription rather than a fetch: a report uploaded a moment ago moves
 * through queued → processing → processed on its own, and the user's instinct
 * is to sit on this page and watch. Polling or a manual refresh would make a
 * working pipeline look broken.
 */

type Filter = 'all' | ReportStatus;

/**
 * The filter labels reuse the report-status keys, so a status is worded
 * identically in the filter and in the badge it filters for. "All" has no
 * status to borrow from and gets its own.
 */
const FILTERS: { id: Filter; label: MessageKey }[] = [
  { id: 'all', label: 'reports.filter.all' },
  { id: 'processed', label: 'status.report.processed' },
  { id: 'processing', label: 'status.report.processing' },
  { id: 'partially_processed', label: 'status.report.partiallyProcessed' },
  { id: 'failed', label: 'status.report.failed' },
];

export function Reports() {
  const { user } = useAuth();
  const { push } = useToast();
  const { t, locale } = useI18n();

  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [pendingDelete, setPendingDelete] = useState<Report | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** Id of the report being reprocessed — one at a time, and only its own row spins. */
  const [retrying, setRetrying] = useState<string | null>(null);

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirmingBulk, setConfirmingBulk] = useState(false);

  useEffect(() => {
    if (!user) return;
    return subscribeToReports(
      user.uid,
      (next) => {
        setReports(next);
        setError(null);
        // Reports arrive and leave under the reader — another tab deletes one,
        // the pipeline finishes another. A selection holding ids that no longer
        // exist would let the bar offer to delete four reports and remove two.
        setSelected((current) => {
          if (current.size === 0) return current;
          const alive = new Set(next.map((report) => report.id));
          const kept = [...current].filter((id) => alive.has(id));
          return kept.length === current.size ? current : new Set(kept);
        });
      },
      () => setError(t('reports.loadFailed')),
    );
  }, [user, t]);

  const visible = useMemo(() => {
    if (!reports) return [];
    if (filter === 'all') return reports;
    // "Processing" reads as "in flight" to a user, so it covers the queued step
    // too — that distinction is ours, not theirs.
    if (filter === 'processing') {
      return reports.filter(
        (report) =>
          report.status === 'processing' ||
          report.status === 'queued' ||
          report.status === 'uploaded',
      );
    }
    return reports.filter((report) => report.status === filter);
  }, [reports, filter]);

  /**
   * The selected reports, in the order they appear.
   *
   * Derived from `visible` rather than from the whole list, so a selection can
   * never reach past the filter the reader is looking through. Narrowing the
   * filter therefore narrows what "delete selected" will delete, which is the
   * only reading of it that matches what is on screen.
   */
  const chosen = useMemo(
    () => visible.filter((report) => selected.has(report.id)),
    [visible, selected],
  );

  const chosenBytes = useMemo(
    () => chosen.reduce((sum, report) => sum + (report.fileSize ?? 0), 0),
    [chosen],
  );

  const totals = useMemo(() => {
    const list = reports ?? [];
    return {
      reports: list.length,
      results: list.reduce((sum, report) => sum + (report.resultCount ?? 0), 0),
    };
  }, [reports]);

  async function handleOpenPdf(report: Report) {
    try {
      const url = await getReportDownloadUrl(report);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      push(t('reports.openFailed'), 'danger');
    }
  }

  /**
   * The call resolves only when reprocessing has finished, which is tens of
   * seconds for a full panel. The subscription is what actually reports the
   * outcome — this handler's job is to keep the button honest while it runs
   * and to say something if the server refuses outright.
   */
  async function handleRetry(report: Report) {
    setRetrying(report.id);
    try {
      const status = await retryReport(report.id);
      if (status === 'failed') {
        // The row already carries the new reason; what the toast adds is that
        // the attempt is over, since the button stopped spinning either way.
        push(t('reports.retryFailedAgain'), 'danger');
      } else {
        push(t('reports.retrySucceeded'), 'success');
      }
    } catch (error) {
      push(retryErrorMessage(error, locale), 'danger');
    } finally {
      setRetrying(null);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteReport(pendingDelete);
      // The subscription removes the row; saying so closes the loop, and the
      // freed-space note connects the action to the quota meter on Upload.
      push(t('reports.deleted', { size: formatBytes(pendingDelete.fileSize) }), 'success');
      setPendingDelete(null);
    } catch {
      push(t('reports.deleteFailed'), 'danger');
    } finally {
      setDeleting(false);
    }
  }

  /**
   * Deletes everything selected, and says what actually happened.
   *
   * A partial result is a real outcome here, not an edge case — each report is
   * a Storage object and a Firestore document in two services with no shared
   * transaction. Reporting "deleted" after seven of nine went would be a lie
   * about someone's health records, so the failures are counted out loud and
   * stay selected, which is also what makes a second attempt one click away.
   */
  async function handleConfirmBulkDelete() {
    if (chosen.length === 0) return;
    setDeleting(true);
    try {
      const { deleted, failed } = await deleteReports(chosen);

      if (deleted.length > 0) {
        push(
          t(deleted.length === 1 ? 'reports.deletedOne' : 'reports.deletedMany', {
            count: deleted.length,
            size: formatBytes(deleted.reduce((sum, report) => sum + (report.fileSize ?? 0), 0)),
          }),
          'success',
        );
      }
      if (failed.length > 0) {
        push(t('reports.deleteSomeFailed', { count: failed.length }), 'danger');
      }

      // Only the ones that are gone leave the selection.
      setSelected(new Set(failed.map((report) => report.id)));
      setConfirmingBulk(false);
    } finally {
      setDeleting(false);
    }
  }

  function toggleOne(id: string, isSelected: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (isSelected) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(keys: string[], isSelected: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const key of keys) {
        if (isSelected) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }

  const columns: Column<Report>[] = [
    {
      key: 'reportDate',
      header: t('reports.col.reportDate'),
      width: '130px',
      sortValue: (report) => effectiveDate(report)?.getTime() ?? 0,
      render: (report) => (
        <>
          {formatDate(effectiveDate(report), locale)}
          {!report.reportDate ? (
            // Being explicit beats showing the upload date as if the laboratory
            // had printed it.
            <div className="faint" style={{ fontSize: 11 }}>
              {t('reports.uploadDateNote')}
            </div>
          ) : null}
        </>
      ),
    },
    {
      key: 'uploadedAt',
      header: t('reports.col.uploaded'),
      width: '120px',
      sortValue: (report) => report.uploadedAt?.toMillis?.() ?? 0,
      render: (report) => formatDate(report.uploadedAt?.toDate?.() ?? null, locale),
    },
    {
      key: 'file',
      header: t('reports.col.file'),
      sortValue: (report) => report.originalFileName.toLowerCase(),
      render: (report) => {
        const subtitle = reportSubtitle(report, locale);
        return (
          <>
            <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{report.userLabel || report.originalFileName}</span>
              {/* A word, not a colour: the row has to say "possible duplicate"
                  to a reader who cannot see the tag's tone (spec §60). Both
                  copies stay in the list — this marks one, it does not hide
                  it (spec §40.2). */}
              {report.duplicateOf ? <Tag tone="outline">{t('reports.duplicateTag')}</Tag> : null}
            </div>
            {subtitle.text ? (
              <div
                style={{
                  fontSize: 11,
                  color:
                    subtitle.tone === 'danger'
                      ? 'var(--feedback-danger-ink)'
                      : 'var(--color-text-muted)',
                }}
              >
                {subtitle.text}
              </div>
            ) : null}
          </>
        );
      },
    },
    {
      key: 'status',
      header: t('reports.col.status'),
      width: '180px',
      // Sorted by the label the reader can see, so the order matches the
      // column rather than an English word behind it.
      sortValue: (report) => present(REPORT_STATUS[report.status], locale).label,
      render: (report) => <ReportStatusBadge status={report.status} />,
    },
    {
      key: 'results',
      header: t('reports.col.results'),
      width: '90px',
      align: 'right',
      sortValue: (report) => report.resultCount ?? -1,
      render: (report) => report.resultCount ?? '—',
    },
    {
      key: 'outOfRange',
      header: t('reports.col.outOfRange'),
      width: '110px',
      align: 'right',
      sortValue: (report) => report.outOfRangeCount ?? -1,
      render: (report) => report.outOfRangeCount ?? '—',
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('reports.col.actions')}</span>,
      width: '280px',
      render: (report) => (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {/* Every row shows the same three words, so each control names its
              own report through aria-label. The visible text stays the first
              part of that name, which keeps voice control working (WCAG 2.5.3)
              and avoids repeating the filename as visible text. */}
          {canRetryReport(report) ? (
            <Button
              variant="ghost"
              icon="arrow-clockwise"
              loading={retrying === report.id}
              loadingLabel={t('reports.retrying')}
              // Reprocessing reads the PDF that is already stored, so it costs
              // the user nothing from their monthly upload allowance.
              onClick={() => void handleRetry(report)}
              aria-label={t('reports.retryLabel', { file: report.originalFileName })}
            >
              {t('reports.retry')}
            </Button>
          ) : null}
          {hasResults(report) ? (
            <ButtonLink
              to={`/files/${report.id}`}
              variant="ghost"
              aria-label={t('reports.viewDetailsLabel', { file: report.originalFileName })}
            >
              {t('reports.viewDetails')}
            </ButtonLink>
          ) : null}
          {report.status !== 'failed' ? (
            <Button
              variant="ghost"
              onClick={() => void handleOpenPdf(report)}
              aria-label={t('reports.originalPdfLabel', { file: report.originalFileName })}
            >
              {t('reports.originalPdf')}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            onClick={() => setPendingDelete(report)}
            aria-label={t('reports.deleteLabel', { file: report.originalFileName })}
          >
            {t('reports.delete')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">
            {reports === null
              ? t('reports.loading')
              : [
                  t(totals.reports === 1 ? 'reports.countOne' : 'reports.countMany', {
                    count: totals.reports,
                  }),
                  ...(totals.results > 0
                    ? [t('reports.resultsCount', { count: totals.results })]
                    : []),
                ].join(' · ')}
          </div>
          <h1>{t('nav.files')}</h1>
        </div>
        <div className="spacer" />
        <ButtonLink to="/upload" variant="primary" icon="upload-simple">
          {t('common.uploadReport')}
        </ButtonLink>
      </div>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      {reports === null ? (
        <SkeletonTable rows={4} columns={6} />
      ) : reports.length === 0 ? (
        <EmptyState
          icon="tray"
          title={t('reports.emptyTitle')}
          action={
            <ButtonLink to="/upload" variant="primary" icon="upload-simple">
              {t('reports.uploadFirst')}
            </ButtonLink>
          }
        >
          {t('reports.emptyBody')}
        </EmptyState>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div className="seg" role="group" aria-label={t('reports.filterLabel')}>
              {FILTERS.map((option) => (
                <label key={option.id} className="seg-opt">
                  <input
                    type="radio"
                    name="report-filter"
                    checked={filter === option.id}
                    onChange={() => setFilter(option.id)}
                  />
                  {t(option.label)}
                </label>
              ))}
            </div>
          </div>

          {/* Appears only once something is selected, and announces itself:
              the count is the only confirmation the reader gets that the row
              they ticked was the row that took it. */}
          {chosen.length > 0 ? (
            <div className="bulk-bar" role="status" aria-live="polite">
              <span className="bulk-count">
                {t(chosen.length === 1 ? 'reports.selectedOne' : 'reports.selectedMany', {
                  count: chosen.length,
                  size: formatBytes(chosenBytes),
                })}
              </span>
              <div className="spacer" />
              <Button variant="ghost" onClick={() => setSelected(new Set())}>
                {t('reports.clearSelection')}
              </Button>
              <Button variant="secondary" icon="trash" onClick={() => setConfirmingBulk(true)}>
                {t('reports.deleteSelected')}
              </Button>
            </div>
          ) : null}

          <DataTable
            caption={
              filter === 'all'
                ? t('reports.caption')
                : t('reports.captionFiltered', {
                    // The filter's own translated label, not the raw status id
                    // with its underscore swapped for a space.
                    status: t(
                      FILTERS.find((option) => option.id === filter)?.label ??
                        'reports.filter.all',
                    ),
                  })
            }
            columns={columns}
            rows={visible}
            rowKey={(report) => report.id}
            selection={{
              selected,
              onToggle: toggleOne,
              onToggleAll: toggleAll,
              rowLabel: (report) =>
                t('reports.selectLabel', { file: report.userLabel || report.originalFileName }),
              // "All" is the rows the filter is showing, not every report the
              // user has — the box sits on top of those rows and cannot mean
              // something the reader can't see.
              allLabel: t('reports.selectAllLabel'),
            }}
            initialSort={{ key: 'reportDate', direction: 'descending' }}
            empty={
              <EmptyState icon="funnel" title={t('reports.noMatchTitle')}>
                {t('reports.noMatchBody')}
              </EmptyState>
            }
          />
        </>
      )}

      <Modal
        open={pendingDelete !== null}
        onClose={() => (deleting ? undefined : setPendingDelete(null))}
        title={t('reports.deleteTitle')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(null)} disabled={deleting}>
              {t('settings.keepIt')}
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleConfirmDelete()}
              loading={deleting}
              loadingLabel={t('reports.deleting')}
            >
              {t('reports.deletePermanently')}
            </Button>
          </>
        }
      >
        <p>
          <Trans
            id="reports.deleteBody"
            values={{ file: <strong>{pendingDelete?.originalFileName}</strong> }}
          />
        </p>
        <p style={{ marginBottom: 0 }}>
          <Icon name="hard-drives" size={14} />{' '}
          {t('reports.deleteFreed', {
            size: pendingDelete ? formatBytes(pendingDelete.fileSize) : '',
          })}
        </p>
      </Modal>

      {/* Deleting several at once gets its own dialog rather than a reworded
          version of the single one. What makes a bulk delete safe is seeing
          exactly which reports are about to go, so they are listed by name —
          a count alone asks the reader to trust that their ticks landed where
          they think they did. */}
      <Modal
        open={confirmingBulk}
        onClose={() => (deleting ? undefined : setConfirmingBulk(false))}
        title={t('reports.deleteSelectedTitle', { count: chosen.length })}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmingBulk(false)}
              disabled={deleting}
            >
              {t('settings.keepIt')}
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleConfirmBulkDelete()}
              loading={deleting}
              loadingLabel={t('reports.deleting')}
            >
              {t('reports.deleteSelectedConfirm', { count: chosen.length })}
            </Button>
          </>
        }
      >
        <p>{t('reports.deleteSelectedBody')}</p>
        <ul className="bulk-list">
          {chosen.map((report) => (
            <li key={report.id}>
              <span>{report.userLabel || report.originalFileName}</span>
              <span className="muted">{formatBytes(report.fileSize)}</span>
            </li>
          ))}
        </ul>
        <p style={{ marginBottom: 0 }}>
          <Icon name="hard-drives" size={14} />{' '}
          {t('reports.deleteFreed', { size: formatBytes(chosenBytes) })}
        </p>
      </Modal>
    </>
  );
}
