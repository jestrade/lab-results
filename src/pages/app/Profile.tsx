import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '@/auth/useAuth';
import { toAuthErrorMessage } from '@/auth/authErrors';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';
import { PasswordInput } from '@/components/PasswordInput';
import { PasswordStrength } from '@/components/PasswordStrength';
import { Skeleton } from '@/components/Skeleton';
import { Tag } from '@/components/Tag';
import { validatePassword } from '@/components/password';
import type { BiologicalSex, HealthContext, PregnancyStatus, UserProfile } from '@/domain/types';
import { changePassword, hasPasswordSignIn, syncAuthDisplayName } from '@/services/account';
import {
  clearHealthContext,
  subscribeToProfile,
  updateDisplayName,
  updateHealthContext,
} from '@/services/profiles';

/**
 * Profile (KAN-27, KAN-48).
 *
 * Three things live here, in the order someone looks for them: who the account
 * belongs to, the password, and the optional context about the person whose
 * results these are. Privacy settings stay on Account settings — consent is a
 * decision, not a detail, and burying it under a form would undo the reason
 * that page exists.
 */

const SEX_OPTIONS: { value: BiologicalSex; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'intersex', label: 'Intersex' },
];

const PREGNANCY_OPTIONS: { value: PregnancyStatus; label: string }[] = [
  { value: 'not_pregnant', label: 'Not pregnant' },
  { value: 'pregnant', label: 'Pregnant' },
  { value: 'postpartum', label: 'Postpartum' },
];

type ContextDraft = Omit<HealthContext, 'updatedAt'>;

const EMPTY_CONTEXT: ContextDraft = {
  dateOfBirth: null,
  biologicalSex: null,
  pregnancyStatus: null,
  medications: null,
  conditions: null,
  ongoingSymptoms: null,
};

function draftFrom(profile: UserProfile | null): ContextDraft {
  const context = profile?.healthContext;
  if (!context) return EMPTY_CONTEXT;
  return {
    dateOfBirth: context.dateOfBirth ?? null,
    biologicalSex: context.biologicalSex ?? null,
    pregnancyStatus: context.pregnancyStatus ?? null,
    medications: context.medications ?? null,
    conditions: context.conditions ?? null,
    ongoingSymptoms: context.ongoingSymptoms ?? null,
  };
}

/**
 * Blank strings become null, so "cleared" and "never set" stay the same thing.
 *
 * Applied at save, never on change. Normalising each keystroke means the space
 * in "Levothyroxine 50mcg" is trimmed the instant it is typed and the next
 * character lands against the previous word — which makes typing any phrase
 * impossible. A test caught this; the form had eaten every space.
 */
function normalise(value: string | null): string | null {
  const next = (value ?? '').trim();
  return next === '' ? null : next;
}

export function Profile() {
  const { user, isEmailVerified, resendVerification, refresh } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeToProfile(
      user.uid,
      (next) => {
        setProfile(next);
        setLoadError(null);
      },
      () => setLoadError('We could not load your profile. Check your connection and try again.'),
    );
  }, [user]);

  if (!user) return null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">Account</div>
          <h1>Profile</h1>
        </div>
      </div>

      {loadError ? (
        <Alert tone="danger" live>
          {loadError}
        </Alert>
      ) : null}

      {profile === undefined ? (
        <Skeleton height={200} radius="var(--r-card)" />
      ) : (
        <>
          <IdentitySection
            profile={profile}
            email={user.email ?? ''}
            isEmailVerified={isEmailVerified}
            onResend={resendVerification}
            onSave={async (displayName) => {
              await updateDisplayName(user.uid, displayName);
              // Auth carries its own copy, and the sidebar reads that one
              // before the profile document arrives.
              await syncAuthDisplayName(user, displayName);
              await refresh();
            }}
          />

          <PasswordSection canChange={hasPasswordSignIn(user)} user={user} />

          <HealthContextSection
            profile={profile}
            onSave={(draft) => updateHealthContext(user.uid, draft)}
            onClear={() => clearHealthContext(user.uid)}
          />

          <DataSection />
        </>
      )}
    </>
  );
}

