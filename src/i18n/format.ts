/**
 * Placeholder substitution for message catalogs (KAN-8).
 *
 * ── Why sentences are not assembled from fragments ────────────────────────
 *
 * The tempting shortcut for a sentence with something embedded in it —
 * "we send its text to **Google Gemini**, a third-party provider" — is to cut
 * it into a `before` string and an `after` string and put the bold bit between
 * them in JSX. That works in exactly one language. Spanish reorders clauses,
 * moves adjectives after nouns, and puts the subject somewhere English never
 * would, so a translator handed `before`/`after` is being asked to translate
 * half a sentence into a word order they cannot change.
 *
 * So a message is always one whole sentence with named holes in it:
 *
 *   'To read a report we send its text to {provider}, a third-party provider.'
 *
 * The translator moves `{provider}` wherever Spanish wants it. `format` fills
 * holes with text; `formatNodes` fills them with React elements, which is what
 * lets the bold run — or a link, or a date — sit inside a translated sentence
 * without the sentence being broken into pieces first.
 */

import type { ReactNode } from 'react';

/** `{name}` — deliberately not `{{name}}`; braces never appear in our copy. */
const PLACEHOLDER = /\{(\w+)\}/g;

export type TextValues = Record<string, string | number>;
export type NodeValues = Record<string, ReactNode>;

/**
 * Fills `{name}` holes with text.
 *
 * A hole with no matching value is left standing rather than replaced with
 * nothing. `{count}` printed on screen is a visible bug that gets reported;
 * a sentence that silently reads "You have  reports" looks like a data problem
 * and gets investigated in the wrong place.
 */
export function format(template: string, values?: TextValues): string {
  if (!values) return template;
  return template.replace(PLACEHOLDER, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/**
 * Same, for values that are React nodes.
 *
 * Returns an array of alternating text and nodes. Callers render it directly;
 * React handles the keys for the string segments, and each substituted node is
 * wrapped so it carries a stable key of its own.
 */
export function formatNodes(template: string, values: NodeValues): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;
  let occurrence = 0;

  for (const match of template.matchAll(PLACEHOLDER)) {
    const name = match[1] ?? '';
    const start = match.index;

    // An unknown name stays literal, for the same reason as in `format`.
    if (!(name in values)) continue;

    if (start > cursor) parts.push(template.slice(cursor, start));
    parts.push(values[name]);
    cursor = start + match[0].length;
    occurrence += 1;
  }

  if (cursor < template.length) parts.push(template.slice(cursor));
  return occurrence === 0 ? [template] : parts;
}
