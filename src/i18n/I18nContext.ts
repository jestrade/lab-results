import { createContext } from 'react';

import type { Locale } from '@/domain/locales';
import type { MessageKey } from './messages';
import type { TextValues } from './format';

export interface I18nContextValue {
  locale: Locale;
  /** Translate a key, filling any `{name}` holes. */
  t: (key: MessageKey, values?: TextValues) => string;
  /**
   * Switch language. Resolves once the choice has been stored, so the picker
   * can keep its saving state up until it is actually saved rather than until
   * it has been asked for.
   */
  setLocale: (locale: Locale) => Promise<void>;
  /** True while a chosen locale is being written to the profile. */
  saving: boolean;
  /**
   * Set when the preference could not be persisted. The switch still applies
   * locally — a failed write must not leave the reader stuck in a language
   * they cannot read.
   */
  error: string | null;
}

export const I18nContext = createContext<I18nContextValue | null>(null);
