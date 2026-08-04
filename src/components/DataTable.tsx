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

  return (
    <div className="table-scroll">
      <table className="table">
        <caption className={captionVisible ? undefined : 'sr-only'}>{caption}</caption>
        <thead>
          <tr>
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
          {sorted.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key} style={{ textAlign: column.align ?? 'left' }}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
