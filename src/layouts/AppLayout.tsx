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
import { Icon } from '@/components/Icon';
import { Tag } from '@/components/Tag';

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const PRIMARY_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'squares-four' },
  { to: '/upload', label: 'Upload report', icon: 'upload-simple' },
  { to: '/reports', label: 'Reports', icon: 'files' },
  { to: '/variables', label: 'Laboratory variables', icon: 'flask' },
  { to: '/trends', label: 'Trend analysis', icon: 'chart-line' },
];

const ACCOUNT_NAV: NavItem[] = [
  { to: '/profile', label: 'Profile', icon: 'user' },
  { to: '/settings', label: 'Account settings', icon: 'gear' },
];

function formatToday(): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

export function AppLayout() {
  const { user, isEmailVerified, isAdmin, signOutUser } = useAuth();
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

  const navGroups: { heading?: string; items: NavItem[] }[] = [
    { items: PRIMARY_NAV },
    { heading: 'Account', items: ACCOUNT_NAV },
  ];
  if (isAdmin) {
    navGroups.push({
      heading: 'Administration',
      items: [
        { to: '/admin', label: 'Admin overview', icon: 'shield-check' },
        { to: '/admin/users', label: 'Users', icon: 'users-three' },
        { to: '/admin/jobs', label: 'Processing jobs', icon: 'queue' },
      ],
    });
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <button
        type="button"
        className="app-sidebar-scrim"
        data-open={drawerOpen}
        aria-label="Close navigation"
        onClick={() => setDrawerOpen(false)}
      />

      <nav id="app-sidebar" className="app-sidebar" data-open={drawerOpen} aria-label="Main">
        <div className="app-sidebar-brand">
          <span className="brand">LabResults</span>
          <span className="app-sidebar-tagline">Result archive &amp; trends</span>
        </div>

        {navGroups.map((group, index) => (
          <div className="app-nav-group" key={group.heading ?? index}>
            {group.heading ? <div className="app-nav-heading">{group.heading}</div> : null}
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/admin'}
                className="app-nav-link"
              >
                <Icon name={item.icon} size={18} />
                {item.label}
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
            <span className="sr-only">Navigation</span>
          </button>

          <span className="app-topbar-date">{formatToday()}</span>
          <div className="spacer" />
          <span style={{ fontSize: 13 }}>{user?.email}</span>
          {isEmailVerified ? (
            <Tag tone="neutral">
              <Icon name="seal-check" size={13} />
              <span style={{ marginLeft: 5 }}>Verified</span>
            </Tag>
          ) : (
            <Tag tone="accent-2">
              <Icon name="warning" size={13} />
              <span style={{ marginLeft: 5 }}>Unverified</span>
            </Tag>
          )}
          <button type="button" className="btn btn-ghost" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
        <div className="app-topbar-rule" />

        <main className="app-content" id="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
