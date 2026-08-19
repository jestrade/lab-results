import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { DataTable, type Column } from '@/components/DataTable';
import { EmptyState } from '@/components/EmptyState';
import { Field, TextInput } from '@/components/Field';
import { Skeleton } from '@/components/Skeleton';
import { Tag, type TagTone } from '@/components/Tag';
import { useToast } from '@/components/useToast';
import {
  canRetryJob,
  durationParts,
  filterJobs,
  filterParams,
  hasActiveFilters,
  jobCounts,
  jobElapsedMs,
  jobStartedAtMs,
  jobState,
  noRetryReason,
  readFilters,
  sortJobs,
  MAX_RETRIES,
  type JobFilters,
  type JobRow,
  type JobState,
  type JobStateFilter,
} from '@/domain/adminJobs';
import { warningText } from '@/domain/reportWarnings';
import { useNow } from '@/hooks/useNow';
import { formatDateTime } from '@/i18n/dates';
import { useI18n } from '@/i18n/useI18n';
import type { I18nContextValue } from '@/i18n/I18nContext';
import type { MessageKey } from '@/i18n/messages';
import { JOB_PAGE_SIZE, retryErrorMessage, retryJob, subscribeToJobs } from '@/services/adminJobs';

/**
 * The processing queue (KAN-20, KAN-51).
 *
 * The overview says how many reports failed. This is the screen that says
 * *which*, *whose*, *why*, and *for how long* — and it is the only place in the
 * product where a report belonging to somebody else can be acted on at all.
 *
 * ── What an operator comes here to tell apart ─────────────────────────────
 *
 * Three states that look identical on a reader's own file list, where all
 * three read as "extracting":
 *
 *   waiting   — uploaded, the trigger has not claimed it yet
 *   running   — claimed, inside the time a run can take
 *   stalled   — claimed, and past it
 *
 * The third is the one that matters. `onReportUploaded` is declared
 * `retry: false` and times out at 540 seconds, so a job still in flight past
 * `staleAfterMinutes` has lost its worker and will never finish by itself.
 * Nobody is coming to tell us: the owner sees a spinner, not an error. Until
 * this screen existed those reports were only found by the person who uploaded
 * one getting in touch.
 *
 * ── The line this screen holds ────────────────────────────────────────────
 *
 * Same line as the rest of the console. A row names a report id, an account
 * uid, a state, some timestamps and a failure code — and `JobRow` is shaped so
 * that is all it *can* name. The file name is on the document these rows are
 * read from and is deliberately not carried onto them: `march-hiv-panel.pdf`
 * would tell an operator something about a person that fixing their stuck job
 * does not require.
 *
 * ── Why the durations move on their own ───────────────────────────────────
 *
 * A job crossing from running to stalled changes nothing in Firestore — it is
 * the clock that moved, not the document — so no snapshot arrives to redraw
 * the row. `useNow` supplies the second hand.
 */
