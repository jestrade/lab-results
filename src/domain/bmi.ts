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
 * ── The bands, and what they are not ──────────────────────────────────────
 *
 * `bmiBand` puts an index into one of the four WHO categories, and the
 * interface draws a red, amber or green signal beside it. Two constraints come
 * with that, and neither is optional.
 *
 * **The band is for adults.** Under eighteen, body mass index is read against
 * age-and-sex percentile charts, not these four fixed numbers, and the same
 * ratio that is "normal" for a 40-year-old can sit anywhere on a child's
 * chart. Every screen that shows a band has to say so — the copy key is
 * `profile.bmiAdultsOnly`, and it is not decoration.
 *
 * **The colour is never the message.** A band always renders with its name and
 * an icon beside the colour, the same rule `domain/status.ts` enforces for
 * every other status in this app: remove the colour and the reader still sees
 * "Obesity" next to a warning glyph.
 *
 * What is still deliberately absent is advice. A band names where a number
 * falls on a published table. It does not say what to do about it, and nothing
 * in this file should ever start.
 */

import type { MessageKey } from '@/i18n/messages';

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

/** The four WHO categories, as printed on the table this app follows. */
export type BmiBand = 'underweight' | 'normal' | 'overweight' | 'obese';

/** The traffic light beside the figure. Green, amber, red. */
export type BmiSignal = 'ok' | 'caution' | 'alert';

export interface BmiBandEntry {
  labelKey: MessageKey;
  /** Phosphor icon. Decorative — the label is what carries the meaning. */
  icon: string;
  signal: BmiSignal;
}

/**
 * Band → what to draw.
 *
 * Both ends of the scale get amber rather than one of them getting green by
 * default: being under the range is a finding, not the absence of one, and a
 * green light under 18.5 would say the opposite of what the table says.
 * Red is kept for the one band the table itself sets apart.
 */
export const BMI_BANDS: Record<BmiBand, BmiBandEntry> = {
  underweight: {
    labelKey: 'profile.bmiBand.underweight',
    icon: 'ph-arrow-down',
    signal: 'caution',
  },
  normal: { labelKey: 'profile.bmiBand.normal', icon: 'ph-check-circle', signal: 'ok' },
  overweight: { labelKey: 'profile.bmiBand.overweight', icon: 'ph-arrow-up', signal: 'caution' },
  obese: { labelKey: 'profile.bmiBand.obese', icon: 'ph-warning-circle', signal: 'alert' },
};

/** Where the bands meet. */
export const BMI_UNDERWEIGHT_BELOW = 18.5;
export const BMI_NORMAL_BELOW = 25;
export const BMI_OVERWEIGHT_BELOW = 30;

/**
 * The band an index falls in, or `null` when there is no index to place.
 *
 * The printed table reads "18.5 – 24.9" and "25.0 – 29.9", which leaves a
 * hairline gap at 24.95 that no reader ever means. The boundaries here are
 * continuous — below 25 is normal, below 30 is above normal — so every index
 * lands in exactly one band and none falls between two.
 *
 * Adults only. See the note at the top of this file: this is not a scale for
 * anyone under eighteen, and the interface must say so wherever it is shown.
 */
export function bmiBand(bmi: number | null): BmiBand | null {
  if (bmi === null || !Number.isFinite(bmi)) return null;
  if (bmi < BMI_UNDERWEIGHT_BELOW) return 'underweight';
  if (bmi < BMI_NORMAL_BELOW) return 'normal';
  if (bmi < BMI_OVERWEIGHT_BELOW) return 'overweight';
  return 'obese';
}
