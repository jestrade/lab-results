/**
 * Typed, validated access to build-time configuration.
 *
 * Vite inlines `import.meta.env.VITE_*` at build time, so a missing variable
 * is a silent `undefined` deep inside the Firebase SDK rather than an error at
 * the point of the mistake. Reading config through here turns that into one
 * clear failure at startup, listing everything that is missing.
 */

interface FirebaseEnv {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

const FIREBASE_KEYS = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
} as const satisfies Record<keyof FirebaseEnv, string>;

export class MissingConfigError extends Error {
  constructor(public readonly missing: string[]) {
    super(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        'Copy .env.example to .env.local and fill it in — see docs/setup.md.',
    );
    this.name = 'MissingConfigError';
  }
}

export function readFirebaseEnv(source: Record<string, unknown> = import.meta.env): FirebaseEnv {
  const missing: string[] = [];
  const out = {} as FirebaseEnv;

  for (const [field, varName] of Object.entries(FIREBASE_KEYS) as [
    keyof FirebaseEnv,
    string,
  ][]) {
    const value = source[varName];
    if (typeof value !== 'string' || value.trim() === '') {
      missing.push(varName);
      continue;
    }
    out[field] = value;
  }

  if (missing.length > 0) throw new MissingConfigError(missing);
  return out;
}

function flag(value: unknown): boolean {
  return value === 'true' || value === true;
}

export const useEmulators = flag(import.meta.env.VITE_USE_FIREBASE_EMULATORS);
export const sentryDsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined) ?? '';
export const sentryEnvironment =
  (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ?? 'development';
export const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev';
export const isProduction = import.meta.env.PROD;
