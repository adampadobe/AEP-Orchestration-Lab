/**
 * Firestore Admin SDK with optional non-default database (multi-DB).
 * Sandbox `adbe-gcp0819` has `(default)` in Datastore mode; Native data lives in `aep-lab`.
 */
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

const SANDBOX_PROJECT_ID = 'adbe-gcp0819';
const SANDBOX_NATIVE_DATABASE_ID = 'aep-lab';

let cachedDb = null;

function resolveFirestoreDatabaseId() {
  const explicit = String(process.env.FIRESTORE_DATABASE_ID || '').trim();
  if (explicit) return explicit;
  const projectId = String(
    process.env.GCLOUD_PROJECT
      || process.env.GCP_PROJECT
      || process.env.GOOGLE_CLOUD_PROJECT
      || '',
  ).trim();
  if (projectId === SANDBOX_PROJECT_ID) return SANDBOX_NATIVE_DATABASE_ID;
  return '';
}

function getAdminFirestore() {
  if (!admin.apps.length) admin.initializeApp();
  if (cachedDb) return cachedDb;
  const databaseId = resolveFirestoreDatabaseId();
  cachedDb = databaseId ? getFirestore(admin.app(), databaseId) : getFirestore();
  return cachedDb;
}

module.exports = {
  getAdminFirestore,
  resolveFirestoreDatabaseId,
  SANDBOX_NATIVE_DATABASE_ID,
};
