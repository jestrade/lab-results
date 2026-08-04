/**
 * Cloud Functions entry point.
 *
 * initializeApp() runs once here, before any handler module is imported, so
 * every handler can call getFirestore()/getStorage() without repeating it.
 */

import { initializeApp } from 'firebase-admin/app';

initializeApp();

/**
 * ── Always deep-import from firebase-functions ──────────────────────────
 *
 * Use `firebase-functions/logger`, `firebase-functions/v2/storage` and so on.
 * Never the root `firebase-functions` barrel.
 *
 * The barrel re-exports every provider, including Realtime Database, which
 * pulls in firebase-admin's database module, which needs `@firebase/app` —
 * a package nothing here installs. The result is not a build error. It is a
 * deployed container that dies on load with
 *
 *     Error: Cannot find module '@firebase/app'
 *
 * and surfaces only as "Container Healthcheck failed", which points nowhere
 * near the real cause. This bit us once; the deep imports are what prevent it.
 */

export { onReportUploaded, onReportDeleted } from './usage';
export { reconcileUsage } from './reconcile';
export { setUserRole } from './roles';
export { aiHealthCheck } from './ai/healthCheck';
