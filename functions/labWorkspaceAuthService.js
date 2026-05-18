const admin = require('firebase-admin');
const crypto = require('crypto');
const labUserSandboxStore = require('./labUserSandboxStore');

const APPROVAL_COLLECTION = 'labWorkspaceAccessApprovals';
const APPROVAL_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function getDb() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

function sanitizeName(v) {
  return String(v || '').trim().replace(/[\x00-\x1f<>]/g, '').slice(0, 80);
}

function sanitizeEmail(v) {
  return String(v || '').trim().toLowerCase().slice(0, 160);
}

function sanitizePassword(v) {
  return String(v || '').slice(0, 160);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim().toLowerCase());
}

function isAdobeComEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return e.endsWith('@adobe.com');
}

function toSlug(raw) {
  return String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function buildWorkspaceSlug(email, firstName, lastName) {
  const localPart = String(email || '').split('@')[0] || '';
  return toSlug(localPart) || toSlug(`${firstName}-${lastName}`) || 'workspace-user';
}

function approvalDocRef(uid) {
  return getDb().collection(APPROVAL_COLLECTION).doc(String(uid || '').trim().slice(0, 128));
}

function approvalToken() {
  return crypto.randomBytes(32).toString('hex');
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

function sanitizeHostOrigin(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) return '';
  return s.replace(/\/+$/, '');
}

function resolveBaseUrl(inputOrigin, configuredBaseUrl) {
  const preferred = sanitizeHostOrigin(configuredBaseUrl);
  if (preferred) return preferred;
  const reqOrigin = sanitizeHostOrigin(inputOrigin);
  if (reqOrigin) return reqOrigin;
  return 'https://aep-orchestration-lab.web.app';
}

function approvalUrl(baseUrl, uid, token) {
  const u = new URL('/api/lab/workspace-auth/approve', baseUrl);
  u.searchParams.set('uid', String(uid || ''));
  u.searchParams.set('token', String(token || ''));
  return u.toString();
}

async function sendMailgunEmail({ apiKey, domain, region, fromEmail, subject, text, recipients }) {
  if (!apiKey || apiKey === 'disabled' || apiKey === 'skip' || apiKey.length < 8) {
    return { skipped: true };
  }
  if (!domain || domain === 'skip' || String(domain).trim().length < 2) {
    return { skipped: true, reason: 'no_domain' };
  }
  if (!fromEmail || !String(fromEmail).includes('@')) {
    return { skipped: true, reason: 'no_from' };
  }
  const base =
    String(region || '').toLowerCase() === 'eu' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net';
  const url = `${base}/v3/${encodeURIComponent(String(domain).trim())}/messages`;
  const params = new URLSearchParams();
  params.append('from', `AEP Orchestration Lab <${String(fromEmail).trim()}>`);
  recipients.forEach((to) => params.append('to', to));
  params.append('subject', subject);
  params.append('text', text);
  const auth = Buffer.from(`api:${apiKey}`, 'utf8').toString('base64');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Mailgun ${res.status}: ${raw.slice(0, 500)}`);
  }
  return { sent: true };
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

async function sendApprovalNotification({
  uid,
  firstName,
  lastName,
  adobeEmail,
  approvalLink,
  notifyEmail,
  mailgunKey,
  mailgunDomain,
  mailFrom,
  mailgunRegion,
}) {
  const subject = `Workspace access approval needed: ${firstName} ${lastName}`;
  const text = [
    'A no-sandbox workspace access request requires approval.',
    '',
    `Name: ${firstName} ${lastName}`,
    `Adobe email: ${adobeEmail}`,
    `UID: ${uid}`,
    '',
    'Approve this user:',
    approvalLink,
    '',
    'If this request is unexpected, ignore this email.',
  ].join('\n');
  return sendMailgunEmail({
    apiKey: mailgunKey,
    domain: mailgunDomain,
    region: mailgunRegion,
    fromEmail: mailFrom,
    subject,
    text,
    recipients: [notifyEmail],
  });
}

async function registerWorkspaceAuthRequest(input, deps) {
  const firstName = sanitizeName(input.firstName);
  const lastName = sanitizeName(input.lastName);
  const adobeEmail = sanitizeEmail(input.adobeEmail);
  const password = sanitizePassword(input.password);

  if (!firstName) throw badRequest('firstName is required');
  if (!lastName) throw badRequest('lastName is required');
  if (!isValidEmail(adobeEmail)) throw badRequest('adobeEmail is invalid');
  if (password.length < 8) throw badRequest('Password must be at least 8 characters');

  if (!admin.apps.length) admin.initializeApp();
  const auth = admin.auth();

  let user = null;
  let createdNow = false;
  try {
    user = await auth.getUserByEmail(adobeEmail);
  } catch (e) {
    if (!e || e.code !== 'auth/user-not-found') throw e;
  }

  if (user && !user.disabled) {
    const err = new Error('Account already approved. Sign in with your credentials.');
    err.status = 409;
    err.code = 'already_active';
    throw err;
  }

  if (!user) {
    user = await auth.createUser({
      email: adobeEmail,
      password,
      displayName: `${firstName} ${lastName}`.trim(),
      disabled: true,
    });
    createdNow = true;
  } else {
    await auth.updateUser(user.uid, {
      password,
      displayName: `${firstName} ${lastName}`.trim(),
      disabled: true,
    });
  }

  const workspaceName = `${firstName} ${lastName}`.trim();
  const workspaceSlug = buildWorkspaceSlug(adobeEmail, firstName, lastName);
  await labUserSandboxStore.upsertWorkspaceProfile(user.uid, {
    firstName,
    lastName,
    adobeEmail,
    workspaceName,
    workspaceSlug,
  });

  const token = approvalToken();
  const hashed = tokenHash(token);
  const now = Date.now();
  const expiresAt = new Date(now + APPROVAL_TTL_MS);
  const ref = approvalDocRef(user.uid);
  await ref.set(
    {
      uid: user.uid,
      adobeEmail,
      firstName,
      lastName,
      workspaceName,
      workspaceSlug,
      status: 'pending',
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      tokenHash: hashed,
      tokenExpiresAt: expiresAt,
      requestCount: admin.firestore.FieldValue.increment(1),
      approvedAt: null,
    },
    { merge: true },
  );

  const baseUrl = resolveBaseUrl(input.origin, deps.approvalBaseUrl);
  const link = approvalUrl(baseUrl, user.uid, token);

  let emailResult = { skipped: true };
  try {
    emailResult = await sendApprovalNotification({
      uid: user.uid,
      firstName,
      lastName,
      adobeEmail,
      approvalLink: link,
      notifyEmail: deps.notifyEmail,
      mailgunKey: deps.mailgunKey,
      mailgunDomain: deps.mailgunDomain,
      mailFrom: deps.mailFrom,
      mailgunRegion: deps.mailgunRegion,
    });
  } catch (e) {
    console.error('[labWorkspaceAuthService] approval email failed', e.message || e);
    emailResult = { sent: false, error: String(e.message || e) };
  }

  return {
    ok: true,
    uid: user.uid,
    createdNow,
    pendingApproval: true,
    emailSent: !!emailResult.sent,
    workspaceName,
    workspaceSlug,
    message: 'Signup request submitted. Await admin approval before login.',
  };
}

/**
 * No-sandbox signup after client Firebase Google sign-in: verifies ID token,
 * requires @adobe.com + Google provider, mirrors email/password approval flow.
 */
async function registerWorkspaceGoogleAuthRequest(input, deps) {
  const idToken = String(input.idToken || '').trim();
  const firstName = sanitizeName(input.firstName);
  const lastName = sanitizeName(input.lastName);

  if (!idToken) throw badRequest('idToken is required');
  if (!firstName) throw badRequest('firstName is required');
  if (!lastName) throw badRequest('lastName is required');

  if (!admin.apps.length) admin.initializeApp();
  const auth = admin.auth();

  let decoded;
  try {
    decoded = await auth.verifyIdToken(idToken, true);
  } catch (e) {
    throw badRequest('Invalid or expired ID token');
  }

  const uid = String(decoded.uid || '').trim();
  const adobeEmail = sanitizeEmail(decoded.email);
  if (!isValidEmail(adobeEmail)) throw badRequest('Token email is invalid');
  if (!isAdobeComEmail(adobeEmail)) throw badRequest('Sign in with an Adobe Google account (@adobe.com).');
  if (!decoded.email_verified) throw badRequest('Google email must be verified');

  const userRecord = await auth.getUser(uid);
  const hasGoogle = (userRecord.providerData || []).some((p) => p && p.providerId === 'google.com');
  if (!hasGoogle) throw badRequest('Google sign-in is required for this workspace path');

  const workspaceName = `${firstName} ${lastName}`.trim();
  const workspaceSlug = buildWorkspaceSlug(adobeEmail, firstName, lastName);

  const ref = approvalDocRef(uid);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() || {} : {};
  const status = String(data.status || '');

  if (status === 'approved') {
    await labUserSandboxStore.upsertWorkspaceProfile(uid, {
      firstName,
      lastName,
      adobeEmail,
      workspaceName,
      workspaceSlug,
    });
    if (userRecord.disabled) {
      await auth.updateUser(uid, { disabled: false });
    }
    return {
      ok: true,
      pendingApproval: false,
      emailSent: false,
      workspaceName,
      workspaceSlug,
      message: 'Workspace access is active.',
    };
  }

  if (status === 'pending') {
    await labUserSandboxStore.upsertWorkspaceProfile(uid, {
      firstName,
      lastName,
      adobeEmail,
      workspaceName,
      workspaceSlug,
    });
    const err = new Error(
      'Your workspace request is still pending admin approval. You cannot sign in until it is approved.',
    );
    err.status = 403;
    err.code = 'pending_approval';
    throw err;
  }

  await labUserSandboxStore.upsertWorkspaceProfile(uid, {
    firstName,
    lastName,
    adobeEmail,
    workspaceName,
    workspaceSlug,
  });

  const token = approvalToken();
  const hashed = tokenHash(token);
  const now = Date.now();
  const expiresAt = new Date(now + APPROVAL_TTL_MS);
  await ref.set(
    {
      uid,
      adobeEmail,
      firstName,
      lastName,
      workspaceName,
      workspaceSlug,
      status: 'pending',
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      tokenHash: hashed,
      tokenExpiresAt: expiresAt,
      requestCount: admin.firestore.FieldValue.increment(1),
      approvedAt: null,
    },
    { merge: true },
  );

  await auth.updateUser(uid, { disabled: true });

  const baseUrl = resolveBaseUrl(input.origin, deps.approvalBaseUrl);
  const link = approvalUrl(baseUrl, uid, token);

  let emailResult = { skipped: true };
  try {
    emailResult = await sendApprovalNotification({
      uid,
      firstName,
      lastName,
      adobeEmail,
      approvalLink: link,
      notifyEmail: deps.notifyEmail,
      mailgunKey: deps.mailgunKey,
      mailgunDomain: deps.mailgunDomain,
      mailFrom: deps.mailFrom,
      mailgunRegion: deps.mailgunRegion,
    });
  } catch (e) {
    console.error('[labWorkspaceAuthService] approval email failed (google path)', e.message || e);
    emailResult = { sent: false, error: String(e.message || e) };
  }

  return {
    ok: true,
    uid,
    createdNow: true,
    pendingApproval: true,
    emailSent: !!emailResult.sent,
    workspaceName,
    workspaceSlug,
    message: 'Signup request submitted. Await admin approval before login.',
  };
}

async function approveWorkspaceAuthRequest(input) {
  const uid = String(input.uid || '').trim().slice(0, 128);
  const token = String(input.token || '').trim();
  if (!uid || !token) throw badRequest('uid and token are required');

  const ref = approvalDocRef(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    const err = new Error('Approval request not found.');
    err.status = 404;
    throw err;
  }
  const data = snap.data() || {};
  if (String(data.status || '') === 'approved') {
    return { ok: true, status: 'already_approved', adobeEmail: String(data.adobeEmail || '') };
  }
  const expiresAtMs =
    data.tokenExpiresAt && typeof data.tokenExpiresAt.toMillis === 'function'
      ? data.tokenExpiresAt.toMillis()
      : 0;
  if (!expiresAtMs || expiresAtMs < Date.now()) {
    const err = new Error('Approval token expired. Ask the user to sign up again.');
    err.status = 410;
    throw err;
  }
  const expectedHash = String(data.tokenHash || '');
  if (!expectedHash || expectedHash !== tokenHash(token)) {
    const err = new Error('Invalid approval token.');
    err.status = 403;
    throw err;
  }

  if (!admin.apps.length) admin.initializeApp();
  await admin.auth().updateUser(uid, { disabled: false });
  await ref.set(
    {
      status: 'approved',
      approvedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      tokenHash: admin.firestore.FieldValue.delete(),
      tokenExpiresAt: admin.firestore.FieldValue.delete(),
    },
    { merge: true },
  );

  return { ok: true, status: 'approved', adobeEmail: String(data.adobeEmail || '') };
}

module.exports = {
  registerWorkspaceAuthRequest,
  registerWorkspaceGoogleAuthRequest,
  approveWorkspaceAuthRequest,
};

