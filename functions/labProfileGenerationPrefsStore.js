/**
 * Per-user, per-sandbox profile generation prefs (Portal + MCP shared counter).
 * Collection: labProfileGenerationPrefs/{uid__sandbox}
 */

const admin = require('firebase-admin');

const COLLECTION = 'labProfileGenerationPrefs';
const DEFAULT_MOBILE_PHONE = '+447425627462';
const MAX_EMAIL_LEN = 200;
const MAX_PHONE_LEN = 32;

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

function todayYmd(date) {
  const d = date instanceof Date ? date : new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * Scale base email to plus-addressed pattern with today's DDMMYYYY and counter N.
 * Mirrors web/profile-viewer/profile-generation-shared.js scaleEmail.
 */
function scaleEmail(base, n, date) {
  const s = String(base || '').trim();
  if (!s.includes('@')) return '';
  const at = s.lastIndexOf('@');
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  if (!local || !domain) return '';
  const d = date instanceof Date ? date : new Date();
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  const counter = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  if (local.includes('+')) {
    return `${local}-${dd}${mm}${yyyy}-${counter}@${domain}`;
  }
  return `${local}+${dd}${mm}${yyyy}-${counter}@${domain}`;
}

function isValidEmail(email) {
  const v = String(email || '').trim();
  if (!v || v.length < 6 || v.length > MAX_EMAIL_LEN) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function normalizePrefs(data, sandbox, date = new Date()) {
  const raw = data && typeof data === 'object' ? data : {};
  const today = todayYmd(date);
  let counterN = Number(raw.counterN);
  if (!Number.isFinite(counterN) || counterN < 1) counterN = 1;
  counterN = Math.floor(counterN);

  let counterDate = String(raw.counterDate || '').trim();
  if (counterDate !== today) {
    counterN = 1;
    counterDate = today;
  }

  const baseEmail = String(raw.baseEmail || '').trim().slice(0, MAX_EMAIL_LEN);
  const mobilePhone = String(raw.mobilePhone || DEFAULT_MOBILE_PHONE).trim().slice(0, MAX_PHONE_LEN);
  const testProfile = raw.testProfile !== false;

  return {
    uid: String(raw.uid || '').trim().slice(0, 128),
    sandbox: String(sandbox || raw.sandbox || '').trim(),
    baseEmail,
    mobilePhone: mobilePhone || DEFAULT_MOBILE_PHONE,
    counterN,
    counterDate,
    testProfile,
    updatedAt: raw.updatedAt && typeof raw.updatedAt.toDate === 'function'
      ? raw.updatedAt.toDate().toISOString()
      : null,
  };
}

function prefsWithPreview(prefs, date = new Date()) {
  const nextScaledEmail = prefs.baseEmail && isValidEmail(prefs.baseEmail)
    ? scaleEmail(prefs.baseEmail, prefs.counterN, date)
    : '';
  return {
    ...prefs,
    nextScaledEmail,
    emailPattern: '<local>+DDMMYYYY-N@<domain> (daily UTC counter per account and sandbox)',
  };
}

async function getPrefs(uid, sandbox) {
  const name = String(sandbox || '').trim();
  if (!name) throw new Error('sandbox is required');
  const userId = String(uid || '').trim().slice(0, 128);
  if (!userId) throw new Error('uid is required');

  const ref = getDb().collection(COLLECTION).doc(docId(userId, name));
  const snap = await ref.get();
  const date = new Date();
  if (!snap.exists) {
    return prefsWithPreview(normalizePrefs({
      uid: userId,
      sandbox: name,
      baseEmail: '',
      mobilePhone: DEFAULT_MOBILE_PHONE,
      counterN: 1,
      counterDate: todayYmd(date),
      testProfile: true,
    }, name, date), date);
  }
  return prefsWithPreview(normalizePrefs({ ...snap.data(), uid: userId, sandbox: name }, name, date), date);
}

/**
 * @param {string} uid
 * @param {string} sandbox
 * @param {object} patch
 */
async function updatePrefs(uid, sandbox, patch) {
  const name = String(sandbox || '').trim();
  if (!name) throw new Error('sandbox is required');
  const userId = String(uid || '').trim().slice(0, 128);
  if (!userId) throw new Error('uid is required');

  const body = patch && typeof patch === 'object' ? patch : {};
  const ref = getDb().collection(COLLECTION).doc(docId(userId, name));

  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const date = new Date();
    const today = todayYmd(date);
    const prev = snap.exists ? (snap.data() || {}) : {};
    const normalized = normalizePrefs({ ...prev, uid: userId, sandbox: name }, name, date);

    let baseEmail = normalized.baseEmail;
    if (body.baseEmail != null) {
      const next = String(body.baseEmail || '').trim();
      if (next && !isValidEmail(next)) {
        throw Object.assign(new Error('baseEmail is invalid'), { status: 400 });
      }
      baseEmail = next;
    }

    let mobilePhone = normalized.mobilePhone;
    if (body.mobilePhone != null) {
      mobilePhone = String(body.mobilePhone || '').trim().slice(0, MAX_PHONE_LEN) || DEFAULT_MOBILE_PHONE;
    }

    let counterN = normalized.counterN;
    let counterDate = normalized.counterDate;
    if (body.resetCounter) {
      counterN = 1;
      counterDate = today;
    } else if (body.counterN != null) {
      const n = Number(body.counterN);
      if (!Number.isSafeInteger(n) || n < 1 || n >= Number.MAX_SAFE_INTEGER) {
        throw Object.assign(new Error('counterN must be a positive integer'), { status: 400 });
      }
      counterN = n;
      counterDate = today;
    }

    let testProfile = normalized.testProfile;
    if (body.testProfile != null) {
      testProfile = !!body.testProfile;
    }

    tx.set(ref, {
      uid: userId,
      sandbox: name,
      baseEmail,
      mobilePhone,
      counterN,
      counterDate,
      testProfile,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  return getPrefs(userId, name);
}

/**
 * Atomically reserve a batch from one base-email/date snapshot and advance counterN.
 * @returns {Promise<object>}
 */
async function reserveEmails(uid, sandbox, count, { expectedBaseEmail } = {}) {
  const name = String(sandbox || '').trim();
  if (!name) throw new Error('sandbox is required');
  const userId = String(uid || '').trim().slice(0, 128);
  if (!userId) throw new Error('uid is required');
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000) {
    throw Object.assign(new Error('count must be an integer between 1 and 1000'), { status: 400 });
  }

  const ref = getDb().collection(COLLECTION).doc(docId(userId, name));
  const now = admin.firestore.FieldValue.serverTimestamp();

  const result = await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const date = new Date();
    const today = todayYmd(date);
    const prev = snap.exists ? (snap.data() || {}) : {};
    const normalized = normalizePrefs({ ...prev, uid: userId, sandbox: name }, name, date);

    const baseEmail = String(normalized.baseEmail || '').trim();
    if (!baseEmail || !isValidEmail(baseEmail)) {
      throw Object.assign(new Error('baseEmail is required — set it in Profile Viewer or lab_set_generation_prefs'), { status: 400 });
    }
    if (expectedBaseEmail != null && baseEmail !== String(expectedBaseEmail).trim()) {
      throw Object.assign(new Error('Saved base email changed. Refresh email settings before generating.'), { status: 409 });
    }

    let counterN = normalized.counterN;
    let counterDate = normalized.counterDate;
    if (counterDate !== today) {
      counterN = 1;
      counterDate = today;
    }

    if (!Number.isSafeInteger(counterN + count)) {
      throw Object.assign(new Error('Email counter limit reached. Set a valid counter before generating.'), { status: 400 });
    }
    const emails = Array.from({ length: count }, (_, offset) => ({
      scaledEmail: scaleEmail(baseEmail, counterN + offset, date),
      counterN: counterN + offset,
    }));
    const usedN = counterN;
    const nextCounterN = counterN + count;

    tx.set(ref, {
      uid: userId,
      sandbox: name,
      baseEmail,
      mobilePhone: normalized.mobilePhone || DEFAULT_MOBILE_PHONE,
      counterN: nextCounterN,
      counterDate: today,
      testProfile: normalized.testProfile !== false,
      updatedAt: now,
    }, { merge: true });

    return {
      uid: userId,
      sandbox: name,
      baseEmail,
      mobilePhone: normalized.mobilePhone || DEFAULT_MOBILE_PHONE,
      scaledEmail: emails[0].scaledEmail,
      emails,
      count,
      counterN: usedN,
      nextCounterN,
      counterDate: today,
      testProfile: normalized.testProfile !== false,
      emailPattern: '<local>+DDMMYYYY-N@<domain>',
    };
  });

  return result;
}

async function reserveNextEmail(uid, sandbox, options) {
  const { emails, count, ...reserved } = await reserveEmails(uid, sandbox, 1, options);
  return reserved;
}

module.exports = {
  COLLECTION,
  DEFAULT_MOBILE_PHONE,
  docId,
  todayYmd,
  scaleEmail,
  isValidEmail,
  normalizePrefs,
  prefsWithPreview,
  getPrefs,
  updatePrefs,
  reserveNextEmail,
  reserveEmails,
};
