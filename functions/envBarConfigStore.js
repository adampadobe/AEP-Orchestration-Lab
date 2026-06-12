/**
 * Firestore-backed defaults for shared env bar demos.
 * Collection: envBarConfigs/{demoId}
 *
 * Example document (no seed required — demos fall back to page envBarConfig):
 * {
 *   demoId: "ksia",
 *   prefix: "ksia",
 *   defaultSandbox: "apalmer",
 *   variant: "spectrum",
 *   features: { webPush: true, bc: true, decisioning: true },
 *   defaultBcStyle: "miral",
 *   updatedAt: <server timestamp>
 * }
 */

const admin = require('firebase-admin');

const COLLECTION = 'envBarConfigs';

let db;
function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

function docId(demoId) {
  const s = String(demoId || '').trim().toLowerCase();
  if (!s) return '';
  return s.replace(/[/\s.#$\[\]]/g, '_').slice(0, 128);
}

function sanitizeConfig(data) {
  if (!data || typeof data !== 'object') return null;
  const out = {};
  const allow = [
    'demoId',
    'prefix',
    'defaultSandbox',
    'availableSandboxes',
    'variant',
    'mode',
    'defaultBcStyle',
    'disclaimer',
    'labCoreScript',
    'storagePrefix',
    'features',
    'decisioning',
    'siteCloneDemoEnv',
    'envBar',
    'iframeIds',
  ];
  for (const key of allow) {
    if (data[key] !== undefined) out[key] = data[key];
  }
  if (out.prefix && !out.demoId) out.demoId = out.prefix;
  return Object.keys(out).length ? out : null;
}

/**
 * @param {string} demoId
 * @returns {Promise<object|null>}
 */
async function getEnvBarConfig(demoId) {
  const id = docId(demoId);
  if (!id) return null;
  const snap = await getDb().collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return sanitizeConfig(snap.data());
}

module.exports = { getEnvBarConfig, docId, COLLECTION };
