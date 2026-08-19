/**
 * Body mass index, and the two measurements it is made of (KAN-27).
 *
 * ── Why the index is computed and never stored ────────────────────────────
 *
 * BMI is `weight / height²` and nothing else. Storing it beside the weight and
 * the height would create a third number that can disagree with the two it
 * came from — a reader who corrects their weight on a slow connection would
 * have a profile briefly claiming an index that matches neither figure. There
 * is no version of that document worth keeping, so the index is derived at the
 * moment it is shown.
 *
 * ── Why there is no category here ─────────────────────────────────────────
 *
 * Deliberately absent: any function that turns 27.4 into a word. The ratio is
 * arithmetic on two numbers the reader gave us; "overweight" is a clinical
 * judgement about a person, and this product does not make those (spec §51).
 * The same rule already governs trends, which name a direction and refuse to
 * say whether it is welcome.
 */

/**
 * The range of measurements accepted.
 *
 * Wide on purpose. These bounds exist to catch a slipped decimal point or a
 * height typed in metres — 1.7 rather than 170 — not to decide which bodies
 * are real. The heaviest and lightest people ever recorded sit inside them,
 * and so does every newborn.
 */
export const MIN_WEIGHT_KG = 1;
export const MAX_WEIGHT_KG = 500;
export const MIN_HEIGHT_CM = 30;
export const MAX_HEIGHT_CM = 280;

export function isPlausibleWeightKg(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_WEIGHT_KG && value <= MAX_WEIGHT_KG;
}

export function isPlausibleHeightCm(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_HEIGHT_CM && value <= MAX_HEIGHT_CM;
}

/**
 * Reads a measurement the reader typed.
 *
 * Returns `null` for blank — "I have not said" is a legitimate answer to both
 * of these questions — and `NaN` for text that is not a number at all, which
 * the caller reports rather than silently dropping. A comma is accepted as a
 * decimal separator, because a Spanish keyboard and a Spanish reader both
 * expect `70,5` and typing it should not mean seventy.
 */
export function parseMeasurement(text: string | null): number | null {
  const trimmed = (text ?? '').trim().replace(',', '.');
  if (trimmed === '') return null;
  return Number(trimmed);
}

/**
 * The index, to one decimal place, or `null` when either measurement is
 * missing or outside the accepted range.
 *
 * One decimal because the inputs do not support more: a weight given to the
 * nearest kilogram cannot produce an index that is meaningful to two.
 */
export function bodyMassIndex(weightKg: number | null, heightCm: number | null): number | null {
  if (weightKg === null || heightCm === null) return null;
  if (!isPlausibleWeightKg(weightKg) || !isPlausibleHeightCm(heightCm)) return null;

  const metres = heightCm / 100;
  return Math.round((weightKg / (metres * metres)) * 10) / 10;
}
