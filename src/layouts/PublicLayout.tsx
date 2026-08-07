import { Link, NavLink, Outlet } from 'react-router-dom';

import { ButtonLink } from '@/components/Button';
import { LanguageSwitcher } from '@/components/LanguagePicker';
import { useT } from '@/i18n/useI18n';
import type { MessageKey } from '@/i18n/messages';

const LEGAL_LINKS: { to: string; label: MessageKey }[] = [
  { to: '/legal/privacy', label: 'public.legal.privacy' },
  { to: '/legal/terms', label: 'public.legal.terms' },
  { to: '/legal/medical-disclaimer', label: 'public.legal.medicalDisclaimer' },
  { to: '/legal/ai-processing', label: 'public.legal.aiProcessing' },
  { to: '/legal/data-retention', label: 'public.legal.dataRetention' },
];

/**
 * The switcher sits in the public header, not only on the account page. The
 * reader who most needs it is the one who has not signed in yet — sending them
 * to a settings screen behind a sign-in form they cannot read would be a
 * language control that only helps people who no longer need it.
 */
export function PublicLayout() {
  const t = useT();

  return (
    <>
      <a className="skip-link" href="#main">
        {t('common.skipToContent')}
      </a>

      <header>
        <nav className="public-nav" aria-label={t('nav.main')}>
          <Link to="/" className="brand">
            LabResults
          </Link>
          <div className="public-nav-links">
            <NavLink to="/#how-it-works">{t('public.howItWorks')}</NavLink>
            <NavLink to="/legal/privacy">{t('public.privacy')}</NavLink>
            <NavLink to="/legal/medical-disclaimer">{t('public.disclaimer')}</NavLink>
          </div>
          <div className="spacer" />
          <LanguageSwitcher />
          <ButtonLink to="/sign-in" variant="ghost">
            {t('common.signIn')}
          </ButtonLink>
          <ButtonLink to="/register" variant="primary">
            {t('common.createAccount')}
          </ButtonLink>
        </nav>
      </header>

      <main id="main">
        <Outlet />
      </main>

      <footer className="public-footer">
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: 'var(--color-text)' }}>
          LabResults
        </span>
        <div className="spacer" />
        {LEGAL_LINKS.map((link) => (
          <Link key={link.to} to={link.to}>
            {t(link.label)}
          </Link>
        ))}
      </footer>
    </>
  );
}
