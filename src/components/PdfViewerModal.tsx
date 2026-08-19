/**
 * The stored PDF, shown where the reader already is.
 *
 * Opening the original used to hand the file to a new browser tab, which is a
 * handover: the reader leaves the list, the browser decides whether to render
 * or download, and coming back is their problem. Checking a value against the
 * page it was extracted from is a glance, not a departure — so the document is
 * framed in a dialog over the list instead, and Escape puts them back.
 *
 * The frame points at the Firebase Storage download URL directly rather than
 * at a blob this app fetched: that host serves the object with
 * `Content-Disposition: inline` and no X-Frame-Options, but answers no CORS
 * preflight, so fetching the bytes here would fail where framing them works.
 * `config/csp.mjs` carries the matching frame-src entry.
 *
 * The new tab is still offered as an action. A browser with no built-in PDF
 * viewer — and mobile Safari, which renders one page in a frame and stops —
 * leaves the reader looking at a blank rectangle, and that exit has to be on
 * screen rather than in a support answer.
 */

import { Alert } from './Alert';
import { Button } from './Button';
import { Icon } from './Icon';
import { Spinner } from './Spinner';
import { Modal } from './Modal';
import { useT } from '@/i18n/useI18n';

export interface PdfViewerModalProps {
  open: boolean;
  /** Shown as the dialog's heading, and names the frame for assistive tech. */
  fileName: string;
  /** The download URL, or null while it is still being resolved. */
  src: string | null;
  /** Why the URL could not be resolved. Replaces the frame when set. */
  error: string | null;
  onClose: () => void;
}

export function PdfViewerModal({ open, fileName, src, error, onClose }: PdfViewerModalProps) {
  const t = useT();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={fileName}
      size="wide"
      actions={
        <>
          {/* A plain anchor, not a router link: this leaves the application
              for a file on another origin. */}
          {src ? (
            <a
              className="btn btn-secondary"
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('reports.openInNewTabLabel', { file: fileName })}
            >
              <Icon name="arrow-square-out" size={16} />
              {t('reports.openInNewTab')}
            </a>
          ) : null}
          <Button variant="primary" onClick={onClose}>
            {t('common.close')}
          </Button>
        </>
      }
    >
      <div className="pdf-frame">
        {error ? (
          <Alert tone="danger" live>
            {error}
          </Alert>
        ) : src ? (
          <iframe src={src} title={t('reports.pdfFrameTitle', { file: fileName })} />
        ) : (
          // Resolving the download URL is one round trip, so this is usually
          // a blink. It is here for the trip that is not.
          <div className="pdf-frame-pending">
            <Spinner label={t('reports.pdfLoading')} size={28} />
            <span aria-hidden="true">{t('reports.pdfLoading')}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
