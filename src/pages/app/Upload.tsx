import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/Alert';
import { Button, ButtonLink } from '@/components/Button';
import { FileDropzone } from '@/components/FileDropzone';
import { Icon } from '@/components/Icon';
import { ProgressBar } from '@/components/ProgressBar';
import { StepIndicator, type Step } from '@/components/StepIndicator';
import { useToast } from '@/components/useToast';
import {
  formatBytes,
  uploadReport,
  validateFile,
  type FileRejection,
  type UploadHandle,
} from '@/services/reports';

type Phase = 'idle' | 'uploading' | 'stored' | 'failed';

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

  const [phase, setPhase] = useState<Phase>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [rejection, setRejection] = useState<FileRejection | null>(null);
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
      setFailure(
        caught instanceof Error && caught.message === 'Upload cancelled'
          ? 'Upload cancelled. Nothing was stored.'
          : 'The upload did not finish. Check your connection and try again — nothing was stored.',
      );
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
        PDF only, up to 25 MB. Your file is stored privately and processed on our servers — never
        sent directly from your browser to a third party.
      </p>

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
          disabled={!isEmailVerified}
          disabledReason="Verify your email address first."
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
