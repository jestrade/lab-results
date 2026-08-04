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
import { useToast } from '@/components/useToast';
import { REPORT_STATUS } from '@/domain/status';
import { formatBytes } from '@/domain/quotas';
import type { Report, ReportStatus } from '@/domain/types';
import {
  deleteReport,
  effectiveDate,
  formatDate,
  getReportDownloadUrl,
  hasResults,
  reportSubtitle,
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

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'processed', label: 'Processed' },
  { id: 'processing', label: 'Processing' },
  { id: 'partially_processed', label: 'Partially processed' },
  { id: 'failed', label: 'Failed' },
];

export function Reports() {
  const { user } = useAuth();
  const { push } = useToast();

  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [pendingDelete, setPendingDelete] = useState<Report | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    return subscribeToReports(
      user.uid,
      (next) => {
        setReports(next);
        setError(null);
      },
      () => setError('We could not load your reports. Check your connection and try again.'),
    );
  }, [user]);

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
      push('That file could not be opened. It may still be uploading.', 'danger');
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteReport(pendingDelete);
      // The subscription removes the row; saying so closes the loop, and the
      // freed-space note connects the action to the quota meter on Upload.
      push(
        `Report deleted. ${formatBytes(pendingDelete.fileSize)} of your storage freed.`,
        'success',
      );
      setPendingDelete(null);
    } catch {
      push('That report could not be deleted. Please try again.', 'danger');
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<Report>[] = [
    {
      key: 'reportDate',
      header: 'Report date',
      width: '130px',
      sortValue: (report) => effectiveDate(report)?.getTime() ?? 0,
      render: (report) => (
        <>
          {formatDate(effectiveDate(report))}
          {!report.reportDate ? (
            // Being explicit beats showing the upload date as if the laboratory
            // had printed it.
            <div className="faint" style={{ fontSize: 11 }}>
              upload date
            </div>
          ) : null}
        </>
      ),
    },
    {
      key: 'uploadedAt',
      header: 'Uploaded',
      width: '120px',
      sortValue: (report) => report.uploadedAt?.toMillis?.() ?? 0,
      render: (report) => formatDate(report.uploadedAt?.toDate?.() ?? null),
    },
    {
      key: 'file',
      header: 'Original file',
      sortValue: (report) => report.originalFileName.toLowerCase(),
      render: (report) => {
        const subtitle = reportSubtitle(report);
        return (
          <>
            <div style={{ fontSize: 13 }}>{report.userLabel || report.originalFileName}</div>
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
      header: 'Status',
      width: '180px',
      sortValue: (report) => REPORT_STATUS[report.status].label,
      render: (report) => <ReportStatusBadge status={report.status} />,
    },
    {
      key: 'results',
      header: 'Results',
      width: '90px',
      align: 'right',
      sortValue: (report) => report.resultCount ?? -1,
      render: (report) => report.resultCount ?? '—',
    },
    {
      key: 'outOfRange',
      header: 'Out of range',
      width: '110px',
      align: 'right',
      sortValue: (report) => report.outOfRangeCount ?? -1,
      render: (report) => report.outOfRangeCount ?? '—',
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      width: '210px',
      render: (report) => (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {/* Every row shows the same three words, so each control names its
              own report through aria-label. The visible text stays the first
              part of that name, which keeps voice control working (WCAG 2.5.3)
              and avoids repeating the filename as visible text. */}
          {hasResults(report) ? (
            <ButtonLink
              to={`/reports/${report.id}`}
              variant="ghost"
              aria-label={`View details for ${report.originalFileName}`}
            >
              View details
            </ButtonLink>
          ) : null}
          {report.status !== 'failed' ? (
            <Button
              variant="ghost"
              onClick={() => void handleOpenPdf(report)}
              aria-label={`Open the original PDF for ${report.originalFileName}`}
            >
              Original PDF
            </Button>
          ) : null}
          <Button
            variant="ghost"
            onClick={() => setPendingDelete(report)}
            aria-label={`Delete ${report.originalFileName}`}
          >
            Delete
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
              ? 'Loading'
              : `${totals.reports} report${totals.reports === 1 ? '' : 's'}${
                  totals.results > 0 ? ` · ${totals.results} results` : ''
                }`}
          </div>
          <h1>Reports</h1>
        </div>
        <div className="spacer" />
        <ButtonLink to="/upload" variant="primary" icon="upload-simple">
          Upload a report
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
          title="No reports yet"
          action={
            <ButtonLink to="/upload" variant="primary" icon="upload-simple">
              Upload your first report
            </ButtonLink>
          }
        >
          Upload your first laboratory PDF and we&rsquo;ll extract the results, match reference
          ranges and start tracking each value over time.
        </EmptyState>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div className="seg" role="group" aria-label="Filter reports by status">
              {FILTERS.map((option) => (
                <label key={option.id} className="seg-opt">
                  <input
                    type="radio"
                    name="report-filter"
                    checked={filter === option.id}
                    onChange={() => setFilter(option.id)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>

          <DataTable
            caption={`Your laboratory reports${filter === 'all' ? '' : `, filtered to ${filter.replace('_', ' ')}`}`}
            columns={columns}
            rows={visible}
            rowKey={(report) => report.id}
            initialSort={{ key: 'reportDate', direction: 'descending' }}
            empty={
              <EmptyState icon="funnel" title="Nothing matches this filter">
                No reports have that status right now.
              </EmptyState>
            }
          />
        </>
      )}

      <Modal
        open={pendingDelete !== null}
        onClose={() => (deleting ? undefined : setPendingDelete(null))}
        title="Delete this report?"
        actions={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(null)} disabled={deleting}>
              Keep it
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleConfirmDelete()}
              loading={deleting}
              loadingLabel="Deleting…"
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <p>
          <strong>{pendingDelete?.originalFileName}</strong> and every result extracted from it
          will be removed. This cannot be undone, and the values it contributed will disappear from
          your trends.
        </p>
        <p style={{ marginBottom: 0 }}>
          <Icon name="hard-drives" size={14} />{' '}
          {pendingDelete ? formatBytes(pendingDelete.fileSize) : ''} of your storage will be freed.
        </p>
      </Modal>
    </>
  );
}
