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

const ASIDE_LEDE =
  'Your reports and the values extracted from them are visible only to you. Files are stored ' +
  'privately and processed on our servers — the original PDF never gets a public link.';

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  consent?: string;
}

export function Register() {
  const { register, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

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
    if (!name.trim()) next.name = 'Enter the name you would like us to use.';
    if (!email.includes('@')) next.email = 'Enter a valid email address.';
    const passwordProblem = validatePassword(password);
    if (passwordProblem) next.password = passwordProblem;
    // Both consents are required, and they are asked separately on purpose:
    // agreeing to the terms is not the same as agreeing to have your report
    // text sent to a third-party AI provider.
    if (!acceptedTerms || !acceptedAi) {
      next.consent = 'Both confirmations are required before an account can be created.';
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
      setFormError(toAuthErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setFormError(null);
    setGooglePending(true);
    try {
      await signInWithGoogle();
      navigate('/dashboard', { replace: true });
    } catch (caught) {
      setFormError(toAuthErrorMessage(caught));
    } finally {
      setGooglePending(false);
    }
  }

  return (
    <AuthLayout heading="One account. Every panel you have ever had." lede={ASIDE_LEDE}>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div>
          <h2>Create your account</h2>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
            Already have one? <Link to="/sign-in">Sign in</Link>
          </p>
        </div>

        <GoogleButton onClick={handleGoogle} label="Sign up with Google" loading={googlePending} />

        <div className="divider-text">or use your email</div>

        {formError ? (
          <Alert tone="danger" live>
            {formError.message}
          </Alert>
        ) : null}

        <Field label="Full name" error={errors.name}>
          {(props) => (
            <TextInput
              {...props}
              name="name"
              autoComplete="name"
              placeholder="Miriam Okonkwo"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>

        <Field label="Email address" error={errors.email}>
          {(props) => (
            <TextInput
              {...props}
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>

        <Field label="Password" error={errors.password}>
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
          I have read the <Link to="/legal/terms">Terms</Link>,{' '}
          <Link to="/legal/privacy">Privacy Policy</Link> and{' '}
          <Link to="/legal/medical-disclaimer">Medical Disclaimer</Link>, and I understand this
          service does not provide medical advice.
        </Checkbox>

        <Checkbox checked={acceptedAi} onChange={(event) => setAcceptedAi(event.target.checked)}>
          I consent to my report contents being processed by a third-party AI provider to extract
          and explain results. <Link to="/legal/ai-processing">What is sent</Link>
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
          loadingLabel="Creating your account…"
          style={{ height: 48, fontSize: 15 }}
        >
          Create account
        </Button>

        <p className="legal-note">
          We&rsquo;ll send a verification link to your email before your first upload.
        </p>
      </form>
    </AuthLayout>
  );
}
