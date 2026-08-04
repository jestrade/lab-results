/**
 * Firebase SDK singletons (KAN-1, KAN-4).
 *
 * Initialised lazily so that importing a module for a unit test does not spin
 * up a network client, and so the emulator wiring happens exactly once.
 */

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  type Auth,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';

import { readFirebaseEnv, useEmulators } from './env';

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let firestoreInstance: Firestore | undefined;
let storageInstance: FirebaseStorage | undefined;

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  app = getApps().length > 0 ? getApp() : initializeApp(readFirebaseEnv());
  return app;
}

export function getAuthClient(): Auth {
  if (authInstance) return authInstance;
  authInstance = getAuth(getFirebaseApp());
  if (useEmulators) {
    connectAuthEmulator(authInstance, 'http://127.0.0.1:9099', { disableWarnings: true });
  }
  return authInstance;
}

export function getDb(): Firestore {
  if (firestoreInstance) return firestoreInstance;
  firestoreInstance = getFirestore(getFirebaseApp());
  if (useEmulators) connectFirestoreEmulator(firestoreInstance, '127.0.0.1', 8080);
  return firestoreInstance;
}

export function getStorageClient(): FirebaseStorage {
  if (storageInstance) return storageInstance;
  storageInstance = getStorage(getFirebaseApp());
  if (useEmulators) connectStorageEmulator(storageInstance, '127.0.0.1', 9199);
  return storageInstance;
}

export function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  // Always show the chooser: on a shared machine, silently reusing the last
  // Google session would sign the wrong person into someone's health records.
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}
