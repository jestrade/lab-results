/**
 * PDF dropzone (KAN-3, KAN-42).
 *
 * The control is a `<button>` wrapping a visually hidden `<input type="file">`.
 * That combination is what makes drag-and-drop and keyboard use the same
 * control: dragging is a pure enhancement layered on a button that opens the
 * file picker on Enter or Space, so a keyboard-only user is never locked out of
 * the primary action on the page.
 *
 * Drag state is tracked with a counter rather than a boolean. `dragleave` fires
 * every time the pointer crosses into a child element, so a boolean flickers
 * off the moment the user drags over the icon in the middle of the zone.
 */

import { useCallback, useRef, useState, type DragEvent } from 'react';

import type { MessageKey } from '@/i18n/messages';
import { useT } from '@/i18n/useI18n';
import { Icon } from './Icon';

export interface FileDropzoneProps {
  /**
   * Called with everything the user dropped or picked, in the order they gave
   * it. Always an array, even for one file: the page queues uploads, and a
   * single-file callback would make "one" a special case for no benefit.
   */
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  /** Explains why the zone is disabled — shown instead of the usual prompt. */
  disabledReason?: string;
  accept?: string;
  /** Prompt shown in the zone. Defaults to the single-file wording. */
  promptKey?: MessageKey;
  hintKey?: MessageKey;
}

export function FileDropzone({
  onFilesSelected,
  disabled = false,
  disabledReason,
  accept = 'application/pdf,.pdf',
  promptKey = 'dropzone.prompt',
  hintKey = 'dropzone.hint',
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const t = useT();

  const reset = useCallback(() => {
    dragDepth.current = 0;
    setDragging(false);
  }, []);

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    if (disabled) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (disabled) return;
    // Without this the browser navigates to the dropped file instead of
    // handing it to us.
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (disabled) return;
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) reset();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (disabled) return;
    event.preventDefault();
    reset();
    // Everything that was dropped, in the order the browser reports it.
    // Validation of what each one is happens upstream, per file, so a folder
    // of PDFs with one stray image queues the PDFs and explains the image
    // rather than refusing the whole drop.
    const files = [...(event.dataTransfer.files ?? [])];
    if (files.length > 0) onFilesSelected(files);
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <button
        type="button"
        className="dropzone"
        data-dragging={dragging}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {dragging ? (
          <>
            <Icon name="download-simple" size={56} />
            <span className="dropzone-title">{t('dropzone.release')}</span>
          </>
        ) : (
          <>
            <Icon name="file-pdf" size={56} />
            <span className="dropzone-title">
              {t(disabled ? 'dropzone.unavailable' : promptKey)}
            </span>
            <span className="muted" style={{ fontSize: 13 }}>
              {disabled ? disabledReason : t(hintKey)}
            </span>
          </>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          if (files.length > 0) onFilesSelected(files);
          // Clear the value so choosing the same file twice in a row still
          // fires a change event.
          event.target.value = '';
        }}
      />
    </div>
  );
}
