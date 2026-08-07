/**
 * Choosing the appearance.
 *
 * ── Why a radio group rather than a dark-mode toggle ──────────────────────
 *
 * A two-state switch cannot express "follow my device", and collapsing that
 * into an implicit default makes the control lie: a reader whose device is
 * dark would see a switch that says "dark mode: off" while looking at a dark
 * screen. Three named options say what is actually true, and make going back
 * to the device setting a thing you can *choose* rather than something you can
 * only get by clearing site data.
 *
 * ── Why real radios ──────────────────────────────────────────────────────
 *
 * Broadsheet's `.seg` paints a segmented control over hidden `<input
 * type="radio">`s, which is the same trick `Checkbox` uses in `Field.tsx`:
 * the inputs stay in the DOM and in the tab order, so arrow keys, `name`
 * grouping and the "3 of 3" announcement all come from the browser rather than
 * from key handlers we would have to write and keep correct.
 */

import { useId } from 'react';

import { THEME_PREFERENCES, type ThemePreference } from '@/domain/themes';
import type { MessageKey } from '@/i18n/messages';
import { useI18n } from '@/i18n/useI18n';
import { useTheme } from '@/theme/useTheme';

import { Alert } from './Alert';
import { Icon } from './Icon';

const OPTIONS: Record<ThemePreference, { label: MessageKey; icon: string }> = {
  system: { label: 'theme.system', icon: 'devices' },
  light: { label: 'theme.light', icon: 'sun' },
  dark: { label: 'theme.dark', icon: 'moon' },
};

/** The full setting, for the account settings page. */
export function ThemePicker() {
  const { preference, theme, setPreference, saving, error } = useTheme();
  const { t } = useI18n();
  const captionId = useId();

  return (
    <>
      <p className="muted">{t('theme.description')}</p>

      {error ? (
        <Alert tone="warning" live>
          {error}
        </Alert>
      ) : null}

      <div className="field">
        <span id={captionId} className="field-caption">
          {t('theme.label')}
        </span>

        <div className="seg" role="radiogroup" aria-labelledby={captionId}>
          {THEME_PREFERENCES.map((option) => (
            <label key={option} className="seg-opt">
              <input
                type="radio"
                name="theme-preference"
                value={option}
                checked={preference === option}
                disabled={saving}
                onChange={() => void setPreference(option)}
              />
              <Icon name={OPTIONS[option].icon} size={15} />
              {t(OPTIONS[option].label)}
            </label>
          ))}
        </div>

        {/* Only under "device setting", where the control alone does not tell
            you what you are actually going to get. Under an explicit choice the
            label already says it. */}
        {preference === 'system' ? (
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }} aria-live="polite">
            {t(theme === 'dark' ? 'theme.followingSystemDark' : 'theme.followingSystemLight')}
          </div>
        ) : null}
      </div>
    </>
  );
}
