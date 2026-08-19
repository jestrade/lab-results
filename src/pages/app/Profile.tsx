import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { User } from 'firebase/auth';

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
import { useToast } from '@/components/useToast';
import { validatePassword } from '@/components/password';
import { messageFor } from '@/i18n/catalogs';
import { formatLongDate } from '@/i18n/dates';
import { Trans } from '@/i18n/Trans';
import { useI18n } from '@/i18n/useI18n';
import type { I18nContextValue } from '@/i18n/I18nContext';
import type { MessageKey } from '@/i18n/messages';
import type { Locale } from '@/domain/locales';
import type {
  BiologicalSex,
  HealthContext,
  IdentityDocument,
  IdentityDocumentType,
  PregnancyStatus,
  UserProfile,
} from '@/domain/types';
import {
  DELETION_CONFIRMATION,
  changePassword,
  deleteAccountAndData,
  hasPasswordSignIn,
  reauthenticate,
  syncAuthDisplayName,
} from '@/services/account';
import {
  clearHealthContext,
  clearIdentityDocument,
  subscribeToProfile,
  updateDisplayName,
  updateHealthContext,
  updateIdentityDocument,
} from '@/services/profiles';

/**
 * Profile (KAN-27, KAN-48, KAN-23).
 *
 * Five things live here, in the order someone looks for them: who the account
 * belongs to, the identity document that says so, the password, the optional
 * context about the person whose results these are, and — last, where nothing
 * is reached by accident — deleting the account. Privacy settings stay on
 * Account settings; consent is a decision, not a detail, and burying it under
 * a form would undo the reason that page exists.
 */

const DOCUMENT_TYPE_OPTIONS: { value: IdentityDocumentType; label: MessageKey }[] = [
  { value: 'cedula', label: 'profile.document.cedula' },
  { value: 'registro_civil', label: 'profile.document.registroCivil' },
  { value: 'pasaporte', label: 'profile.document.pasaporte' },
  { value: 'cedula_extranjeria', label: 'profile.document.cedulaExtranjeria' },
];

const SEX_OPTIONS: { value: BiologicalSex; label: MessageKey }[] = [
  { value: 'female', label: 'profile.sex.female' },
  { value: 'male', label: 'profile.sex.male' },
  { value: 'intersex', label: 'profile.sex.intersex' },
];

const PREGNANCY_OPTIONS: { value: PregnancyStatus; label: MessageKey }[] = [
  { value: 'not_pregnant', label: 'profile.pregnancy.not' },
  { value: 'pregnant', label: 'profile.pregnancy.pregnant' },
  { value: 'postpartum', label: 'profile.pregnancy.postpartum' },
];

/** Exactly what deletion removes. Listed, not summarised — see the note below. */
const DELETED_ITEM_KEYS: MessageKey[] = [
  'profile.deleted.profile',
  'profile.deleted.reports',
  'profile.deleted.results',
  'profile.deleted.variables',
  'profile.deleted.account',
];

type DocumentDraft = Omit<IdentityDocument, 'updatedAt'>;

const EMPTY_DOCUMENT: DocumentDraft = {
  type: null,
  number: null,
  placeOfIssue: null,
};

