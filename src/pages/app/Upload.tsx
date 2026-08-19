import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/Alert';
import { Button, ButtonLink } from '@/components/Button';
import { Field, TextInput } from '@/components/Field';
import { FileDropzone } from '@/components/FileDropzone';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { PdfViewerModal } from '@/components/PdfViewerModal';
import { ProgressBar } from '@/components/ProgressBar';
import { StepIndicator, type Step } from '@/components/StepIndicator';
import { QuotaMeter } from '@/components/QuotaMeter';
import { useToast } from '@/components/useToast';
import { useAiConsent } from '@/hooks/useAiConsent';
import { useStorageQuota } from '@/hooks/useStorageQuota';
import { Trans } from '@/i18n/Trans';
import { useI18n } from '@/i18n/useI18n';
import type { I18nContextValue } from '@/i18n/I18nContext';
import type { MessageKey } from '@/i18n/messages';
import type { Locale } from '@/domain/locales';
import { findDuplicates, strongestSignal, type DuplicateMatch } from '@/domain/duplicates';
import {
  checkReportDate,
  localToday,
  parseReportDate,
  type ReportDateProblem,
} from '@/domain/reportDate';
import {
  checkUploadAllowed,
  currentUploadPeriod,
  formatBytes,
  MAX_FILE_BYTES,
  PER_USER_UPLOADS_PER_MONTH,
  uploadsUsedThisMonth,
} from '@/domain/quotas';
import { hashFile, uploadReport, validateFile, type UploadHandle } from '@/services/reports';
import { fetchDuplicateCandidates, formatDate, effectiveDate } from '@/services/reportsList';
import { toStorageErrorMessage } from '@/services/storageErrors';

/**
 * Where one chosen file has got to.
 *
 * `rejected` is separated from `failed` because the difference matters to the
 * reader: nothing was attempted for a rejected file (wrong type, no room),
 * while a failed one was sent and did not arrive.
 */
type ItemState =
  | 'draft'
  | 'checking'
  | 'confirming'
  | 'waiting'
  | 'uploading'
  | 'stored'
  | 'skipped'
  | 'cancelled'
  | 'rejected'
  | 'failed';

interface QueueItem {
  id: string;
  file: File;
  state: ItemState;
  progress: number;
  /**
   * The day the tests were taken, as the user typed it — `YYYY-MM-DD`, the
   * form `<input type="date">` exchanges. Kept as the string rather than a
   * `Date` so a half-typed value stays half-typed instead of becoming a
   * confidently wrong day.
   */
  reportDate: string;
  /** What is wrong with that date. Set when the user tries to upload. */
  dateProblem?: ReportDateProblem;
  /** Why it was rejected or how it failed. Ready to display. */
  message?: string;
  /** Existing reports this file looks like (KAN-28). */
  duplicates?: DuplicateMatch[];
}

/** States where the file's fate is still being decided. */
const IN_FLIGHT: ItemState[] = ['checking', 'confirming', 'waiting', 'uploading'];

/**
 * Upload reports (KAN-3, KAN-42, KAN-28).
 *
 * ── One queue, one worker ─────────────────────────────────────────────────
 *
 * The page takes as many files as the user drops and processes them strictly
 * one at a time. Concurrency would be the obvious alternative and is the wrong
 * one here, for three reasons that all point the same way:
 *
 *   The quota is checked against a counter the *server* maintains, and that
 *   counter only moves once an object finalizes. Five simultaneous uploads all
 *   read the same pre-upload figure, so a batch that fits only if you ignore
 *   four of its members would sail through the pre-flight and be rejected,
 *   file by file, after transfer.
 *
 *   Duplicate detection compares against what is already in the account. Run
 *   sequentially, the second copy of a file dropped twice in one batch is
 *   simply a duplicate of the first — which is the correct answer, and comes
 *   free. Run in parallel, neither knows about the other.
 *
 *   And a progress bar per file that all crawl together tells the user less
 *   than one that finishes.
 *
 * ── The duplicate prompt ──────────────────────────────────────────────────
 *
 * Before each file is sent, its hash and metadata are checked against the
 * account (see `domain/duplicates.ts`). A match pauses the queue and asks. It
 * never decides: the user can upload anyway, and nothing is ever removed or
 * merged on their behalf (spec §40.2). The content-based half of the check —
 * report date, laboratory, extracted values — cannot run here, because none of
 * that exists until the pipeline has read the PDF; it runs in
 * `functions/src/duplicates.ts` and surfaces on the report itself.
 */
