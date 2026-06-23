/**
 * Per-user, per-sandbox recently generated profiles (Portal + MCP sync).
 * Collection: labProfileRecentGenerated/{uid__sandbox}
 */

const admin = require('firebase-admin');
const { buildRecentProfileLabels } = require('./labProfileRecentSummaryLabel');

const COLLECTION = 'labProfileRecentGenerated';
const ITEMS_LIMIT = 20;
const MAX_EMAIL_LEN = 200;
const MAX_ECID_LEN = 40;
const MAX_INDUSTRY_LEN = 32;
const MAX_LABEL_LEN = 500;
const MAX_SNAPSHOT_BYTES = 48_000;

let db;

function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

function docId(uid, sandbox) {
  const u = String(uid || '').trim().slice(0, 128);
  const s = String(sandbox || 'default').trim() || 'default';
  const safe = s.replace(/[:/\s.#$\[\]]/g, '_').slice(0, 200);
  return `${u}__${safe}`.slice(0, 800);
}

function isValidEmail(email) {
  const v = String(email || '').trim();
  if (!v || v.length < 6 || v.length > MAX_EMAIL_LEN) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function normalizeSource(source) {
  const s = String(source || 'portal').trim().toLowerCase();
  return s === 'mcp' ? 'mcp' : 'portal';
}

function itemIdForEmail(email) {
  return String(email || '').trim().toLowerCase().slice(0, MAX_EMAIL_LEN);
}

function trimSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return undefined;
  try {
    const json = JSON.stringify(snapshot);
    if (json.length > MAX_SNAPSHOT_BYTES) return undefined;
    return JSON.parse(json);
  } catch (_) {
    return undefined;
  }
}

function normalizeItem(raw, sandbox) {
  const email = String(raw.email || raw.scaledEmail || '').trim().slice(0, MAX_EMAIL_LEN);
  const ecid = String(raw.ecid || '').trim().slice(0, MAX_ECID_LEN);
  const industry = String(raw.industry || 'generic').trim().toLowerCase().slice(0, MAX_INDUSTRY_LEN) || 'generic';
  const generatedAt = String(raw.generatedAt || raw.ts || '').trim()
    || new Date().toISOString();
  const source = normalizeSource(raw.source);
  let summaryLabel = String(raw.summaryLabel || '').trim().slice(0, MAX_LABEL_LEN);
  const snapshot = trimSnapshot(raw.snapshot);
  const attributes = raw.attributes && typeof raw.attributes === 'object' ? raw.attributes : undefined;

  if (!summaryLabel && email) {
    const built = buildRecentProfileLabels({
      email,
      industry,
      snapshot,
      attributes,
      personName: raw.personName,
      mobilePhone: raw.mobilePhone,
    });
    summaryLabel = built.summaryLabel.slice(0, MAX_LABEL_LEN);
  }

  const personName = String(raw.personName || '').trim().slice(0, 120) || undefined;
  const mobilePhone = String(raw.mobilePhone || '').trim().slice(0, 32) || undefined;

  return {
    id: itemIdForEmail(email),
    email,
    ecid: ecid || undefined,
    industry,
    sandbox: String(sandbox || raw.sandbox || '').trim(),
    summaryLabel,
    generatedAt,
    source,
    personName,
    mobilePhone,
    snapshot,
    n: Number.isFinite(Number(raw.n)) ? Math.floor(Number(raw.n)) : undefined,
    ts: Date.parse(generatedAt) || Date.now(),
  };
}

function sortItemsNewestFirst(items) {
  return [...items].sort((a, b) => {
    const ta = Date.parse(a.generatedAt) || a.ts || 0;
    const tb = Date.parse(b.generatedAt) || b.ts || 0;
    return tb - ta;
  });
}

function dedupeItems(items) {
  const byEmail = new Map();
  for (const item of sortItemsNewestFirst(items)) {
    if (!item || !item.email) continue;
    const key = itemIdForEmail(item.email);
    if (!byEmail.has(key)) byEmail.set(key, item);
  }
  return sortItemsNewestFirst([...byEmail.values()]).slice(0, ITEMS_LIMIT);
}

function serializeItemForApi(item) {
  const out = {
    id: item.id,
    email: item.email,
    ecid: item.ecid || null,
    industry: item.industry,
    sandbox: item.sandbox,
    summaryLabel: item.summaryLabel,
    generatedAt: item.generatedAt,
    source: item.source,
    personName: item.personName || null,
    mobilePhone: item.mobilePhone || null,
    n: item.n != null ? item.n : null,
    ts: item.ts,
  };
  if (item.snapshot) out.snapshot = item.snapshot;
  return out;
}

async function listItems(uid, sandbox) {
  const name = String(sandbox || '').trim();
  if (!name) throw new Error('sandbox is required');
  const userId = String(uid || '').trim().slice(0, 128);
  if (!userId) throw new Error('uid is required');

  const ref = getDb().collection(COLLECTION).doc(docId(userId, name));
  const snap = await ref.get();
  if (!snap.exists) {
    return { uid: userId, sandbox: name, items: [] };
  }
  const data = snap.data() || {};
  const items = dedupeItems(
    (Array.isArray(data.items) ? data.items : []).map((row) => normalizeItem(row, name)),
  );
  return { uid: userId, sandbox: name, items: items.map(serializeItemForApi) };
}

/**
 * Append or upsert one recent profile (newest first, cap ITEMS_LIMIT).
 * @param {string} uid
 * @param {string} sandbox
 * @param {object} item
 */
async function appendItem(uid, sandbox, item) {
  const name = String(sandbox || '').trim();
  if (!name) throw new Error('sandbox is required');
  const userId = String(uid || '').trim().slice(0, 128);
  if (!userId) throw new Error('uid is required');

  const normalized = normalizeItem(item, name);
  if (!isValidEmail(normalized.email)) {
    throw Object.assign(new Error('email is required and must be valid'), { status: 400 });
  }

  const ref = getDb().collection(COLLECTION).doc(docId(userId, name));
  const now = admin.firestore.FieldValue.serverTimestamp();

  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? (snap.data() || {}) : {};
    const existing = Array.isArray(prev.items) ? prev.items : [];
    const merged = dedupeItems([
      normalized,
      ...existing.map((row) => normalizeItem(row, name)),
    ]);
    tx.set(ref, {
      uid: userId,
      sandbox: name,
      items: merged.map((row) => {
        const serialized = serializeItemForApi(row);
        if (row.snapshot) serialized.snapshot = row.snapshot;
        return serialized;
      }),
      updatedAt: now,
    }, { merge: true });
  });

  const listed = await listItems(userId, name);
  const saved = listed.items.find((row) => row.id === normalized.id) || listed.items[0];
  return { item: saved, items: listed.items };
}

