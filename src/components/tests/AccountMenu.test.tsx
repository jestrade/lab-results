import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders, signedInAuth } from '@/test/renderWithProviders';
import { expectNoA11yViolations } from '@/test/axe';
import type { HealthContext, UserProfile } from '@/domain/types';
import { AccountMenu } from '../AccountMenu';

// Mocked rather than allowed through: `subscribeToProfile` reaches
// `getDb()`, which throws when the Firebase config is absent — as it is in
// CI, which has no root `.env`.
const subscribeToProfile = vi.hoisted(() => vi.fn());
vi.mock('@/services/profiles', () => ({ subscribeToProfile }));

function stamp(iso: string) {
  return { toDate: () => new Date(iso) } as never;
}

function makeContext(overrides: Partial<HealthContext> = {}): HealthContext {
  return {
    dateOfBirth: null,
    biologicalSex: null,
    pregnancyStatus: null,
    weightKg: null,
    heightCm: null,
    medications: null,
    conditions: null,
    familyConditions: null,
    ongoingSymptoms: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: 'test-uid',
    email: 'test@example.com',
    displayName: 'Test User',
    role: 'user',
    disabled: false,
    consents: {
      termsAcceptedAt: stamp('2026-01-01'),
      aiProcessingAcceptedAt: stamp('2026-01-01'),
      documentsVersion: '2026-07-01',
    },
    preferences: { notifyOnProcessed: true, notifyOnCritical: true },
    healthContext: null,
    identityDocument: null,
    createdAt: stamp('2026-01-15T12:00:00Z'),
    updatedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

/** Deliver a profile to whichever subscription the open panel made. */
function emit(profile: UserProfile | null) {
  act(() => {
    (subscribeToProfile.mock.calls.at(-1)?.[1] as (p: UserProfile | null) => void)(profile);
  });
}

function renderMenu(auth = signedInAuth(), onSignOut = vi.fn()) {
  const result = renderWithProviders(<AccountMenu onSignOut={onSignOut} />, { auth });
  return { ...result, onSignOut };
}

function trigger() {
  return screen.getByRole('button', { name: /Account menu/ });
}

describe('AccountMenu', () => {
  beforeEach(() => {
    subscribeToProfile.mockReset();
    subscribeToProfile.mockReturnValue(() => {});
  });

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

  it('does not listen to the profile until the panel is opened', async () => {
    // A listener held on every page is a Firestore read per navigation for a
    // panel most readers never open.
    const user = userEvent.setup();
    renderMenu();

    expect(subscribeToProfile).not.toHaveBeenCalled();
    await user.click(trigger());
    expect(subscribeToProfile).toHaveBeenCalledWith(
      'test-uid',
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('lists the record behind the avatar, headings first', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    emit(
      makeProfile({
        identityDocument: {
          type: 'cedula',
          number: '1020304050',
          placeOfIssue: 'Bogotá',
          updatedAt: null,
        },
        healthContext: makeContext({
          weightKg: 70,
          heightCm: 175,
          conditions: 'Hypothyroidism',
          familyConditions: 'Type 2 diabetes — father',
        }),
      }),
    );

    expect(await screen.findByText('Identity document')).toBeInTheDocument();
    expect(screen.getByText('Body mass index')).toBeInTheDocument();
    expect(screen.getByText('Ongoing conditions')).toBeInTheDocument();
    expect(screen.getByText('Family illnesses')).toBeInTheDocument();
  });

  it('carries the saved value on the row itself, not only on hover', async () => {
    // Hover is the convenience. The value lives in the row's accessible name,
    // so a screen reader and a phone both reach it without one.
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    emit(
      makeProfile({
        healthContext: makeContext({ familyConditions: 'Type 2 diabetes — father' }),
      }),
    );

    expect(
      await screen.findByRole('button', { name: /Family illnesses.*Type 2 diabetes — father/ }),
    ).toBeInTheDocument();
  });

  it('shows the index beside the two numbers it was computed from', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    emit(makeProfile({ healthContext: makeContext({ weightKg: 70, heightCm: 175 }) }));

    expect(await screen.findByText('22.9')).toBeInTheDocument();
    // A ratio with no sight of its inputs is a number nobody can check.
    expect(screen.getByText('70 kg · 175 cm')).toBeInTheDocument();
  });

  it('never signals with colour alone', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    emit(makeProfile({ healthContext: makeContext({ weightKg: 95, heightCm: 175 }) }));

    // The dot is aria-hidden and decorative. What must survive greyscale is
    // the band's name beside it.
    expect(await screen.findByText('Obesity')).toBeInTheDocument();
  });

  it('says the bands are an adult scale wherever it shows one', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    emit(makeProfile({ healthContext: makeContext({ weightKg: 70, heightCm: 175 }) }));

    expect(await screen.findByText(/apply to adults only/i)).toBeInTheDocument();
  });

  it('draws the index even when there is nothing to compute it from', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    emit(makeProfile());

    // A figure that comes and goes as the profile is filled in reads as the
    // app losing it. It reads `—` instead.
    expect(await screen.findByText('Body mass index')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    // No band, so no caveat about a scale that is not being shown.
    expect(screen.queryByText(/apply to adults only/i)).not.toBeInTheDocument();
  });

  it('keeps the measurements without claiming an index from one of them', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    emit(makeProfile({ healthContext: makeContext({ weightKg: 70 }) }));

    expect(await screen.findByText('70 kg')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('leaves out the fields the reader never filled in', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    emit(makeProfile({ healthContext: makeContext({ conditions: 'Hypothyroidism' }) }));

    // A row per empty field would fill the panel with the shape of a record
    // that does not exist.
    expect(await screen.findByText('Ongoing conditions')).toBeInTheDocument();
    expect(screen.queryByText('Medications')).not.toBeInTheDocument();
    expect(screen.queryByText('Date of birth')).not.toBeInTheDocument();
  });

  it('offers a way to fill the record in when there is nothing saved', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    emit(makeProfile());

    expect(await screen.findByText(/Nothing saved here yet/)).toBeInTheDocument();
    // The index is drawn regardless, so "nothing saved" is about the rows.
    expect(screen.getByText('Body mass index')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Fill in your profile/ })).toHaveAttribute(
      'href',
      '/profile',
    );
  });

  it('opens a row on click, for a screen with no hover to give', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(trigger());
    emit(makeProfile({ healthContext: makeContext({ conditions: 'Hypothyroidism' }) }));

    const row = await screen.findByRole('button', { name: /Ongoing conditions/ });
    expect(row).not.toHaveAttribute('data-pinned');

    await user.click(row);
    expect(row).toHaveAttribute('data-pinned', 'true');
    // Still open — pressing a row is using the panel, not dismissing it.
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
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
