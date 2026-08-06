import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/Alert';
import { Button, ButtonLink } from '@/components/Button';
import { FileDropzone } from '@/components/FileDropzone';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { ProgressBar } from '@/components/ProgressBar';
import { StepIndicator, type Step } from '@/components/StepIndicator';
import { QuotaMeter } from '@/components/QuotaMeter';
import { useToast } from '@/components/useToast';
import { useAiConsent } from '@/hooks/useAiConsent';
import { useStorageQuota } from '@/hooks/useStorageQuota';
import { Trans } from '@/i18n/Trans';
import { useI18n } from '@/i18n/useI18n';
import type { I18nContextValue } from '@/i18n/I18nContext';
import type { Locale } from '@/domain/locales';
import { findDuplicates, strongestSignal, type DuplicateMatch } from '@/domain/duplicates';
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

      patch(item.id, { state: 'uploading', progress: 0 });
      const handle = uploadReport({
        file: item.file,
        ownerId: user.uid,
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
    let projectedBytes = quota.usage?.storageBytes ?? 0;
    let projectedUploads = uploadsUsedThisMonth(quota.usage);

    const queued: QueueItem[] = selected.map((file) => {
      const id = crypto.randomUUID();

      const problem = validateFile(file, locale);
      if (problem) return { id, file, state: 'rejected', progress: 0, message: problem.message };

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
      if (overQuota) return { id, file, state: 'rejected', progress: 0, message: overQuota.message };

      projectedBytes += file.size;
      projectedUploads += 1;
      return { id, file, state: 'waiting', progress: 0 };
    });

    itemsRef.current = [...itemsRef.current, ...queued];
    publish();
    void pump();
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
    // Only the finished ones: clearing a file mid-transfer would leave an
    // upload running with nothing on screen to cancel it with.
    itemsRef.current = itemsRef.current.filter((item) => IN_FLIGHT.includes(item.state));
    publish();
  }

  const pending = items.find((item) => item.state === 'confirming');
  const stored = items.filter((item) => item.state === 'stored');
  const busy = items.some((item) => IN_FLIGHT.includes(item.state));
  const settled = items.filter((item) => !IN_FLIGHT.includes(item.state));

  // The step indicator describes what happens to a report after it lands, and
  // now covers the batch: the first step is complete once everything that is
  // going to arrive has arrived.
  const steps: Step[] = [
    {
      label: t('status.report.uploaded'),
      state: stored.length > 0 && !busy ? 'complete' : busy ? 'current' : 'pending',
      detail:
        stored.length > 0 && !busy
          ? t('upload.step.stored', {
              size: formatBytes(stored.reduce((sum, item) => sum + item.file.size, 0)),
            })
          : busy
            ? t('upload.step.transferring', { count: items.filter((i) => IN_FLIGHT.includes(i.state)).length })
            : t('upload.step.chooseFile'),
    },
    {
      label: t('status.report.queued'),
      state: stored.length > 0 && !busy ? 'current' : 'pending',
      detail: stored.length > 0 && !busy ? t('upload.step.waitingSlot') : undefined,
    },
    { label: t('status.report.processing'), state: 'pending', detail: t('upload.step.extracting') },
    { label: t('status.report.processed'), state: 'pending', detail: t('upload.step.ready') },
  ];

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
                  onCancel={() => handleCancel(item)}
                  onRemove={() => handleRemove(item)}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {stored.length > 0 && !busy ? (
        <Alert
          tone="success"
          title={t(stored.length === 1 ? 'upload.storedTitle' : 'upload.storedTitleMany', {
            count: stored.length,
          })}
          actions={
            <Button variant="primary" onClick={() => navigate('/reports')}>
              {t('upload.goToReports')}
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
  onCancel,
  onRemove,
}: {
  item: QueueItem;
  t: I18nContextValue['t'];
  locale: Locale;
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

function rowStatus(item: QueueItem, t: I18nContextValue['t'], locale: Locale): string {
  switch (item.state) {
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
