import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders, signedInAuth } from '@/test/renderWithProviders';
import { expectNoA11yViolations } from '@/test/axe';
import { AccountMenu } from '../AccountMenu';

function renderMenu(auth = signedInAuth(), onSignOut = vi.fn()) {
  const result = renderWithProviders(<AccountMenu onSignOut={onSignOut} />, { auth });
  return { ...result, onSignOut };
}

function trigger() {
  return screen.getByRole('button', { name: /Account menu/ });
}

describe('AccountMenu', () => {
  it('shows one control, not five, until it is opened', () => {
    renderMenu();

    expect(screen.getByRole('button', { name: /test@example\.com/ })).toBeInTheDocument();
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Language')).not.toBeInTheDocument();
  });

  it('names the account, so two open windows are tellable apart', () => {
    renderMenu();
    expect(trigger()).toHaveAccessibleName('Account menu — test@example.com');
  });

  it('reports whether it is open', async () => {
    const user = userEvent.setup();
    renderMenu();

    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    await user.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  });

  it('gathers the address, the state, the language and the way out', async () => {
    const user = userEvent.setup();
    renderMenu(signedInAuth({ role: 'admin', isAdmin: true }));

    await user.click(trigger());

    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByLabelText('Language')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign out/ })).toBeInTheDocument();
  });

  it('keeps the role out of the bar but not out of the account', async () => {
    const user = userEvent.setup();
    renderMenu(signedInAuth({ role: 'user' }));

    await user.click(trigger());
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('hands sign-out back to the layout', async () => {
    const user = userEvent.setup();
    const { onSignOut } = renderMenu();

    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: /Sign out/ }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and gives focus back to the trigger', async () => {
    // Otherwise focus falls to the top of the document and a keyboard reader
    // has to tab through the whole page to get back.
    const user = userEvent.setup();
    renderMenu();

    await user.click(trigger());
    await user.keyboard('{Escape}');

    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).toHaveFocus();
  });

  it('closes when something outside it is pressed', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <AccountMenu onSignOut={() => {}} />
        <button type="button">Elsewhere</button>
      </>,
      { auth: signedInAuth() },
    );

    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));

    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('stays open while the panel itself is being used', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(trigger());
    await user.click(screen.getByText('test@example.com'));

    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps its controls out of the tab order while shut', async () => {
    // A hidden panel left in the DOM is a keyboard reader tabbing through
    // controls they cannot see.
    const user = userEvent.setup();
    renderMenu();

    await user.tab();
    expect(trigger()).toHaveFocus();
    await user.tab();
    expect(trigger()).not.toHaveFocus();
    expect(screen.queryByRole('button', { name: /Sign out/ })).not.toBeInTheDocument();
  });

  it('has no accessibility violations, open or shut', async () => {
    const user = userEvent.setup();
    const { container } = renderMenu(signedInAuth({ role: 'admin', isAdmin: true }));

    await expectNoA11yViolations(container);
    await user.click(trigger());
    await expectNoA11yViolations(container);
  });
});

describe('an unverified address', () => {
  const unverified = signedInAuth({ isEmailVerified: false });

  it('is flagged on the trigger even while the panel is shut', () => {
    // The one status that survives the collapse: it is a task the account has
    // to finish before it can upload, not a fact about it.
    const { container } = renderMenu(unverified);
    expect(container.querySelector('.account-dot')).toBeInTheDocument();
  });

  it('offers the way to finish it rather than only naming it', async () => {
    const user = userEvent.setup();
    renderMenu(unverified);

    await user.click(trigger());

    expect(screen.getByText('Unverified')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Verify your email address/ }),
    ).toHaveAttribute('href', '/verify-email');
  });

  it('leaves no dot once the address is verified', () => {
    const { container } = renderMenu(signedInAuth({ isEmailVerified: true }));
    expect(container.querySelector('.account-dot')).not.toBeInTheDocument();
  });
});

describe('the avatar letter', () => {
  it('comes from the address, which every account has', () => {
    renderMenu(signedInAuth({ user: { email: 'ana@example.com' } as never }));
    expect(within(trigger()).getByText('A')).toBeInTheDocument();
  });

  it('falls back rather than rendering an empty circle', () => {
    renderMenu(signedInAuth({ user: { email: '' } as never }));
    expect(within(trigger()).getByText('·')).toBeInTheDocument();
  });
});
