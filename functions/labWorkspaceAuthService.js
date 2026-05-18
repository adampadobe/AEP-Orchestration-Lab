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

function deriveFirstLastFromUserRecord(userRecord) {
  const dn = userRecord && userRecord.displayName ? String(userRecord.displayName).trim() : '';
  if (dn) {
    const parts = dn.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return { firstName: sanitizeName(parts[0]), lastName: sanitizeName('User') };
    }
    return {
      firstName: sanitizeName(parts[0]),
      lastName: sanitizeName(parts.slice(1).join(' ')),
    };
  }
  const email = userRecord && userRecord.email ? String(userRecord.email).trim().toLowerCase() : '';
  const local = String(email.split('@')[0] || '').trim();
  const cap = local ? local.charAt(0).toUpperCase() + local.slice(1) : '';
  return { firstName: sanitizeName(cap || 'Adobe'), lastName: sanitizeName('User') };
}

function coalesceNamesWithUserRecord(inputFirst, inputLast, userRecord) {
  let firstName = sanitizeName(inputFirst);
  let lastName = sanitizeName(inputLast);
  if (!firstName || !lastName) {
    const d = deriveFirstLastFromUserRecord(userRecord);
    if (!firstName) firstName = d.firstName;
    if (!lastName) lastName = d.lastName;
  }
  if (!firstName) firstName = 'Adobe';
  if (!lastName) lastName = 'User';
  return { firstName, lastName };
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
  approvalEmailKind,
}) {
  const kind = approvalEmailKind === 'signup' ? 'signup' : 'onboarding';
  const subject =
    kind === 'signup'
      ? `Lab access approval needed (new @adobe.com signup): ${firstName} ${lastName}`
      : `Lab access approval needed: ${firstName} ${lastName}`;
  const text =
    kind === 'signup'
      ? [
          'A new @adobe.com lab account was created and requires admin approval before the user can sign in and choose Adobe sandbox vs no-sandbox access.',
          '',
          `Display name (best effort): ${firstName} ${lastName}`,
          `Adobe email: ${adobeEmail}`,
          `UID: ${uid}`,
          '',
          'Approve this user:',
          approvalLink,
          '',
          'If this request is unexpected, ignore this email.',
        ].join('\n')
      : [
          'A new @adobe.com lab account finished onboarding (Adobe sandbox or no-sandbox path) and requires admin approval before sign-in.',
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

/**
 * Writes pending approval doc, disables Auth user, sends Mailgun (shared onboarding completion path).
 * @param {{ uid: string, adobeEmail: string, firstName: string, lastName: string, origin?: string, approvalEmailKind?: 'signup'|'onboarding' }} params
 */
async function createPendingLabApprovalAndNotify({ uid, adobeEmail, firstName, lastName, origin, approvalEmailKind }, deps) {
  const workspaceName = `${firstName} ${lastName}`.trim();
  const workspaceSlug = buildWorkspaceSlug(adobeEmail, firstName, lastName);
  const token = approvalToken();
  const hashed = tokenHash(token);
  const now = Date.now();
  const expiresAt = new Date(now + APPROVAL_TTL_MS);
  const ref = approvalDocRef(uid);
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

  if (!admin.apps.length) admin.initializeApp();
  await admin.auth().updateUser(uid, { disabled: true });

  const baseUrl = resolveBaseUrl(origin, deps.approvalBaseUrl);
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
      approvalEmailKind: approvalEmailKind === 'signup' ? 'signup' : 'onboarding',
    });
  } catch (e) {
    console.error('[labWorkspaceAuthService] approval email failed (pending gate)', e.message || e);
    emailResult = { sent: false, error: String(e.message || e) };
  }

  return {
    emailResult,
    workspaceName,
    workspaceSlug,
  };
}

