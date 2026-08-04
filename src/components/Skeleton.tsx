import type { CSSProperties } from 'react';

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  style?: CSSProperties;
}

/**
 * A placeholder block for content that is still loading.
 *
 * Deliberately hidden from assistive tech: a screen reader gets the `role
 *="status"` announcement from whatever is loading, and reading out a dozen
 * empty grey rectangles would be worse than silence.
 */
export function Skeleton({ width = '100%', height = 16, radius, style }: SkeletonProps) {
  return (
    <span
      className="skeleton"
      aria-hidden="true"
      style={{ display: 'block', width, height, borderRadius: radius, ...style }}
    />
  );
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} width={index === lines - 1 ? '60%' : '100%'} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div role="status" aria-label="Loading results">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div key={rowIndex} style={{ display: 'flex', gap: 16 }}>
            {Array.from({ length: columns }, (_, columnIndex) => (
              <Skeleton key={columnIndex} height={14} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
