import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from '@/test/renderWithProviders';
import { expectNoA11yViolations } from '@/test/axe';
import { DataTable, type Column } from '../DataTable';
import { Pagination } from '../Pagination';

interface Row {
  id: string;
  name: string;
  size: number;
}

const rows: Row[] = Array.from({ length: 178 }, (_, index) => ({
  id: `r${index + 1}`,
  name: `Row ${String(index + 1).padStart(3, '0')}`,
  size: 178 - index,
}));

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', render: (row) => row.name, sortValue: (row) => row.name },
  { key: 'size', header: 'Size', render: (row) => row.size, sortValue: (row) => row.size },
];

function renderTable(page: number, onPageChange = vi.fn()) {
  const result = renderWithProviders(
    <DataTable
      caption="Rows"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      pagination={{ page, onPageChange, label: 'Row pages' }}
    />,
  );
  return { ...result, onPageChange };
}

function bodyRows() {
  return screen.getAllByRole('row').slice(1);
}

describe('Pagination', () => {
  it('says how much of the list is on screen', () => {
    renderWithProviders(
      <Pagination page={2} pageCount={8} total={178} pageSize={25} onPageChange={() => {}} label="Pages" />,
    );
    expect(screen.getByText('Showing 26–50 of 178')).toBeInTheDocument();
  });

  it('marks the current page for assistive tech, not just visually', () => {
    renderWithProviders(
      <Pagination page={3} pageCount={8} total={178} pageSize={25} onPageChange={() => {}} label="Pages" />,
    );
    expect(screen.getByRole('button', { name: 'Go to page 3' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('button', { name: 'Go to page 4' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('stops you stepping past either end', async () => {
    const onPageChange = vi.fn();
    const { rerender } = renderWithProviders(
      <Pagination page={1} pageCount={8} total={178} pageSize={25} onPageChange={onPageChange} label="Pages" />,
    );
    expect(screen.getByRole('button', { name: /Previous/ })).toBeDisabled();

    rerender(
      <Pagination page={8} pageCount={8} total={178} pageSize={25} onPageChange={onPageChange} label="Pages" />,
    );
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
  });

  it('keeps the count but drops the controls for a single page', () => {
    renderWithProviders(
      <Pagination page={1} pageCount={1} total={4} pageSize={25} onPageChange={() => {}} label="Pages" />,
    );
    // The sentence is what says "this is the whole result".
    expect(screen.getByText('Showing 1–4 of 4')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('reports an empty list without claiming a first row', () => {
    renderWithProviders(
      <Pagination page={1} pageCount={1} total={0} pageSize={25} onPageChange={() => {}} label="Pages" />,
    );
    expect(screen.getByText('Showing 0–0 of 0')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(
      <Pagination page={4} pageCount={20} total={500} pageSize={25} onPageChange={() => {}} label="Pages" />,
    );
    await expectNoA11yViolations(container);
  });
});

describe('DataTable with pagination', () => {
  it('renders one page of rows rather than the whole list', () => {
    renderTable(1);
    expect(bodyRows()).toHaveLength(25);
    expect(screen.getByText('Row 001')).toBeInTheDocument();
    expect(screen.queryByText('Row 026')).not.toBeInTheDocument();
  });

  it('shows the rows belonging to the page it is given', () => {
    renderTable(2);
    expect(screen.getByText('Row 026')).toBeInTheDocument();
    expect(screen.queryByText('Row 001')).not.toBeInTheDocument();
  });

  it('hands the page change back to the caller', async () => {
    const user = userEvent.setup();
    const { onPageChange } = renderTable(1);

    await user.click(screen.getByRole('button', { name: 'Go to page 3' }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    await user.click(screen.getByRole('button', { name: /Next/ }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('sorts the whole list before cutting the page, not the page in isolation', async () => {
    // The bug this guards: slicing before sorting turns every column header
    // into "sort these twenty-five", which looks right and is wrong from page
    // two onwards.
    const user = userEvent.setup();
    renderTable(1);

    await user.click(screen.getByRole('button', { name: /Size/ }));

    // Size counts down as the name counts up, so ascending size must put the
    // LAST row of the whole list first — a row that was not on this page.
    const first = within(bodyRows()[0]!).getByText('Row 178');
    expect(first).toBeInTheDocument();
  });

  it('does not draw a control when everything fits on one page', () => {
    renderWithProviders(
      <DataTable
        caption="Rows"
        columns={columns}
        rows={rows.slice(0, 4)}
        rowKey={(row) => row.id}
        pagination={{ page: 1, onPageChange: () => {}, label: 'Row pages' }}
      />,
    );
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(bodyRows()).toHaveLength(4);
  });

  it('falls back to the last page rather than rendering blank', () => {
    // A filter applied while deep in the list leaves the page out of range.
    renderTable(99);
    expect(bodyRows()).toHaveLength(3);
    expect(screen.getByText('Row 178')).toBeInTheDocument();
  });

  it('renders every row when no pagination is asked for', () => {
    renderWithProviders(
      <DataTable caption="Rows" columns={columns} rows={rows} rowKey={(row) => row.id} />,
    );
    expect(bodyRows()).toHaveLength(178);
  });

  it('selects only what the reader can see', async () => {
    // Ticking the header box on page two must not silently select 178 rows.
    const user = userEvent.setup();
    const onToggleAll = vi.fn();
    renderWithProviders(
      <DataTable
        caption="Rows"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        pagination={{ page: 2, onPageChange: () => {}, label: 'Row pages' }}
        selection={{
          selected: new Set<string>(),
          onToggle: () => {},
          onToggleAll,
          rowLabel: (row) => row.name,
          allLabel: 'Select all',
        }}
      />,
    );

    await user.click(screen.getByLabelText('Select all'));

    const [keys] = onToggleAll.mock.calls[0] as [string[], boolean];
    expect(keys).toHaveLength(25);
    expect(keys[0]).toBe('r26');
  });
});
