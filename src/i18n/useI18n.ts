import { useContext } from 'react';

import { I18nContext, type I18nContextValue } from './I18nContext';

/** The whole language context: current locale, `t`, and the switcher. */
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside an <I18nProvider>.');
  }
  return context;
}

/**
 * Just the translate function.
 *
 * The common case by a wide margin, and worth its own hook: a component that
 * only renders text has no business holding a reference to `setLocale`.
 */
export function useT(): I18nContextValue['t'] {
  return useI18n().t;
}
