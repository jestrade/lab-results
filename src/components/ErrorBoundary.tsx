import { Component, type ErrorInfo, type ReactNode } from 'react';
import * as Sentry from '@sentry/react';

import { translateStatic } from '@/i18n/resolve';
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
 *
 * Translated through `translateStatic` rather than the language context: this
 * boundary catches failures in the tree that *contains* the provider, so by
 * the time it renders there may be no context left to read. It resolves the
 * locale from storage and the browser directly, which is the same answer in
 * every case except an account preference that has not been applied yet.
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
          {translateStatic(isConfig ? 'error.notConfigured' : 'common.somethingWentWrong')}
        </h1>
        <p className="muted">
          {/* A configuration error prints its own message, untranslated: it is
              addressed to whoever is deploying the app, not to a reader. */}
          {isConfig ? error.message : translateStatic('error.pageFailed')}
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => window.location.reload()}
        >
          {translateStatic('common.reload')}
        </button>
      </main>
    );
  }
}
