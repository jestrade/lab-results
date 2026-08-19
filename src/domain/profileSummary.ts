/**
 * What the account menu shows about the person, in one list (KAN-27).
 *
 * The panel behind the avatar answers "who is this account?", and the profile
 * now holds more of that answer than an address and a role. This turns that
 * record into labelled rows the menu can render without knowing anything about
 * health data.
 *
 * Two exports, because the panel makes two different promises. `summariseProfile`
 * returns a row per field the reader actually filled in. `summariseBody` is
 * unconditional — the index is on screen whether or not it can be computed.
 *
 * ── Only what was actually saved ──────────────────────────────────────────
 *
 * A field the reader left blank produces no row. The alternative — a row per
 * field with an em dash in it — would fill the panel with the shape of a
 * medical record that does not exist, and make the two facts they did give
 * harder to find than if the list were empty.
 *
 * Nothing here is derived except the body mass index, which is arithmetic on
 * two numbers they gave us and is named as such. No ages, no categories, no
 * counts of conditions: this list repeats what the reader wrote and adds no
 * interpretation of its own.
 */

import { messageFor } from '@/i18n/catalogs';
import { intlTag } from '@/i18n/dates';
import type { MessageKey } from '@/i18n/messages';

import { bmiBand, bodyMassIndex, type BmiBand } from './bmi';
import type { Locale } from './locales';
import type {
  BiologicalSex,
  IdentityDocumentType,
  PregnancyStatus,
  UserProfile,
} from './types';

export interface ProfileSummaryItem {
  /** Stable id — the React key, and what a test asks for. */
  key: string;
  /** The heading. Always visible. */
  label: string;
  /**
   * What the reader saved, verbatim. Free-text fields keep their line breaks,
   * because "one per line" is how the form asked for them and re-flowing a
   * medication list into a paragraph loses the list.
   */
  value: string;
}

const DOCUMENT_LABELS: Record<IdentityDocumentType, MessageKey> = {
  cedula: 'profile.document.cedula',
  registro_civil: 'profile.document.registroCivil',
  pasaporte: 'profile.document.pasaporte',
  cedula_extranjeria: 'profile.document.cedulaExtranjeria',
};

const SEX_LABELS: Record<BiologicalSex, MessageKey> = {
  female: 'profile.sex.female',
  male: 'profile.sex.male',
  intersex: 'profile.sex.intersex',
};

const PREGNANCY_LABELS: Record<PregnancyStatus, MessageKey> = {
  not_pregnant: 'profile.pregnancy.not',
  pregnant: 'profile.pregnancy.pregnant',
  postpartum: 'profile.pregnancy.postpartum',
};

/** Parts of one fact, joined. Blank parts drop out rather than leaving gaps. */
function join(parts: (string | null | undefined)[]): string {
  return parts.filter((part) => part != null && part !== '').join(' · ');
}

function decimal(value: number, locale: Locale, digits: number): string {
  return value.toLocaleString(intlTag(locale), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * The body mass index, for a panel that shows it whether or not it exists.
 *
 * Separate from the row list above, and unconditional, because those two
 * things are different promises. A row appears when the reader saved
 * something; the index is always on screen, reading `—` until there is
 * anything to compute it from. A figure that comes and goes as the profile is
 * filled in reads as the app mislaying it.
 *
 * `measurements` travels with it. A ratio shown with no sight of the two
 * numbers it came from is a number the reader cannot check.
 */
export interface BodyReadout {
  /** The index, formatted for the locale, or `null` when there is none. */
  index: string | null;
  band: BmiBand | null;
  /** "70 kg · 175 cm", or `null` when neither was given. */
  measurements: string | null;
}

export function summariseBody(profile: UserProfile | null, locale: Locale): BodyReadout {
  const context = profile?.healthContext ?? null;
  const weightKg = context?.weightKg ?? null;
  const heightCm = context?.heightCm ?? null;

  const measurements = join([
    weightKg === null ? null : `${decimal(weightKg, locale, 0)} kg`,
    heightCm === null ? null : `${decimal(heightCm, locale, 0)} cm`,
  ]);

  const bmi = bodyMassIndex(weightKg, heightCm);

  return {
    index: bmi === null ? null : decimal(bmi, locale, 1),
    band: bmiBand(bmi),
    measurements: measurements === '' ? null : measurements,
  };
}

export function summariseProfile(
  profile: UserProfile | null,
  locale: Locale,
): ProfileSummaryItem[] {
  if (!profile) return [];

  const items: ProfileSummaryItem[] = [];
  const document = profile.identityDocument;
  const context = profile.healthContext;

  if (document && (document.type || document.number || document.placeOfIssue)) {
    items.push({
      key: 'document',
      label: messageFor(locale, 'profile.documentHeading'),
      value: join([
        document.type ? messageFor(locale, DOCUMENT_LABELS[document.type]) : null,
        document.number,
        document.placeOfIssue,
      ]),
    });
  }

  if (!context) return items;

  if (context.dateOfBirth) {
    items.push({
      key: 'dateOfBirth',
      label: messageFor(locale, 'profile.dateOfBirth'),
      // The stored ISO string, not a formatted date: this is the value the
      // reader typed, and a summary that reformats it is a summary they have
      // to translate back before they can check it.
      value: context.dateOfBirth,
    });
  }

  if (context.biologicalSex) {
    items.push({
      key: 'biologicalSex',
      label: messageFor(locale, 'profile.biologicalSex'),
      value: messageFor(locale, SEX_LABELS[context.biologicalSex]),
    });
  }

  if (context.pregnancyStatus) {
    items.push({
      key: 'pregnancyStatus',
      label: messageFor(locale, 'profile.pregnancyStatus'),
      value: messageFor(locale, PREGNANCY_LABELS[context.pregnancyStatus]),
    });
  }

  const freeText: [string, MessageKey, string | null][] = [
    ['medications', 'profile.medications', context.medications],
    ['conditions', 'profile.conditions', context.conditions],
    ['familyConditions', 'profile.familyConditions', context.familyConditions],
    ['ongoingSymptoms', 'profile.symptoms', context.ongoingSymptoms],
  ];

  for (const [key, label, value] of freeText) {
    if (!value) continue;
    items.push({ key, label: messageFor(locale, label), value });
  }

  return items;
}
