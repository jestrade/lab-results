import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/Alert';
import { Button, ButtonLink } from '@/components/Button';
import { FileDropzone } from '@/components/FileDropzone';
import { Icon } from '@/components/Icon';
import { ProgressBar } from '@/components/ProgressBar';
import { StepIndicator, type Step } from '@/components/StepIndicator';
import { QuotaMeter } from '@/components/QuotaMeter';
import { useToast } from '@/components/useToast';
import { useAiConsent } from '@/hooks/useAiConsent';
import { useStorageQuota } from '@/hooks/useStorageQuota';
import { Trans } from '@/i18n/Trans';
import { useI18n } from '@/i18n/useI18n';
import {
  checkUploadAllowed,
  formatBytes,
  MAX_FILE_BYTES,
  PER_USER_UPLOADS_PER_MONTH,
  type QuotaRejection,
} from '@/domain/quotas';
import {
  uploadReport,
  validateFile,
  type FileRejection,
  type UploadHandle,
} from '@/services/reports';
import { toStorageErrorMessage } from '@/services/storageErrors';

type Phase = 'idle' | 'uploading' | 'stored' | 'failed';

/** A refusal to start, whether the file itself or the capacity is the problem.
 *  Both shapes carry a ready-to-display sentence, which is all this page needs. */
type Refusal = FileRejection | QuotaRejection;

/**
 * Upload a report (KAN-3, KAN-42).
 *
 * The page owns one upload at a time. That is a deliberate limit rather than a
 * missing feature: a queue of concurrent uploads would need its own progress
 * model and its own cancel semantics, and the step indicator below is about the
 * *processing* of one report, which is what the user is actually waiting on.
 */
export function Upload() {
  const { user, isEmailVerified } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const quota = useStorageQuota();
  const consent = useAiConsent();
  const { t, locale } = useI18n();

  const [phase, setPhase] = useState<Phase>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [rejection, setRejection] = useState<Refusal | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const handleRef = useRef<UploadHandle | null>(null);

  function reset() {
    handleRef.current = null;
    setFile(null);
    setProgress(0);
    setPhase('idle');
  }

  async function handleFileSelected(selected: File) {
    setRejection(null);
    setFailure(null);

    const problem = validateFile(selected, locale);
    if (problem) {
      setRejection(problem);
      return;
    }

    // Capacity pre-flight (spec §79). `storage.rules` makes the same decision
    // and is the one that binds; running it here first means the user gets a
    // specific, actionable sentence instantly rather than an opaque permission
    // error after waiting for a 25 MB transfer to fail.
    const overQuota = checkUploadAllowed(
      {
        fileSize: selected.size,
        usage: quota.usage,
        systemStorageBytes: quota.system?.storageBytes ?? 0,
        uploadsDisabled: quota.uploadsDisabled,
      },
      locale,
    );
    if (overQuota) {
      setRejection(overQuota);
      return;
    }

    if (!user) return;

    setFile(selected);
    setProgress(0);
    setPhase('uploading');

    const handle = uploadReport({
      file: selected,
      ownerId: user.uid,
      onProgress: setProgress,
    });
    handleRef.current = handle;

    try {
      await handle.done;
      setPhase('stored');
      push(t('upload.uploaded'), 'success');
    } catch (caught) {
      // A cancel rejects the same promise; don't dress that up as a failure.
      if (handleRef.current !== handle) return;
      setPhase('failed');
      // Mapped rather than assumed. A 403 once surfaced as "check your
      // connection", which sent everyone looking in the wrong place.
      setFailure(toStorageErrorMessage(caught, locale).message);
    }
  }

  function handleCancel() {
    handleRef.current?.cancel();
    handleRef.current = null;
    reset();
    push(t('upload.cancelled'), 'info');
  }

  // The step labels reuse the report-status wording, so the stage named here
  // is the same word the reports list shows for that stage.
  const steps: Step[] = [
    {
      label: t('status.report.uploaded'),
      state: phase === 'stored' ? 'complete' : phase === 'uploading' ? 'current' : 'pending',
      detail:
        phase === 'stored' && file
          ? t('upload.step.stored', { size: formatBytes(file.size) })
          : phase === 'uploading'
            ? t('upload.step.transferred', { percent: progress })
            : t('upload.step.chooseFile'),
    },
    {
      label: t('status.report.queued'),
      state: phase === 'stored' ? 'current' : 'pending',
      detail: phase === 'stored' ? t('upload.step.waitingSlot') : undefined,
    },
    { label: t('status.report.processing'), state: 'pending', detail: t('upload.step.extracting') },
    { label: t('status.report.processed'), state: 'pending', detail: t('upload.step.ready') },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">{t('upload.kicker')}</div>
          <h1>{t('dashboard.uploadReport')}</h1>
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

      {rejection ? (
        <Alert tone="danger" live title={t('upload.rejectedTitle')}>
          {rejection.message}
        </Alert>
      ) : null}

      {failure ? (
        <Alert tone="danger" live title={t('upload.failedTitle')}>
          {failure}
        </Alert>
      ) : null}

      {phase === 'idle' || phase === 'failed' ? (
        <FileDropzone
          onFileSelected={handleFileSelected}
          disabled={
            !isEmailVerified ||
            !consent.granted ||
            quota.uploadsDisabled ||
            quota.storage.isFull ||
            quota.uploads.remaining <= 0
          }
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
      ) : null}

      {phase === 'uploading' && file ? (
        <div className="upload-row">
          <div className="upload-row-head">
            <Icon name="file-pdf" size={20} />
            <span style={{ flex: 1 }}>{file.name}</span>
            <span className="muted">
              {formatBytes(file.size)} · {progress}%
            </span>
            <button
              type="button"
              onClick={handleCancel}
              style={{ background: 'none', border: 0, cursor: 'pointer', padding: 4, lineHeight: 1 }}
            >
              <Icon name="x" size={16} />
              <span className="sr-only">
                {t('upload.cancelLabel', { file: file.name })}
              </span>
            </button>
          </div>
          <ProgressBar value={progress} label={t('upload.progressLabel', { file: file.name })} />
        </div>
      ) : null}

      {phase === 'stored' && file ? (
        <Alert
          tone="success"
          title={t('upload.storedTitle')}
          actions={
            <>
              <Button variant="secondary" onClick={reset}>
                {t('upload.another')}
              </Button>
              <Button variant="primary" onClick={() => navigate('/reports')}>
                {t('upload.goToReports')}
              </Button>
            </>
          }
        >
          {t('upload.storedBody', { file: file.name })}
        </Alert>
      ) : null}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h2 style={{ fontSize: 20, margin: 0 }}>{t('upload.statusHeading')}</h2>
        <StepIndicator steps={steps} label={t('upload.statusLabel')} />
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {t('upload.statusFoot')}
        </p>
      </section>
    </>
  );
}
