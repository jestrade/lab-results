/**
 * Identifier redaction before any third-party AI call (spec §54, §64).
 *
 * The product makes two promises that this file has to keep. The landing page
 * says "Identifiers redacted before AI". The registration consent says report
 * contents are "processed by a third-party AI provider to extract and explain
 * results" — processed, not published, and not attached to a name.
 *
 * On top of that, the Gemini **free tier's terms allow Google to use submitted
 * content to improve their products**. Whatever that means in practice, it
 * makes redaction non-optional here rather than merely good hygiene.
 *
 * ── What this can and cannot do ──────────────────────────────────────────
 *
 * Structured identifiers — email addresses, phone numbers, long digit runs
 * (record numbers, national IDs, insurance numbers), URLs, dates of birth —
 * have shapes, and shapes can be matched reliably. Those are handled.
 *
 * **Personal names are not reliably removable with regular expressions.** A
 * name is just a capitalised word, and so is a laboratory, a city, a test and
 * a unit. Attempting it with patterns would either miss most names or shred
 * the clinical text the model needs to read. Removing names properly needs
 * named-entity recognition over the extracted text, which belongs with the
 * extraction pipeline (KAN-6 / KAN-54) where the document structure is known —
 * a patient name usually sits in a header field, not loose in prose.
 *
 * This function is therefore a **floor, not a guarantee**, and it is documented
 * as such in `docs/ai.md` and in the AI Processing Disclosure that KAN-22 owes.
 * Do not describe it to users as anonymisation.
 */

export interface RedactionResult {
  text: string;
  /** Count per category, for logging how much was removed — never what. */
  counts: Record<RedactionCategory, number>;
}

export type RedactionCategory =
  | 'email'
  | 'phone'
  | 'longNumber'
  | 'url'
  | 'date'
  | 'postcode';

interface Rule {
  category: RedactionCategory;
  pattern: RegExp;
  placeholder: string;
  /**
   * Minimum digits required for a match to count. This is what separates a
   * phone number or a record number from an integer reference range like
   * `70-100` or `130-170`, which have the same punctuation and cannot be told
   * apart by shape alone. Counting digits can; ranges are short, identifiers
   * are not.
   */
  minDigits?: number;
}

/**
 * Measurements, masked out before redaction runs and restored afterwards.
 *
 * This exists because of a bug these rules had on first write: the date
 * pattern matched `13.0-17.0` — a haemoglobin reference range — and turned it
 * into `[DATE].0`. Silently destroying the reference range would have been far
 * worse than leaking a date, because classification depends on it and the
 * damage would have surfaced as inexplicably wrong results much later.
 *
 * Only *decimal* forms are masked here, because a decimal point is a reliable
 * signal of a measurement. Integer reference ranges (`70-100`, `130-170`) are
 * shaped exactly like short identifiers and cannot be masked safely, so they
 * are protected the other way round: the identifier rules carry a `minDigits`
 * floor, and ranges are always shorter than the things that floor admits.
 */
const MEASUREMENT_PATTERNS: RegExp[] = [
  // Decimal ranges: 13.0-17.0, 3.5 - 5.1
  /\b\d{1,4}\.\d+\s*[-–]\s*\d{1,4}\.\d+\b/g,
  // Standalone decimals: 14.2, 6.3
  /\b\d{1,4}\.\d+\b/g,
];

// Plain ASCII sentinels, deliberately improbable. `@@` cannot start an email
// match (the pattern needs word characters before the `@`), no other rule can
// match it, and unlike a whitespace-delimited marker it restores exactly.
// Printable on purpose: control characters would travel to the provider if a
// restore were ever missed.
const PROTECT_PREFIX = '@@M';
const PROTECT_SUFFIX = '@@';

function protectMeasurements(input: string): { text: string; restore: (s: string) => string } {
  const held: string[] = [];
  let text = input;

  for (const pattern of MEASUREMENT_PATTERNS) {
    text = text.replace(pattern, (match) => {
      held.push(match);
      return `${PROTECT_PREFIX}${held.length - 1}${PROTECT_SUFFIX}`;
    });
  }

  return {
    text,
    restore: (value) =>
      value.replace(
        new RegExp(`${PROTECT_PREFIX}(\\d+)${PROTECT_SUFFIX}`, 'g'),
        (_, index: string) => held[Number(index)] ?? '',
      ),
  };
}

/**
 * Order still matters among these. Emails and URLs run before the numeric
 * rules, or the digits inside them get replaced first and the remaining
 * fragment stops matching.
 */
const RULES: Rule[] = [
  {
    category: 'email',
    pattern: /[\w.+-]+@[\w-]+\.[\w.]{2,}/g,
    placeholder: '[EMAIL]',
  },
  {
    category: 'url',
    pattern: /\bhttps?:\/\/\S+/gi,
    placeholder: '[URL]',
  },
  {
    // International and grouped forms: +44 20 7946 0958, (555) 123-4567.
    // Gated at 7 digits, the shortest real subscriber number — below that it
    // is far more likely to be a reference range.
    category: 'phone',
    pattern: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{2,4}[\s.-]\d{3,4}(?:[\s.-]\d{2,4})?/g,
    placeholder: '[PHONE]',
    minDigits: 7,
  },
  {
    // ISO form, and day/month/year with a CONSISTENT separator (the \1
    // backreference). Requiring the same separator twice is what stops
    // `13.0-17.0` — a reference range punctuated with both `.` and `-` —
    // being read as a date, which is a bug this file used to have.
    category: 'date',
    pattern: /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}([/.-])\d{1,2}\1\d{2,4})\b/g,
    placeholder: '[DATE]',
  },
  {
    // Record numbers, national IDs, insurance numbers. Gated at 7 digits,
    // which is longer than any laboratory value or reference range.
    category: 'longNumber',
    pattern: /\b\d[\d\s-]*\d\b/g,
    placeholder: '[ID]',
    minDigits: 7,
  },
  {
    // UK-style and similar alphanumeric postcodes.
    category: 'postcode',
    pattern: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi,
    placeholder: '[POSTCODE]',
  },
];

const EMPTY_COUNTS: Record<RedactionCategory, number> = {
  email: 0,
  phone: 0,
  longNumber: 0,
  url: 0,
  date: 0,
  postcode: 0,
};

/**
 * Replaces structured identifiers with typed placeholders.
 *
 * Placeholders rather than deletion: the model still needs to know a field was
 * there. "Patient: [NAME], DOB [DATE]" parses as a header; "Patient: , DOB"
 * looks like a corrupt document and invites the model to invent a repair.
 */
export function redact(input: string): RedactionResult {
  const counts = { ...EMPTY_COUNTS };

  // Measurements out of harm's way first — see MEASUREMENT_PATTERNS for why.
  const { text: masked, restore } = protectMeasurements(input);
  let text = masked;

  for (const rule of RULES) {
    text = text.replace(rule.pattern, (match) => {
      if (rule.minDigits !== undefined) {
        const digits = (match.match(/\d/g) ?? []).length;
        if (digits < rule.minDigits) return match;
      }
      counts[rule.category] += 1;
      return rule.placeholder;
    });
  }

  return { text: restore(text), counts };
}

/** Total identifiers removed, for logging a single number rather than content. */
export function redactionTotal(counts: Record<RedactionCategory, number>): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}
