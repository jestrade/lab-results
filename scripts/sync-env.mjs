#!/usr/bin/env node
/**
 * Fans the single root `.env` out to where each runtime can read it.
 *
 * There is **one** file a human edits: `.env` at the repository root. The
 * `functions/.env*` files are generated from it, are gitignored, and must never
 * be hand-edited — the same arrangement as `quotas.generated.json`.
 *
 * ── The one rule that matters ────────────────────────────────────────────
 *
 *   VITE_*  →  public. Vite inlines these into the browser bundle at build
 *              time. Anyone can read them. This is fine for Firebase web
 *              config, which identifies the project rather than granting
 *              access to it.
 *
 *   others  →  server-only. Vite does not expose unprefixed variables to the
 *              client, so they stay out of the bundle. These are routed to the
 *              Cloud Functions instead.
 *
 * That single prefix is the whole security boundary between "published to the
 * world" and "server-side secret", which is why this script refuses to run if
 * a known secret is found wearing a VITE_ prefix.
 *
 * Server variables are split again, because Firebase treats the two files
 * differently:
 *
 *   functions/.env        deployed as function environment config, readable by
 *                         anyone with project access. Non-secret selection only.
 *   functions/.env.local  emulator only. Firebase never deploys it. Secrets.
 *
 * Deployed secrets do not come from either file — they come from Secret
 * Manager (`firebase functions:secrets:set`). These files are a local
 * development convenience.
 *
 * ── The one exception to the prefix rule ─────────────────────────────────
 *
 * Firebase AI Logic (`AI_MODEL=firebase`) runs inside a Cloud Function but
 * authenticates with the *web* config — the same apiKey/projectId/appId the
 * browser bundle already carries. So three `VITE_FIREBASE_*` values are
 * mirrored, unprefixed, into `functions/.env` as well.
 *
 * That is not a hole in the boundary. The boundary exists to stop secrets
 * reaching the browser; this moves public values the other way, toward the
 * server, and the alternative — asking a human to keep two copies of the same
 * project id in one file in sync — is the version that eventually goes wrong.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = join(root, '.env');

/**
 * Names that must never be published, whatever prefix someone gives them.
 * Add to this list when a new credential appears.
 */
const SECRETS = new Set(['GEMINI_API_KEY', 'SENTRY_AUTH_TOKEN', 'FIREBASE_SERVICE_ACCOUNT']);

function parse(text) {
  const entries = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    entries.push([match[1], match[2].replace(/^["']|["']$/g, '')]);
  }
  return entries;
}

function render(header, entries) {
  const body = entries.map(([key, value]) => `${key}=${value}`).join('\n');
  return `${header}\n${body}\n`;
}

if (!existsSync(sourcePath)) {
  // CI has no root .env — it injects configuration directly and reads secrets
  // from Secret Manager. Not an error, just nothing to do.
  console.log('sync-env: no root .env found, nothing to sync.');
  process.exit(0);
}

const entries = parse(readFileSync(sourcePath, 'utf8'));

// Guard: a secret behind a VITE_ prefix would be compiled into the browser
// bundle and published on the next deploy. Fail loudly rather than warn.
const leaked = entries.filter(
  ([key]) => key.startsWith('VITE_') && SECRETS.has(key.replace(/^VITE_/, '')),
);
if (leaked.length > 0) {
  console.error(
    `sync-env: refusing to continue — ${leaked
      .map(([key]) => key)
      .join(', ')} would be inlined into the browser bundle.\n` +
      'Remove the VITE_ prefix. Anything VITE_-prefixed is public.',
  );
  process.exit(1);
}

/**
 * Public web-config values the functions need for Firebase AI Logic, mirrored
 * from `VITE_<name>` to `<name>`. An explicit unprefixed entry in the root
 * .env wins, which is what lets a deployment point the functions at a
 * different Firebase app than the one in the bundle.
 */
const MIRRORED_TO_SERVER = ['FIREBASE_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_APP_ID'];

const declared = new Set(entries.map(([key]) => key));
const mirrored = MIRRORED_TO_SERVER.flatMap((name) => {
  if (declared.has(name)) return [];
  const source = entries.find(([key]) => key === `VITE_${name}`);
  return source ? [[name, source[1]]] : [];
});

const serverEntries = [...entries.filter(([key]) => !key.startsWith('VITE_')), ...mirrored];
const secretEntries = serverEntries.filter(([key]) => SECRETS.has(key));
const configEntries = serverEntries.filter(([key]) => !SECRETS.has(key));

const GENERATED = '# GENERATED by `npm run sync:env` from the root .env. Do not edit.';

writeFileSync(
  join(root, 'functions', '.env'),
  render(
    `${GENERATED}\n# Non-secret configuration. Firebase DEPLOYS this file, so treat it as public.`,
    configEntries,
  ),
);

writeFileSync(
  join(root, 'functions', '.env.local'),
  render(
    `${GENERATED}\n# Secrets, emulator only. Firebase never deploys .env.local.\n` +
      '# Deployed secrets come from Secret Manager: firebase functions:secrets:set <NAME>',
    secretEntries,
  ),
);

const viteCount = entries.filter(([key]) => key.startsWith('VITE_')).length;

console.log(
  `sync-env: ${configEntries.length} config + ${secretEntries.length} secret ` +
    `variable(s) written to functions/ ` +
    `(${mirrored.length} mirrored from VITE_ for Firebase AI Logic). ` +
    `${viteCount} VITE_ variable(s) left for the web app.`,
);
