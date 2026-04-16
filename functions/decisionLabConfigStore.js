/**
 * Persist Decisioning lab (Edge) setup per AEP sandbox — Launch URL, datastream, placement fragments.
 * Same access pattern as eventConfigStore.js (shared doc + per-user doc).
 */

const admin = require('firebase-admin');

const COLLECTION = 'decisionLabConfig';
const USER_COLLECTION = 'decisionLabConfigUser';

const DEFAULT_PLACEMENTS = [
  { key: 'topRibbon', fragment: 'TopRibbon', label: 'Top ribbon' },
  { key: 'hero', fragment: 'hero-banner', label: 'Hero banner' },
  { key: 'contentCard', fragment: 'ContentCardContainer', label: 'Content card' },
];

let db;
function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

function docId(sandbox) {
  const s = String(sandbox || 'default').trim() || 'default';
  return s.replace(/[/\s.#$\[\]]/g, '_').slice(0, 700);
}

function userDocId(uid, sandbox) {
  const u = String(uid || '').trim().slice(0, 128);
  const d = docId(sandbox);
  return `${u}__${d}`.slice(0, 800);
}

function trim(val, max) {
  if (val == null) return '';
  return String(val).trim().slice(0, max);
}

function sanitizePlacements(raw) {
  if (!raw) return DEFAULT_PLACEMENTS.slice();
  if (!Array.isArray(raw)) return DEFAULT_PLACEMENTS.slice();
  const out = [];
  for (const p of raw.slice(0, 8)) {
    if (!p || typeof p !== 'object') continue;
    const key = trim(p.key, 64).replace(/[^a-zA-Z0-9_-]/g, '') || `slot${out.length}`;
    const fragment = trim(p.fragment, 128);
    const label = trim(p.label, 128);
    if (!fragment) continue;
    out.push({ key, fragment, label: label || fragment });
  }
  return out.length ? out : DEFAULT_PLACEMENTS.slice();
}

function sanitizeMode(m) {
  const s = String(m || '').trim().toLowerCase();
  if (s === 'decisionscopes' || s === 'decision_scopes') return 'decisionScopes';
  if (s === 'surfaces') return 'surfaces';
  return 'surfaces';
}

async function getDecisionLabConfig(sandbox) {
  const name = String(sandbox || '').trim();
  if (!name) return null;
  const snap = await getDb().collection(COLLECTION).doc(docId(name)).get();
  if (!snap.exists) return null;
  const data = snap.data();
  return data && typeof data === 'object' ? { id: snap.id, ...data } : null;
}

async function saveDecisionLabConfig(sandbox, patch) {
  const name = String(sandbox || '').trim();
  if (!name) throw new Error('sandbox is required');

  const ref = getDb().collection(COLLECTION).doc(docId(name));

  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists && snap.data() ? snap.data() : {};

    const merged = {
      sandbox: name,
      launchScriptUrl: trim(
        patch.launchScriptUrl !== undefined ? patch.launchScriptUrl : prev.launchScriptUrl,
        512,
      ),
      datastreamId: trim(
        patch.datastreamId !== undefined ? patch.datastreamId : prev.datastreamId,
        256,
      ),
      schemaTitle: trim(
        patch.schemaTitle !== undefined ? patch.schemaTitle : prev.schemaTitle,
        256,
      ),
      datasetName: trim(
        patch.datasetName !== undefined ? patch.datasetName : prev.datasetName,
        256,
      ),
      edgePersonalizationMode: sanitizeMode(
        patch.edgePersonalizationMode !== undefined
          ? patch.edgePersonalizationMode
          : prev.edgePersonalizationMode,
      ),
      placements: sanitizePlacements(
        patch.placements !== undefined ? patch.placements : prev.placements,
      ),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    tx.set(ref, merged, { merge: true });
  });

  const after = await ref.get();
  return after.exists ? { id: after.id, ...after.data() } : null;
}

async function getUserDecisionLabConfig(uid, sandbox) {
  const name = String(sandbox || '').trim();
  const u = String(uid || '').trim();
  if (!name || !u) return null;
  const snap = await getDb().collection(USER_COLLECTION).doc(userDocId(u, name)).get();
  if (!snap.exists) return null;
  const data = snap.data();
  return data && typeof data === 'object' ? { id: snap.id, ...data } : null;
}

async function saveUserDecisionLabConfig(uid, sandbox, patch) {
  const name = String(sandbox || '').trim();
  const u = String(uid || '').trim();
  if (!name) throw new Error('sandbox is required');
  if (!u) throw new Error('uid is required');

  const ref = getDb().collection(USER_COLLECTION).doc(userDocId(u, name));

  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists && snap.data() ? snap.data() : {};

    const merged = {
      uid: u,
      sandbox: name,
      launchScriptUrl: trim(
        patch.launchScriptUrl !== undefined ? patch.launchScriptUrl : prev.launchScriptUrl,
        512,
      ),
      datastreamId: trim(
        patch.datastreamId !== undefined ? patch.datastreamId : prev.datastreamId,
        256,
      ),
      schemaTitle: trim(
        patch.schemaTitle !== undefined ? patch.schemaTitle : prev.schemaTitle,
        256,
      ),
      datasetName: trim(
        patch.datasetName !== undefined ? patch.datasetName : prev.datasetName,
        256,
      ),
      edgePersonalizationMode: sanitizeMode(
        patch.edgePersonalizationMode !== undefined
          ? patch.edgePersonalizationMode
          : prev.edgePersonalizationMode,
      ),
      placements: sanitizePlacements(
        patch.placements !== undefined ? patch.placements : prev.placements,
      ),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    tx.set(ref, merged, { merge: true });
  });

  const after = await ref.get();
  return after.exists ? { id: after.id, ...after.data() } : null;
}

async function getEffectiveDecisionLabConfig(sandbox, uid) {
  const u = String(uid || '').trim();
  if (u) {
    const userRec = await getUserDecisionLabConfig(u, sandbox);
    if (userRec) return userRec;
  }
  return getDecisionLabConfig(sandbox);
}

async function saveEffectiveDecisionLabConfig(sandbox, uid, patch) {
  const u = String(uid || '').trim();
  if (u) return saveUserDecisionLabConfig(u, sandbox, patch);
  return saveDecisionLabConfig(sandbox, patch);
}

module.exports = {
  COLLECTION,
  USER_COLLECTION,
  DEFAULT_PLACEMENTS,
  getDecisionLabConfig,
  saveDecisionLabConfig,
  getUserDecisionLabConfig,
  saveUserDecisionLabConfig,
  getEffectiveDecisionLabConfig,
  saveEffectiveDecisionLabConfig,
  sanitizePlacements,
  docId,
};