async function registerWorkspaceAuthRequest(input, deps) {
  const firstName = sanitizeName(input.firstName);
  const lastName = sanitizeName(input.lastName);
  const adobeEmail = sanitizeEmail(input.adobeEmail);
  const password = sanitizePassword(input.password);

  if (!firstName) throw badRequest('firstName is required');
  if (!lastName) throw badRequest('lastName is required');
  if (!isValidEmail(adobeEmail)) throw badRequest('adobeEmail is invalid');
  if (!isAdobeComEmail(adobeEmail)) throw badRequest('Adobe email must end with @adobe.com');
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
 * Shared lab access approval gate after onboarding step 2 (workspace path or Adobe sandbox path).
 * @param {'workspace_form'|'derive_ok'} namePolicy
 * @param {'throw403'|'return_ok'} onExistingPending
 */
async function runLabAccessApprovalAfterOnboardingFlow(input, deps, gate, flowOpts) {
  const namePolicy = flowOpts && flowOpts.namePolicy === 'workspace_form' ? 'workspace_form' : 'derive_ok';
  const onExistingPending = flowOpts && flowOpts.onExistingPending === 'throw403' ? 'throw403' : 'return_ok';
  const idToken = String(input.idToken || '').trim();
  const requireGoogle = !!(gate && gate.requireGoogle);
  const requireEmailVerified = !!(gate && gate.requireEmailVerified);

  if (!idToken) throw badRequest('idToken is required');

  let firstNameInput = sanitizeName(input.firstName);
  let lastNameInput = sanitizeName(input.lastName);
  if (namePolicy === 'workspace_form') {
    if (!firstNameInput) throw badRequest('firstName is required');
    if (!lastNameInput) throw badRequest('lastName is required');
  }

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
  if (!isAdobeComEmail(adobeEmail)) {
    throw badRequest(requireGoogle ? 'Sign in with an Adobe Google account (@adobe.com).' : 'Sign in with an Adobe @adobe.com account.');
  }
  if (requireEmailVerified && !decoded.email_verified) {
    throw badRequest('Google email must be verified');
  }

  const userRecord = await auth.getUser(uid);
  const providerIds = (userRecord.providerData || [])
    .map((p) => (p && p.providerId ? String(p.providerId) : ''))
    .filter(Boolean);
  const hasGoogle = providerIds.includes('google.com');
  const hasPassword = providerIds.includes('password');
  if (requireGoogle) {
    if (!hasGoogle) throw badRequest('Google sign-in is required for this workspace path');
  } else if (!hasGoogle && !hasPassword) {
    throw badRequest('Use Adobe @adobe.com sign-in (password or Google) for this workspace path.');
  }

  const { firstName, lastName } = coalesceNamesWithUserRecord(firstNameInput, lastNameInput, userRecord);
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
      uid,
      pendingApproval: false,
      alreadyPending: false,
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
    // Always re-apply disabled — sandbox path historically used return_ok without re-disabling,
    // and clients can retain a session until the next token refresh.
    await auth.updateUser(uid, { disabled: true });
    if (onExistingPending === 'throw403') {
      const err = new Error(
        'Your workspace request is still pending admin approval. You cannot sign in until it is approved.',
      );
      err.status = 403;
      err.code = 'pending_approval';
      throw err;
    }
    return {
      ok: true,
      uid,
      pendingApproval: true,
      alreadyPending: true,
      emailSent: false,
      workspaceName,
      workspaceSlug,
      message: 'Your lab access request is still pending admin approval.',
    };
  }

  await labUserSandboxStore.upsertWorkspaceProfile(uid, {
    firstName,
    lastName,
    adobeEmail,
    workspaceName,
    workspaceSlug,
  });

  const { emailResult, workspaceName: wn, workspaceSlug: ws } = await createPendingLabApprovalAndNotify(
    { uid, adobeEmail, firstName, lastName, origin: input.origin },
    deps,
  );

  return {
    ok: true,
    uid,
    createdNow: true,
    pendingApproval: true,
    alreadyPending: false,
    emailSent: !!emailResult.sent,
    workspaceName: wn,
    workspaceSlug: ws,
    message: 'Signup request submitted. Await admin approval before login.',
  };
}

/**
 * No-sandbox signup after client Firebase sign-in: verifies ID token, requires @adobe.com.
 * Optional Google + verified-email checks for legacy register-google callers.
 */
async function registerWorkspaceFromFirebaseIdTokenRequest(input, deps, gate) {
  return runLabAccessApprovalAfterOnboardingFlow(input, deps, gate, {
    namePolicy: 'workspace_form',
    onExistingPending: 'throw403',
  });
}

/** Adobe sandbox (or any) path after onboarding step 2 — same approval doc + Mailgun + disable as workspace; pending matches workspace (403 on repeat). */
async function requestLabAccessApprovalAfterOnboardingRequest(input, deps) {
  return runLabAccessApprovalAfterOnboardingFlow(
    input,
    deps,
    { requireGoogle: false, requireEmailVerified: false },
    { namePolicy: 'derive_ok', onExistingPending: 'throw403' },
  );
}

/**
 * Immediately after client `createUserWithEmailAndPassword` for @adobe.com: pending + Mailgun + disable.
 * If Firestore is already `pending`, re-disables Auth and returns without sending another email.
 * If already `approved`, returns success and does not disable (re-enables if the account was left disabled).
 */
