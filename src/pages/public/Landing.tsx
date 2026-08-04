import { Link } from 'react-router-dom';

import { ButtonLink } from '@/components/Button';
import { DisclaimerBanner } from '@/components/DisclaimerBanner';
import { Icon } from '@/components/Icon';
import { Tag } from '@/components/Tag';

const STEPS = [
  {
    title: 'Upload the PDF',
    body: 'Drag in a report from any laboratory. The original file is stored privately and never gets a public link.',
  },
  {
    title: 'We extract every value',
    body: 'Test name, value, unit and the reference range printed on that report — including scanned pages, via OCR.',
  },
  {
    title: 'Values are matched and classified',
    body: 'Hgb, Hb and Hemoglobin become one variable. Low, normal, high and critical are decided arithmetically, not by AI.',
  },
  {
    title: 'You see the whole history',
    body: 'Charts per variable, plus explanations and a preliminary analysis, both clearly marked as AI-generated.',
  },
];

const ASSURANCES = [
  { icon: 'lock-key', label: 'Private by default' },
  { icon: 'eraser', label: 'Identifiers redacted before AI' },
  { icon: 'download-simple', label: 'Export or delete any time' },
];

export function Landing() {
  return (
    <>
      <section className="hero">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          <Tag tone="accent">Educational tool · not medical advice</Tag>
          <h1>Stop reading your lab results one PDF at a time.</h1>
          <p className="hero-lede">
            Upload the reports you already have. Every test, value, unit and reference range is
            extracted, matched across laboratories and charted over time — with plain-language
            explanations that are always labelled as AI-generated.
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <ButtonLink to="/register" variant="primary">
              Upload your first report
            </ButtonLink>
            <ButtonLink to="/sign-in" variant="secondary">
              Sign in
            </ButtonLink>
          </div>
          <div className="hero-assurances">
            {ASSURANCES.map((item) => (
              <span key={item.label}>
                <Icon name={item.icon} size={16} />
                {item.label}
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
              7 reports · 2024–2026
            </span>
          </div>

          {/* An illustration, not real data. The long description carries the
              same information for anyone who cannot see the chart. */}
          <svg
            viewBox="0 0 560 240"
            style={{ width: '100%', height: 'auto' }}
            role="img"
            aria-label="Example trend chart: hemoglobin across seven reports against a shaded reference range, dipping below the range once in November 2025 and returning to 14.2 g/dL by July 2026."
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
              11.8 · below range
            </text>
            <text x="30" y="216" fontSize="10" fill="var(--color-text-muted)">
              Mar 2024
            </text>
            <text x="530" y="216" fontSize="10" textAnchor="end" fill="var(--color-text-muted)">
              Jul 2026
            </text>
          </svg>

          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Illustrative example. Reference ranges shown are the ones printed on each report.
          </p>
        </div>
      </section>

      <section className="section-pad" id="how-it-works">
        <h2 style={{ fontSize: 34 }}>How it works</h2>
        <div className="steps-grid">
          {STEPS.map((step, index) => (
            <div key={step.title} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="step-num" aria-hidden="true">
                {index + 1}
              </div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 17 }}>
                {step.title}
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.65 }}>
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <DisclaimerBanner variant="full" />

      <section className="section-pad">
        <p className="muted" style={{ fontSize: 14 }}>
          Read the <Link to="/legal/privacy">Privacy Policy</Link>, the{' '}
          <Link to="/legal/terms">Terms of Service</Link> and the{' '}
          <Link to="/legal/ai-processing">AI Processing Disclosure</Link> before creating an
          account.
        </p>
      </section>
    </>
  );
}
