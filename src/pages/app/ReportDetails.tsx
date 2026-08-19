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
import {
  CRITICAL_RESULT_NOTICE_BY_LOCALE,
  PARTIAL_PROCESSING_NOTICE_BY_LOCALE,
} from '@/domain/disclaimers';
import { isOutOfRange } from '@/domain/status';
import { canRetryReport, retryHint } from '@/domain/retry';
import { formatReferenceRange } from '@/domain/variables';
import type { Report } from '@/domain/types';
import { formatBytes } from '@/domain/quotas';
import type { Locale } from '@/domain/locales';
import { warningText } from '@/domain/reportWarnings';
import { useI18n } from '@/i18n/useI18n';
import type { I18nContextValue } from '@/i18n/I18nContext';
import { getReportDownloadUrl, retryErrorMessage, retryReport } from '@/services/reportsList';
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
  const { t, locale } = useI18n();

  const [report, setReport] = useState<Report | null | undefined>(undefined);
  const [results, setResults] = useState<ReportResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!reportId || !user) return;
    const stopReport = subscribeToReport(reportId, setReport, () =>
      setError(t('detail.loadFailed')),
    );
    const stopResults = subscribeToResults(reportId, setResults, () =>
      setError(t('detail.resultsLoadFailed')),
    );
    return () => {
      stopReport();
      stopResults();
    };
  }, [reportId, user, t]);

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
      push(t('detail.openFailed'), 'danger');
    }
  }

  async function handleRetry() {
    if (!report) return;
    setRetrying(true);
    try {
      await retryReport(report.id);
      // Nothing is pushed on success: this page is subscribed to the report and
      // its results, so the alert, the badge and the table all change under the
      // reader on their own. A toast saying so would be the third telling.
    } catch (caught) {
      push(retryErrorMessage(caught, locale), 'danger');
    } finally {
      setRetrying(false);
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
        title={t('detail.missingTitle')}
        action={
          <ButtonLink to="/files" variant="primary">
            {t('detail.backToFiles')}
          </ButtonLink>
        }
      >
        {t('detail.missingBody')}
      </EmptyState>
    );
  }

  const processing = report.status === 'processing' || report.status === 'queued' ||
    report.status === 'uploaded';

  const retryButton = canRetryReport(report) ? (
    <Button
      variant="secondary"
      icon="arrow-clockwise"
      loading={retrying}
      loadingLabel={t('detail.reprocessing')}
      onClick={() => void handleRetry()}
    >
      {t('detail.tryAgain')}
    </Button>
  ) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">
            <ButtonLink to="/files" variant="ghost">
              <Icon name="arrow-left" size={13} /> {t('nav.files')}
            </ButtonLink>
          </div>
          <h1>
            {report.reportDate
              ? t('detail.reportOf', { date: formatTimestamp(report.reportDate, locale) })
              : report.originalFileName}
          </h1>
        </div>
        <div className="spacer" />
        <ReportStatusBadge status={report.status} />
        {report.status !== 'failed' ? (
          <Button variant="secondary" icon="download-simple" onClick={() => void handleOpenPdf()}>
            {t('detail.downloadOriginal')}
          </Button>
        ) : null}
      </div>

      {/* Critical results come first and are impossible to scroll past. The
          §46 wording is quoted exactly — it is regulated copy, not a summary. */}
      {summary.critical.length > 0 ? (
        <Alert
          tone="danger"
          live
          title={t(
            summary.critical.length === 1 ? 'detail.criticalOne' : 'detail.criticalMany',
            { count: summary.critical.length },
          )}
        >
          {CRITICAL_RESULT_NOTICE_BY_LOCALE[locale]}
        </Alert>
      ) : null}

      {report.status === 'partially_processed' ? (
        <Alert tone="warning" title={t('detail.partialTitle')}>
          {PARTIAL_PROCESSING_NOTICE_BY_LOCALE[locale]}
        </Alert>
      ) : null}

      {/* Possible duplicate (KAN-28). A notice with a way to look, not a
          prompt to act: both reports are kept, and the only thing offered
          here is the other one to compare against. Deleting either stays a
          deliberate act on the reports list (spec §40.2). */}
      {report.duplicateOf ? (
        <Alert
          tone="info"
          title={t('detail.duplicateTitle')}
          actions={
            <ButtonLink to={`/files/${report.duplicateOf}`}>
              {t('detail.duplicateCompare')}
            </ButtonLink>
          }
        >
          {t('detail.duplicateBody')}
        </Alert>
      ) : null}

      {report.status === 'failed' ? (
        <Alert tone="danger" title={t('detail.failedTitle')} actions={retryButton}>
          {/* Translated through the warning's code rather than shown as the
              pipeline wrote it. The sentence on the document is English —
              it is written in a Cloud Function, which has no reader and no
              locale — and this is the screen where somebody is trying to
              find out why their own report did not work. `warningText`
              falls back to the pipeline's words for a code it does not know,
              because a duplicate notice naming the other file says more in
              English than a generic apology does in Spanish. */}
          {report.warnings[0]
            ? warningText(report.warnings[0], locale)
            : t('detail.failedFallback')}
          {/* Why there is no button, when there is no button. */}
          {retryHint(report) ? ` ${retryHint(report)}` : null}
        </Alert>
      ) : null}

      {processing ? (
        // The retry sits here too, and only appears once the run is old enough
        // to be presumed dead (domain/retry.ts). A report whose worker died
        // shows this same reassuring notice forever otherwise, and re-uploading
        // the file is the only escape the user could find on their own.
        <Alert tone="info" title={t('detail.processingTitle')} actions={retryButton}>
          {t('detail.processingBody')}
        </Alert>
      ) : null}

      <div className="report-detail">
        <section className="report-results">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 22 }}>{t('detail.extractedResults')}</h2>
            {results ? (
              <span className="muted" style={{ fontSize: 13 }}>
                {/* Joined in code rather than baking the separator into the
                    messages: a translator should never have to preserve a
                    leading " · " to keep the line from running together. */}
                {[
                  t(summary.total === 1 ? 'detail.summaryOne' : 'detail.summaryMany', {
                    count: summary.total,
                  }),
                  ...(summary.outOfRange > 0
                    ? [t('detail.summaryOutOfRange', { count: summary.outOfRange })]
                    : []),
                  ...(summary.lowConfidence > 0
                    ? [t('detail.summaryLowConfidence', { count: summary.lowConfidence })]
                    : []),
                ].join(' · ')}
              </span>
            ) : null}
          </div>

          {results === null ? (
            <SkeletonTable rows={5} columns={5} />
          ) : results.length === 0 ? (
            <EmptyState icon="flask" title={t('detail.noResultsTitle')}>
              {t(processing ? 'detail.stillExtracting' : 'detail.nothingExtracted')}
            </EmptyState>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <caption className="sr-only">
                  {t('detail.tableCaption', { file: report.originalFileName })}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{t('detail.col.test')}</th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      {t('detail.col.value')}
                    </th>
                    <th scope="col">{t('detail.col.unit')}</th>
                    <th scope="col">{t('detail.col.range')}</th>
                    <th scope="col">{t('detail.col.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result) => (
                    <ResultRow key={result.id} result={result} locale={locale} t={t} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <DisclaimerBanner />
        </section>

        <aside className="report-meta" aria-label={t('detail.metaLabel')}>
          <h2 style={{ fontSize: 18, margin: 0 }}>{t('detail.metaLabel')}</h2>
          <Meta
            label={t('detail.meta.laboratory')}
            value={report.laboratoryName ?? t('detail.meta.notStated')}
          />
          <Meta
            label={t('detail.meta.reportDate')}
            value={formatTimestamp(report.reportDate, locale)}
          />
          <Meta label={t('detail.meta.uploaded')} value={formatTimestamp(report.uploadedAt, locale)} />
          <Meta
            label={t('detail.meta.processed')}
            value={formatTimestamp(report.processedAt, locale)}
          />
          <Meta
            label={t('detail.meta.file')}
            value={t('detail.meta.fileValue', {
              name: report.originalFileName,
              size: formatBytes(report.fileSize),
            })}
          />
          <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.6 }}>
            <Icon name="lock-key" size={13} /> {t('detail.meta.privateLink')}
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

/**
 * The locale and `t` are passed down rather than read from context again: this
 * renders once per extracted value, and a table of forty results should not
 * mean forty context subscriptions.
 */
function ResultRow({
  result,
  locale,
  t,
}: {
  result: ReportResult;
  locale: Locale;
  t: I18nContextValue['t'];
}) {
  const range = formatReferenceRange(result.referenceRange, locale);

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
          {range.text ?? <span className="muted">{t('detail.notStated')}</span>}
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
                {t('detail.aiGenerated')}
              </div>
              {/* The analysis prose itself is generated server-side, in
                  English. Translating it is a pipeline change, not a UI one —
                  see the note in `functions/src/ai/prompts.ts`. */}
              <p>{result.analysis.text}</p>
              <div className="faint" style={{ fontSize: 11 }}>
                {t('detail.promptVersion', {
                  model: result.analysis.model,
                  version: result.analysis.promptVersion,
                })}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
