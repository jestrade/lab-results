import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Icon } from '@/components/Icon';

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
  return (
    <div className="auth-split">
      <a className="skip-link" href="#main">
        Skip to content
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
        <p className="auth-aside-foot">
          Informational and educational only. Not a medical device, and not a substitute for
          consultation with a qualified healthcare professional.
        </p>
      </aside>

      <main className="auth-main" id="main">
        {children}
      </main>
    </div>
  );
}
