/**
 * Choosing the interface language (KAN-8).
 *
 * ── Why a native `<select>` ───────────────────────────────────────────────
 *
 * A custom dropdown would have to reimplement type-ahead, keyboard selection,
 * the mobile picker wheel and the focus contract, and the one screen where
 * getting that wrong is least recoverable is the screen someone lands on
 * *because they cannot read the interface*. The native control already speaks
 * every language it is labelled in.
 *
 * ── Why each option is written in its own language ────────────────────────
 *
 * "Español", never "Spanish" — a reader looking for their language is
 * scanning for the word they know, and translating language names into the
 * language they are trying to leave is the one place where a translated label
 * makes the control harder to use.
 */

import { useId } from 'react';

import { LOCALES, LOCALE_LABEL, isLocale } from '@/domain/locales';
import { useI18n } from '@/i18n/useI18n';

import { Alert } from './Alert';
import { Field } from './Field';
import { Icon } from './Icon';

function options() {
  return LOCALES.map((locale) => (
    <option key={locale} value={locale}>
      {LOCALE_LABEL[locale]}
    </option>
  ));
}

/**
 * The compact switcher, for the public header and the application top bar.
 *
 * Present on the signed-out pages deliberately: the account setting cannot
 * help someone who has to read the sign-in form before they can reach it.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const id = useId();

  return (
    <div className={['lang-switcher', className].filter(Boolean).join(' ')}>
      <Icon name="translate" size={16} />
      <label htmlFor={id} className="sr-only">
        {t('lang.switcherLabel')}
      </label>
      <select
        id={id}
        value={locale}
        onChange={(event) => {
          if (isLocale(event.target.value)) void setLocale(event.target.value);
        }}
      >
        {options()}
      </select>
    </div>
  );
}

/** The full setting, for the account settings page. */
export function LanguagePicker() {
  const { locale, setLocale, saving, error, t } = useI18n();

  return (
    <>
      <p className="muted">{t('lang.description')}</p>

      {error ? (
        <Alert tone="warning" live>
          {error}
        </Alert>
      ) : null}

      <Field label={t('lang.label')} hint={t('lang.catalogNote')}>
        {(props) => (
          <select
            {...props}
            className="input"
            style={{ maxWidth: 280 }}
            value={locale}
            disabled={saving}
            onChange={(event) => {
              if (isLocale(event.target.value)) void setLocale(event.target.value);
            }}
          >
            {options()}
          </select>
        )}
      </Field>
    </>
  );
}
