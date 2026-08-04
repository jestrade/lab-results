/**
 * Cloud Functions entry point.
 *
 * initializeApp() runs once here, before any handler module is imported, so
 * every handler can call getFirestore()/getStorage() without repeating it.
 */

import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { onReportUploaded, onReportDeleted } from './usage';
export { reconcileUsage } from './reconcile';
export { setUserRole } from './roles';
