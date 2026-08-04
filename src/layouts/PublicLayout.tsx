import { Link, NavLink, Outlet } from 'react-router-dom';

import { ButtonLink } from '@/components/Button';

const LEGAL_LINKS = [
  { to: '/legal/privacy', label: 'Privacy Policy' },
  { to: '/legal/terms', label: 'Terms of Service' },
  { to: '/legal/medical-disclaimer', label: 'Medical Disclaimer' },
  { to: '/legal/ai-processing', label: 'AI Processing Disclosure' },
  { to: '/legal/data-retention', label: 'Data Retention' },
];

export function PublicLayout() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header>
        <nav className="public-nav" aria-label="Main">
          <Link to="/" className="brand">
            LabResults
          </Link>
          <div className="public-nav-links">
            <NavLink to="/#how-it-works">How it works</NavLink>
            <NavLink to="/legal/privacy">Privacy</NavLink>
            <NavLink to="/legal/medical-disclaimer">Disclaimer</NavLink>
          </div>
          <div className="spacer" />
          <ButtonLink to="/sign-in" variant="ghost">
            Sign in
          </ButtonLink>
          <ButtonLink to="/register" variant="primary">
            Create free account
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
            {link.label}
          </Link>
        ))}
      </footer>
    </>
  );
}
