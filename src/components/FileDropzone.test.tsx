import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/react';

import { expectNoA11yViolations } from '@/test/axe';
import { renderWithProviders } from '@/test/renderWithProviders';
import { FileDropzone } from './FileDropzone';

function pdf(name = 'panel.pdf'): File {
  return new File(['%PDF-1.4'], name, { type: 'application/pdf' });
}

function dropEvent(files: File[]) {
  return {
    dataTransfer: {
      files,
      items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
      types: ['Files'],
    },
  };
}

describe('FileDropzone', () => {
  it('opens the file picker when activated from the keyboard', async () => {
    const onFilesSelected = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithProviders(<FileDropzone onFilesSelected={onFilesSelected} />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});

    await user.tab();
    expect(screen.getByRole('button')).toHaveFocus();
    await user.keyboard('{Enter}');

    // Drag-and-drop is an enhancement; the keyboard path must reach the same
    // control, which is what makes the page usable without a mouse.
    expect(click).toHaveBeenCalled();
  });

  it('hands over a dropped file', () => {
    const onFilesSelected = vi.fn();
    const { container } = renderWithProviders(<FileDropzone onFilesSelected={onFilesSelected} />);
    const zone = container.firstElementChild as HTMLElement;

    fireEvent.drop(zone, dropEvent([pdf()]));

    expect(onFilesSelected).toHaveBeenCalledWith([expect.objectContaining({ name: 'panel.pdf' })]);
  });

  it('hands over every file when several are dropped', () => {
    const onFilesSelected = vi.fn();
    const { container } = renderWithProviders(<FileDropzone onFilesSelected={onFilesSelected} />);
    const zone = container.firstElementChild as HTMLElement;

    fireEvent.drop(zone, dropEvent([pdf('first.pdf'), pdf('second.pdf')]));

    // Dropping four months of reports at once is the normal case, not an
    // accident to be trimmed down to one.
    expect(onFilesSelected).toHaveBeenCalledTimes(1);
    expect(onFilesSelected).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'first.pdf' }),
      expect.objectContaining({ name: 'second.pdf' }),
    ]);
  });

  it('lets the picker take more than one file', () => {
    const { container } = renderWithProviders(<FileDropzone onFilesSelected={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.multiple).toBe(true);
  });

  it('stays in the drag-over state while the pointer crosses child elements', () => {
    const { container } = renderWithProviders(<FileDropzone onFilesSelected={vi.fn()} />);
    const zone = container.firstElementChild as HTMLElement;
    const button = screen.getByRole('button');

    // The counter exists for exactly this: entering a child fires dragleave on
    // the parent, and a naive boolean would flicker the highlight off.
    fireEvent.dragEnter(zone, dropEvent([pdf()]));
    fireEvent.dragEnter(zone, dropEvent([pdf()]));
    fireEvent.dragLeave(zone, dropEvent([pdf()]));

    expect(button).toHaveAttribute('data-dragging', 'true');

    fireEvent.dragLeave(zone, dropEvent([pdf()]));
    expect(button).toHaveAttribute('data-dragging', 'false');
  });

  it('ignores a drop while disabled', () => {
    const onFilesSelected = vi.fn();
    const { container } = renderWithProviders(
      <FileDropzone onFilesSelected={onFilesSelected} disabled disabledReason="Verify first." />,
    );
    fireEvent.drop(container.firstElementChild as HTMLElement, dropEvent([pdf()]));
    expect(onFilesSelected).not.toHaveBeenCalled();
  });

  it('explains why it is disabled', () => {
    renderWithProviders(
      <FileDropzone onFilesSelected={vi.fn()} disabled disabledReason="Verify your email address first." />,
    );
    expect(screen.getByText('Verify your email address first.')).toBeInTheDocument();
  });

  it('has no serious accessibility violations', async () => {
    const { container } = renderWithProviders(<FileDropzone onFilesSelected={vi.fn()} />);
    await expectNoA11yViolations(container);
  });
});
