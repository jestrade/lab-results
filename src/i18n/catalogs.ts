import type { Locale } from '@/domain/locales';

import { en } from './en';
import { es } from './es';
import { format, type TextValues } from './format';
import type { Messages, MessageKey } from './messages';

/**
 * Every catalog, keyed by locale.
 *
 * Typed as a total record over `Locale`, so adding a locale to
 * `@/domain/locales` without writing its catalog is a compile error rather
 * than a page that renders `undefined` where its labels should be.
 */
export const CATALOGS: Record<Locale, Messages> = { en, es };

/**
 * Translation as a pure function of locale.
 *
 * The hook is the right tool inside components; this is for the domain layer,
 * where functions like `summariseSeries` build a sentence out of data and
 * already take a locale. Making those call a React hook would mean either
 * moving presentation logic into components or making pure functions
 * unusable outside of a render — this keeps them pure and testable, with the
 * locale as an ordinary argument.
 */
export function messageFor(locale: Locale, key: MessageKey, values?: TextValues): string {
  return format(CATALOGS[locale][key], values);
}
