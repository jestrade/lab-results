import type { ReactNode } from 'react';

export type TagTone = 'accent' | 'accent-2' | 'neutral' | 'outline';

export function Tag({ tone = 'neutral', children }: { tone?: TagTone; children: ReactNode }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}
