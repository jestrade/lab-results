import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders, signedInAuth } from '@/test/renderWithProviders';
import { expectNoA11yViolations } from '@/test/axe';
import { AccountSettings } from './AccountSettings';

const grant = vi.hoisted(() => vi.fn());
const withdraw = vi.hoisted(() => vi.fn());
const consentState = vi.hoisted(() => ({ value: null as unknown }));

vi.mock('@/hooks/useAiConsent', () => ({ useAiConsent: () => consentState.value }));

function makeConsent(overrides: Record<string, unknown> = {}) {
  return {
    loading: false,
    granted: true,
    acceptedAt: new Date('2026-08-04T00:00:00Z'),
    grant,
    withdraw,
    saving: false,
    error: null,
    ...overrides,
  };
}

const render = () =>
  renderWithProviders(<AccountSettings />, { auth: signedInAuth(), route: '/settings' });

describe('AccountSettings — AI processing', () => {
  beforeEach(() => {
    grant.mockReset();
    withdraw.mockReset();
    consentState.value = makeConsent();
  });

  it('shows the current state rather than making the user guess', () => {
    render();
    expect(screen.getByText('Agreed')).toBeInTheDocument();
    expect(screen.getByText(/you agreed on/i)).toBeInTheDocument();
  });

  it('states the limits of redaction instead of implying anonymity', () => {
    // Consent given against a rosier description than the truth is not consent
    // to what actually happens.
    render();
    expect(screen.getByText(/not full anonymisation/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot be reliably removed/i)).toBeInTheDocument();
    expect(screen.getByText(/used to improve their products/i)).toBeInTheDocument();
  });

  it('says the original PDF is never sent, and that classification is not the AI', () => {
    render();
    expect(screen.getByText(/original PDF is never sent/i)).toBeInTheDocument();
    expect(screen.getByText(/not decided by the AI/i)).toBeInTheDocument();
  });

  it('offers withdrawal, and confirms before acting', async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole('button', { name: /withdraw consent/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/nothing is sent to the AI provider/i)).toBeInTheDocument();
    expect(withdraw).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: /withdraw consent/i }));
    expect(withdraw).toHaveBeenCalled();
  });

  it('is explicit that withdrawing does not delete existing results', async () => {
    const user = userEvent.setup();
    render();
    await user.click(screen.getByRole('button', { name: /withdraw consent/i }));
    expect(screen.getByText(/keep their results/i)).toBeInTheDocument();
  });

  it('lets a user who has not agreed do so from here', async () => {
    const user = userEvent.setup();
    consentState.value = makeConsent({ granted: false, acceptedAt: null });
    render();

    expect(screen.getByText('Not agreed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /i understand and agree/i }));
    expect(grant).toHaveBeenCalled();
  });

  it('has no serious accessibility violations', async () => {
    const { container } = render();
    await expectNoA11yViolations(container);
  });
});
