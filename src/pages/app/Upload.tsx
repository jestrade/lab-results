import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/Alert';
import { Button, ButtonLink } from '@/components/Button';
import { FileDropzone } from '@/components/FileDropzone';
import { Icon } from '@/components/Icon';
import { ProgressBar } from '@/components/ProgressBar';
import { StepIndicator, type Step } from '@/components/StepIndicator';
import { QuotaMeter } from '@/components/QuotaMeter';
import { useToast } from '@/components/useToast';
import { useStorageQuota } from '@/hooks/useStorageQuota';
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

    const problem = validateFile(selected);
    if (problem) {
      setRejection(problem);
      return;
    }

    // Capacity pre-flight (spec §79). `storage.rules` makes the same decision
    // and is the one that binds; running it here first means the user gets a
    // specific, actionable sentence instantly rather than an opaque permission
    // error after waiting for a 25 MB transfer to fail.
    const overQuota = checkUploadAllowed({
      fileSize: selected.size,
      usage: quota.usage,
      systemStorageBytes: quota.system?.storageBytes ?? 0,
      uploadsDisabled: quota.uploadsDisabled,
    });
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
      push('Report uploaded. Processing starts automatically.', 'success');
    } catch (caught) {
      // A cancel rejects the same promise; don't dress that up as a failure.
      if (handleRef.current !== handle) return;
      setPhase('failed');
      // Mapped rather than assumed. A 403 once surfaced as "check your
      // connection", which sent everyone looking in the wrong place.
      setFailure(toStorageErrorMessage(caught).message);
    }
  }

  function handleCancel() {
    handleRef.current?.cancel();
    handleRef.current = null;
    reset();
    push('Upload cancelled.', 'info');
  }

  const steps: Step[] = [
    {
      label: 'Uploaded',
      state: phase === 'stored' ? 'complete' : phase === 'uploading' ? 'current' : 'pending',
      detail:
        phase === 'stored' && file
          ? `${formatBytes(file.size)} stored`
          : phase === 'uploading'
            ? `${progress}% transferred`
            : 'Choose a PDF to begin',
    },
    {
      label: 'Queued',
      state: phase === 'stored' ? 'current' : 'pending',
      detail: phase === 'stored' ? 'Waiting for a processing slot' : undefined,
    },
    { label: 'Processing', state: 'pending', detail: 'Extracting results' },
    { label: 'Processed', state: 'pending', detail: 'Results and explanations ready' },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Step one</div>
          <h1>Upload a report</h1>
        </div>
      </div>

      <p className="muted" style={{ margin: 0, fontSize: 15, maxWidth: 620 }}>
        PDF only, up to {formatBytes(MAX_FILE_BYTES)} per report, within your{' '}
        {formatBytes(quota.storage.limitBytes)} allowance. Your file is stored privately and
        processed on our servers — never sent directly from your browser to a third party.
      </p>

      <section
        style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
        aria-label="Your storage allowance"
      >
        <QuotaMeter label="Storage used" state={quota.storage} />
        <QuotaMeter
          label="Uploads this month"
          state={{
            usedBytes: quota.uploads.used,
            limitBytes: quota.uploads.limit,
            remainingBytes: quota.uploads.remaining,
            fraction: quota.uploads.limit === 0 ? 1 : quota.uploads.used / quota.uploads.limit,
            isWarning: quota.uploads.remaining <= quota.uploads.limit * 0.2,
            isFull: quota.uploads.remaining <= 0,
          }}
          detail={`${quota.uploads.used} of ${PER_USER_UPLOADS_PER_MONTH} used · resets on the 1st`}
        />
      </section>

      {quota.uploadsDisabled ? (
        <Alert tone="warning" title="Uploads are paused">
          The service is at capacity, so new reports cannot be accepted right now. Your existing
          reports and results are unaffected.
        </Alert>
      ) : null}

      {quota.storage.isFull ? (
        <Alert tone="danger" title="Your storage is full">
          Delete a report you no longer need to free space. You are using{' '}
          {formatBytes(quota.storage.usedBytes)} of {formatBytes(quota.storage.limitBytes)}.
        </Alert>
      ) : quota.storage.isWarning ? (
        <Alert tone="warning" title="You are running low on space">
          {formatBytes(quota.storage.remainingBytes)} left of{' '}
          {formatBytes(quota.storage.limitBytes)}. Deleting reports you no longer need will free
          space.
        </Alert>
      ) : null}

      {!isEmailVerified ? (
        <Alert
          tone="warning"
          title="Verify your email before uploading"
          actions={<ButtonLink to="/verify-email">Verify my email</ButtonLink>}
        >
          Uploading a report needs a verified address. We sent a link when you created your account.
        </Alert>
      ) : null}

      {rejection ? (
        <Alert tone="danger" live title="That file was not accepted">
          {rejection.message}
        </Alert>
      ) : null}

      {failure ? (
        <Alert tone="danger" live title="Upload failed">
          {failure}
        </Alert>
      ) : null}

      {phase === 'idle' || phase === 'failed' ? (
        <FileDropzone
          onFileSelected={handleFileSelected}
          disabled={
            !isEmailVerified ||
            quota.uploadsDisabled ||
            quota.storage.isFull ||
            quota.uploads.remaining <= 0
          }
          disabledReason={
            !isEmailVerified
              ? 'Verify your email address first.'
              : quota.uploadsDisabled
                ? 'The service is at capacity. Please try again later.'
                : quota.storage.isFull
                  ? 'Your storage is full. Delete a report to free space.'
                  : 'You have used all your uploads for this month.'
          }
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
              <span className="sr-only">Cancel upload of {file.name}</span>
            </button>
          </div>
          <ProgressBar value={progress} label={`Uploading ${file.name}`} />
        </div>
      ) : null}

      {phase === 'stored' && file ? (
        <Alert
          tone="success"
          title="Report stored"
          actions={
            <>
              <Button variant="secondary" onClick={reset}>
                Upload another
              </Button>
              <Button variant="primary" onClick={() => navigate('/reports')}>
                Go to reports
              </Button>
            </>
          }
        >
          {file.name} was uploaded successfully. You can leave this page — processing continues and
          your report appears under Reports when it finishes.
        </Alert>
      ) : null}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h2 style={{ fontSize: 20, margin: 0 }}>Processing status</h2>
        <StepIndicator steps={steps} label="Report processing progress" />
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          You can leave this page — processing continues and your report appears under Reports when
          it finishes.
        </p>
      </section>
    </>
  );
}
