import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/Alert';
import { Button, ButtonLink } from '@/components/Button';
import { DisclaimerBanner } from '@/components/DisclaimerBanner';
import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { SkeletonTable } from '@/components/Skeleton';
import { ConfidenceTag, ReportStatusBadge, ResultStatusBadge } from '@/components/StatusBadge';
import { useToast } from '@/components/useToast';
import { CRITICAL_RESULT_NOTICE, PARTIAL_PROCESSING_NOTICE } from '@/domain/disclaimers';
import { isOutOfRange } from '@/domain/status';
import { formatReferenceRange } from '@/domain/variables';
import type { Report } from '@/domain/types';
import { formatBytes } from '@/domain/quotas';
import { getReportDownloadUrl } from '@/services/reportsList';
import {
  formatTimestamp,
  subscribeToReport,
  subscribeToResults,
  type ReportResult,
} from '@/services/reportDetails';

/**
 * Report details (KAN-13, KAN-44).
 *
 * Every extracted value beside the range it was reported with, the status
 * computed from that range, and how confident the extraction was. The reader's
 * job here is to check the screen against the paper in front of them, so the
 * page is arranged for comparison rather than for summary: rows in document
 * order, values verbatim, nothing rounded or reformatted.
 */
export function ReportDetails() {
  const { reportId } = useParams<{ reportId: string }>();
  const { user } = useAuth();
  const { push } = useToast();

  const [report, setReport] = useState<Report | null | undefined>(undefined);
  const [results, setResults] = useState<ReportResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reportId || !user) return;
    const stopReport = subscribeToReport(reportId, setReport, () =>
      setError('We could not load this report. It may have been deleted.'),
    );
    const stopResults = subscribeToResults(reportId, setResults, () =>
      setError('We could not load the results for this report.'),
    );
    return () => {
      stopReport();
      stopResults();
    };
  }, [reportId, user]);

  const summary = useMemo(() => {
    const list = results ?? [];
    return {
      total: list.length,
      outOfRange: list.filter((result) => isOutOfRange(result.status)).length,
      lowConfidence: list.filter((result) => result.confidence === 'low').length,
      critical: list.filter((result) => result.status === 'critical'),
    };
  }, [results]);

  async function handleOpenPdf() {
    if (!report) return;
    try {
      const url = await getReportDownloadUrl(report);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      push('That file could not be opened.', 'danger');
    }
  }

  if (error) {
    return (
      <Alert tone="danger" live>
        {error}
      </Alert>
    );
  }

  if (report === undefined) return <SkeletonTable rows={6} columns={5} />;

  if (report === null) {
    return (
      <EmptyState
        icon="file-x"
        title="That report does not exist"
        action={
          <ButtonLink to="/reports" variant="primary">
            Back to reports
          </ButtonLink>
        }
      >
        It may have been deleted, or the link may be wrong.
      </EmptyState>
    );
  }

  const processing = report.status === 'processing' || report.status === 'queued' ||
    report.status === 'uploaded';

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">
            <ButtonLink to="/reports" variant="ghost">
              <Icon name="arrow-left" size={13} /> Reports
            </ButtonLink>
          </div>
          <h1>
            {report.reportDate
              ? `Report of ${formatTimestamp(report.reportDate)}`
              : report.originalFileName}
          </h1>
        </div>
        <div className="spacer" />
        <ReportStatusBadge status={report.status} />
        {report.status !== 'failed' ? (
          <Button variant="secondary" icon="download-simple" onClick={() => void handleOpenPdf()}>
            Download original
          </Button>
        ) : null}
      </div>

      {/* Critical results come first and are impossible to scroll past. The
          §46 wording is quoted exactly — it is regulated copy, not a summary. */}
      {summary.critical.length > 0 ? (
        <Alert
          tone="danger"
          live
          title={`${summary.critical.length} result${summary.critical.length === 1 ? '' : 's'} outside the critical range`}
        >
          {CRITICAL_RESULT_NOTICE}
        </Alert>
      ) : null}

      {report.status === 'partially_processed' ? (
        <Alert tone="warning" title="Some values could not be read">
          {PARTIAL_PROCESSING_NOTICE}
        </Alert>
      ) : null}

      {report.status === 'failed' ? (
        <Alert tone="danger" title="This report could not be processed">
          {report.warnings[0]?.message ??
            'Something went wrong while processing this report. Try uploading it again.'}
        </Alert>
      ) : null}

      {processing ? (
        <Alert tone="info" title="Still processing">
          Results appear here as soon as extraction finishes. You can leave this page.
        </Alert>
      ) : null}

      <div className="report-detail">
        <section className="report-results">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 22 }}>Extracted results</h2>
            {results ? (
              <span className="muted" style={{ fontSize: 13 }}>
                {summary.total} result{summary.total === 1 ? '' : 's'}
                {summary.outOfRange > 0 ? ` · ${summary.outOfRange} outside range` : ''}
                {summary.lowConfidence > 0 ? ` · ${summary.lowConfidence} low confidence` : ''}
              </span>
            ) : null}
          </div>

          {results === null ? (
            <SkeletonTable rows={5} columns={5} />
          ) : results.length === 0 ? (
            <EmptyState icon="flask" title="No results yet">
              {processing
                ? 'Extraction is still running.'
                : 'Nothing was extracted from this report.'}
            </EmptyState>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <caption className="sr-only">
                  Results extracted from {report.originalFileName}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Test</th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Value
                    </th>
                    <th scope="col">Unit</th>
                    <th scope="col">Reference range</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result) => (
                    <ResultRow key={result.id} result={result} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <DisclaimerBanner />
        </section>

        <aside className="report-meta" aria-label="Report metadata">
          <h2 style={{ fontSize: 18, margin: 0 }}>Report metadata</h2>
          <Meta label="Laboratory" value={report.laboratoryName ?? 'Not stated on this report'} />
          <Meta label="Report date" value={formatTimestamp(report.reportDate)} />
          <Meta label="Uploaded" value={formatTimestamp(report.uploadedAt)} />
          <Meta label="Processed" value={formatTimestamp(report.processedAt)} />
          <Meta
            label="File"
            value={`${report.originalFileName} · ${formatBytes(report.fileSize)}`}
          />
          <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.6 }}>
            <Icon name="lock-key" size={13} /> The original file is served through an authenticated
            link. It is never given a public URL.
          </p>
        </aside>
      </div>
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="kicker-quiet">{label}</div>
      <div style={{ fontSize: 14 }}>{value}</div>
    </div>
  );
}