export function Upload() {
  const { user, isEmailVerified } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const quota = useStorageQuota();
  const consent = useAiConsent();
  const { t, locale } = useI18n();

  // The queue is held in a ref as well as in state: the worker loop below runs
  // across awaits and needs to read what is *now* in the queue, not what was
  // there when its closure was created.
  const itemsRef = useRef<QueueItem[]>([]);
  const [items, setItems] = useState<QueueItem[]>([]);
  const pumping = useRef(false);
  const handles = useRef(new Map<string, UploadHandle>());
  /** Resolves when the user answers the duplicate dialog. */
  const answer = useRef<((decision: 'upload' | 'skip') => void) | null>(null);

  /**
   * The staged file being looked at, and the blob URL its frame reads.
   *
   * One piece of state for both because they have one lifetime: the URL exists
   * so this dialog can point at it, and the moment the dialog closes it is a
   * handle pinning the whole file in memory until it is revoked.
   */
  const [preview, setPreview] = useState<{ item: QueueItem; url: string } | null>(null);

  // Revoked in a cleanup rather than by the close handler: a handler cannot run
  // when the page unmounts, and a reader who navigates away with the dialog
  // open would leave the file held.
  useEffect(() => {
    const url = preview?.url;
    return url ? () => URL.revokeObjectURL(url) : undefined;
  }, [preview]);

  const publish = useCallback(() => setItems([...itemsRef.current]), []);

  const patch = useCallback(
    (id: string, changes: Partial<QueueItem>) => {
      itemsRef.current = itemsRef.current.map((item) =>
        item.id === id ? { ...item, ...changes } : item,
      );
      publish();
    },
    [publish],
  );

  /**
   * Runs one file end to end: hash, duplicate check, upload.
   *
   * Every exit writes a final state onto the item, so a file is never left
   * looking busy after its turn is over.
   */
  const process = useCallback(
    async (item: QueueItem) => {
      if (!user) return;
      patch(item.id, { state: 'checking' });

      const contentHash = await hashFile(item.file).catch(() => '');

      // A failed lookup must not block an upload. The check is advisory, and
      // the server-side pass still runs after extraction — refusing to proceed
      // because we could not read the user's own report list would be turning
      // a courtesy into an obstacle.
      const candidates = await fetchDuplicateCandidates(user.uid, contentHash).catch(() => []);
      const matches = findDuplicates(
        { contentHash, fileName: item.file.name, fileSize: item.file.size },
        candidates,
      );

      if (matches.length > 0) {
        patch(item.id, { state: 'confirming', duplicates: matches });
        const decision = await new Promise<'upload' | 'skip'>((resolve) => {
          answer.current = resolve;
        });
        answer.current = null;
        if (decision === 'skip') {
          patch(item.id, { state: 'skipped' });
          return;
        }
      }

      // Parsed here rather than carried as a `Date` on the item: the row owns
      // a string the user can still be editing, and this is the one moment it
      // has to become a day. Nothing reaches this point without having passed
      // `checkReportDate`, so a null would be a bug in this file — it is
      // guarded rather than asserted away because the cost of being wrong is
      // a report filed under the wrong date.
      const reportDate = parseReportDate(item.reportDate);
      if (!reportDate) {
        patch(item.id, { state: 'draft', dateProblem: 'required' });
        return;
      }

      patch(item.id, { state: 'uploading', progress: 0 });
      const handle = uploadReport({
        file: item.file,
        ownerId: user.uid,
        reportDate,
        contentHash,
        onProgress: (percent) => patch(item.id, { progress: percent }),
      });
      handles.current.set(item.id, handle);

      try {
        await handle.done;
        patch(item.id, { state: 'stored', progress: 100 });
      } catch (caught) {
        // A cancel rejects the same promise. The row already says `cancelled`;
        // dressing that up as a failure would be reporting the user's own
        // click back to them as an error.
        if (handles.current.get(item.id) !== handle) return;
        patch(item.id, {
          state: 'failed',
          message: toStorageErrorMessage(caught, locale).message,
        });
      } finally {
        handles.current.delete(item.id);
      }
    },
    [user, locale, patch],
  );

  /** Takes waiting files one at a time until none are left. */
  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true;
    try {
      for (;;) {
        const next = itemsRef.current.find((item) => item.state === 'waiting');
        if (!next) break;
        await process(next);
      }
    } finally {
      pumping.current = false;
    }
  }, [process]);

  function handleFilesSelected(selected: File[]) {
    if (!user) return;

    // The pre-flight is cumulative across the batch. Checking each file against
    // the *current* usage would clear five files that fit individually and
    // together do not, and the user would find that out one rejected transfer
    // at a time (spec §79).
    //
    // Files already staged count towards it too. Since a chosen file now waits
    // on the page for its date, "what is already on screen" and "what has been
    // sent" are no longer the same thing, and a projection that ignored the
    // waiting rows would accept a second batch that leaves no room for the
    // first.
    let projectedBytes =
      (quota.usage?.storageBytes ?? 0) +
      itemsRef.current
        .filter((item) => item.state === 'draft')
        .reduce((sum, item) => sum + item.file.size, 0);
    let projectedUploads =
      uploadsUsedThisMonth(quota.usage) +
      itemsRef.current.filter((item) => item.state === 'draft').length;

    const queued: QueueItem[] = selected.map((file) => {
      const id = crypto.randomUUID();
      const base = { id, file, progress: 0, reportDate: '' };

      const problem = validateFile(file, locale);
      if (problem) return { ...base, state: 'rejected', message: problem.message };

      const overQuota = checkUploadAllowed(
        {
          fileSize: file.size,
          usage: {
            storageBytes: projectedBytes,
            uploadsThisMonth: projectedUploads,
            uploadPeriod: currentUploadPeriod(),
          },
          systemStorageBytes: quota.system?.storageBytes ?? 0,
          uploadsDisabled: quota.uploadsDisabled,
        },
        locale,
      );
      if (overQuota) return { ...base, state: 'rejected', message: overQuota.message };

      projectedBytes += file.size;
      projectedUploads += 1;
      // Not sent yet: the file waits here until its owner says which day these
      // tests were taken. See `handleUploadDrafts`.
      return { ...base, state: 'draft' };
    });

    itemsRef.current = [...itemsRef.current, ...queued];
    publish();
  }

  /**
   * Starts the upload for one staged file.
   *
   * Per row rather than per batch. A single button naming a number — "Upload 3
   * files" — has to be all or nothing, so one empty date field holds back two
   * files that were ready; and the thing the user has to fix is somewhere in a
   * list, while the button they pressed is at the bottom of it. A button on
   * each row removes both problems: it sits beside the date it depends on, and
   * a row that is not ready is the only row that waits.
   *
   * The queue behind it is unchanged — files still go up one at a time (see
   * `pump`), so pressing three buttons quickly stages three files rather than
   * starting three transfers.
   */
  function handleUploadDraft(item: QueueItem) {
    // Read from the ref, not the row the button closed over: the date the user
    // typed after this render is in the ref and not in that closure.
    const current = itemsRef.current.find((entry) => entry.id === item.id);
    if (!current || current.state !== 'draft') return;

    const problem = checkReportDate(current.reportDate, localToday());
    if (problem) {
      patch(current.id, { dateProblem: problem });
      return;
    }

    patch(current.id, { state: 'waiting', dateProblem: undefined });
    void pump();
  }

  /**
   * Shows the chosen file, so the date can be read off the report itself.
   *
   * The date field asks for something only the document knows, and until now
   * the only way to look it up was to leave the page and open the file from
   * wherever it was downloaded to. The bytes are already here — they are a
   * `File` the user handed over — so `createObjectURL` is all that stands
   * between the field and the page it is asking about.
   */
  function handlePreview(item: QueueItem) {
    setPreview({ item, url: URL.createObjectURL(item.file) });
  }

  function handleDateChange(item: QueueItem, value: string) {
    // The problem clears as soon as the field is touched: leaving a red
    // "required" under a date the user has just typed reads as a rejection of
    // what they typed. It is re-checked when they press the button.
    patch(item.id, { reportDate: value, dateProblem: undefined });
  }

  function handleCancel(item: QueueItem) {
    const handle = handles.current.get(item.id);
    handles.current.delete(item.id);
    handle?.cancel();
    patch(item.id, { state: 'cancelled' });
    push(t('upload.cancelled'), 'info');
  }

  function handleRemove(item: QueueItem) {
    itemsRef.current = itemsRef.current.filter((entry) => entry.id !== item.id);
    publish();
  }

  function handleClear() {
    // Only the finished ones. Clearing a file mid-transfer would leave an
    // upload running with nothing on screen to cancel it with, and clearing a
    // draft would throw away a file the user has just chosen and may have
    // already dated.
    itemsRef.current = itemsRef.current.filter(
      (item) => IN_FLIGHT.includes(item.state) || item.state === 'draft',
    );
    publish();
  }

  const pending = items.find((item) => item.state === 'confirming');
  const stored = items.filter((item) => item.state === 'stored');
  const drafts = items.filter((item) => item.state === 'draft');
  const busy = items.some((item) => IN_FLIGHT.includes(item.state));
  const settled = items.filter(
    (item) => !IN_FLIGHT.includes(item.state) && item.state !== 'draft',
  );

  /**
   * Whether anything on this page is still on its way in.
   *
   * A staged file counts. It is not being transferred, but it is a report the
   * user means to add, and every "all done" on the page has to wait for it —
   * otherwise dropping a fourth file makes the page congratulate the reader on
   * finishing while the fourth one sits there undated.
   */
  const unfinished = busy || drafts.length > 0;

  // The step indicator describes what happens to a report after it lands, and
  // now covers the batch: the first step is complete once everything that is
  // going to arrive has arrived.
  const steps: Step[] = [
    {
      label: t('status.report.uploaded'),
      state: stored.length > 0 && !unfinished ? 'complete' : unfinished ? 'current' : 'pending',
      detail:
        stored.length > 0 && !unfinished
          ? t('upload.step.stored', {
              size: formatBytes(stored.reduce((sum, item) => sum + item.file.size, 0)),
            })
          : busy
            ? t('upload.step.transferring', { count: items.filter((i) => IN_FLIGHT.includes(i.state)).length })
            : drafts.length > 0
              ? t('upload.step.dateFirst', { count: drafts.length })
              : t('upload.step.chooseFile'),
    },
    {
      label: t('status.report.queued'),
      state: stored.length > 0 && !unfinished ? 'current' : 'pending',
      detail: stored.length > 0 && !unfinished ? t('upload.step.waitingSlot') : undefined,
    },
    { label: t('status.report.processing'), state: 'pending', detail: t('upload.step.extracting') },
    { label: t('status.report.processed'), state: 'pending', detail: t('upload.step.ready') },
  ];

  // One ceiling for every date field on the page, read once per render so two
  // rows cannot disagree about what "today" is across a midnight.
  const today = localToday();

  const uploadsBlocked =
    !isEmailVerified ||
    !consent.granted ||
    quota.uploadsDisabled ||
    quota.storage.isFull ||
    quota.uploads.remaining <= 0;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">{t('upload.kicker')}</div>
          <h1>{t('common.uploadReport')}</h1>
        </div>
      </div>

      <p className="muted" style={{ margin: 0, fontSize: 15, maxWidth: 620 }}>
        {t('upload.lede', {
          perFile: formatBytes(MAX_FILE_BYTES),
          allowance: formatBytes(quota.storage.limitBytes),
        })}
      </p>

      <section
        style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
        aria-label={t('upload.allowanceLabel')}
      >
        <QuotaMeter label={t('upload.storageUsed')} state={quota.storage} />
        <QuotaMeter
          label={t('upload.uploadsThisMonth')}
          state={{
            usedBytes: quota.uploads.used,
            limitBytes: quota.uploads.limit,
            remainingBytes: quota.uploads.remaining,
            fraction: quota.uploads.limit === 0 ? 1 : quota.uploads.used / quota.uploads.limit,
            isWarning: quota.uploads.remaining <= quota.uploads.limit * 0.2,
            isFull: quota.uploads.remaining <= 0,
          }}
          detail={t('upload.uploadsDetail', {
            used: quota.uploads.used,
            limit: PER_USER_UPLOADS_PER_MONTH,
          })}
        />
      </section>

      {quota.uploadsDisabled ? (
        <Alert tone="warning" title={t('upload.pausedTitle')}>
          {t('upload.pausedBody')}
        </Alert>
      ) : null}

      {quota.storage.isFull ? (
        <Alert tone="danger" title={t('upload.storageFullTitle')}>
          {t('upload.storageFullBody', {
            used: formatBytes(quota.storage.usedBytes),
            limit: formatBytes(quota.storage.limitBytes),
          })}
        </Alert>
      ) : quota.storage.isWarning ? (
        <Alert tone="warning" title={t('upload.storageLowTitle')}>
          {t('upload.storageLowBody', {
            remaining: formatBytes(quota.storage.remainingBytes),
            limit: formatBytes(quota.storage.limitBytes),
          })}
        </Alert>
      ) : null}

      {!consent.loading && !consent.granted ? (
        <div className="consent-gate">
          <Icon name="sparkle" className="alert-icon" />
          <div>
            <div className="consent-gate-title">{t('upload.consentTitle')}</div>
            <p>
              <Trans
                id="upload.consentBody1"
                values={{
                  provider: <strong>Google Gemini</strong>,
                  emphasis: <strong>{t('upload.consentEmphasis')}</strong>,
                }}
              />
            </p>
            <p>
              <Trans
                id="upload.consentBody2"
                values={{
                  link: <Link to="/legal/ai-processing">{t('upload.consentLink')}</Link>,
                }}
              />
            </p>
            {consent.error ? (
              <Alert tone="danger" live>
                {consent.error}
              </Alert>
            ) : null}
            <Button
              variant="primary"
              onClick={() => void consent.grant()}
              loading={consent.saving}
              loadingLabel={t('common.saving')}
            >
              {t('settings.agree')}
            </Button>
          </div>
        </div>
      ) : null}

      {!isEmailVerified ? (
        <Alert
          tone="warning"
          title={t('upload.verifyTitle')}
          actions={<ButtonLink to="/verify-email">{t('upload.verifyAction')}</ButtonLink>}
        >
          {t('upload.verifyBody')}
        </Alert>
      ) : null}

      {/* The dropzone stays available while the queue runs: a user who has
          just dropped three reports and remembers a fourth should not have to
          wait for the batch to finish before adding it. */}
      <FileDropzone
        onFilesSelected={handleFilesSelected}
        disabled={uploadsBlocked}
        promptKey="dropzone.prompt"
        hintKey="dropzone.hint"
        disabledReason={t(
          !isEmailVerified
            ? 'upload.disabled.verify'
            : !consent.granted
              ? 'upload.disabled.consent'
              : quota.uploadsDisabled
                ? 'upload.disabled.capacity'
                : quota.storage.isFull
                  ? 'upload.disabled.storageFull'
                  : 'upload.disabled.monthly',
        )}
      />

      {items.length > 0 ? (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h2 style={{ fontSize: 20, margin: 0 }}>{t('upload.queueHeading')}</h2>
            <span className="muted" style={{ fontSize: 13 }}>
              {t('upload.queueCount', { done: stored.length, total: items.length })}
            </span>
            <div className="spacer" />
            {settled.length > 0 ? (
              <Button variant="ghost" onClick={handleClear}>
                {t('upload.clearFinished')}
              </Button>
            ) : null}
          </div>

          <ul
            className="upload-queue"
            aria-label={t('upload.queueLabel')}
            style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            {items.map((item) => (
              <li key={item.id}>
                <QueueRow
                  item={item}
                  t={t}
                  locale={locale}
                  today={today}
                  onDateChange={(value) => handleDateChange(item, value)}
                  onPreview={() => handlePreview(item)}
                  onUpload={() => handleUploadDraft(item)}
                  onCancel={() => handleCancel(item)}
                  onRemove={() => handleRemove(item)}
                />
              </li>
            ))}
          </ul>

          {/* The buttons are on the rows; this is the one line that belongs to
              the page. Repeating it under nine of them would be nine times the
              reading and not one bit more reassuring. */}
          {drafts.length > 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {t('upload.startHint')}
            </p>
          ) : null}
        </section>
      ) : null}

      {stored.length > 0 && !unfinished ? (
        <Alert
          tone="success"
          title={t(stored.length === 1 ? 'upload.storedTitle' : 'upload.storedTitleMany', {
            count: stored.length,
          })}
          actions={
            <Button variant="primary" onClick={() => navigate('/files')}>
              {t('upload.goToFiles')}
            </Button>
          }
        >
          {t(stored.length === 1 ? 'upload.storedBody' : 'upload.storedBodyMany', {
            file: stored[0]!.file.name,
            count: stored.length,
          })}
        </Alert>
      ) : null}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h2 style={{ fontSize: 20, margin: 0 }}>{t('upload.statusHeading')}</h2>
        <StepIndicator steps={steps} label={t('upload.statusLabel')} />
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {t('upload.statusFoot')}
        </p>
      </section>

      {/* The same dialog the reports list uses, on a file that is not stored
          yet — hence a blob URL where that one has a download URL. Same act,
          same dialog: a reader should not have to learn it twice. There is no
          error branch because there is no round trip to fail; the bytes are
          already in the page. */}
      <PdfViewerModal
        open={preview !== null}
        fileName={preview?.item.file.name ?? ''}
        src={preview?.url ?? null}
        error={null}
        onClose={() => setPreview(null)}
      />

      <DuplicateDialog
        item={pending ?? null}
        t={t}
        locale={locale}
        onDecide={(decision) => answer.current?.(decision)}
      />
    </>
  );
}

