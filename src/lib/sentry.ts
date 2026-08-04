/**
 * Error tracking and performance monitoring (KAN-35).
 *
 * The important part of this file is not the wiring, it is `scrub`. This app
 * handles laboratory results; an error report that carries a value, a filename
 * or an email address turns the error tracker into an uncontrolled copy of
 * health data. So: no request bodies, no breadcrumb payloads from the app, and
 * a scrubbing pass over anything that could carry an identifier.
 */

import * as Sentry from '@sentry/react';

import { appVersion, isProduction, sentryDsn, sentryEnvironment } from './env';

/** Redacts values that look like an email address or a Firebase storage path. */
function scrubString(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/users\/[A-Za-z0-9_-]+\/reports\/[A-Za-z0-9_-]+\/[^\s"']+/g, 'users/[uid]/reports/[id]/[file]')
    .replace(/\b[\w-]+\.pdf\b/gi, '[report].pdf');
}

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.url) event.request.url = scrubString(event.request.url);
  }
  if (event.message) event.message = scrubString(event.message);

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubString(exception.value);
  }

  // Keep the user id — it is what makes a report actionable — but nothing that
  // identifies the person behind it.
  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : {};
  }

  event.breadcrumbs = event.breadcrumbs?.map((crumb) => ({
    ...crumb,
    message: crumb.message ? scrubString(crumb.message) : crumb.message,
    data: undefined,
  }));

  return event;
}

export function initMonitoring(): void {
  if (!sentryDsn) return; // Unconfigured is a supported state, not an error.

  Sentry.init({
    dsn: sentryDsn,
    environment: sentryEnvironment,
    release: appVersion,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: isProduction ? 0.1 : 1.0,
    // Session Replay would record the screen — i.e. the results. Never enable.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });
}

/** Associates subsequent events with a user id, and nothing else about them. */
export function setMonitoringUser(uid: string | null): void {
  if (!sentryDsn) return;
  Sentry.setUser(uid ? { id: uid } : null);
}

export { scrubString as __scrubStringForTests };