function documentDraftFrom(profile: UserProfile | null): DocumentDraft {
  const document = profile?.identityDocument;
  if (!document) return EMPTY_DOCUMENT;
  return {
    type: document.type ?? null,
    number: document.number ?? null,
    placeOfIssue: document.placeOfIssue ?? null,
  };
}

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
  const { t, locale } = useI18n();

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
      () => setLoadError(t('profile.loadFailed')),
    );
  }, [user, t]);

  if (!user) return null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="kicker">{t('nav.account')}</div>
          <h1>{t('nav.profile')}</h1>
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
            t={t}
            locale={locale}
            onSave={async (displayName) => {
              await updateDisplayName(user.uid, displayName);
              // Auth carries its own copy, and the sidebar reads that one
              // before the profile document arrives.
              await syncAuthDisplayName(user, displayName);
              await refresh();
            }}
          />

          <IdentityDocumentSection
            profile={profile}
            onSave={(draft) => updateIdentityDocument(user.uid, draft)}
            onClear={() => clearIdentityDocument(user.uid)}
            t={t}
          />

          <PasswordSection canChange={hasPasswordSignIn(user)} user={user} t={t} locale={locale} />

          <HealthContextSection
            profile={profile}
            onSave={(draft) => updateHealthContext(user.uid, draft)}
            onClear={() => clearHealthContext(user.uid)}
            t={t}
          />

          <DataSection user={user} t={t} locale={locale} />
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
  t,
  locale,
}: {
  profile: UserProfile | null;
  email: string;
  isEmailVerified: boolean;
  onResend: () => Promise<void>;
  onSave: (displayName: string) => Promise<void>;
  t: I18nContextValue['t'];
  locale: Locale;
}) {
  const [name, setName] = useState(profile?.displayName ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const next = name.trim();
    if (next === '') {
      setError(t('profile.nameEmpty'));
      return;
    }

    setError(null);
    setStatus('saving');
    try {
      await onSave(next);
      setStatus('saved');
    } catch (caught) {
      setStatus('idle');
      setError(toAuthErrorMessage(caught, locale).message);
    }
  }

  return (
    <section className="settings-section" aria-labelledby="profile-identity">
      <div className="settings-head">
        <h2 id="profile-identity">{t('profile.detailsHeading')}</h2>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} className="profile-form" noValidate>
        <Field label={t('profile.displayName')} error={error}>
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

        <Field label={t('profile.emailAddress')} hint={t('profile.emailHint')}>
          {(props) => (
            <input {...props} className="input" type="email" value={email} readOnly disabled />
          )}
        </Field>

        <div className="profile-actions">
          <Button
            type="submit"
            variant="primary"
            loading={status === 'saving'}
            loadingLabel={t('common.saving')}
          >
            {t('profile.saveName')}
          </Button>
          {/* Announced, not just coloured — a confirmation nobody hears is not
              a confirmation (KAN-53). */}
          <span role="status" className="muted" style={{ fontSize: 13 }}>
            {status === 'saved' ? t('profile.nameSaved') : ''}
          </span>
        </div>
      </form>

      <div className="profile-meta">
        <div className="profile-meta-row">
          <span className="muted">{t('profile.emailVerification')}</span>
          {isEmailVerified ? (
            <Tag tone="accent">
              <Icon name="check-circle" size={13} />
              <span style={{ marginLeft: 5 }}>{t('common.verified')}</span>
            </Tag>
          ) : (
            <Tag tone="neutral">
              <Icon name="warning" size={13} />
              <span style={{ marginLeft: 5 }}>{t('profile.notVerified')}</span>
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
              {t('profile.resendVerification')}
            </Button>
            <span role="status" className="muted" style={{ fontSize: 13 }}>
              {resent ? t('profile.resent') : ''}
            </span>
          </div>
        ) : null}

        {profile?.createdAt ? (
          <div className="profile-meta-row">
            <span className="muted">{t('profile.accountCreated')}</span>
            <span>{formatLongDate(profile.createdAt.toDate(), locale)}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * The identity document on the profile.
 *
 * Its own section rather than three more fields under "Your details", because
 * the write is its own: the display name goes to Firestore *and* to the auth
 * record, and folding a document number into that form would mean one Save
 * button standing for two unrelated writes, either of which can fail alone.
 *
 * Kept above the health context deliberately. This says who the account holder
 * is; that says what is true about their body. They are answered by different
 * evidence — a card in a wallet, and a memory of a prescription — and reading
 * one heading straight into the other invites the two to be filled in as one.
 */
function IdentityDocumentSection({
  profile,
  onSave,
  onClear,
  t,
}: {
  profile: UserProfile | null;
  onSave: (draft: DocumentDraft) => Promise<void>;
  onClear: () => Promise<void>;
  t: I18nContextValue['t'];
}) {
  const [draft, setDraft] = useState<DocumentDraft>(() => documentDraftFrom(profile));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numberError, setNumberError] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const hasAnything = Object.values(documentDraftFrom(profile)).some((value) => value !== null);

  function set<K extends keyof DocumentDraft>(key: K, value: DocumentDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setNumberError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const next: DocumentDraft = {
      type: draft.type,
      number: normalise(draft.number),
      placeOfIssue: normalise(draft.placeOfIssue),
    };

    // A number with no type is a string of digits nobody can act on — the same
    // sequence means a different person depending on which document it came
    // off. Every other combination is allowed to be incomplete.
    if (next.number !== null && next.type === null) {
      setNumberError(t('profile.documentNumberNeedsType'));
      return;
    }

    setError(null);
    setNumberError(null);
    setSaving(true);
    try {
      await onSave(next);
      setDraft(next);
      setSaved(true);
    } catch {
      setError(t('profile.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    try {
      await onClear();
      setDraft(EMPTY_DOCUMENT);
      setConfirmingClear(false);
      setSaved(false);
    } catch {
      setError(t('profile.removeFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-section" aria-labelledby="profile-document">
      <div className="settings-head">
        <h2 id="profile-document">{t('profile.documentHeading')}</h2>
        <Tag tone="neutral">{t('profile.optional')}</Tag>
      </div>

      <p className="muted">{t('profile.documentIntro')}</p>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      <form onSubmit={(event) => void handleSubmit(event)} className="profile-form" noValidate>
        <div className="profile-grid">
          <Field label={t('profile.documentType')}>
            {(props) => (
              <select
                {...props}
                className="input"
                value={draft.type ?? ''}
                onChange={(event) =>
                  set('type', (event.target.value || null) as IdentityDocumentType | null)
                }
              >
                <option value="">{t('profile.documentTypeUnset')}</option>
                {DOCUMENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.label)}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field
            label={t('profile.documentNumber')}
            hint={t('profile.documentNumberHint')}
            error={numberError}
          >
            {(props) => (
              <input
                {...props}
                className="input"
                type="text"
                inputMode="text"
                autoComplete="off"
                value={draft.number ?? ''}
                onChange={(event) => set('number', event.target.value)}
              />
            )}
          </Field>
        </div>

        <Field label={t('profile.documentPlace')} hint={t('profile.documentPlaceHint')}>
          {(props) => (
            <input
              {...props}
              className="input"
              type="text"
              autoComplete="off"
              value={draft.placeOfIssue ?? ''}
              onChange={(event) => set('placeOfIssue', event.target.value)}
            />
          )}
        </Field>

        <div className="profile-actions">
          <Button type="submit" variant="primary" loading={saving} loadingLabel={t('common.saving')}>
            {t('profile.documentSave')}
          </Button>
          {hasAnything ? (
            <Button variant="secondary" onClick={() => setConfirmingClear(true)} disabled={saving}>
              {t('profile.documentRemoveAll')}
            </Button>
          ) : null}
          {/* Announced, not just coloured (KAN-53). */}
          <span role="status" className="muted" style={{ fontSize: 13 }}>
            {saved ? t('profile.documentSaved') : ''}
          </span>
        </div>
      </form>

      <Modal
        open={confirmingClear}
        onClose={() => (saving ? undefined : setConfirmingClear(false))}
        title={t('profile.documentRemoveTitle')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmingClear(false)} disabled={saving}>
              {t('settings.keepIt')}
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleClear()}
              loading={saving}
              loadingLabel={t('profile.removing')}
            >
              {t('profile.removeIt')}
            </Button>
          </>
        }
      >
        <p style={{ marginBottom: 0 }}>{t('profile.documentRemoveBody')}</p>
      </Modal>
    </section>
  );
}

function PasswordSection({
  canChange,
  user,
  t,
  locale,
}: {
  canChange: boolean;
  user: Parameters<typeof changePassword>[0];
  t: I18nContextValue['t'];
  locale: Locale;
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
          <h2 id="profile-password">{t('profile.passwordHeading')}</h2>
        </div>
        {/* Not an error — this account simply has no password. Offering the
            form would be offering something that cannot work. */}
        <p className="muted">
          <Trans
            id="profile.googleNoPassword"
            values={{
              link: (
                <a
                  href="https://myaccount.google.com/security"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {t('profile.googleSettingsLink')}
                </a>
              ),
            }}
          />
        </p>
      </section>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const invalid = validatePassword(next, locale);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (next !== confirm) {
      setError(t('profile.passwordMismatch'));
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
      setError(toAuthErrorMessage(caught, locale).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-section" aria-labelledby="profile-password">
      <div className="settings-head">
        <h2 id="profile-password">{t('profile.passwordHeading')}</h2>
      </div>

      <p className="muted">{t('profile.passwordIntro')}</p>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}
      {done ? (
        <Alert tone="success" live>
          {t('profile.passwordChanged')}
        </Alert>
      ) : null}

      <form onSubmit={(event) => void handleSubmit(event)} className="profile-form" noValidate>
        <Field label={t('profile.currentPassword')}>
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

        <Field label={t('profile.newPassword')}>
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

        <Field label={t('profile.confirmPassword')}>
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
          <Button type="submit" variant="primary" loading={saving} loadingLabel={t('profile.changing')}>
            {t('profile.changePassword')}
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
  t,
}: {
  profile: UserProfile | null;
  onSave: (draft: ContextDraft) => Promise<void>;
  onClear: () => Promise<void>;
  t: I18nContextValue['t'];
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
      setError(t('profile.saveFailed'));
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
      setError(t('profile.removeFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="settings-section" aria-labelledby="profile-context">
      <div className="settings-head">
        <h2 id="profile-context">{t('profile.contextHeading')}</h2>
        <Tag tone="neutral">{t('profile.optional')}</Tag>
      </div>

      <p className="muted">{t('profile.contextIntro')}</p>

      {/* The honest limit, stated where the form is rather than in a footer.
          Context makes an explanation better informed; it does not turn one
          into a medical evaluation, and this product does not perform one. */}
      <Alert tone="info">{t('profile.contextLimit')}</Alert>

      <Alert tone="warning">
        <Trans
          id="profile.contextUnused"
          values={{ emphasis: <strong>{t('profile.contextUnusedEmphasis')}</strong> }}
        />
      </Alert>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      <form onSubmit={(event) => void handleSubmit(event)} className="profile-form" noValidate>
        <div className="profile-grid">
          <Field label={t('profile.dateOfBirth')} hint={t('profile.dateOfBirthHint')}>
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

          <Field label={t('profile.biologicalSex')} hint={t('profile.biologicalSexHint')}>
            {(props) => (
              <select
                {...props}
                className="input"
                value={draft.biologicalSex ?? ''}
                onChange={(event) =>
                  set('biologicalSex', (event.target.value || null) as BiologicalSex | null)
                }
              >
                <option value="">{t('profile.preferNotToSay')}</option>
                {SEX_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.label)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        <Field label={t('profile.pregnancyStatus')}>
          {(props) => (
            <select
              {...props}
              className="input"
              value={draft.pregnancyStatus ?? ''}
              onChange={(event) =>
                set('pregnancyStatus', (event.target.value || null) as PregnancyStatus | null)
              }
            >
              <option value="">{t('profile.preferNotToSay')}</option>
              {PREGNANCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label={t('profile.medications')} hint={t('profile.medicationsHint')}>
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

        <Field label={t('profile.conditions')} hint={t('profile.onePerLine')}>
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

        <Field label={t('profile.symptoms')} hint={t('profile.onePerLine')}>
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
          <Button type="submit" variant="primary" loading={saving} loadingLabel={t('common.saving')}>
            {t('common.save')}
          </Button>
          {hasAnything ? (
            <Button variant="secondary" onClick={() => setConfirmingClear(true)} disabled={saving}>
              {t('profile.removeAll')}
            </Button>
          ) : null}
          <span role="status" className="muted" style={{ fontSize: 13 }}>
            {saved ? t('common.saved') : ''}
          </span>
        </div>
      </form>

      <Modal
        open={confirmingClear}
        onClose={() => (saving ? undefined : setConfirmingClear(false))}
        title={t('profile.removeTitle')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirmingClear(false)} disabled={saving}>
              {t('settings.keepIt')}
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleClear()}
              loading={saving}
              loadingLabel={t('profile.removing')}
            >
              {t('profile.removeIt')}
            </Button>
          </>
        }
      >
        <p style={{ marginBottom: 0 }}>{t('profile.removeBody')}</p>
      </Modal>
    </section>
  );
}

function DataSection({
  user,
  t,
  locale,
}: {
  user: User;
  t: I18nContextValue['t'];
  locale: Locale;
}) {
  return (
    <section className="settings-section" aria-labelledby="profile-data">
      <div className="settings-head">
        <h2 id="profile-data">{t('profile.dataHeading')}</h2>
      </div>
      <p className="muted">
        <Trans
          id="profile.consentElsewhere"
          values={{ link: <Link to="/settings">{t('nav.settings')}</Link> }}
        />
      </p>
      {/* Stated rather than linked. A "Download my data" button that opens
          nothing is worse than an honest absence, and it is a spec requirement
          (§56), so the gap matters. Deletion (§57) is below and is real. */}
      <p className="muted">
        <Trans
          id="profile.exportBody"
          values={{ emphasis: <strong>{t('profile.exportEmphasis')}</strong> }}
        />
      </p>

      <DeleteAccountSection user={user} t={t} locale={locale} />
    </section>
  );
}

/**
 * Account deletion (KAN-23, spec §57).
 *
 * Three things this deliberately does *not* do. It does not hide behind a
 * support email — the right to have data erased is worth nothing if exercising
 * it depends on someone answering. It does not soft-delete: `deletedAt` on the
 * profile would leave the email, the health context and every extracted result
 * exactly where they are, which is retention wearing a delete button's clothes.
 * And it does not describe the outcome vaguely — the list above is itemised
 * because "your data will be removed" is a sentence someone can agree to
 * without knowing they are about to lose four years of blood work.
 *
 * The confirmation is deliberately slow: re-authentication, a typed word, and a
 * dialog that states the consequence. Every other destructive action in this
 * app is recoverable; this one is not.
 */
function DeleteAccountSection({
  user,
  t,
  locale,
}: {
  user: User;
  t: I18nContextValue['t'];
  locale: Locale;
}) {
  const { signOutUser } = useAuth();
  const navigate = useNavigate();
  const { push } = useToast();

  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsPassword = hasPasswordSignIn(user);
  const confirmed = typed.trim().toUpperCase() === DELETION_CONFIRMATION;

  function close() {
    if (deleting) return;
    setOpen(false);
    setTyped('');
    setPassword('');
    setError(null);
  }

  async function handleDelete() {
    if (!confirmed) return;
    setError(null);
    setDeleting(true);

    try {
      // Proves who is at the keyboard before anything is destroyed, and moves
      // the token's auth_time, which is what the callable checks server-side.
      await reauthenticate(user, needsPassword ? password : undefined);
      await deleteAccountAndData();

      // The Auth record is already gone; this clears the local session so the
      // app does not spend a moment holding a token for an account that no
      // longer exists.
      await signOutUser();
      navigate('/', { replace: true });
      push(t('profile.deletedToast'), 'success');
    } catch (caught) {
      setDeleting(false);
      setError(toDeletionErrorMessage(caught, locale));
    }
  }

  return (
    <>
      <div className="danger-zone">
        <h3>{t('profile.deleteHeading')}</h3>
        <p className="muted">{t('profile.deleteIntro')}</p>
        <ul className="settings-facts danger-facts">
          {DELETED_ITEM_KEYS.map((key) => (
            <li key={key}>
              <Icon name="trash" size={15} />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
        <div>
          <Button variant="secondary" icon="trash" onClick={() => setOpen(true)}>
            {t('profile.deleteButton')}
          </Button>
        </div>
      </div>

      <Modal
        open={open}
        onClose={close}
        title={t('profile.deleteTitle')}
        actions={
          <>
            <Button variant="secondary" onClick={close} disabled={deleting}>
              {t('profile.keepAccount')}
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleDelete()}
              loading={deleting}
              loadingLabel={t('profile.deleting')}
              // Disabled rather than hidden: the reason it cannot be pressed
              // is the field right above it, which stays on screen.
              disabled={!confirmed}
            >
              {t('profile.deleteEverything')}
            </Button>
          </>
        }
      >
        <p>
          <Trans
            id="profile.deleteWarning"
            values={{ emphasis: <strong>{t('profile.deleteWarningEmphasis')}</strong> }}
          />
        </p>

        {error ? (
          <Alert tone="danger" live>
            {error}
          </Alert>
        ) : null}

        <form
          className="profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleDelete();
          }}
          noValidate
        >
          {needsPassword ? (
            <Field label={t('profile.yourPassword')} hint={t('profile.yourPasswordHint')}>
              {(props) => (
                <PasswordInput
                  {...props}
                  value={password}
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.target.value)}
                />
              )}
            </Field>
          ) : (
            <Alert tone="info">{t('profile.googleReauth')}</Alert>
          )}

          {/* The word itself stays "DELETE" in every language: the callable
              checks it server-side against one constant, so translating it
              would mean the server accepting a set of words that grows with
              every locale. The instruction around it is translated. */}
          <Field label={t('profile.typeToConfirm', { word: DELETION_CONFIRMATION })}>
            {(props) => (
              <input
                {...props}
                className="input"
                type="text"
                value={typed}
                autoComplete="off"
                // Autocorrect on a phone will happily turn a typed word into
                // something else and leave the button stubbornly disabled.
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event) => setTyped(event.target.value)}
              />
            )}
          </Field>
        </form>
      </Modal>
    </>
  );
}

/**
 * Deletion failures need their own wording.
 *
 * `toAuthErrorMessage` covers the re-authentication half correctly — a wrong
 * password here is the same failure as a wrong password anywhere. What it
 * cannot say is the thing that matters once the server has started work:
 * deletion is not transactional, so "it failed" must not be reported as
 * "nothing happened".
 */
function toDeletionErrorMessage(error: unknown, locale: Locale): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';

  if (code.startsWith('auth/')) return toAuthErrorMessage(error, locale).message;

  if (code === 'functions/failed-precondition') {
    return messageFor(locale, 'profile.deleteReauth');
  }
  if (code === 'functions/unauthenticated') {
    return messageFor(locale, 'profile.deleteExpired');
  }

  return messageFor(locale, 'profile.deletePartial');
}