function IdentitySection({
  profile,
  email,
  isEmailVerified,
  onResend,
  onSave,
}: {
  profile: UserProfile | null;
  email: string;
  isEmailVerified: boolean;
  onResend: () => Promise<void>;
  onSave: (displayName: string) => Promise<void>;
}) {
  const [name, setName] = useState(profile?.displayName ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const next = name.trim();
    if (next === '') {
      setError('Your name cannot be empty.');
      return;
    }

    setError(null);
    setStatus('saving');
    try {
      await onSave(next);
      setStatus('saved');
    } catch (caught) {
      setStatus('idle');
      setError(toAuthErrorMessage(caught).message);
    }
  }

  return (
    <section className="settings-section" aria-labelledby="profile-identity">
      <div className="settings-head">
        <h2 id="profile-identity">Your details</h2>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} className="profile-form" noValidate>
        <Field label="Display name" error={error}>
          {(props) => (
            <input
              {...props}
              className="input"
              type="text"
              value={name}
              autoComplete="name"
              onChange={(event) => {
                setName(event.target.value);
                setStatus('idle');
              }}
            />
          )}
        </Field>

        <Field
          label="Email address"
          hint="Changing your email is not available yet — it needs a verified-change flow so an account cannot be moved to an address the owner does not control."
        >
          {(props) => (
            <input {...props} className="input" type="email" value={email} readOnly disabled />
          )}
        </Field>

        <div className="profile-actions">
          <Button type="submit" variant="primary" loading={status === 'saving'} loadingLabel="Saving…">
            Save name
          </Button>
          {/* Announced, not just coloured — a confirmation nobody hears is not
              a confirmation (KAN-53). */}
          <span role="status" className="muted" style={{ fontSize: 13 }}>
            {status === 'saved' ? 'Name saved.' : ''}
          </span>
        </div>
      </form>

      <div className="profile-meta">
        <div className="profile-meta-row">
          <span className="muted">Email verification</span>
          {isEmailVerified ? (
            <Tag tone="accent">
              <Icon name="check-circle" size={13} />
              <span style={{ marginLeft: 5 }}>Verified</span>
            </Tag>
          ) : (
            <Tag tone="neutral">
              <Icon name="warning" size={13} />
              <span style={{ marginLeft: 5 }}>Not verified</span>
            </Tag>
          )}
        </div>

        {!isEmailVerified ? (
          <div className="profile-actions">
            <Button
              variant="secondary"
              onClick={() => {
                void onResend().then(() => setResent(true));
              }}
            >
              Resend verification email
            </Button>
            <span role="status" className="muted" style={{ fontSize: 13 }}>
              {resent ? 'Sent — check your inbox.' : ''}
            </span>
          </div>
        ) : null}

        {profile?.createdAt ? (
          <div className="profile-meta-row">
            <span className="muted">Account created</span>
            <span>
              {new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(
                profile.createdAt.toDate(),
              )}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PasswordSection({
  canChange,
  user,
}: {
  canChange: boolean;
  user: Parameters<typeof changePassword>[0];
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canChange) {
    return (
      <section className="settings-section" aria-labelledby="profile-password">
        <div className="settings-head">
          <h2 id="profile-password">Password</h2>
        </div>
        {/* Not an error — this account simply has no password. Offering the
            form would be offering something that cannot work. */}
        <p className="muted">
          You sign in with Google, so this account has no password here. Manage it in your{' '}
          <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer noopener">
            Google account settings
          </a>
          .
        </p>
      </section>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const invalid = validatePassword(next);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (next !== confirm) {
      setError('The two new passwords do not match.');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await changePassword(user, current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    } catch (caught) {
      setError(toAuthErrorMessage(caught).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-section" aria-labelledby="profile-password">
      <div className="settings-head">
        <h2 id="profile-password">Password</h2>
      </div>

      <p className="muted">
        Your current password is required. Without it, anyone who found this session open could lock
        you out of your own records.
      </p>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}
      {done ? (
        <Alert tone="success" live>
          Your password has been changed.
        </Alert>
      ) : null}

      <form onSubmit={(event) => void handleSubmit(event)} className="profile-form" noValidate>
        <Field label="Current password">
          {(props) => (
            <PasswordInput
              {...props}
              value={current}
              autoComplete="current-password"
              onChange={(event) => {
                setCurrent(event.target.value);
                setDone(false);
              }}
            />
          )}
        </Field>

        <Field label="New password">
          {(props) => (
            <PasswordInput
              {...props}
              value={next}
              autoComplete="new-password"
              onChange={(event) => {
                setNext(event.target.value);
                setDone(false);
              }}
            />
          )}
        </Field>
        <PasswordStrength password={next} />

        <Field label="Confirm new password">
          {(props) => (
            <PasswordInput
              {...props}
              value={confirm}
              autoComplete="new-password"
              onChange={(event) => setConfirm(event.target.value)}
            />
          )}
        </Field>

        <div className="profile-actions">
          <Button type="submit" variant="primary" loading={saving} loadingLabel="Changing…">
            Change password
          </Button>
        </div>
      </form>
    </section>
  );
}

function HealthContextSection({
  profile,
  onSave,
  onClear,
}: {
  profile: UserProfile | null;
  onSave: (draft: ContextDraft) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<ContextDraft>(() => draftFrom(profile));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const hasAnything = Object.values(draftFrom(profile)).some((value) => value !== null);

  function set<K extends keyof ContextDraft>(key: K, value: ContextDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSave({
        ...draft,
        dateOfBirth: normalise(draft.dateOfBirth),
        medications: normalise(draft.medications),
        conditions: normalise(draft.conditions),
        ongoingSymptoms: normalise(draft.ongoingSymptoms),
      });
      setSaved(true);
    } catch {
      setError('We could not save this. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      await onClear();
      setDraft(EMPTY_CONTEXT);
      setConfirmingClear(false);
      setSaved(false);
    } catch {
      setError('We could not remove this. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-section" aria-labelledby="profile-context">
      <div className="settings-head">
        <h2 id="profile-context">About you</h2>
        <Tag tone="neutral">Optional</Tag>
      </div>

      <p className="muted">
        Reference ranges differ by age and sex, and knowing what you already take or live with makes
        an explanation more relevant. Every field here is optional, and leaving them all blank
        changes nothing about how your results are classified.
      </p>

      {/* The honest limit, stated where the form is rather than in a footer.
          Context makes an explanation better informed; it does not turn one
          into a medical evaluation, and this product does not perform one. */}
      <Alert tone="info">
        Filling this in does not make the analysis a medical assessment. Nothing here is used to
        decide whether a result is normal — that is always calculated from the reference range
        printed on your own report.
      </Alert>

      <Alert tone="warning">
        <strong>Not yet used for analysis.</strong> This is stored on your account, but the AI
        analysis does not read it. Sending it would widen what leaves this app beyond what the AI
        processing consent currently describes, so that needs the consent text updated first.
      </Alert>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      <form onSubmit={(event) => void handleSubmit(event)} className="profile-form" noValidate>
        <div className="profile-grid">
          <Field label="Date of birth" hint="Used to work out your age when a report was taken.">
            {(props) => (
              <input
                {...props}
                className="input"
                type="date"
                value={draft.dateOfBirth ?? ''}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(event) => set('dateOfBirth', event.target.value)}
              />
            )}
          </Field>

          <Field label="Biological sex" hint="Asked because many reference ranges differ by sex.">
            {(props) => (
              <select
                {...props}
                className="input"
                value={draft.biologicalSex ?? ''}
                onChange={(event) =>
                  set('biologicalSex', (event.target.value || null) as BiologicalSex | null)
                }
              >
                <option value="">Prefer not to say</option>
                {SEX_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        <Field label="Pregnancy status">
          {(props) => (
            <select
              {...props}
              className="input"
              value={draft.pregnancyStatus ?? ''}
              onChange={(event) =>
                set('pregnancyStatus', (event.target.value || null) as PregnancyStatus | null)
              }
            >
              <option value="">Prefer not to say</option>
              {PREGNANCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Medications" hint="One per line. Written as you write them — never parsed.">
          {(props) => (
            <textarea
              {...props}
              className="input"
              rows={3}
              value={draft.medications ?? ''}
              onChange={(event) => set('medications', event.target.value)}
            />
          )}
        </Field>

        <Field label="Ongoing conditions" hint="One per line.">
          {(props) => (
            <textarea
              {...props}
              className="input"
              rows={3}
              value={draft.conditions ?? ''}
              onChange={(event) => set('conditions', event.target.value)}
            />
          )}
        </Field>

        <Field label="Ongoing symptoms" hint="One per line.">
          {(props) => (
            <textarea
              {...props}
              className="input"
              rows={3}
              value={draft.ongoingSymptoms ?? ''}
              onChange={(event) => set('ongoingSymptoms', event.target.value)}
            />
          )}
        </Field>

        <div className="profile-actions">
          <Button type="submit" variant="primary" loading={saving} loadingLabel="Saving…">
            Save
          </Button>
          {hasAnything ? (
            <Button variant="secondary" onClick={() => setConfirmingClear(true)} disabled={saving}>
              Remove all of this
            </Button>
          ) : null}
          <span role="status" className="muted" style={{ fontSize: 13 }}>
            {saved ? 'Saved.' : ''}
          </span>
        </div>
      </form>

      <Modal
        open={confirmingClear}
        onClose={() => (saving ? undefined : setConfirmingClear(false))}
        title="Remove everything in this section?"
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmingClear(false)} disabled={saving}>
              Keep it
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleClear()}
              loading={saving}
              loadingLabel="Removing…"
            >
              Remove it
            </Button>
          </>
        }
      >
        <p style={{ marginBottom: 0 }}>
          Your date of birth, sex, pregnancy status, medications, conditions and symptoms are
          deleted from your account. Your reports and results are not affected.
        </p>
      </Modal>
    </section>
  );
}

function DataSection() {
  return (
    <section className="settings-section" aria-labelledby="profile-data">
      <div className="settings-head">
        <h2 id="profile-data">Your data</h2>
      </div>
      <p className="muted">
        Privacy and AI-processing consent live on <Link to="/settings">Account settings</Link>.
      </p>
      {/* Stated rather than linked. A "Download my data" button that opens
          nothing is worse than an honest absence, and both of these are
          required by the spec (§56, §57), so the gap matters. */}
      <p className="muted">
        <strong>Data export and account deletion are not built yet</strong> (KAN-23). Until they
        are, email us to have an account removed.
      </p>
    </section>
  );
}
