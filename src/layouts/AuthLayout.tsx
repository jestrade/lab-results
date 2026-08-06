import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Icon } from '@/components/Icon';
import { LanguageSwitcher } from '@/components/LanguagePicker';
import { useT } from '@/i18n/useI18n';

export interface AuthAsidePoint {
  icon: string;
  title: string;
  body: string;
}

export interface AuthLayoutProps {
  heading: string;
  /** Optional paragraph under the heading, in place of the bullet points. */
  lede?: string;
  points?: AuthAsidePoint[];
  children: ReactNode;
}

/**
 * The split auth screen (KAN-40).
 *
 * The violet panel is presentation, not content — it is hidden below `lg` and
 * its contents are duplicated nowhere, so nothing a user needs is lost when it
 * disappears on a phone. The form is the page.
 */
export function AuthLayout({ heading, lede, points, children }: AuthLayoutProps) {
  const t = useT();

  return (
    <div className="auth-split">
      <a className="skip-link" href="#main">
        {t('common.skipToContent')}
      </a>

      <aside className="auth-aside">
        <Link to="/" className="brand">
          LabResults
        </Link>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28 }}>
          <h1>{heading}</h1>
          {lede ? (
            <p style={{ margin: 0, fontSize: 16, opacity: 0.9, lineHeight: 1.7, maxWidth: 420 }}>
              {lede}
            </p>
          ) : null}
          {points ? (
            <div className="auth-aside-points">
              {points.map((point) => (
                <div key={point.title} className="auth-aside-point">
                  <Icon name={point.icon} size={24} />
                  <div>
                    <div className="auth-aside-point-title">{point.title}</div>
                    <div className="auth-aside-point-body">{point.body}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <p className="auth-aside-foot">{t('authLayout.foot')}</p>
      </aside>

      <main className="auth-main" id="main">
        {/* On the form side, not the violet panel: the panel is hidden below
            `lg`, and a phone is exactly where someone is most likely to be
            hunting for their language.

            Positioned out of the centring flow rather than placed in it —
            `.auth-main` centres a single child, and a second one would sit
            beside the form rather than above it. */}
        <LanguageSwitcher className="auth-lang" />
        {children}
      </main>
    </div>
  );
}
