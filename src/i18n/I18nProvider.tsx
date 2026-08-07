/**
 * Interface language (KAN-8).
 *
 * ── Where the answer comes from, in order ─────────────────────────────────
 *
 *   1. the account's stored preference   — once the profile has loaded
 *   2. this device's remembered choice   — available before first paint
 *   3. the browser's `navigator.languages`
 *   4. English
 *
 * The order is "most deliberate first". A preference saved on the account is
 * the reader having said what they want; `localStorage` is them having said it
 * on this device; `navigator.languages` is an inference. Each step only
 * overrides the ones below it.
 *
 * The account preference is applied *after* first paint because it cannot be
 * read before the profile arrives, so steps 2–4 exist largely to stop the app
 * rendering in English and visibly flipping to Spanish a moment later. A
 * reader who has chosen Spanish on this device sees Spanish immediately.
 *
 * ── Why a chosen language is not lost when saving fails ───────────────────
 *
 * `setLocale` applies the switch locally first and persists second. If the
 * write fails — offline, rules, a signed-out session — the reader still gets
 * the language they asked for and an error they can act on. Refusing to switch
 * until the server agrees would leave someone stranded in a language they
 * cannot read because of a network blip.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAuth } from '@/auth/useAuth';
import type { Locale } from '@/domain/locales';
import { updateLocalePreference, subscribeToLocalePreference } from '@/services/profiles';

import { CATALOGS } from './catalogs';
import { format, type TextValues } from './format';
import { I18nContext, type I18nContextValue } from './I18nContext';
import type { MessageKey } from './messages';
import { applyDocumentLocale, resolveInitialLocale } from './resolve';
import { writeStoredLocale } from './storage';

export function I18nProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [locale, setLocaleState] = useState<Locale>(resolveInitialLocale);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Suppresses the echo of our own write.
   *
   * The snapshot listener below adopts whatever the profile says. Between
   * `setLocale` updating the screen and Firestore acknowledging the write,
   * that listener can still deliver the *old* value and flip the language back
   * under the reader. Held from the moment the switch is applied until the
   * write settles.
   */
  const writing = useRef(false);

  useEffect(() => applyDocumentLocale(locale), [locale]);

  useEffect(() => {
    if (!user) return;

    return subscribeToLocalePreference(
      user.uid,
      (stored) => {
        if (writing.current) return;
        // `null` means the account never chose; the device answer stands.
        if (stored) setLocaleState(stored);
      },
      // A profile that cannot be read is not a reason to shout at someone
      // about their language setting — the rest of the app surfaces that
      // failure where it actually matters.
      () => {},
    );
  }, [user]);

  const setLocale = useCallback(
    async (next: Locale) => {
      setLocaleState(next);
      writeStoredLocale(next);
      setError(null);

      // Signed out, the device is the only place there is to remember it.
      if (!user) return;

      writing.current = true;
      setSaving(true);
      try {
        await updateLocalePreference(user.uid, next);
      } catch {
        setError('save-failed');
      } finally {
        writing.current = false;
        setSaving(false);
      }
    },
    [user],
  );

  const t = useCallback(
    (key: MessageKey, values?: TextValues) => format(CATALOGS[locale][key], values),
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      t,
      setLocale,
      saving,
      error: error ? CATALOGS[locale]['lang.saveFailed'] : null,
    }),
    [locale, t, setLocale, saving, error],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
