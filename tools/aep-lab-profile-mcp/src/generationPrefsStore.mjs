import { FieldValue } from 'firebase-admin/firestore';

import { getFirestoreDb } from './firestoreAdmin.mjs';

const COLLECTION = 'labProfileGenerationPrefs';
const DEFAULT_MOBILE_PHONE = '+447425627462';
const MAX_EMAIL_LEN = 200;
const MAX_PHONE_LEN = 32;

function docId(uid, sandbox) {
  const userId = String(uid || '').trim().slice(0, 128);
  const safeSandbox = (String(sandbox || 'default').trim() || 'default')
    .replace(/[:/\s.#$\[\]]/g, '_')
    .slice(0, 200);
  return `${userId}__${safeSandbox}`.slice(0, 800);
}

function todayYmd(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function scaleEmail(base, counterN, date = new Date()) {
  const email = String(base || '').trim();
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return '';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const suffix = `${day}${month}${date.getFullYear()}-${counterN}`;
  return local.includes('+')
    ? `${local}-${suffix}@${domain}`
    : `${local}+${suffix}@${domain}`;
}

function isValidEmail(value) {
  const email = String(value || '').trim();
  return email.length >= 6
    && email.length <= MAX_EMAIL_LEN
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizePrefs(data, sandbox, now = new Date()) {
  const raw = data && typeof data === 'object' ? data : {};
  const today = todayYmd(now);
  let counterN = Number(raw.counterN);
  if (!Number.isFinite(counterN) || counterN < 1) counterN = 1;
  counterN = Math.floor(counterN);
  let counterDate = String(raw.counterDate || '').trim();
  if (counterDate !== today) {
    counterN = 1;
    counterDate = today;
  }
  const mobilePhone = String(raw.mobilePhone || DEFAULT_MOBILE_PHONE)
    .trim()
    .slice(0, MAX_PHONE_LEN);
  return {
    uid: String(raw.uid || '').trim().slice(0, 128),
    sandbox: String(sandbox || raw.sandbox || '').trim(),
    baseEmail: String(raw.baseEmail || '').trim().slice(0, MAX_EMAIL_LEN),
    mobilePhone: mobilePhone || DEFAULT_MOBILE_PHONE,
    counterN,
    counterDate,
    testProfile: raw.testProfile !== false,
    updatedAt: raw.updatedAt && typeof raw.updatedAt.toDate === 'function'
      ? raw.updatedAt.toDate().toISOString()
      : null,
  };
}

function prefsWithPreview(prefs, now = new Date()) {
  return {
    ...prefs,
    nextScaledEmail: isValidEmail(prefs.baseEmail)
      ? scaleEmail(prefs.baseEmail, prefs.counterN, now)
      : '',
    emailPattern: '<local>+DDMMYYYY-N@<domain> (daily counter resets per sandbox)',
  };
}

function validateIdentity(uid, sandbox) {
  const principalUid = String(uid || '').trim().slice(0, 128);
  const sandboxName = String(sandbox || '').trim();
  if (!principalUid) throw Object.assign(new Error('uid is required'), { status: 401 });
  if (!sandboxName) throw Object.assign(new Error('sandbox is required'), { status: 400 });
  return { principalUid, sandboxName };
}

async function resolveDb(options) {
  return options?.db || getFirestoreDb();
}

function success(data) {
  return { ok: true, status: 200, url: 'firestore://labProfileGenerationPrefs', data };
}

function failure(error, sandbox) {
  const status = Number(error?.status) || 500;
  const message = String(error?.message || error);
  return {
    ok: false,
    status,
    url: 'firestore://labProfileGenerationPrefs',
    error: message,
    data: { ok: false, error: message, sandbox },
  };
}

export async function getGenerationPrefsForPrincipal(uid, sandbox, options = {}) {
  try {
    const { principalUid, sandboxName } = validateIdentity(uid, sandbox);
    const db = await resolveDb(options);
    if (!db) throw Object.assign(new Error('Firestore is unavailable'), { status: 503 });
    const snap = await db.collection(COLLECTION).doc(docId(principalUid, sandboxName)).get();
    const now = options.now || new Date();
    const prefs = prefsWithPreview(normalizePrefs({
      ...(snap.exists ? snap.data() : {}),
      uid: principalUid,
      sandbox: sandboxName,
    }, sandboxName, now), now);
    return success({ ok: true, prefs, authSource: 'mcp-principal' });
  } catch (error) {
    return failure(error, sandbox);
  }
}

export async function updateGenerationPrefsForPrincipal(uid, sandbox, patch, options = {}) {
  try {
    const { principalUid, sandboxName } = validateIdentity(uid, sandbox);
    const db = await resolveDb(options);
    if (!db) throw Object.assign(new Error('Firestore is unavailable'), { status: 503 });
    const ref = db.collection(COLLECTION).doc(docId(principalUid, sandboxName));
    const body = patch && typeof patch === 'object' ? patch : {};
    const now = options.now || new Date();
    const today = todayYmd(now);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const normalized = normalizePrefs({
        ...(snap.exists ? snap.data() : {}),
        uid: principalUid,
        sandbox: sandboxName,
      }, sandboxName, now);
      let baseEmail = normalized.baseEmail;
      if (body.baseEmail != null) {
        baseEmail = String(body.baseEmail || '').trim().slice(0, MAX_EMAIL_LEN);
        if (baseEmail && !isValidEmail(baseEmail)) {
          throw Object.assign(new Error('baseEmail is invalid'), { status: 400 });
        }
      }
      let mobilePhone = normalized.mobilePhone;
      if (body.mobilePhone != null) {
        mobilePhone = String(body.mobilePhone || '').trim().slice(0, MAX_PHONE_LEN)
          || DEFAULT_MOBILE_PHONE;
      }
      let counterN = normalized.counterN;
      if (body.resetCounter) {
        counterN = 1;
      } else if (body.counterN != null) {
        const nextCounter = Number(body.counterN);
        if (!Number.isFinite(nextCounter) || nextCounter < 1) {
          throw Object.assign(new Error('counterN must be a positive integer'), { status: 400 });
        }
        counterN = Math.floor(nextCounter);
      }
      tx.set(ref, {
        uid: principalUid,
        sandbox: sandboxName,
        baseEmail,
        mobilePhone,
        counterN,
        counterDate: today,
        testProfile: body.testProfile == null ? normalized.testProfile : !!body.testProfile,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    return getGenerationPrefsForPrincipal(principalUid, sandboxName, { ...options, db });
  } catch (error) {
    return failure(error, sandbox);
  }
}

export async function reserveGenerationEmailForPrincipal(uid, sandbox, options = {}) {
  try {
    const { principalUid, sandboxName } = validateIdentity(uid, sandbox);
    const db = await resolveDb(options);
    if (!db) throw Object.assign(new Error('Firestore is unavailable'), { status: 503 });
    const ref = db.collection(COLLECTION).doc(docId(principalUid, sandboxName));
    const now = options.now || new Date();
    const today = todayYmd(now);
    const reserved = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const prefs = normalizePrefs({
        ...(snap.exists ? snap.data() : {}),
        uid: principalUid,
        sandbox: sandboxName,
      }, sandboxName, now);
      if (!isValidEmail(prefs.baseEmail)) {
        throw Object.assign(
          new Error('baseEmail is required — set it in Profile Viewer or lab_set_generation_prefs'),
          { status: 400 },
        );
      }
      const scaledEmail = scaleEmail(prefs.baseEmail, prefs.counterN, now);
      tx.set(ref, {
        uid: principalUid,
        sandbox: sandboxName,
        baseEmail: prefs.baseEmail,
        mobilePhone: prefs.mobilePhone,
        counterN: prefs.counterN + 1,
        counterDate: today,
        testProfile: prefs.testProfile,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return {
        uid: principalUid,
        sandbox: sandboxName,
        baseEmail: prefs.baseEmail,
        mobilePhone: prefs.mobilePhone,
        scaledEmail,
        counterN: prefs.counterN,
        nextCounterN: prefs.counterN + 1,
        counterDate: today,
        testProfile: prefs.testProfile,
        emailPattern: '<local>+DDMMYYYY-N@<domain>',
      };
    });
    return success({ ok: true, ...reserved, authSource: 'mcp-principal' });
  } catch (error) {
    return failure(error, sandbox);
  }
}

export const generationPrefsInternals = {
  docId,
  todayYmd,
  scaleEmail,
  isValidEmail,
  normalizePrefs,
  prefsWithPreview,
};
