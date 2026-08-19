/**
 * The Admin SDK plumbing the seeding scripts share.
 *
 * Extracted so that `seed.mjs` and `import-variables.mjs --push` write
 * reference data the same way. They must: both are create-only, and a second
 * implementation of "create, count the collisions, never edit" is a second
 * chance to get the never-edit part wrong.
 */

/**
 * A Firestore handle, or a readable error about why there isn't one.
 *
 * The emulator accepts any credential; production needs a real one, and
 * failing here beats failing later with "16 UNAUTHENTICATED".
 */
export async function openFirestore() {
  if (!process.env.FIRESTORE_EMULATOR_HOST && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      'Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key, or ' +
        'FIRESTORE_EMULATOR_HOST to target the emulator.',
    );
  }

  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');

  initializeApp({ credential: applicationDefault() });
  return { db: getFirestore(), FieldValue };
}

/** What the run is pointed at, for the line printed before it starts. */
export function target() {
  return process.env.FIRESTORE_EMULATOR_HOST ?? 'the live project';
}

/**
 * Writes documents that do not exist yet, leaving the ones that do.
 *
 * `create()` rather than `set()` is the whole point. Re-running a seed against
 * a project where an admin has since corrected an entry must not undo the
 * correction, and ALREADY_EXISTS is the expected, correct outcome rather than
 * a failure.
 */
export async function createAll(db, FieldValue, collection, documents, { dryRun = false } = {}) {
  let created = 0;
  let skipped = 0;

  for (const document of documents) {
    const ref = db.collection(collection).doc(document.id);

    if (dryRun) {
      if ((await ref.get()).exists) skipped += 1;
      else created += 1;
      continue;
    }

    try {
      await ref.create({ ...document, createdAt: FieldValue.serverTimestamp() });
      created += 1;
    } catch (error) {
      if (error?.code === 6 || /already exists/i.test(String(error?.message))) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }

  return { created, skipped };
}