async function requestLabAccessApprovalOnSignupRequest(input, deps) {
  const idToken = String(input.idToken || '').trim();
  if (!idToken) throw badRequest('idToken is required');

  if (!admin.apps.length) admin.initializeApp();
  const auth = admin.auth();

  let decoded;
  try {
    decoded = await auth.verifyIdToken(idToken, true);
  } catch (_e) {
    throw badRequest('Invalid or expired ID token');
  }

  const uid = String(decoded.uid || '').trim();
  const adobeEmail = sanitizeEmail(decoded.email);
  if (!isValidEmail(adobeEmail)) throw badRequest('Token email is invalid');
  if (!isAdobeComEmail(adobeEmail)) {
    throw badRequest('Sign in with an Adobe @adobe.com account.');
  }

  const userRecord = await auth.getUser(uid);
  const providerIds = (userRecord.providerData || [])
    .map((p) => (p && p.providerId ? String(p.providerId) : ''))
    .filter(Boolean);
  if (!providerIds.includes('password')) {
    throw badRequest('This endpoint is for email/password lab signups from Create account.');
  }

  const ref = approvalDocRef(uid);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() || {} : {};
  const status = String(data.status || '');

  if (status === 'approved') {
    if (userRecord.disabled) {
      await auth.updateUser(uid, { disabled: false });
    }
    return {
      ok: true,
      uid,
      pendingApproval: false,
      alreadyPending: false,
      emailSent: false,
      message: 'Lab access is already approved for this account.',
    };
  }

  if (status === 'pending') {
    await auth.updateUser(uid, { disabled: true });
    return {
      ok: true,
      uid,
      pendingApproval: true,
      alreadyPending: true,
      emailSent: false,
      message: 'Lab access request is still pending admin approval.',
    };
  }

  const { firstName, lastName } = coalesceNamesWithUserRecord('', '', userRecord);
  const { emailResult, workspaceName, workspaceSlug } = await createPendingLabApprovalAndNotify(
    { uid, adobeEmail, firstName, lastName, origin: input.origin, approvalEmailKind: 'signup' },
    deps,
  );

  return {
    ok: true,
    uid,
    pendingApproval: true,
    alreadyPending: false,
    emailSent: !!emailResult.sent,
    workspaceName,
    workspaceSlug,
    message: 'Signup request submitted. Await admin approval before login.',
  };
}

/** Legacy: same as registerWorkspaceFromFirebaseIdTokenRequest with Google + verified-email gate. */
async function registerWorkspaceGoogleAuthRequest(input, deps) {
  return registerWorkspaceFromFirebaseIdTokenRequest(input, deps, {
    requireGoogle: true,
    requireEmailVerified: true,
  });
}

/** Email/password (or any) Firebase user already signed in on the client; no duplicate Admin user creation. */
async function registerWorkspaceLabSessionFromIdTokenRequest(input, deps) {
  return registerWorkspaceFromFirebaseIdTokenRequest(input, deps, {
    requireGoogle: false,
    requireEmailVerified: false,
  });
}

/**
 * GET helper: @adobe.com lab gate from ID token + Firestore approval doc + Auth disabled flag.
 * @returns {{ ok: true, status: 'pending'|'approved'|'missing'|'not_applicable' }}
 */
async function getLabAccessStatusFromIdTokenRequest(input) {
  const idToken = String(input.idToken || '').trim();
  if (!idToken) throw badRequest('idToken is required');

  if (!admin.apps.length) admin.initializeApp();
  const auth = admin.auth();

  let decoded;
  try {
    decoded = await auth.verifyIdToken(idToken, true);
  } catch (_e) {
    throw badRequest('Invalid or expired ID token');
  }

  const uid = String(decoded.uid || '').trim();
  const adobeEmail = sanitizeEmail(decoded.email);
  if (!isValidEmail(adobeEmail) || !isAdobeComEmail(adobeEmail)) {
    return { ok: true, status: 'not_applicable' };
  }

  const userRecord = await auth.getUser(uid);
  const snap = await approvalDocRef(uid).get();
  if (!snap.exists) {
    if (userRecord.disabled) {
      return { ok: true, status: 'pending' };
    }
    return { ok: true, status: 'missing' };
  }
  const data = snap.data() || {};
  const docStatus = String(data.status || '');
  if (docStatus === 'approved') {
    return { ok: true, status: 'approved' };
  }
  if (docStatus === 'pending') {
    return { ok: true, status: 'pending' };
  }
  return { ok: true, status: 'missing' };
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
  registerWorkspaceLabSessionFromIdTokenRequest,
  requestLabAccessApprovalAfterOnboardingRequest,
  requestLabAccessApprovalOnSignupRequest,
  getLabAccessStatusFromIdTokenRequest,
  approveWorkspaceAuthRequest,
};