/**
 * Bulk append for localStorage migration (skips invalid emails).
 * @param {string} uid
 * @param {string} sandbox
 * @param {object[]} items
 */
async function appendMany(uid, sandbox, items) {
  const name = String(sandbox || '').trim();
  if (!name) throw new Error('sandbox is required');
  const userId = String(uid || '').trim().slice(0, 128);
  if (!userId) throw new Error('uid is required');
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) return listItems(userId, name);

  const ref = getDb().collection(COLLECTION).doc(docId(userId, name));
  const now = admin.firestore.FieldValue.serverTimestamp();
  const normalizedIncoming = rows
    .map((row) => normalizeItem(row, name))
    .filter((row) => isValidEmail(row.email));

  if (!normalizedIncoming.length) return listItems(userId, name);

  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? (snap.data() || {}) : {};
    const existing = Array.isArray(prev.items) ? prev.items : [];
    const merged = dedupeItems([
      ...normalizedIncoming,
      ...existing.map((row) => normalizeItem(row, name)),
    ]);
    tx.set(ref, {
      uid: userId,
      sandbox: name,
      items: merged.map((row) => {
        const serialized = serializeItemForApi(row);
        if (row.snapshot) serialized.snapshot = row.snapshot;
        return serialized;
      }),
      updatedAt: now,
    }, { merge: true });
  });

  return listItems(userId, name);
}

module.exports = {
  COLLECTION,
  ITEMS_LIMIT,
  docId,
  isValidEmail,
  normalizeItem,
  dedupeItems,
  buildRecentProfileLabels,
  listItems,
  appendItem,
  appendMany,
};
