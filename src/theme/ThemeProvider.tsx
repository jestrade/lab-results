/**
 * Light and dark appearance, by the reader's choice.
 *
 * ── Where the answer comes from, in order ─────────────────────────────────
 *
 *   1. the account's stored preference   — once the profile has loaded
 *   2. this device's remembered choice   — available before first paint
 *   3. the device's `prefers-color-scheme`
 *
 * The order is "most deliberate first", exactly as `I18nProvider` resolves the
 * language, and for the same reason: a preference saved on the account is the
 * reader having said what they want, `localStorage` is them having said it on
 * this device, and `prefers-color-scheme` is what their operating system says
 * on their behalf. Each step only overrides the ones below it.
 *
 * There is no fourth step, because "light" is not a fallback here — it is what
 * step 3 answers when the device asks for light.
 *
 * ── Why the account preference cannot be the only one ─────────────────────
 *
 * It arrives a round-trip after first paint. Trusting it alone would render
 * every signed-in page in light and then swap it to dark in front of a reader
 * who has already said they want dark — the flash that theme switchers exist
 * to avoid. Step 2 is what makes the first paint already correct, and
 * `bootTheme()` in `main.tsx` is what applies it before React renders at all.
 *
 * ── Why a chosen theme is not lost when saving fails ──────────────────────
 *
 * `setPreference` applies the switch locally first and persists second. If the
 * write fails — offline, rules, a signed-out session — the reader still gets
 * the theme they asked for and an error they can act on. Refusing to switch
 * until the server agrees would leave someone staring at a bright white screen
 * because of a network blip, which for a reader who chose dark for reasons of
 * light sensitivity or migraine is not a cosmetic failure.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAuth } from '@/auth/useAuth';
import {
  detectSystemTheme,
  resolveTheme,
  type Theme,
  type ThemePreference,
} from '@/domain/themes';
import { CATALOGS } from '@/i18n/catalogs';
import { useI18n } from '@/i18n/useI18n';
import { subscribeToThemePreference, updateThemePreference } from '@/services/profiles';

import { applyDocumentTheme, resolveInitialThemePreference, subscribeToSystemTheme } from './resolve';
import { writeStoredThemePreference } from './storage';
import { ThemeContext, type ThemeContextValue } from './ThemeContext';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { locale } = useI18n();

  const [preference, setPreferenceState] = useState<ThemePreference>(
    resolveInitialThemePreference,
  );
  const [system, setSystem] = useState<Theme>(detectSystemTheme);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Suppresses the echo of our own write.
   *
   * The snapshot listener below adopts whatever the profile says. Between
   * `setPreference` updating the screen and Firestore acknowledging the write,
   * that listener can still deliver the *old* value and flip the theme back
   * under the reader. Held from the moment the switch is applied until the
   * write settles.
   */
  const writing = useRef(false);

  const theme = resolveTheme(preference, system);

  useEffect(() => applyDocumentTheme(theme), [theme]);

  // Subscribed unconditionally, not only while the preference is `system`:
  // keeping `system` current means that switching *back* to "follow my device"
  // is instant rather than correct-at-next-reload.
  useEffect(() => subscribeToSystemTheme(setSystem), []);

  useEffect(() => {
    if (!user) return;

    return subscribeToThemePreference(
      user.uid,
      (stored) => {
        if (writing.current) return;
        // `null` means the account never chose; the device answer stands.
        if (stored) setPreferenceState(stored);
      },
      // A profile that cannot be read is not a reason to shout at someone
      // about their theme — the rest of the app surfaces that failure where it
      // actually matters.
      () => {},
    );
  }, [user]);

  const setPreference = useCallback(
    async (next: ThemePreference) => {
      setPreferenceState(next);
      writeStoredThemePreference(next);
      setError(null);

      // Signed out, the device is the only place there is to remember it.
      if (!user) return;

      writing.current = true;
      setSaving(true);
      try {
        await updateThemePreference(user.uid, next);
      } catch {
        setError('save-failed');
      } finally {
        writing.current = false;
        setSaving(false);
      }
    },
    [user],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      theme,
      setPreference,
      saving,
      error: error ? CATALOGS[locale]['theme.saveFailed'] : null,
    }),
    [preference, theme, setPreference, saving, error, locale],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
