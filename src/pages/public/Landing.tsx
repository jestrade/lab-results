import { Link } from 'react-router-dom';

import { NavButton } from '@/components/NavButton';
import { DisclaimerBanner } from '@/components/DisclaimerBanner';
import { Icon } from '@/components/Icon';
import { Tag } from '@/components/Tag';
import { Trans } from '@/i18n/Trans';
import { useT } from '@/i18n/useI18n';
import type { MessageKey } from '@/i18n/messages';

const STEPS: { title: MessageKey; body: MessageKey }[] = [
  { title: 'landing.step1Title', body: 'landing.step1Body' },
  { title: 'landing.step2Title', body: 'landing.step2Body' },
  { title: 'landing.step3Title', body: 'landing.step3Body' },
  { title: 'landing.step4Title', body: 'landing.step4Body' },
];

const ASSURANCES: { icon: string; label: MessageKey }[] = [
  { icon: 'lock-key', label: 'landing.assurance.private' },
  { icon: 'eraser', label: 'landing.assurance.redacted' },
  { icon: 'download-simple', label: 'landing.assurance.export' },
];

export function Landing() {
  const t = useT();

  return (
    <>
      <section className="hero">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          <Tag tone="accent">{t('landing.badge')}</Tag>
          <h1>{t('landing.heading')}</h1>
          <p className="hero-lede">{t('landing.lede')}</p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <NavButton to="/register" variant="primary">
              {t('landing.uploadFirst')}
            </NavButton>
            <NavButton to="/sign-in" variant="secondary">
              {t('common.signIn')}
            </NavButton>
          </div>
          <div className="hero-assurances">
            {ASSURANCES.map((item) => (
              <span key={item.label}>
                <Icon name={item.icon} size={16} />
                {t(item.label)}
              </span>
            ))}
          </div>
        </div>

        <div className="hero-panel">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 18 }}>
              Hemoglobin
            </span>
            <span className="status-pill" data-status="normal">
              <Icon name="check-circle" size={13} />
              Normal
            </span>
            <div className="spacer" />
            <span className="muted" style={{ fontSize: 13 }}>
              {t('landing.exampleReports')}
            </span>
          </div>

          {/* An illustration, not real data. The long description carries the
              same information for anyone who cannot see the chart. */}
          <svg
            viewBox="0 0 560 240"
            style={{ width: '100%', height: 'auto' }}
            role="img"
            aria-label={t('landing.chartAlt')}
          >
            <rect x="20" y="26" width="520" height="112" fill="var(--chart-band)" />
            <line x1="20" y1="26" x2="540" y2="26" stroke="var(--chart-band-edge)" strokeWidth="1" strokeDasharray="4 3" />
            <line x1="20" y1="138" x2="540" y2="138" stroke="var(--chart-band-edge)" strokeWidth="1" strokeDasharray="4 3" />
            <line x1="20" y1="196" x2="540" y2="196" stroke="var(--chart-axis)" strokeWidth="1" />
            <polyline
              points="30,104 115,112 200,124 285,90 370,146 455,80 530,72"
              fill="none"
              stroke="var(--chart-line)"
              strokeWidth="2.5"
            />
            {[
              [30, 104],
              [115, 112],
              [200, 124],
              [285, 90],
              [455, 80],
            ].map(([cx, cy]) => (
              <circle
                key={`${cx}-${cy}`}
                cx={cx}
                cy={cy}
                r="4"
                fill="var(--panel-bg)"
                stroke="var(--chart-line)"
                strokeWidth="2"
              />
            ))}
            <circle cx="370" cy="146" r="5.5" fill="var(--chart-point-critical)" />
            <circle cx="530" cy="72" r="6.5" fill="var(--chart-line)" />
            <text x="530" y="58" fontSize="13" fontWeight="700" textAnchor="end" fill="var(--color-text)">
              14.2 g/dL
            </text>
            <text x="370" y="168" fontSize="11" textAnchor="middle" fill="var(--chart-point-critical)">
              {t('landing.belowRange')}
            </text>
            <text x="30" y="216" fontSize="10" fill="var(--color-text-muted)">
              Mar 2024
            </text>
            <text x="530" y="216" fontSize="10" textAnchor="end" fill="var(--color-text-muted)">
              Jul 2026
            </text>
          </svg>

          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            {t('landing.illustrative')}
          </p>
        </div>
      </section>

      <section className="section-pad" id="how-it-works">
        <h2 style={{ fontSize: 34 }}>{t('landing.howItWorks')}</h2>
        <div className="steps-grid">
          {STEPS.map((step, index) => (
            <div key={step.title} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="step-num" aria-hidden="true">
                {index + 1}
              </div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17 }}>
                {t(step.title)}
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.65 }}>
                {t(step.body)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <DisclaimerBanner variant="full" />

      <section className="section-pad">
        <p className="muted" style={{ fontSize: 14 }}>
          <Trans
            id="landing.legalNote"
            values={{
              privacy: <Link to="/legal/privacy">{t('public.legal.privacy')}</Link>,
              terms: <Link to="/legal/terms">{t('public.legal.terms')}</Link>,
              ai: <Link to="/legal/ai-processing">{t('public.legal.aiProcessing')}</Link>,
            }}
          />
        </p>
      </section>
    </>
  );
}
