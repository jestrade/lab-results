/**
 * Authenticated application shell (KAN-25).
 *
 * Desktop is the design board's fixed sidebar. Below `lg` the same sidebar
 * becomes an off-canvas drawer — same markup, same links, same order, so there
 * is one navigation to maintain rather than a desktop one and a mobile one that
 * drift apart.
 *
 * The drawer closes on route change and on Escape, and the toggle reports its
 * state with `aria-expanded`.
 */

import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { AccountMenu } from '@/components/AccountMenu';
import { Icon } from '@/components/Icon';
import { formatWeekdayDate } from '@/i18n/dates';
import { useI18n } from '@/i18n/useI18n';
import type { MessageKey } from '@/i18n/messages';

/**
 * Navigation carries a message *key*, not a label. The array is defined once
 * at module scope and translated at render, so switching language re-labels
 * the sidebar without rebuilding the route table.
 */
interface NavItem {
  to: string;
  label: MessageKey;
  icon: string;
}

// Variables leads: with the dashboard gone it is the app's home, and the first
// entry in the sidebar is what a reader takes "the main page" to mean.
const PRIMARY_NAV: NavItem[] = [
  { to: '/variables', label: 'nav.variables', icon: 'house' },
  { to: '/upload', label: 'nav.upload', icon: 'upload-simple' },
  { to: '/files', label: 'nav.files', icon: 'files' },
];

const ACCOUNT_NAV: NavItem[] = [
  { to: '/profile', label: 'nav.profile', icon: 'user' },
  { to: '/settings', label: 'nav.settings', icon: 'gear' },
];

const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'nav.adminOverview', icon: 'shield-check' },
  { to: '/admin/users', label: 'nav.adminUsers', icon: 'users-three' },
  { to: '/admin/variables', label: 'nav.adminVariables', icon: 'flask' },
  { to: '/admin/jobs', label: 'nav.adminJobs', icon: 'queue' },
];

export function AppLayout() {
  const { isAdmin, signOutUser } = useAuth();
  const { t, locale } = useI18n();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Navigating with the drawer open would leave it covering the new page.
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  async function handleSignOut() {
    await signOutUser();
    navigate('/', { replace: true });
  }

  const navGroups: { heading?: MessageKey; items: NavItem[] }[] = [
    { items: PRIMARY_NAV },
    { heading: 'nav.account', items: ACCOUNT_NAV },
  ];
  if (isAdmin) {
    navGroups.push({ heading: 'nav.administration', items: ADMIN_NAV });
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        {t('common.skipToContent')}
      </a>

      <button
        type="button"
        className="app-sidebar-scrim"
        data-open={drawerOpen}
        aria-label={t('nav.closeNavigation')}
        onClick={() => setDrawerOpen(false)}
      />

      <nav
        id="app-sidebar"
        className="app-sidebar"
        data-open={drawerOpen}
        aria-label={t('nav.main')}
      >
        <div className="app-sidebar-brand">
          <span className="brand">LabResults</span>
          <span className="app-sidebar-tagline">{t('common.brandTagline')}</span>
        </div>

        {navGroups.map((group, index) => (
          <div className="app-nav-group" key={group.heading ?? index}>
            {group.heading ? <div className="app-nav-heading">{t(group.heading)}</div> : null}
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/admin'}
                className="app-nav-link"
              >
                <Icon name={item.icon} size={18} />
                {t(item.label)}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="app-main">
        <div className="app-topbar">
          <button
            type="button"
            className="btn btn-secondary btn-icon sidebar-toggle"
            aria-expanded={drawerOpen}
            aria-controls="app-sidebar"
            onClick={() => setDrawerOpen((open) => !open)}
          >
            <Icon name="list" size={18} />
            <span className="sr-only">{t('nav.navigation')}</span>
          </button>

          <span className="app-topbar-date">{formatWeekdayDate(new Date(), locale)}</span>
          <div className="spacer" />
          {/* The address, the role, the verification state, the language and
              the way out all live in here now. Five controls spread across the
              bar wrapped onto a second row on a narrow screen and competed
              with the page on a wide one; what they have in common is that
              they are all about the account rather than about the page. */}
          <AccountMenu onSignOut={() => void handleSignOut()} />
        </div>
        <div className="app-topbar-rule" />

        <main className="app-content" id="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
