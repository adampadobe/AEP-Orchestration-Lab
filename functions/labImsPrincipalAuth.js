'use strict';

const admin = require('firebase-admin');

function failure(status, code, error) {
  return { ok: false, status, body: { ok: false, code, error } };
}

function identityFromProfile(raw) {
  const candidates = [raw, raw?.profile, raw?.user, ...(Array.isArray(raw?.profiles) ? raw.profiles : [])];
  for (const profile of candidates) {
    if (!profile || typeof profile !== 'object') continue;
    const email = String(profile.email || profile.emailAddress || profile.user_email || '').trim().toLowerCase();
    if (email) {
      return {
        email,
        verified: profile.email_verified !== false && profile.emailVerified !== false,
      };
    }
  }
  return { email: '', verified: false };
}

/** Independently validate Coworker's bearer; headers and caller-supplied UIDs are not identity proof. */
async function resolveLabImsPrincipal(req, deps = {}) {
  const authorization = String(req.headers.authorization || '').trim();
  const org = String(req.headers['x-gw-ims-org-id'] || '').trim();
  if (!/^Bearer\s+\S+$/i.test(authorization) || !/^[A-Za-z0-9]+@AdobeOrg$/.test(org)) {
    return failure(401, 'IMS_AUTH_REQUIRED', 'Adobe IMS bearer and x-gw-ims-org-id are required.');
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const sandbox = String(body.sandbox || req.query?.sandbox || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(sandbox)) {
    return failure(400, 'IMS_SANDBOX_REQUIRED', 'A valid sandbox is required for IMS enrollment lookup.');
  }

  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  async function fetchIdentity(url, method) {
    const response = await fetchImpl(url, {
      method,
      headers: { accept: 'application/json', authorization },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      return failure(
        response.status === 401 ? 401 : (response.status >= 500 || response.status === 429 ? 503 : 403),
        'IMS_AUTH_REJECTED',
        'Adobe IMS could not validate this session.',
      );
    }
    try {
      return { ok: true, identity: identityFromProfile(await response.json()) };
    } catch {
      return failure(502, 'IMS_IDENTITY_INVALID', 'Adobe IMS returned an invalid identity response.');
    }
  }

  let validated;
  try {
    validated = await fetchIdentity('https://ims-na1.adobelogin.com/ims/userinfo/v2', 'GET');
    if (validated.ok && !validated.identity.email) {
      validated = await fetchIdentity('https://ims-na1.adobelogin.com/ims/profile/v1', 'POST');
    }
  } catch {
    return failure(503, 'IMS_AUTH_UNAVAILABLE', 'Adobe IMS authentication is temporarily unavailable.');
  }
  if (!validated.ok) return validated;
  const { email, verified } = validated.identity;
  if (!email.endsWith('@adobe.com') || !verified) {
    return failure(403, 'IMS_CORPORATE_IDENTITY_REQUIRED', 'A verified Adobe corporate identity is required.');
  }
  const forwardedEmail = String(req.headers['x-gw-ims-email'] || '').trim().toLowerCase();
  if (forwardedEmail && forwardedEmail !== email) {
    return failure(403, 'IMS_IDENTITY_MISMATCH', 'Forwarded IMS identity does not match the validated bearer token.');
  }

  try {
    let db = deps.db;
    if (!db) {
      if (!admin.apps.length) admin.initializeApp();
      db = admin.firestore();
    }
    const snap = await db.collection('mcpApiKeys').where('principalEmail', '==', email).get();
    const enrolled = snap.docs.map((doc) => doc.data() || {}).filter((entry) => {
      const scopes = entry.sandbox ? [entry.sandbox] : entry.allowedSandboxes;
      return entry.revoked === false && Array.isArray(scopes)
        && scopes.some((scope) => String(scope).trim().toLowerCase() === sandbox);
    });
    const uids = new Set(enrolled.map((entry) => String(entry.principalUid || '').trim()).filter(Boolean));
    if (!enrolled.length || !uids.size) {
      return failure(403, 'IMS_ENROLLMENT_REQUIRED',
        'No active Portal enrollment with a Firebase user exists for this Adobe user and sandbox. Create a sandbox-scoped MCP key in the Portal; do not paste it into Coworker.');
    }
    if (uids.size !== 1 || enrolled.some((entry) => !String(entry.principalUid || '').trim())) {
      return failure(403, 'IMS_ENROLLMENT_AMBIGUOUS', 'Portal enrollment has conflicting Firebase user mappings. Resolve the enrollment before retrying.');
    }
    return {
      ok: true,
      uid: [...uids][0],
      authSource: 'ims',
      principalEmail: email,
      keySandbox: sandbox,
      keyId: null,
    };
  } catch {
    return failure(503, 'IMS_ENROLLMENT_UNAVAILABLE', 'IMS enrollment lookup is temporarily unavailable.');
  }
}

module.exports = { resolveLabImsPrincipal };
