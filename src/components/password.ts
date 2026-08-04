/**
 * Password scoring and validation (KAN-1).
 *
 * Pure functions, kept apart from the meter that renders them so they can be
 * imported by forms and tested without a DOM.
 */

export const MIN_PASSWORD_LENGTH = 10;

export type PasswordScore = 0 | 1 | 2 | 3 | 4;

/**
 * Four coarse bands, weighted towards length — length is what actually resists
 * an offline attack, so a long passphrase must not score below a short string
 * with a punctuation mark in it.
 */
export function scorePassword(password: string): PasswordScore {
  if (!password) return 0;
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score += 2;
  else if (password.length >= 8) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, 4) as PasswordScore;
}

/** The hard minimum. The score above is advisory; this one blocks submission. */
export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export const PASSWORD_ADVICE: Record<PasswordScore, string> = {
  0: `At least ${MIN_PASSWORD_LENGTH} characters.`,
  1: `Too short. Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  2: `At least ${MIN_PASSWORD_LENGTH} characters. Add a number or symbol to strengthen it.`,
  3: 'Good. Add a symbol to strengthen it further.',
  4: 'Strong.',
};
