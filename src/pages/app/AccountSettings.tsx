import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { LanguagePicker } from '@/components/LanguagePicker';
import { Modal } from '@/components/Modal';
import { Tag } from '@/components/Tag';
import { ThemePicker } from '@/components/ThemePicker';
import { formatLongDate } from '@/i18n/dates';
import { Trans } from '@/i18n/Trans';
import { useI18n } from '@/i18n/useI18n';
import { useAiConsent } from '@/hooks/useAiConsent';

/**
 * Account settings — currently the privacy half (KAN-27 / KAN-48 build the rest).
 *
 * This page exists now because of a question that turned out to be a design
 * flaw rather than a bug: "where do I agree to AI processing?" The consent
 * prompt lived only on the upload page, and only until it was answered. After
 * that there was nowhere to see what had been agreed and no way to undo it.
 *
 * Consent that cannot be reviewed is a claim rather than a choice, and consent
 * that cannot be withdrawn is not really consent — withdrawal is expected to be
 * as easy as giving it. So this page shows the current state, when it was
 * given, exactly what agreeing permits, and a way out.
 *
 * Language sits at the top (KAN-8), above AI processing, because it is the one
 * setting that changes whether the rest of the page can be read at all.
 * Appearance follows it for the weaker version of the same reason — it changes
 * how comfortably it can be read — and both sit above the consent section,
 * which is the longest thing on the page and would otherwise bury them.
 */
export function AccountSettings() {
  const consent = useAiConsent();
  const { t, locale } = useI18n();
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);

  async function handleWithdraw() {
    await consent.withdraw();
    setConfirmingWithdraw(false);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">{t('nav.account')}</div>
          <h1>{t('nav.settings')}</h1>
        </div>
      </div>

      <section className="settings-section" aria-labelledby="language">
        <div className="settings-head">
          <h2 id="language">{t('lang.heading')}</h2>
        </div>
        <LanguagePicker />
      </section>

      <section className="settings-section" aria-labelledby="appearance">
        <div className="settings-head">
          <h2 id="appearance">{t('theme.heading')}</h2>
        </div>
        <ThemePicker />
      </section>

      <section className="settings-section" aria-labelledby="ai-processing">
        <div className="settings-head">
          <h2 id="ai-processing">{t('settings.aiHeading')}</h2>
          {consent.loading ? null : consent.granted ? (
            <Tag tone="accent">
              <Icon name="check-circle" size={13} />
              <span style={{ marginLeft: 5 }}>{t('settings.agreed')}</span>
            </Tag>
          ) : (
            <Tag tone="neutral">
              <Icon name="prohibit" size={13} />
              <span style={{ marginLeft: 5 }}>{t('settings.notAgreed')}</span>
            </Tag>
          )}
        </div>

        <p className="muted">
          <Trans id="settings.aiIntro" values={{ provider: <strong>Google Gemini</strong> }} />
        </p>

        {/* Stated plainly rather than buried. Consent given against a rosier
            description than the truth is not consent to what actually happens. */}
        <ul className="settings-facts">
          <li>
            <Icon name="warning" size={15} />
            <span>
              <Trans
                id="settings.aiFact.notAnonymised"
                values={{
                  emphasis: <strong>{t('settings.aiFact.notAnonymisedEmphasis')}</strong>,
                }}
              />
            </span>
          </li>
          <li>
            <Icon name="info" size={15} />
            <span>{t('settings.aiFact.freeTier')}</span>
          </li>
          <li>
            <Icon name="file-pdf" size={15} />
            <span>{t('settings.aiFact.noPdf')}</span>
          </li>
          <li>
            <Icon name="calculator" size={15} />
            <span>{t('settings.aiFact.calculated')}</span>
          </li>
        </ul>

        <p className="muted" style={{ fontSize: 13 }}>
          <Trans
            id="settings.fullDetail"
            values={{
              document: (
                <Link to="/legal/ai-processing">{t('public.legal.aiProcessing')}</Link>
              ),
            }}
          />
        </p>

        {consent.error ? (
          <Alert tone="danger" live>
            {consent.error}
          </Alert>
        ) : null}

        {consent.loading ? null : consent.granted ? (
          <>
            {consent.acceptedAt ? (
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                {t('settings.agreedOn', { date: formatLongDate(consent.acceptedAt, locale) })}
              </p>
            ) : null}
            <div>
              <Button variant="secondary" onClick={() => setConfirmingWithdraw(true)}>
                {t('settings.withdraw')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <Alert tone="warning">{t('settings.blocked')}</Alert>
            <div>
              <Button
                variant="primary"
                onClick={() => void consent.grant()}
                loading={consent.saving}
                loadingLabel={t('common.saving')}
              >
                {t('settings.agree')}
              </Button>
            </div>
          </>
        )}
      </section>

      <section className="settings-section">
        <div className="settings-head">
          <h2>{t('settings.otherHeading')}</h2>
        </div>
        <p className="muted">
          <Trans
            id="settings.otherBody"
            values={{
              profileLink: <Link to="/profile">{t('settings.profileLink')}</Link>,
              deleteLink: <Link to="/profile">{t('settings.deletingAccount')}</Link>,
            }}
          />
        </p>
      </section>

      <Modal
        open={confirmingWithdraw}
        onClose={() => (consent.saving ? undefined : setConfirmingWithdraw(false))}
        title={t('settings.withdrawTitle')}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmingWithdraw(false)}
              disabled={consent.saving}
            >
              {t('settings.keepIt')}
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleWithdraw()}
              loading={consent.saving}
              loadingLabel={t('settings.withdrawing')}
            >
              {t('settings.withdraw')}
            </Button>
          </>
        }
      >
        <p>{t('settings.withdrawBody1')}</p>
        <p style={{ marginBottom: 0 }}>
          <Trans
            id="settings.withdrawBody2"
            values={{
              deleteLink: <Link to="/profile">{t('settings.deleteAccountLink')}</Link>,
            }}
          />
        </p>
      </Modal>
    </>
  );
}