function ResultRow({ result }: { result: ReportResult }) {
  const range = formatReferenceRange(result.referenceRange);

  return (
    <>
      <tr>
        <th scope="row" style={{ textAlign: 'left', fontWeight: 500, textTransform: 'none', fontSize: 14, letterSpacing: 0 }}>
          {result.rawName}
        </th>
        {/* The value exactly as printed. "Negative" and "<0.01" stay as they
            are — reformatting them would misreport what the lab said. */}
        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {result.rawValue}
        </td>
        <td className="muted">{result.unit ?? '—'}</td>
        <td>
          {range.text ?? <span className="muted">Not stated</span>}
          {range.note ? (
            <div className="faint" style={{ fontSize: 11 }}>
              {range.note}
            </div>
          ) : null}
        </td>
        <td>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <ResultStatusBadge status={result.status} describe />
            <ConfidenceTag confidence={result.confidence} />
          </div>
        </td>
      </tr>
      {result.analysis ? (
        <tr>
          <td colSpan={5} style={{ paddingTop: 0 }}>
            <div className="result-analysis">
              <div className="result-analysis-head">
                <Icon name="sparkle" size={14} />
                AI-generated · not medical advice
              </div>
              <p>{result.analysis.text}</p>
              <div className="faint" style={{ fontSize: 11 }}>
                {result.analysis.model} · prompt {result.analysis.promptVersion}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
