import { Component, type ErrorInfo, type ReactNode } from 'react';
import * as Sentry from '@sentry/react';

import { MissingConfigError } from '@/lib/env';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last-resort boundary (KAN-35).
 *
 * The fallback deliberately shows the user nothing about *what* failed beyond
 * a reference id — an error string from this app can carry a filename, an
 * email or a value. The detail goes to Sentry (scrubbed) and, in development,
 * to the console.
 *
 * `MissingConfigError` is the one exception: it is a developer mistake, not a
 * runtime fault, and printing it is the fastest way to fix a bad `.env`.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
    if (import.meta.env.DEV) console.error(error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isConfig = error instanceof MissingConfigError;

    return (
      <main style={{ maxWidth: 560, margin: '18vh auto', padding: '0 24px' }}>
        <h1 style={{ fontSize: 32 }}>
          {isConfig ? 'The app is not configured' : 'Something went wrong'}
        </h1>
        <p className="muted">
          {isConfig
            ? error.message
            : 'The page could not be displayed. The problem has been reported. Reloading usually helps — if it does not, contact support.'}
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => window.location.reload()}
        >
          Reload the page
        </button>
      </main>
    );
  }
}
