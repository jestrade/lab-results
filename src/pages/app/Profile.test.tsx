import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders, signedInAuth } from '@/test/renderWithProviders';
import { expectNoA11yViolations } from '@/test/axe';
import type { AuthContextValue } from '@/auth/AuthContext';
import type { UserProfile } from '@/domain/types';
import type * as AccountModule from '@/services/account';
import { Profile } from './Profile';

const subscribeToProfile = vi.hoisted(() => vi.fn());
const updateDisplayName = vi.hoisted(() => vi.fn());
const updateHealthContext = vi.hoisted(() => vi.fn());
const clearHealthContext = vi.hoisted(() => vi.fn());
const changePassword = vi.hoisted(() => vi.fn());
const syncAuthDisplayName = vi.hoisted(() => vi.fn());

vi.mock('@/services/profiles', () => ({
  subscribeToProfile,
  updateDisplayName,
  updateHealthContext,
  clearHealthContext,
}));

vi.mock('@/services/account', async (importOriginal) => {
  const actual = await importOriginal<typeof AccountModule>();
  return { ...actual, changePassword, syncAuthDisplayName };
});

function stamp(iso: string) {
  return { toDate: () => new Date(iso) } as never;
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
    // Midday rather than midnight: `createdAt` is a genuine instant, so it is
    // correctly rendered in the reader's own timezone. A midnight-UTC fixture
    // would land on the previous day for anyone west of UTC and make this
    // assertion fail on their machine and not on mine.
    createdAt: stamp('2026-01-15T12:00:00Z'),
    updatedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

/** A user who signed up with email and password. */
function passwordUser(overrides: Partial<AuthContextValue> = {}) {
  return signedInAuth({
    user: {
      uid: 'test-uid',
      email: 'test@example.com',
      displayName: 'Test User',
      providerData: [{ providerId: 'password' }],
    } as never,
    ...overrides,
  });
}

/** A user who only ever signed in with Google — no password exists. */
function googleUser(overrides: Partial<AuthContextValue> = {}) {
  return signedInAuth({
    user: {
      uid: 'test-uid',
      email: 'test@example.com',
      displayName: 'Test User',
      providerData: [{ providerId: 'google.com' }],
    } as never,
    ...overrides,
  });
}

function emit(profile: UserProfile | null) {
  act(() => {
    (subscribeToProfile.mock.calls.at(-1)?.[1] as (p: UserProfile | null) => void)(profile);
  });
}

function renderPage(auth = passwordUser()) {
  return renderWithProviders(<Profile />, { auth, route: '/profile' });
}

describe('Profile', () => {
  beforeEach(() => {
    subscribeToProfile.mockReset();
    subscribeToProfile.mockReturnValue(() => {});
    updateDisplayName.mockReset().mockResolvedValue(undefined);
    updateHealthContext.mockReset().mockResolvedValue(undefined);
    clearHealthContext.mockReset().mockResolvedValue(undefined);
    changePassword.mockReset().mockResolvedValue(undefined);
    syncAuthDisplayName.mockReset().mockResolvedValue(undefined);
  });

  it('saves a changed display name to both the profile and the auth record', async () => {
    const user = userEvent.setup();
    renderPage();
    emit(makeProfile());

    const input = await screen.findByLabelText(/display name/i);
    await user.clear(input);
    await user.type(input, 'Jesus Estrada');
    await user.click(screen.getByRole('button', { name: /save name/i }));

    expect(updateDisplayName).toHaveBeenCalledWith('test-uid', 'Jesus Estrada');
    // Auth holds its own copy, and the sidebar reads that one first — writing
    // only Firestore leaves a stale name on screen.
    expect(syncAuthDisplayName).toHaveBeenCalledWith(expect.anything(), 'Jesus Estrada');
  });

  it('refuses an empty display name instead of blanking the account', async () => {
    const user = userEvent.setup();
    renderPage();
    emit(makeProfile());

    await user.clear(await screen.findByLabelText(/display name/i));
    await user.click(screen.getByRole('button', { name: /save name/i }));

    expect(screen.getByText(/name cannot be empty/i)).toBeInTheDocument();
    expect(updateDisplayName).not.toHaveBeenCalled();
  });

  it('shows the email read-only and explains why it cannot be changed here', async () => {
    renderPage();
    emit(makeProfile());

    const email = await screen.findByLabelText(/email address/i);
    expect(email).toBeDisabled();
    expect(email).toHaveValue('test@example.com');
    expect(screen.getByText(/verified-change flow/i)).toBeInTheDocument();
  });

  it('offers to resend verification only when the email is unverified', async () => {
    renderPage(passwordUser({ isEmailVerified: false }));
    emit(makeProfile());

    expect(await screen.findByText('Not verified')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resend verification/i })).toBeInTheDocument();
  });

  it('hides the resend button once verified', async () => {
    renderPage();
    emit(makeProfile());

    expect(await screen.findByText('Verified')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resend verification/i })).not.toBeInTheDocument();
  });

  it('requires the current password before changing it', async () => {
    const user = userEvent.setup();
    renderPage();
    emit(makeProfile());

    await user.type(await screen.findByLabelText(/current password/i), 'old-password-1');
    await user.type(screen.getByLabelText('New password'), 'new-password-9');
    await user.type(screen.getByLabelText(/confirm new password/i), 'new-password-9');
    await user.click(screen.getByRole('button', { name: /change password/i }));

    // Proving the current password is what stops someone at an unlocked laptop
    // from locking the owner out of their own records.
    expect(changePassword).toHaveBeenCalledWith(
      expect.anything(),
      'old-password-1',
      'new-password-9',
    );
  });

  it('will not submit when the two new passwords differ', async () => {
    const user = userEvent.setup();
    renderPage();
    emit(makeProfile());

    await user.type(await screen.findByLabelText(/current password/i), 'old-password-1');
    await user.type(screen.getByLabelText('New password'), 'new-password-9');
    await user.type(screen.getByLabelText(/confirm new password/i), 'new-password-8');
    await user.click(screen.getByRole('button', { name: /change password/i }));

    expect(screen.getByText(/do not match/i)).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('will not submit a new password that fails the strength rule', async () => {
    const user = userEvent.setup();
    renderPage();
    emit(makeProfile());

    await user.type(await screen.findByLabelText(/current password/i), 'old-password-1');
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.type(screen.getByLabelText(/confirm new password/i), 'short');
    await user.click(screen.getByRole('button', { name: /change password/i }));

    expect(changePassword).not.toHaveBeenCalled();
  });

  it('offers no password form to a Google-only account, and says why', async () => {
    renderPage(googleUser());
    emit(makeProfile());

    // The form would be offering something that cannot work: there is no
    // password on this account to re-authenticate against.
    expect(await screen.findByText(/you sign in with google/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument();
  });

  it('surfaces a rejected password change rather than claiming success', async () => {
    const user = userEvent.setup();
    changePassword.mockRejectedValue({ code: 'auth/wrong-password' });
    renderPage();
    emit(makeProfile());

    await user.type(await screen.findByLabelText(/current password/i), 'wrong-password-1');
    await user.type(screen.getByLabelText('New password'), 'new-password-9');
    await user.type(screen.getByLabelText(/confirm new password/i), 'new-password-9');
    await user.click(screen.getByRole('button', { name: /change password/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(/your password has been changed/i)).not.toBeInTheDocument();
  });

  it('marks the health context optional and denies it is a medical assessment', async () => {
    renderPage();
    emit(makeProfile());

    expect(await screen.findByText('Optional')).toBeInTheDocument();
    expect(screen.getByText(/does not make the analysis a medical assessment/i)).toBeInTheDocument();
    // The product's central promise: classification is arithmetic, not context.
    expect(screen.getByText(/always calculated from the reference range/i)).toBeInTheDocument();
  });

  it('says plainly that the context is not yet read by the analysis', async () => {
    renderPage();
    emit(makeProfile());

    // A form claiming to improve analysis while feeding nothing would be a lie.
    expect(await screen.findByText(/not yet used for analysis/i)).toBeInTheDocument();
  });

  it('saves the health context the user entered', async () => {
    const user = userEvent.setup();
    renderPage();
    emit(makeProfile());

    await user.selectOptions(await screen.findByLabelText(/biological sex/i), 'female');
    await user.type(screen.getByLabelText(/^medications/i), 'Levothyroxine 50mcg');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateHealthContext).toHaveBeenCalledWith('test-uid', {
      dateOfBirth: null,
      biologicalSex: 'female',
      pregnancyStatus: null,
      medications: 'Levothyroxine 50mcg',
      conditions: null,
      ongoingSymptoms: null,
    });
  });

  it('writes nulls for cleared fields rather than leaving the old values behind', async () => {
    const user = userEvent.setup();
    renderPage();
    emit(
      makeProfile({
        healthContext: {
          dateOfBirth: '1990-04-02',
          biologicalSex: 'female',
          pregnancyStatus: null,
          medications: 'Levothyroxine 50mcg',
          conditions: null,
          ongoingSymptoms: null,
          updatedAt: null,
        },
      }),
    );

    await user.clear(await screen.findByLabelText(/^medications/i));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // Omitting the field would mean "I removed my medication list" silently
    // became "I kept it".
    expect(updateHealthContext).toHaveBeenCalledWith(
      'test-uid',
      expect.objectContaining({ medications: null, biologicalSex: 'female' }),
    );
  });

  it('shows the stored context in the form rather than an empty one', async () => {
    renderPage();
    emit(
      makeProfile({
        healthContext: {
          dateOfBirth: '1990-04-02',
          biologicalSex: 'female',
          pregnancyStatus: 'not_pregnant',
          medications: 'Levothyroxine 50mcg',
          conditions: null,
          ongoingSymptoms: null,
          updatedAt: null,
        },
      }),
    );

    // Asserted on the select's value, not its markup: a `<select>` carries its
    // selection as a DOM property, so serialised HTML shows every option
    // unselected even when the form is correct.
    expect(await screen.findByLabelText(/date of birth/i)).toHaveValue('1990-04-02');
    expect(screen.getByLabelText(/biological sex/i)).toHaveValue('female');
    expect(screen.getByLabelText(/pregnancy status/i)).toHaveValue('not_pregnant');
    expect(screen.getByLabelText(/^medications/i)).toHaveValue('Levothyroxine 50mcg');
  });

  it('confirms before removing the whole health context', async () => {
    const user = userEvent.setup();
    renderPage();
    emit(
      makeProfile({
        healthContext: {
          dateOfBirth: '1990-04-02',
          biologicalSex: null,
          pregnancyStatus: null,
          medications: null,
          conditions: null,
          ongoingSymptoms: null,
          updatedAt: null,
        },
      }),
    );

    await user.click(await screen.findByRole('button', { name: /remove all of this/i }));
    expect(clearHealthContext).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Remove it' }));
    expect(clearHealthContext).toHaveBeenCalledWith('test-uid');
  });

  it('offers no removal button when there is nothing stored to remove', async () => {
    renderPage();
    emit(makeProfile());

    await screen.findByRole('heading', { name: 'About you' });
    expect(screen.queryByRole('button', { name: /remove all of this/i })).not.toBeInTheDocument();
  });

  it('does not claim data export and deletion exist', async () => {
    renderPage();
    emit(makeProfile());

    // A "Download my data" button that opens nothing is worse than an honest
    // absence, and both are spec requirements (§56, §57).
    expect(await screen.findByText(/are not built yet/i)).toBeInTheDocument();
  });

  it('shows when the account was created', async () => {
    renderPage();
    emit(makeProfile());
    expect(await screen.findByText(/15 January 2026|January 15, 2026/)).toBeInTheDocument();
  });

  it('surfaces a load failure instead of an empty form', async () => {
    renderPage();
    act(() => {
      (subscribeToProfile.mock.calls.at(-1)?.[2] as (e: Error) => void)(new Error('offline'));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load your profile/i);
  });

  it('has no accessibility violations', async () => {
    const { container } = renderPage();
    emit(makeProfile());
    await screen.findByRole('heading', { name: 'Your details' });
    await expectNoA11yViolations(container);
  });
});
