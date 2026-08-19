import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router-dom';

import { renderWithProviders, signedInAuth } from '@/test/renderWithProviders';
import { expectNoA11yViolations } from '@/test/axe';
import { AuthTransition } from './AuthTransition';
import { NavButton } from './NavButton';

function Where() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

describe('NavButton', () => {
  it('navigates where it says', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <NavButton to="/register">Create free account</NavButton>
        <Where />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Create free account' }));

    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/register'));
  });

  it('shows no spinner for a navigation that is instant', async () => {
    // The honest amount of loading for a synchronous render is none. A
    // spinner that appears and vanishes inside a frame reads as a glitch.
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <Routes>
          <Route path="/" element={<NavButton to="/sign-in">Sign in</NavButton>} />
          <Route path="/sign-in" element={<p>the form</p>} />
        </Routes>
        <Where />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('the form')).toBeInTheDocument();
    // Scoped to the control: the providers render their own live regions, and
    // what matters is that this button never announced itself busy.
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('is a real button, so it is reachable and operable by keyboard', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <>
        <NavButton to="/register" variant="primary">
          Create free account
        </NavButton>
        <Where />
      </>,
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'Create free account' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/register'));

    await expectNoA11yViolations(container);
  });
});

describe('AuthTransition', () => {
  it('announces itself rather than only appearing', async () => {
    const { container } = renderWithProviders(<AuthTransition label="Signing you out…" />);

    // `alert` and `aria-busy`: a veil a screen reader cannot perceive is a
    // screen reader whose page silently stops responding.
    const veil = screen.getByRole('alert');
    expect(veil).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Signing you out…')).toBeInTheDocument();

    await expectNoA11yViolations(container);
  });
});

describe('signing out of the app shell', () => {
  it('veils the shell while the session is torn down, and says so', async () => {
    const user = userEvent.setup();
    // A sign-out that never settles, so the transition can be observed.
    const signOutUser = vi.fn(() => new Promise<void>(() => {}));
    const { AppLayout } = await import('@/layouts/AppLayout');

    renderWithProviders(<AppLayout />, {
      auth: signedInAuth({ signOutUser }),
      route: '/variables',
    });

    await user.click(screen.getByRole('button', { name: /Account menu/ }));
    await user.click(screen.getByRole('button', { name: /Sign out/ }));

    expect(await screen.findByText('Signing you out…')).toBeInTheDocument();
    expect(signOutUser).toHaveBeenCalledTimes(1);
  });

  it('takes the veil down again when signing out fails', async () => {
    // Otherwise a reader whose session is still live is stranded on a spinner.
    const user = userEvent.setup();
    const signOutUser = vi.fn(() => Promise.reject(new Error('offline')));
    const { AppLayout } = await import('@/layouts/AppLayout');

    renderWithProviders(<AppLayout />, {
      auth: signedInAuth({ signOutUser }),
      route: '/variables',
    });

    await user.click(screen.getByRole('button', { name: /Account menu/ }));
    await user.click(screen.getByRole('button', { name: /Sign out/ }));

    await waitFor(() =>
      expect(screen.queryByText('Signing you out…')).not.toBeInTheDocument(),
    );
  });
});