export function AdminJobs() {
  const { t, locale } = useI18n();
  const { push } = useToast();
  const now = useNow();

  const [pageSize, setPageSize] = useState(JOB_PAGE_SIZE);
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => readFilters(searchParams), [searchParams]);

  const updateFilters = useCallback(
    (change: Partial<JobFilters>) => {
      setSearchParams(
        (current) =>
          filterParams({
            ...readFilters(current),
            ...change,
            // Any change other than the page itself returns to the first page
            // — see the same note on the other admin screens.
            page: change.page ?? 1,
          }),
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useEffect(
    () =>
      subscribeToJobs(
        pageSize,
        (next) => {
          setJobs(next);
          setError(null);
        },
        () => setError(t('adminJobs.loadFailed')),
      ),
    [pageSize, t],
  );

  const all = useMemo(() => jobs ?? [], [jobs]);
  /**
   * The counts and the rows are cut against a clock that is deliberately
   * coarser than the one the durations tick on. Staleness is judged in
   * minutes, so recomputing the filtered list every second would rebuild the
   * table sixty times over to move one row an hour from now.
   */
  const minute = Math.floor(now / 60_000) * 60_000;
  const counts = useMemo(() => jobCounts(all, minute), [all, minute]);
  const rows = useMemo(() => sortJobs(filterJobs(all, filters, minute)), [all, filters, minute]);
  /** Whether the query filled its limit, and so may be hiding older jobs. */
  const maybeMore = all.length >= pageSize;

  async function handleRetry(job: JobRow) {
    setRetrying(job.reportId);
    try {
      const status = await retryJob(job.reportId);
      // Read back rather than assumed: the callable resolves with the status
      // the report actually ended on, and a second failure returns normally.
      push(
        t(status === 'failed' ? 'adminJobs.retryFailedAgain' : 'adminJobs.retrySucceeded', {
          report: job.reportId,
        }),
        status === 'failed' ? 'danger' : 'success',
      );
    } catch (caught) {
      // A refusal the server phrased — the cooldown, the attempt cap — is
      // shown as the server wrote it, so the console and the callable never
      // disagree about why something did not happen.
      push(retryErrorMessage(caught, locale), 'danger');
    } finally {
      setRetrying(null);
    }
  }

  const columns: Column<JobRow>[] = [
    {
      key: 'job',
      header: t('adminJobs.columnJob'),
      sortValue: (job) => job.reportId,
      render: (job) => (
        <div className="admin-cell-stack">
          {/* The two identifiers a Cloud Logging line and a support ticket
              name it by, and nothing else about the file. */}
          <code className="admin-code admin-code-title">{job.reportId}</code>
          <span className="muted admin-cell-sub">
            {t('adminJobs.ownerLabel', { uid: job.ownerId })}
          </span>
        </div>
      ),
    },
    {
      key: 'state',
      header: t('adminJobs.columnState'),
      sortValue: (job) => STATE_ORDER[jobState(job, now)],
      render: (job) => {
        const state = jobState(job, now);
        return <Tag tone={STATE_TONE[state]}>{t(STATE_LABEL[state])}</Tag>;
      },
    },
    {
      key: 'started',
      header: t('adminJobs.columnStarted'),
      sortValue: (job) => jobStartedAtMs(job) ?? 0,
      render: (job) => {
        const startedAt = jobStartedAtMs(job);
        return startedAt === null ? (
          <span className="muted">{t('adminJobs.startedUnknown')}</span>
        ) : (
          formatDateTime(new Date(startedAt), locale)
        );
      },
    },
    {
      key: 'duration',
      header: t('adminJobs.columnDuration'),
      // A job with no duration sorts below every job that has one rather than
      // above them: the column is read to find the longest-running work.
      sortValue: (job) => jobElapsedMs(job, now) ?? -1,
      render: (job) => <Duration job={job} now={now} t={t} />,
    },
    {
      key: 'attempts',
      header: t('adminJobs.columnAttempts'),
      sortValue: (job) => job.attempts,
      render: (job) =>
        job.attempts === 0 ? (
          <span className="muted">{t('adminJobs.attemptsFirst')}</span>
        ) : (
          t('adminJobs.attemptsSpent', { count: job.attempts, max: MAX_RETRIES })
        ),
    },
    {
      key: 'failure',
      header: t('adminJobs.columnFailure'),
      sortValue: (job) => job.failure?.code ?? '',
      render: (job) =>
        job.failure ? (
          <div className="admin-cell-stack">
            <span className="admin-cell-title">{warningText(job.failure, locale)}</span>
            {/* The code as well as the sentence: it is what the pipeline
                logs, what `config/retry.json` names, and what an operator
                greps for when several jobs died the same way. */}
            <code className="admin-code">{job.failure.code}</code>
          </div>
        ) : (
          <span className="muted">{t('adminJobs.noFailure')}</span>
        ),
    },
    {
      key: 'actions',
      header: t('adminJobs.columnActions'),
      align: 'right',
      render: (job) => (
        <RetryCell
          job={job}
          now={now}
          busy={retrying === job.reportId}
          onRetry={() => void handleRetry(job)}
          t={t}
        />
      ),
    },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">{t('nav.administration')}</div>
          <h1>{t('nav.adminJobs')}</h1>
        </div>
        <div className="spacer" />
        <div style={{ width: 260 }}>
          <Field label={t('adminJobs.search')}>
            {(props) => (
              <TextInput
                {...props}
                type="search"
                placeholder={t('adminJobs.searchPlaceholder')}
                value={filters.query}
                onChange={(event) => updateFilters({ query: event.target.value })}
              />
            )}
          </Field>
        </div>
      </div>

      <p className="muted admin-intro">{t('adminJobs.intro')}</p>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      {jobs === null ? (
        <div role="status" aria-label={t('adminJobs.loadingLabel')}>
          <Skeleton height={320} radius="var(--r-card)" />
        </div>
      ) : all.length === 0 ? (
        <EmptyState icon="check-circle" title={t('adminJobs.emptyTitle')}>
          {t('adminJobs.emptyBody')}
        </EmptyState>
      ) : (
        <>
          {/* Stalled jobs are said out loud at the top rather than left to be
              counted off a chip. They are the finding this screen exists to
              make, and nobody else in the system reports them: the account
              holder is looking at a spinner. */}
          {counts.stalled > 0 ? (
            <Alert
              tone="warning"
              title={t(
                counts.stalled === 1 ? 'adminJobs.stalledAlertOne' : 'adminJobs.stalledAlertMany',
                { count: counts.stalled },
              )}
            >
              {t('adminJobs.stalledAlertBody')}
            </Alert>
          ) : null}

          <div className="variable-filters">
            <div role="group" aria-label={t('adminJobs.filterState')} className="variable-chips">
              {STATES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="chip"
                  aria-pressed={filters.state === option.id}
                  onClick={() => updateFilters({ state: option.id })}
                >
                  {t(option.label, { count: counts[option.count] })}
                </button>
              ))}
            </div>
          </div>

          <DataTable
            caption={t('adminJobs.tableCaption')}
            columns={columns}
            rows={rows}
            rowKey={(job) => job.reportId}
            // Oldest attempt first, which is where triage starts — the
            // opposite default from the account list, and for the opposite
            // reason. See `sortJobs`.
            initialSort={{ key: 'started', direction: 'ascending' }}
            pagination={{
              page: filters.page,
              onPageChange: (page) => updateFilters({ page }),
              label: t('pagination.jobPages'),
            }}
            empty={
              <EmptyState icon="funnel" title={t('adminJobs.noMatchTitle')}>
                {t('adminJobs.noMatchBody')}
              </EmptyState>
            }
          />

          {hasActiveFilters(filters) && rows.length > 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {t('adminJobs.showing', { visible: rows.length, total: all.length })}
            </p>
          ) : null}

          <p className="muted admin-intro">{t('adminJobs.retryNote')}</p>

          {/* Same notice as the account list: a search over a list that is
              silently truncated must not answer "no such job". */}
          {maybeMore ? (
            <div className="admin-more">
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                {t('adminJobs.limitNote', { count: all.length })}
              </p>
              <Button variant="secondary" onClick={() => setPageSize((size) => size + JOB_PAGE_SIZE)}>
                {t('adminJobs.loadMore')}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

/** Sorted by how much attention the state is asking for, not alphabetically. */
const STATE_ORDER: Record<JobState, number> = {
  stalled: 0,
  failed: 1,
  running: 2,
  waiting: 3,
};

const STATE_LABEL: Record<JobState, MessageKey> = {
  waiting: 'adminJobs.stateWaiting',
  running: 'adminJobs.stateRunning',
  stalled: 'adminJobs.stateStalled',
  failed: 'adminJobs.stateFailed',
};

/**
 * Four states, four tags that do not look alike.
 *
 * Stalled and failed both want attention and want different things done, so
 * they must not share a colour — a filled rose tag beside a filled purple one
 * is telling an operator "this run is over" and "this run never will be" in
 * two glances rather than one reading. The word in the tag says it too: colour
 * is never the only carrier of a state in this app.
 */
const STATE_TONE: Record<JobState, TagTone> = {
  waiting: 'neutral',
  running: 'outline',
  stalled: 'accent',
  failed: 'accent-2',
};

const STATES: {
  id: JobStateFilter;
  label: MessageKey;
  count: 'all' | 'inFlight' | 'stalled' | 'failed';
}[] = [
  { id: 'all', label: 'adminJobs.chipAll', count: 'all' },
  { id: 'inFlight', label: 'adminJobs.chipInFlight', count: 'inFlight' },
  { id: 'stalled', label: 'adminJobs.chipStalled', count: 'stalled' },
  { id: 'failed', label: 'adminJobs.chipFailed', count: 'failed' },
];

/**
 * How long the job has been running.
 *
 * A failed job gets a dash and a sentence rather than a figure: the pipeline
 * records no finishing time for a run that gave up, so its duration is not
 * something this system knows. Time-since-start would be a number that kept
 * growing for a job that is over.
 */
function Duration({ job, now, t }: { job: JobRow; now: number; t: I18nContextValue['t'] }) {
  const elapsed = jobElapsedMs(job, now);

  if (elapsed === null) {
    return (
      <span className="muted" title={t('adminJobs.durationNoneLabel')}>
        {t('adminJobs.durationNone')}
      </span>
    );
  }

  const { hours, minutes, seconds } = durationParts(elapsed);
  if (hours > 0) return <>{t('adminJobs.durationHours', { hours, minutes })}</>;
  if (minutes > 0) return <>{t('adminJobs.durationMinutes', { minutes, seconds })}</>;
  return <>{t('adminJobs.durationSeconds', { seconds })}</>;
}

/**
 * The retry control, or the reason there is not one.
 *
 * The three refusals are the server's, mirrored from `config/retry.json` so
 * that a button which is offered is a button that works — and stated rather
 * than left as an empty cell, because "wait", "look at the file" and "stop
 * retrying this one" are three different instructions to the person reading.
 */
function RetryCell({
  job,
  now,
  busy,
  onRetry,
  t,
}: {
  job: JobRow;
  now: number;
  busy: boolean;
  onRetry: () => void;
  t: I18nContextValue['t'];
}) {
  if (!canRetryJob(job, now)) {
    const reason = noRetryReason(job, now);
    return (
      <span className="muted admin-cell-sub">
        {reason === 'running'
          ? t('adminJobs.retryRunning')
          : reason === 'exhausted'
            ? t('adminJobs.retryExhausted', { max: MAX_RETRIES })
            : t('adminJobs.retryPermanent')}
      </span>
    );
  }

  return (
    <div className="admin-row-actions">
      <Button
        variant="secondary"
        icon="arrows-clockwise"
        loading={busy}
        loadingLabel={t('adminJobs.retrying')}
        onClick={onRetry}
        aria-label={t('adminJobs.retryLabel', { report: job.reportId })}
      >
        {t('adminJobs.retry')}
      </Button>
    </div>
  );
}
