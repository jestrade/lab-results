/**
 * Sortable data table (KAN-39, KAN-43).
 *
 * Sorting is exposed as a `<button>` inside the `<th>` with `aria-sort` on the
 * header cell — the pattern assistive tech actually understands, rather than a
 * click handler on the cell with a caret glyph. The table keeps its semantics:
 * real `<table>`, real `<caption>`, real headers.
 */

import { useMemo, useState, type ReactNode } from 'react';

import { Icon } from './Icon';

export interface Column<Row> {
  key: string;
  header: ReactNode;
  render: (row: Row) => ReactNode;
  /** Supply to make the column sortable. */
  sortValue?: (row: Row) => string | number;
  align?: 'left' | 'right';
  width?: string;
}

/**
 * Row selection, when the caller wants it (KAN-43).
 *
 * The selected set is owned by the caller rather than held here. What is
 * selected outlives a sort and has to survive the rows themselves changing —
 * this table is fed by a live subscription — and it is the caller that has to
 * act on the selection, so it is the caller that should hold it.
 */
export interface Selection<Row> {
  selected: ReadonlySet<string>;
  onToggle: (key: string, selected: boolean) => void;
  /** Called with every key currently rendered, so "all" means "all of these". */
  onToggleAll: (keys: string[], selected: boolean) => void;
  /** Accessible name for a row's checkbox. Every one names its own row. */
  rowLabel: (row: Row) => string;
  /** Accessible name for the header checkbox. */
  allLabel: string;
}

export interface DataTableProps<Row> {
  /** Describes the table for screen readers. Required — tables need a name. */
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Shown in place of the body when `rows` is empty. */
  empty?: ReactNode;
  initialSort?: { key: string; direction: SortDirection };
  captionVisible?: boolean;
  /** Omit for a table whose rows are not selectable. */
  selection?: Selection<Row>;
}

export type SortDirection = 'ascending' | 'descending';

export function DataTable<Row>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
  initialSort,
  captionVisible = false,
  selection,
}: DataTableProps<Row>) {
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(
    initialSort ?? null,
  );

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((candidate) => candidate.key === sort.key);
    if (!column?.sortValue) return rows;
    const factor = sort.direction === 'ascending' ? 1 : -1;
    // Copy before sorting: `rows` belongs to the caller.
    return [...rows].sort((left, right) => {
      const a = column.sortValue!(left);
      const b = column.sortValue!(right);
      if (a === b) return 0;
      return (a < b ? -1 : 1) * factor;
    });
  }, [rows, columns, sort]);

  function toggleSort(key: string) {
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' }
        : { key, direction: 'ascending' },
    );
  }

  if (rows.length === 0 && empty) return <>{empty}</>;

  const keys = sorted.map(rowKey);
  const selectedHere = keys.filter((key) => selection?.selected.has(key));
  const allSelected = keys.length > 0 && selectedHere.length === keys.length;

  return (
    <div className="table-scroll">
      <table className="table">
        <caption className={captionVisible ? undefined : 'sr-only'}>{caption}</caption>
        <thead>
          <tr>
            {selection ? (
              <th scope="col" style={{ width: 44 }}>
                <input
                  type="checkbox"
                  className="table-select"
                  checked={allSelected}
                  // Partly-selected is a third state, and the box has to show
                  // it: a plain unchecked box next to four ticked rows reads as
                  // "nothing is selected".
                  ref={(node) => {
                    if (node) {
                      node.indeterminate = selectedHere.length > 0 && !allSelected;
                    }
                  }}
                  onChange={(event) => selection.onToggleAll(keys, event.target.checked)}
                  aria-label={selection.allLabel}
                />
              </th>
            ) : null}
            {columns.map((column) => {
              const active = sort?.key === column.key;
              return (
                <th
                  key={column.key}
                  scope="col"
                  style={{ textAlign: column.align ?? 'left', width: column.width }}
                  aria-sort={active ? sort.direction : column.sortValue ? 'none' : undefined}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      style={{
                        background: 'none',
                        border: 0,
                        padding: 0,
                        font: 'inherit',
                        color: 'inherit',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {column.header}
                      <Icon
                        name={
                          active
                            ? sort.direction === 'ascending'
                              ? 'caret-up'
                              : 'caret-down'
                            : 'caret-up-down'
                        }
                        size={12}
                      />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const key = rowKey(row);
            const isSelected = selection?.selected.has(key) ?? false;
            return (
              <tr key={key} data-selected={isSelected || undefined}>
                {selection ? (
                  <td>
                    <input
                      type="checkbox"
                      className="table-select"
                      checked={isSelected}
                      onChange={(event) => selection.onToggle(key, event.target.checked)}
                      aria-label={selection.rowLabel(row)}
                    />
                  </td>
                ) : null}
                {columns.map((column) => (
                  <td key={column.key} style={{ textAlign: column.align ?? 'left' }}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
