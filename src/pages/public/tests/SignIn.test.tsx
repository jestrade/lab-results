import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { anonymousAuth, renderWithProviders } from '@/test/renderWithProviders';
import { expectNoA11yViolations } from '@/test/axe';
import { SignIn } from '../SignIn';

describe('SignIn', () => {
  it('signs in with the entered credentials', async () => {
    const signInWithEmail = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWithProviders(<SignIn />, { auth: { ...anonymousAuth, signInWithEmail } });

    await user.type(screen.getByLabelText(/email address/i), 'm.okonkwo@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'correct horse battery');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(signInWithEmail).toHaveBeenCalledWith('m.okonkwo@example.com', 'correct horse battery');
  });

  it('shows a non-revealing error when credentials are rejected', async () => {
    const signInWithEmail = vi.fn().mockRejectedValue({ code: 'auth/invalid-credential' });
    const user = userEvent.setup();

    renderWithProviders(<SignIn />, { auth: { ...anonymousAuth, signInWithEmail } });

    await user.type(screen.getByLabelText(/email address/i), 'nobody@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/don't match/i);
    // It must not say the account does not exist.
    expect(alert).not.toHaveTextContent(/no account|not found|does not exist/i);
  });

  it('announces the error to assistive tech', async () => {
    const signInWithEmail = vi.fn().mockRejectedValue({ code: 'auth/invalid-credential' });
    const user = userEvent.setup();

    renderWithProviders(<SignIn />, { auth: { ...anonymousAuth, signInWithEmail } });

    await user.type(screen.getByLabelText(/email address/i), 'a@b.co');
    await user.type(screen.getByLabelText(/^password$/i), 'nope');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
    });
  });

  it('offers Google sign-in', async () => {
    const signInWithGoogle = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWithProviders(<SignIn />, { auth: { ...anonymousAuth, signInWithGoogle } });
    await user.click(screen.getByRole('button', { name: /continue with google/i }));

    expect(signInWithGoogle).toHaveBeenCalled();
  });

  it('links to password reset and registration', () => {
    renderWithProviders(<SignIn />);
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(screen.getByRole('link', { name: /create an account/i })).toHaveAttribute(
      'href',
      '/register',
    );
  });

  it('has no serious accessibility violations', async () => {
    const { container } = renderWithProviders(<SignIn />);
    await expectNoA11yViolations(container);
  });
});