function QueueRow({
  item,
  t,
  locale,
  today,
  onDateChange,
  onPreview,
  onUpload,
  onCancel,
  onRemove,
}: {
  item: QueueItem;
  t: I18nContextValue['t'];
  locale: Locale;
  /** The latest day the date field will accept — see `localToday`. */
  today: string;
  onDateChange: (value: string) => void;
  onPreview: () => void;
  onUpload: () => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const busy = IN_FLIGHT.includes(item.state);

  return (
    <div className="upload-row" data-state={item.state}>
      <div className="upload-row-head">
        <Icon name={ROW_ICON[item.state]} size={20} />
        <span style={{ flex: 1, minWidth: 0 }}>{item.file.name}</span>
        <span className="muted">
          {formatBytes(item.file.size)}
          {item.state === 'uploading' ? ` · ${item.progress}%` : ''}
        </span>

        {item.state === 'uploading' ? (
          <button
            type="button"
            onClick={onCancel}
            style={{ background: 'none', border: 0, cursor: 'pointer', padding: 4, lineHeight: 1 }}
          >
            <Icon name="x" size={16} />
            <span className="sr-only">{t('upload.cancelLabel', { file: item.file.name })}</span>
          </button>
        ) : busy ? null : (
          <button
            type="button"
            onClick={onRemove}
            style={{ background: 'none', border: 0, cursor: 'pointer', padding: 4, lineHeight: 1 }}
          >
            <Icon name="x" size={16} />
            <span className="sr-only">{t('upload.removeLabel', { file: item.file.name })}</span>
          </button>
        )}
      </div>

      {/* Asked per file, not once for the batch: three reports dropped together
          are three different days often enough that a shared date would be a
          trap, and this field exists precisely because a wrong date is
          invisible once it is stored. */}
      {item.state === 'draft' ? (
        <>
          <Field
            label={t('upload.dateLabel', { file: item.file.name })}
            hint={t('upload.dateHint')}
            error={item.dateProblem ? t(DATE_PROBLEM[item.dateProblem]) : null}
          >
            {(field) => (
              <TextInput
                {...field}
                type="date"
                required
                value={item.reportDate}
                max={today}
                style={{ maxWidth: 220 }}
                onChange={(event) => onDateChange(event.target.value)}
              />
            )}
          </Field>

          {/* Directly under the field they belong to, so the refusal the
              second one can produce lands next to the thing that has to
              change, and the first sits beside the question it answers.

              Reading order is the order of the work: look at the report, then
              send it. Both accessible names carry the file name, because a
              queue of nine rows is eighteen buttons that would otherwise share
              two labels between them; each visible label stays a prefix of its
              name so voice control still works (WCAG 2.5.3). */}
          <div className="upload-row-actions">
            <Button
              icon="file-pdf"
              onClick={onPreview}
              aria-label={t('upload.previewLabel', { file: item.file.name })}
            >
              {t('upload.preview')}
            </Button>
            <Button
              variant="primary"
              icon="upload-simple"
              onClick={onUpload}
              aria-label={t('upload.startLabel', { file: item.file.name })}
            >
              {t('upload.startOne')}
            </Button>
          </div>
        </>
      ) : null}

      {item.state === 'uploading' ? (
        <ProgressBar value={item.progress} label={t('upload.progressLabel', { file: item.file.name })} />
      ) : null}

      {/* One line per row saying where this file stands. `live` on the
          settled states rather than on every render: a queue of ten files
          announcing each percentage would be unusable with a screen reader. */}
      <p
        className={item.state === 'rejected' || item.state === 'failed' ? undefined : 'muted'}
        style={{
          margin: 0,
          fontSize: 13,
          color:
            item.state === 'rejected' || item.state === 'failed'
              ? 'var(--feedback-danger-ink)'
              : undefined,
        }}
      >
        {item.message ?? rowStatus(item, t, locale)}
      </p>
    </div>
  );
}

const ROW_ICON: Record<ItemState, string> = {
  draft: 'calendar-blank',
  checking: 'magnifying-glass',
  confirming: 'question',
  waiting: 'clock',
  uploading: 'file-pdf',
  stored: 'check-circle',
  skipped: 'prohibit',
  cancelled: 'prohibit',
  rejected: 'warning',
  failed: 'warning-circle',
};

/** Each way a declared date can be wrong, in the words the reader gets. */
const DATE_PROBLEM: Record<ReportDateProblem, MessageKey> = {
  required: 'upload.dateRequired',
  malformed: 'upload.dateMalformed',
  future: 'upload.dateFuture',
  tooOld: 'upload.dateTooOld',
};

function rowStatus(item: QueueItem, t: I18nContextValue['t'], locale: Locale): string {
  switch (item.state) {
    case 'draft':
      return t('upload.state.draft');
    case 'checking':
      return t('upload.state.checking');
    case 'confirming':
      return t('upload.state.confirming');
    case 'waiting':
      return t('upload.state.waiting');
    case 'uploading':
      return t('upload.state.uploading');
    case 'stored':
      return t('upload.state.stored');
    case 'skipped':
      return t('upload.state.skipped', {
        // Naming what it duplicates is what makes the row reviewable later,
        // when the decision is no longer fresh.
        file: item.duplicates?.[0]
          ? describeMatch(item.duplicates[0], locale)
          : '',
      });
    case 'cancelled':
      return t('upload.state.cancelled');
    default:
      return '';
  }
}

/** "quest-panel.pdf · 12 Jul 2026" — enough to recognise the other report. */
function describeMatch(match: DuplicateMatch, locale: Locale): string {
  const date = formatDate(effectiveDate(match.report), locale);
  return `${match.report.originalFileName} · ${date}`;
}

/**
 * The question the ticket specifies, with the evidence attached (spec §40.2).
 *
 * Two things it deliberately does not do. It does not offer "replace the old
 * one", because that is a merge decision this product does not make on a
 * user's health record. And it has no "do this for the rest of the batch"
 * shortcut: each file is a separate judgement, and the whole point of asking
 * is that the system does not know which answer is right.
 */
function DuplicateDialog({
  item,
  t,
  locale,
  onDecide,
}: {
  item: QueueItem | null;
  t: I18nContextValue['t'];
  locale: Locale;
  onDecide: (decision: 'upload' | 'skip') => void;
}) {
  const matches = item?.duplicates ?? [];
  const signal = strongestSignal(matches);

  return (
    <Modal
      open={item !== null}
      // Escape and the backdrop mean "not now", which for an upload the user
      // has not confirmed is the conservative reading: skip it. Nothing is
      // deleted either way, and the file is still on their computer.
      onClose={() => onDecide('skip')}
      title={t('upload.duplicateTitle')}
      actions={
        <>
          <Button variant="secondary" onClick={() => onDecide('skip')}>
            {t('upload.duplicateSkip')}
          </Button>
          <Button variant="primary" onClick={() => onDecide('upload')}>
            {t('upload.duplicateContinue')}
          </Button>
        </>
      }
    >
      <p>
        <Trans
          id="upload.duplicateBody"
          values={{ file: <strong>{item?.file.name}</strong> }}
        />
      </p>
      <p className="muted" style={{ fontSize: 13 }}>
        {t(
          signal === 'identical-file'
            ? 'upload.duplicateIdentical'
            : 'upload.duplicateSimilar',
        )}
      </p>
      <ul className="settings-facts">
        {matches.map((match) => (
          <li key={match.report.id}>
            <Icon name="file-pdf" size={15} />
            <span>
              {describeMatch(match, locale)}
              {match.report.laboratoryName ? ` · ${match.report.laboratoryName}` : ''}
            </span>
          </li>
        ))}
      </ul>
      <p style={{ marginBottom: 0 }}>{t('upload.duplicateQuestion')}</p>
    </Modal>
  );
}
