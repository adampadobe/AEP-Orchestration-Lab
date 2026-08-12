'use strict';

const crypto = require('node:crypto');
const admin = require('firebase-admin');
const { getAdminFirestore } = require('./adminFirestore');

const KEYS_COLLECTION = 'pdfJourneyApiKeys';
const MAX_ACTIVE_KEYS_PER_USER = 10;
const MAX_KEYS_RETURNED = 50;
const DEFAULT_KEY_LABEL = 'AJO custom action';

function getDb(deps = {}) {
  return deps.firestore || getAdminFirestore();
}

function nowValue(deps = {}) {
  return deps.nowValue ? deps.nowValue() : admin.firestore.FieldValue.serverTimestamp();
}

function normalizeKeyLabel(raw) {
  return String(raw || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function hashApiKey(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function generatePlaintextKey() {
  return `pdf_${crypto.randomBytes(32).toString('base64url')}`;
}

function generateKeyId() {
  return crypto.randomBytes(6).toString('hex');
}

function timestampToIso(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function serializeKey(data) {
  return {
    keyId: String(data && data.keyId || ''),
    keyPrefix: String(data && data.keyPrefix || ''),
    keyLabel: normalizeKeyLabel(data && data.keyLabel) || DEFAULT_KEY_LABEL,
    createdAt: timestampToIso(data && data.createdAt),
    lastUsedAt: timestampToIso(data && data.lastUsedAt),
    revoked: !!(data && data.revoked),
  };
}

async function listKeysForUser(uid, deps = {}) {
  const principalUid = String(uid || '').trim().slice(0, 128);
  if (!principalUid) return [];
  const snapshot = await getDb(deps)
    .collection(KEYS_COLLECTION)
    .where('principalUid', '==', principalUid)
    .get();
  return snapshot.docs
    .map((doc) => serializeKey({ keyId: doc.id, ...(doc.data() || {}) }))
    .filter((key) => !key.revoked)
    .sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0))
    .slice(0, MAX_KEYS_RETURNED);
}

async function createKey(input, deps = {}) {
  const principalUid = String(input && input.uid || '').trim().slice(0, 128);
  if (!principalUid) throw Object.assign(new Error('uid is required'), { status: 400 });
  const active = await listKeysForUser(principalUid, deps);
  if (active.length >= MAX_ACTIVE_KEYS_PER_USER) {
    throw Object.assign(
      new Error(`You already have ${MAX_ACTIVE_KEYS_PER_USER} active PDF journey keys. Revoke one first.`),
      { status: 409 },
    );
  }

  const plaintext = generatePlaintextKey();
  const keyId = generateKeyId();
  const keyPrefix = plaintext.slice(0, 12);
  const keyLabel = normalizeKeyLabel(input.keyLabel) || DEFAULT_KEY_LABEL;
  const createdAt = nowValue(deps);
  await getDb(deps).collection(KEYS_COLLECTION).doc(keyId).set({
    keyId,
    keyHash: hashApiKey(plaintext),
    keyPrefix,
    keyLabel,
    principalUid,
    principalEmail: String(input.email || '').trim().toLowerCase().slice(0, 160),
    scope: 'pdf:journey-action',
    revoked: false,
    createdAt,
    lastUsedAt: null,
  });
  return {
    key: plaintext,
    keyId,
    keyPrefix,
    keyLabel,
    createdAt: new Date().toISOString(),
  };
}

async function revokeKey(uid, keyId, deps = {}) {
  const principalUid = String(uid || '').trim().slice(0, 128);
  const id = String(keyId || '').trim().slice(0, 12);
  if (!principalUid || !/^[a-f0-9]{12}$/.test(id)) {
    throw Object.assign(new Error('A valid keyId is required'), { status: 400 });
  }
  const ref = getDb(deps).collection(KEYS_COLLECTION).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw Object.assign(new Error('PDF journey key not found'), { status: 404 });
  const data = snapshot.data() || {};
  if (String(data.principalUid || '') !== principalUid) {
    throw Object.assign(new Error('Not authorised to revoke this key'), { status: 403 });
  }
  if (!data.revoked) {
    await ref.update({ revoked: true, revokedAt: nowValue(deps) });
  }
  return { keyId: id, revoked: true, alreadyRevoked: !!data.revoked };
}

async function validateApiKey(apiKey, deps = {}) {
  const supplied = String(apiKey || '').trim();
  if (!supplied.startsWith('pdf_') || supplied.length < 32) return { ok: false };
  const keyHash = hashApiKey(supplied);
  const snapshot = await getDb(deps)
    .collection(KEYS_COLLECTION)
    .where('keyHash', '==', keyHash)
    .limit(1)
    .get();
  if (snapshot.empty) return { ok: false };
  const doc = snapshot.docs[0];
  const data = doc.data() || {};
  if (data.revoked || data.scope !== 'pdf:journey-action') return { ok: false };
  doc.ref.update({ lastUsedAt: nowValue(deps) }).catch(() => {});
  return {
    ok: true,
    keyId: doc.id,
    principalUid: String(data.principalUid || '').trim(),
    principalEmail: data.principalEmail ? String(data.principalEmail) : null,
    scope: data.scope,
  };
}

module.exports = {
  KEYS_COLLECTION,
  MAX_ACTIVE_KEYS_PER_USER,
  DEFAULT_KEY_LABEL,
  normalizeKeyLabel,
  hashApiKey,
  generatePlaintextKey,
  serializeKey,
  listKeysForUser,
  createKey,
  revokeKey,
  validateApiKey,
};
