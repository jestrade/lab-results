import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';

import { anonymousAuth, renderWithProviders, signedInAuth } from '@/test/renderWithProviders';
import type { AuthContextValue } from './AuthContext';
import { LandingRedirect, RedirectIfSignedIn, RequireAuth, RequireRole } from './guards';

/** Reports where the guard sent the browser. */
function Where() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

function renderGuards(auth: AuthContextValue, route: string) {
  return renderWithProviders(
    <>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route element={<RequireRole role="admin" />}>
            <Route path="/admin" element={<div>admin console</div>} />
          </Route>
        </Route>
        <Route element={<RedirectIfSignedIn />}>
          <Route path="/sign-in" element={<div>sign-in form</div>} />
        </Route>
        <Route path="/dashboard" element={<LandingRedirect />} />
        <Route path="/variables" element={<div>my results</div>} />
      </Routes>
      <Where />
    </>,
    { auth, route },
  );
}

describe('RequireRole', () => {
  it('lets an admin through', () => {
    renderGuards(signedInAuth({ role: 'admin', isAdmin: true }), '/admin');
    expect(screen.getByText('admin console')).toBeInTheDocument();
  });

  it('sends a reader to their own home rather than to a refusal', () => {
    renderGuards(signedInAuth({ role: 'user' }), '/admin');

    expect(screen.queryByText('admin console')).not.toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/variables');
  });

  it('waits rather than deciding while the session is still resolving', () => {
    // Deciding on a null role mid-resolution would bounce an admin out of the
    // console on every hard refresh.
    renderGuards(signedInAuth({ role: null, loading: true }), '/admin');
    expect(screen.queryByText('admin console')).not.toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/admin');
  });
});

describe('LandingRedirect', () => {
  it('sends an admin to the system overview', () => {
    renderGuards(signedInAuth({ role: 'admin', isAdmin: true }), '/dashboard');
    expect(screen.getByText('admin console')).toBeInTheDocument();
  });

  it('sends a reader to their results', () => {
    renderGuards(signedInAuth({ role: 'user' }), '/dashboard');
    expect(screen.getByText('my results')).toBeInTheDocument();
  });
});

describe('RedirectIfSignedIn', () => {
  it('leaves a signed-out visitor on the form', () => {
    renderGuards(anonymousAuth, '/sign-in');
    expect(screen.getByText('sign-in form')).toBeInTheDocument();
  });

  it('bounces a signed-in admin to the overview, not to the reader home', () => {
    renderGuards(signedInAuth({ role: 'admin', isAdmin: true }), '/sign-in');
    expect(screen.getByText('admin console')).toBeInTheDocument();
  });

  it('bounces a signed-in reader to their results', () => {
    renderGuards(signedInAuth({ role: 'user' }), '/sign-in');
    expect(screen.getByText('my results')).toBeInTheDocument();
  });
});
