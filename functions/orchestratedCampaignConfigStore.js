/**
 * Persist Orchestrated Campaign trigger shortcuts per Adobe sandbox.
 * User-scoped records fall back to a shared sandbox baseline, matching the
 * Event Tool configuration pattern.
 */

const admin = require('firebase-admin');

const COLLECTION = 'orchestratedCampaignTriggerConfig';
const USER_COLLECTION = 'orchestratedCampaignTriggerConfigUser';

let db;
function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

function docId(sandbox) {
  const value = String(sandbox || 'default').trim() || 'default';
  return value.replace(/[/\s.#$\[\]]/g, '_').slice(0, 700);
}

function userDocId(uid, sandbox) {
  return `${String(uid || '').trim().slice(0, 128)}__${docId(sandbox)}`.slice(0, 800);
}

function cleanCampaigns(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const campaigns = [];
  for (const item of value.slice(0, 100)) {
    if (!item || typeof item !== 'object') continue;
    const name = String(item.name || '').trim().slice(0, 256);
    const campaignId = String(item.campaignId || '').trim().slice(0, 256);
    if (!name || !campaignId) continue;
    const key = `${name.toLowerCase()}\n${campaignId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const payloadText = item.payload && typeof item.payload === 'object'
      ? JSON.stringify(item.payload)
      : '';
    campaigns.push({
      name,
      campaignId,
      payload: payloadText && payloadText.length <= 100000 ? JSON.parse(payloadText) : null,
    });
  }
  return campaigns;
}

async function getSharedConfig(sandbox) {
  const name = String(sandbox || '').trim();
  if (!name) return null;
  const snap = await getDb().collection(COLLECTION).doc(docId(name)).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function getUserConfig(uid, sandbox) {
  const name = String(sandbox || '').trim();
  const user = String(uid || '').trim();
  if (!name || !user) return null;
  const snap = await getDb().collection(USER_COLLECTION).doc(userDocId(user, name)).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function saveToRef(ref, sandbox, uid, campaigns) {
  const record = {
    sandbox,
    campaigns: cleanCampaigns(campaigns),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (uid) record.uid = uid;
  await ref.set(record, { merge: true });
  const after = await ref.get();
  return after.exists ? { id: after.id, ...after.data() } : null;
}

async function getEffectiveConfig(sandbox, uid) {
  const user = String(uid || '').trim();
  if (user) {
    const userRecord = await getUserConfig(user, sandbox);
    if (userRecord) return userRecord;
  }
  return getSharedConfig(sandbox);
}

async function saveEffectiveConfig(sandbox, uid, campaigns) {
  const name = String(sandbox || '').trim();
  const user = String(uid || '').trim();
  if (!name) throw new Error('sandbox is required');
  if (!user) throw new Error('uid is required');
  const ref = getDb().collection(USER_COLLECTION).doc(userDocId(user, name));
  const saved = await saveToRef(ref, name, user, campaigns);

  // Best-effort shared baseline for users who have not saved their own list yet.
  try {
    await saveToRef(getDb().collection(COLLECTION).doc(docId(name)), name, '', campaigns);
  } catch (error) {
    console.warn('[orchestratedCampaignConfigStore] shared mirror failed', String(error?.message || error));
  }
  return saved;
}

module.exports = {
  COLLECTION,
  USER_COLLECTION,
  cleanCampaigns,
  getEffectiveConfig,
  saveEffectiveConfig,
};
