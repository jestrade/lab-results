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

import { useT } from '@/i18n/useI18n';
import { Icon } from './Icon';

export interface FileDropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  /** Explains why the zone is disabled — shown instead of the usual prompt. */
  disabledReason?: string;
  accept?: string;
}

export function FileDropzone({
  onFileSelected,
  disabled = false,
  disabledReason,
  accept = 'application/pdf,.pdf',
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
    // Only the first file: one report per upload, so silently taking a second
    // one would be a surprise. Validation of what it is happens upstream.
    const file = event.dataTransfer.files?.[0];
    if (file) onFileSelected(file);
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
              {t(disabled ? 'dropzone.unavailable' : 'dropzone.prompt')}
            </span>
            <span className="muted" style={{ fontSize: 13 }}>
              {disabled ? disabledReason : t('dropzone.hint')}
            </span>
          </>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFileSelected(file);
          // Clear the value so choosing the same file twice in a row still
          // fires a change event.
          event.target.value = '';
        }}
      />
    </div>
  );
}
