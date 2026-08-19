/**
 * Modal dialog (KAN-39, KAN-53).
 *
 * Built on the native `<dialog>` element, which hands us the things hand-rolled
 * modals usually get wrong: the top layer, inertness of the page behind, focus
 * containment, and Escape to close. What we add is the two bits `<dialog>`
 * leaves to the author — closing on a backdrop click, and telling the caller
 * when the dialog closed by any route.
 */

import { useEffect, useRef, type ReactNode } from 'react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Buttons for the footer row. The confirming action goes last. */
  actions?: ReactNode;
  /**
   * `wide` is for content that is looked at rather than read — a page of a
   * PDF, say. The default width is set for a paragraph and a pair of buttons,
   * and a document shown at that size is a document nobody can read.
   */
  size?: 'default' | 'wide';
}

export function Modal({ open, onClose, title, children, actions, size = 'default' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // Fires for Escape and for form-method=dialog too, so the parent's state
    // never drifts out of step with what is on screen.
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={size === 'wide' ? 'dialog dialog-wide' : 'dialog'}
      aria-labelledby="modal-title"
      style={{ border: 0, padding: 'var(--space-4)', borderRadius: 'var(--r-card)' }}
      onClick={(event) => {
        // A click that lands on the dialog element itself is a click on the
        // backdrop — the content sits in child elements.
        if (event.target === ref.current) onClose();
      }}
    >
      <h2 id="modal-title" className="dialog-title">
        {title}
      </h2>
      <div className="dialog-body">{children}</div>
      {actions ? <div className="dialog-actions">{actions}</div> : null}
    </dialog>
  );
}
