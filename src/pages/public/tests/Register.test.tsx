import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { anonymousAuth, renderWithProviders } from '@/test/renderWithProviders';
import { expectNoA11yViolations } from '@/test/axe';
import { Register } from '../Register';

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/full name/i), 'Miriam Okonkwo');
  await user.type(screen.getByLabelText(/email address/i), 'm.okonkwo@example.com');
  await user.type(screen.getByLabelText(/^password$/i), 'a-long-enough-password');
}

describe('Register', () => {
  it('will not create an account until both consents are given', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWithProviders(<Register />, { auth: { ...anonymousAuth, register } });
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    // Consent to AI processing of health documents is not something to infer
    // from a half-completed form.
    expect(register).not.toHaveBeenCalled();
    expect(await screen.findByText(/both confirmations are required/i)).toBeInTheDocument();
  });

  it('requires the AI-processing consent separately from the terms', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWithProviders(<Register />, { auth: { ...anonymousAuth, register } });
    await fillValidForm(user);
    await user.click(screen.getByRole('checkbox', { name: /I have read the Terms/i }));
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(register).not.toHaveBeenCalled();
  });

  it('registers once the form is complete', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWithProviders(<Register />, { auth: { ...anonymousAuth, register } });
    await fillValidForm(user);
    await user.click(screen.getByRole('checkbox', { name: /I have read the Terms/i }));
    await user.click(screen.getByRole('checkbox', { name: /third-party AI provider/i }));
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(register).toHaveBeenCalledWith({
      name: 'Miriam Okonkwo',
      email: 'm.okonkwo@example.com',
      password: 'a-long-enough-password',
      acceptedTerms: true,
      acceptedAiProcessing: true,
    });
  });

  it('rejects a password under the minimum length, with the reason on the field', async () => {
    const register = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<Register />, { auth: { ...anonymousAuth, register } });
    await user.type(screen.getByLabelText(/full name/i), 'Miriam Okonkwo');
    await user.type(screen.getByLabelText(/email address/i), 'm.okonkwo@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'short');
    await user.click(screen.getByRole('checkbox', { name: /I have read the Terms/i }));
    await user.click(screen.getByRole('checkbox', { name: /third-party AI provider/i }));
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(register).not.toHaveBeenCalled();
    const field = screen.getByLabelText(/^password$/i);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    // The message must be reachable from the field, not just floating nearby.
    expect(field.getAttribute('aria-describedby')).toBeTruthy();
    // Scoped to the field's own error node — the strength meter's advice text
    // says something similar, and matching that would prove nothing.
    expect(screen.getByRole('alert')).toHaveTextContent(/at least 10 characters/i);
  });

  it('links each consent to the document it refers to', () => {
    renderWithProviders(<Register />);
    expect(screen.getByRole('link', { name: /^terms$/i })).toHaveAttribute('href', '/legal/terms');
    expect(screen.getByRole('link', { name: /medical disclaimer/i })).toHaveAttribute(
      'href',
      '/legal/medical-disclaimer',
    );
    expect(screen.getByRole('link', { name: /what is sent/i })).toHaveAttribute(
      'href',
      '/legal/ai-processing',
    );
  });

  it('has no serious accessibility violations', async () => {
    const { container } = renderWithProviders(<Register />);
    await expectNoA11yViolations(container);
  });
});
