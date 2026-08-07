import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { toAuthErrorMessage, type AuthErrorMessage } from '@/auth/authErrors';
import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Checkbox, Field, TextInput } from '@/components/Field';
import { GoogleButton } from '@/components/GoogleButton';
import { Icon } from '@/components/Icon';
import { PasswordInput } from '@/components/PasswordInput';
import { PasswordStrength } from '@/components/PasswordStrength';
import { validatePassword } from '@/components/password';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Trans } from '@/i18n/Trans';
import { useI18n } from '@/i18n/useI18n';

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  consent?: string;
}

export function Register() {
  const { register, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const { t, locale } = useI18n();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedAi, setAcceptedAi] = useState(false);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<AuthErrorMessage | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!name.trim()) next.name = t('register.nameRequired');
    if (!email.includes('@')) next.email = t('register.emailInvalid');
    const passwordProblem = validatePassword(password, locale);
    if (passwordProblem) next.password = passwordProblem;
    // Both consents are required, and they are asked separately on purpose:
    // agreeing to the terms is not the same as agreeing to have your report
    // text sent to a third-party AI provider.
    if (!acceptedTerms || !acceptedAi) {
      next.consent = t('register.consentRequired');
    }
    return next;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await register({
        name,
        email,
        password,
        acceptedTerms,
        acceptedAiProcessing: acceptedAi,
      });
      navigate('/verify-email', { replace: true });
    } catch (caught) {
      setFormError(toAuthErrorMessage(caught, locale));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setFormError(null);
    setGooglePending(true);
    try {
      await signInWithGoogle();
      navigate('/variables', { replace: true });
    } catch (caught) {
      setFormError(toAuthErrorMessage(caught, locale));
    } finally {
      setGooglePending(false);
    }
  }

  return (
    <AuthLayout heading={t('register.asideHeading')} lede={t('register.asideLede')}>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div>
          <h2>{t('register.heading')}</h2>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
            <Trans
              id="register.haveOne"
              values={{ link: <Link to="/sign-in">{t('common.signIn')}</Link> }}
            />
          </p>
        </div>

        <GoogleButton
          onClick={handleGoogle}
          label={t('register.signUpWithGoogle')}
          loading={googlePending}
        />

        <div className="divider-text">{t('register.orEmail')}</div>

        {formError ? (
          <Alert tone="danger" live>
            {formError.message}
          </Alert>
        ) : null}

        <Field label={t('register.fullName')} error={errors.name}>
          {(props) => (
            <TextInput
              {...props}
              name="name"
              autoComplete="name"
              placeholder={t('register.namePlaceholder')}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>

        <Field label={t('signIn.email')} error={errors.email}>
          {(props) => (
            <TextInput
              {...props}
              type="email"
              name="email"
              autoComplete="email"
              placeholder={t('register.emailPlaceholder')}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>

        <Field label={t('signIn.password')} error={errors.password}>
          {(props) => (
            <>
              <PasswordInput
                {...props}
                name="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <PasswordStrength password={password} />
            </>
          )}
        </Field>

        <Checkbox
          checked={acceptedTerms}
          onChange={(event) => setAcceptedTerms(event.target.checked)}
        >
          <Trans
            id="register.acceptTerms"
            values={{
              terms: <Link to="/legal/terms">{t('register.termsLink')}</Link>,
              privacy: <Link to="/legal/privacy">{t('public.legal.privacy')}</Link>,
              disclaimer: (
                <Link to="/legal/medical-disclaimer">{t('public.legal.medicalDisclaimer')}</Link>
              ),
            }}
          />
        </Checkbox>

        <Checkbox checked={acceptedAi} onChange={(event) => setAcceptedAi(event.target.checked)}>
          <Trans
            id="register.acceptAi"
            values={{
              link: <Link to="/legal/ai-processing">{t('register.whatIsSent')}</Link>,
            }}
          />
        </Checkbox>

        {errors.consent ? (
          <div
            role="alert"
            style={{
              fontSize: 12,
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              color: 'var(--feedback-danger-ink)',
            }}
          >
            <Icon name="warning-circle" size={14} />
            {errors.consent}
          </div>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          block
          loading={submitting}
          loadingLabel={t('register.creating')}
          style={{ height: 48, fontSize: 15 }}
        >
          {t('register.createAccount')}
        </Button>

        <p className="legal-note">{t('register.verificationNote')}</p>
      </form>
    </AuthLayout>
  );
}
