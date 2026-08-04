import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { toAuthErrorMessage, type AuthErrorMessage } from '@/auth/authErrors';
import { useAuth } from '@/auth/useAuth';
import { Alert } from '@/components/Alert';
import { Button } from '@/components/Button';
import { Checkbox, Field, TextInput } from '@/components/Field';
import { GoogleButton } from '@/components/GoogleButton';
import { PasswordInput } from '@/components/PasswordInput';
import { AuthLayout } from '@/layouts/AuthLayout';

const ASIDE_POINTS = [
  {
    icon: 'file-pdf',
    title: 'Upload a PDF',
    body: 'Every test name, value, unit and reference range is extracted for you.',
  },
  {
    icon: 'chart-line-up',
    title: 'Watch each value over time',
    body: 'The same test from different laboratories, matched and charted together.',
  },
  {
    icon: 'sparkle',
    title: 'Plain-language context',
    body: 'Explanations and analysis, always labelled as AI-generated.',
  },
];

interface LocationState {
  from?: { pathname: string };
}

export function SignIn() {
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<AuthErrorMessage | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googlePending, setGooglePending] = useState(false);

  // Guards stash the page the user was trying to reach; send them back there.
  const destination = (location.state as LocationState | null)?.from?.pathname ?? '/dashboard';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signInWithEmail(email, password);
      navigate(destination, { replace: true });
    } catch (caught) {
      setError(toAuthErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setGooglePending(true);
    try {
      await signInWithGoogle();
      navigate(destination, { replace: true });
    } catch (caught) {
      setError(toAuthErrorMessage(caught));
    } finally {
      setGooglePending(false);
    }
  }

  return (
    <AuthLayout heading="Your laboratory results, finally in one place." points={ASIDE_POINTS}>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div>
          <h2>Sign in</h2>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
            New here? <Link to="/register">Create an account</Link>
          </p>
        </div>

        <GoogleButton onClick={handleGoogle} label="Continue with Google" loading={googlePending} />

        <div className="divider-text">or sign in with email</div>

        {error ? (
          <Alert tone="danger" live>
            {error.message}
          </Alert>
        ) : null}

        <Field label="Email address">
          {(props) => (
            <TextInput
              {...props}
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>

        <Field
          label="Password"
          aside={
            <Link to="/forgot-password" style={{ fontSize: 12 }}>
              Forgot password?
            </Link>
          }
        >
          {(props) => (
            <PasswordInput
              {...props}
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>

        {/* Firebase persists the session in local storage by default, which is
            what "keep me signed in" means here. Unticking it is handled by the
            session-persistence work in KAN-2's follow-up; the control is shown
            because the design specifies it and it reflects current behaviour. */}
        <Checkbox defaultChecked name="persist">
          Keep me signed in on this device
        </Checkbox>

        <Button
          type="submit"
          variant="primary"
          block
          loading={submitting}
          loadingLabel="Signing in…"
          style={{ height: 48, fontSize: 15 }}
        >
          Sign in
        </Button>

        <p className="legal-note">
          By signing in you agree to the <Link to="/legal/terms">Terms of Service</Link>, the{' '}
          <Link to="/legal/privacy">Privacy Policy</Link> and the{' '}
          <Link to="/legal/ai-processing">AI Processing Disclosure</Link>.
        </p>
      </form>
    </AuthLayout>
  );
}
