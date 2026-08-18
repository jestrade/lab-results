#!/usr/bin/env node
/**
 * Creates or promotes an administrator (KAN-2, KAN-50).
 *
 *   node functions/scripts/grant-admin.mjs --email you@example.com
 *   node functions/scripts/grant-admin.mjs --email you@example.com --password '…'
 *   node functions/scripts/grant-admin.mjs --email you@example.com --revoke
 *
 * ── Why this script exists at all ─────────────────────────────────────────
 *
 * `setUserRole` in functions/src/roles.ts is the supported way to grant admin,
 * and it requires an admin caller — so it cannot mint the first one. That is
 * not an oversight: a callable that could promote an account without an
 * existing admin behind it would be a privilege-escalation endpoint on the
 * public internet. The bootstrap therefore has to come from something holding
 * service-account credentials, which is this.
 *
 * Use it once per project. After the first admin exists, /admin/users does the
 * rest through the callable, with the audit trail that comes with it.
 *
 * ── What it writes ────────────────────────────────────────────────────────
 *
 * Three things, and all three are needed for an admin that actually works:
 *
 *   1. the Auth user, created if absent
 *   2. the `role` custom claim — the only thing firestore.rules and
 *      storage.rules trust
 *   3. the `role` mirror on users/{uid}, which is what /admin/users lists and
 *      what the overview counts. An admin bootstrapped without it is an admin
 *      the console cannot see.
 *
 * It also writes an `auditLogs` entry, for the same reason `roles.ts` does: a
 * grant nobody recorded is a grant nobody can account for afterwards.
 *
 * ── Passwords ─────────────────────────────────────────────────────────────
 *
 * `--password` is only read when the account is being created, and it is never
 * echoed. Prefer `--password-stdin`, which keeps it out of your shell history
 * and out of the process list:
 *
 *   printf '%s' 'the-password' | node functions/scripts/grant-admin.mjs \
 *     --email you@example.com --password-stdin
 *
 * An existing account's password is left alone. Changing somebody's password
 * from a script is not a thing this needs to be able to do, and the account
 * holder has the reset flow.
 *
 * Credentials come from the environment, the same as every other script here:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   export FIREBASE_AUTH_EMULATOR_HOST=localhost:9099   # to target the emulator
 */

const args = process.argv.slice(2);

function flag(name) {
  return args.includes(`--${name}`);
}

function option(name) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

const email = option('email');
const revoke = flag('revoke');
const verify = !flag('no-verify');

if (!email) {
  console.error(
    'Usage: node functions/scripts/grant-admin.mjs --email <address> [--password <pw> | --password-stdin] [--revoke]',
  );
  process.exit(1);
}

async function readPassword() {
  if (flag('password-stdin')) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8').trim();
  }
  return option('password');
}

const usingEmulator = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !usingEmulator) {
  console.error(
    'Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key, or ' +
      'FIREBASE_AUTH_EMULATOR_HOST to target the emulator.',
  );
  process.exit(1);
}

const { initializeApp, applicationDefault } = await import('firebase-admin/app');
const { getAuth } = await import('firebase-admin/auth');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

initializeApp({ credential: applicationDefault() });
const auth = getAuth();
const db = getFirestore();

/** The account, created if this is a bootstrap rather than a promotion. */
async function resolveUser() {
  try {
    const existing = await auth.getUserByEmail(email);
    console.log(`Found existing account ${existing.uid}.`);
    return { user: existing, created: false };
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }

  const password = await readPassword();
  if (!password) {
    console.error(
      `No account exists for ${email}.\n` +
        'Pass --password <pw> or --password-stdin to create one.',
    );
    process.exit(1);
  }
  if (password.length < 8) {
    // Firebase itself rejects under six. Eight is this project's floor for an
    // account that can read every other account in the system.
    console.error('Refusing to create an admin with a password under 8 characters.');
    process.exit(1);
  }

  const user = await auth.createUser({
    email,
    password,
    // Marked verified because there is nobody to send a verification link to
    // yet — this is the bootstrap, and an admin who cannot pass the
    // `RequireVerifiedEmail` gate cannot do the job they were created for.
    // `--no-verify` leaves the normal flow in place.
    emailVerified: verify,
  });
  console.log(`Created account ${user.uid}.`);
  return { user, created: true };
}

const { user, created } = await resolveUser();
const role = revoke ? 'user' : 'admin';
const previousRole = user.customClaims?.role ?? 'user';

// Merged into whatever claims are already there. Replacing the object would
// drop any claim a later feature adds beside this one.
await auth.setCustomUserClaims(user.uid, { ...user.customClaims, role });

// The display mirror. `firestore.rules` forbids the account itself from
// writing this field, and /admin/users reads it — an admin granted the claim
// without it is an admin the console cannot see, and the overview cannot count.
await db.collection('users').doc(user.uid).set(
  { role, email, updatedAt: FieldValue.serverTimestamp() },
  { merge: true },
);

// Same entry `setUserRole` writes, with a null actor: this ran with
// service-account credentials, so there is no signed-in admin to name and
// inventing one would be worse than recording the truth.
await db.collection('auditLogs').add({
  action: 'role.changed',
  actorId: null,
  actorNote: 'grant-admin.mjs',
  targetId: user.uid,
  previousRole,
  newRole: role,
  at: FieldValue.serverTimestamp(),
});

console.log(
  `\n${email} is now "${role}" (was "${previousRole}").` +
    (created ? '\nThe account was created by this run.' : '') +
    '\n\nThe claim reaches an open session on its next token refresh — within the' +
    '\nhour, or immediately on a fresh sign-in.',
);
process.exit(0);
