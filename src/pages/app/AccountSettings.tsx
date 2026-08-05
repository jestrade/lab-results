import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { Tag } from '@/components/Tag';
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
 */
export function AccountSettings() {
  const consent = useAiConsent();
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);

  async function handleWithdraw() {
    await consent.withdraw();
    setConfirmingWithdraw(false);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Account</div>
          <h1>Account settings</h1>
        </div>
      </div>

      <section className="settings-section" aria-labelledby="ai-processing">
        <div className="settings-head">
          <h2 id="ai-processing">AI processing</h2>
          {consent.loading ? null : consent.granted ? (
            <Tag tone="accent">
              <Icon name="check-circle" size={13} />
              <span style={{ marginLeft: 5 }}>Agreed</span>
            </Tag>
          ) : (
            <Tag tone="neutral">
              <Icon name="prohibit" size={13} />
              <span style={{ marginLeft: 5 }}>Not agreed</span>
            </Tag>
          )}
        </div>

        <p className="muted">
          To read a report we send its text to <strong>Google Gemini</strong>, a third-party AI
          provider. Identifiers we can detect — email addresses, phone numbers, record numbers,
          dates — are removed first.
        </p>

        {/* Stated plainly rather than buried. Consent given against a rosier
            description than the truth is not consent to what actually happens. */}
        <ul className="settings-facts">
          <li>
            <Icon name="warning" size={15} />
            <span>
              This is <strong>not full anonymisation</strong>. Names written inside the document
              cannot be reliably removed automatically.
            </span>
          </li>
          <li>
            <Icon name="info" size={15} />
            <span>
              On the free tier, Google&rsquo;s terms permit submitted content to be used to improve
              their products.
            </span>
          </li>
          <li>
            <Icon name="file-pdf" size={15} />
            <span>
              The original PDF is never sent — only text extracted from it, after redaction.
            </span>
          </li>
          <li>
            <Icon name="calculator" size={15} />
            <span>
              Whether a result is low, normal, high or critical is calculated from the range printed
              on your report, not decided by the AI.
            </span>
          </li>
        </ul>

        <p className="muted" style={{ fontSize: 13 }}>
          Full detail in the <Link to="/legal/ai-processing">AI Processing Disclosure</Link>.
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
                You agreed on{' '}
                {new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(
                  consent.acceptedAt,
                )}
                .
              </p>
            ) : null}
            <div>
              <Button variant="secondary" onClick={() => setConfirmingWithdraw(true)}>
                Withdraw consent
              </Button>
            </div>
          </>
        ) : (
          <>
            <Alert tone="warning">
              Reports cannot be processed until you agree. You can still upload nothing, and any
              reports already processed are unaffected.
            </Alert>
            <div>
              <Button
                variant="primary"
                onClick={() => void consent.grant()}
                loading={consent.saving}
                loadingLabel="Saving…"
              >
                I understand and agree
              </Button>
            </div>
          </>
        )}
      </section>

      <section className="settings-section">
        <div className="settings-head">
          <h2>Password, notifications, data export and account deletion</h2>
        </div>
        <p className="muted">
          Not built yet — these are KAN-27 and KAN-48. Data export and account deletion are
          required by the spec (§56, §57) and are tracked on KAN-23.
        </p>
      </section>

      <Modal
        open={confirmingWithdraw}
        onClose={() => (consent.saving ? undefined : setConfirmingWithdraw(false))}
        title="Withdraw consent for AI processing?"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmingWithdraw(false)}
              disabled={consent.saving}
            >
              Keep it
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleWithdraw()}
              loading={consent.saving}
              loadingLabel="Withdrawing…"
            >
              Withdraw consent
            </Button>
          </>
        }
      >
        <p>
          New reports will not be processed, and you will not be able to upload until you agree
          again. Nothing is sent to the AI provider from the moment you withdraw.
        </p>
        <p style={{ marginBottom: 0 }}>
          Reports already processed keep their results. Withdrawing does not delete anything — use
          account deletion for that.
        </p>
      </Modal>
    </>
  );
}
