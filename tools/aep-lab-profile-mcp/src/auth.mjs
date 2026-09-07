import { createHash, timingSafeEqual } from 'node:crypto';
import { keyIdFromApiKey } from './auditLog.mjs';
import { getPrincipalAccess } from './requestContext.mjs';
import { assertSandboxAllowedForAccess } from './sandboxAllowlist.mjs';
import { getFirestoreDb } from './firestoreAdmin.mjs';

const MCP_KEY_HEADER = 'x-aep-lab-mcp-key';
const KEYS_COLLECTION = 'mcpApiKeys';
const IMS_USERINFO_URL = 'https://ims-na1.adobelogin.com/ims/userinfo/v2';
const IMS_PROFILE_URL = 'https://ims-na1.adobelogin.com/ims/profile/v3';
const IMS_CACHE_TTL_MS = 5 * 60_000;

let configCache = null;
const imsPrincipalCache = new Map();

function hashApiKey(apiKey) {
  return createHash('sha256').update(String(apiKey || ''), 'utf8').digest('hex');
}

function safeEqual(a, b) {
  const sa = String(a || '');
  const sb = String(b || '');
  if (sa.length !== sb.length) return false;
  return timingSafeEqual(Buffer.from(sa, 'utf8'), Buffer.from(sb, 'utf8'));
}

/**
 * Load auth + sandbox policy from environment (cached after first call).
 */
export function loadAuthConfig() {
  if (configCache) return configCache;

  const apiKey = String(process.env.AEP_LAB_MCP_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error(
      'AEP_LAB_MCP_API_KEY is required. Copy tools/aep-lab-profile-mcp/.env.mcp.example to .env.mcp and set a secret.',
    );
  }

  const allowedRaw = String(process.env.AEP_LAB_MCP_ALLOWED_SANDBOXES || 'apalmer,kirkham').trim();
  const allowedSandboxes = allowedRaw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (allowedSandboxes.length === 0) {
    throw new Error('AEP_LAB_MCP_ALLOWED_SANDBOXES must list at least one sandbox name.');
  }

  configCache = {
    apiKey,
    keyId: keyIdFromApiKey(apiKey),
    allowedSandboxes,
    allowedSet: new Set(allowedSandboxes),
  };
  return configCache;
}

/**
 * Validate user-generated key from Firestore mcpApiKeys/{keyId}.
 * @param {string} provided
 */
async function validateUserGeneratedKey(provided) {
  const db = await getFirestoreDb();
  if (!db) return null;

  const keyHash = hashApiKey(provided);
  try {
    const snap = await db
      .collection(KEYS_COLLECTION)
      .where('keyHash', '==', keyHash)
      .where('revoked', '==', false)
      .limit(1)
      .get();
    if (snap.empty) return null;

    const doc = snap.docs[0];
    const data = doc.data() || {};
    if (!safeEqual(data.keyHash, keyHash)) return null;

    doc.ref.update({ lastUsedAt: new Date() }).catch(() => {});

    return { ok: true, keyId: doc.id, source: 'user' };
  } catch (err) {
    console.warn('[aep-lab-profile-mcp] mcpApiKeys lookup failed:', err?.message || err);
    return null;
  }
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().slice(0, 160);
}

function decodeJwtPart(value) {
  try {
    return JSON.parse(Buffer.from(String(value || ''), 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Return credential-safe bearer metadata for auth troubleshooting.
 * Never include token bytes or identity/header values in this object.
 */
export function describeImsBearerForLog(token, req = {}) {
  const parts = String(token || '').split('.');
  const header = parts.length === 3 ? decodeJwtPart(parts[0]) : null;
  const payload = parts.length === 3 ? decodeJwtPart(parts[1]) : null;
  const forwardedEmail = normalizeEmail(req.headers?.['x-gw-ims-email']);
  const forwardedUserId = String(req.headers?.['x-gw-ims-user-id'] || '').trim();
  const tokenEmail = normalizeEmail(payload?.email || payload?.user_email || payload?.preferred_username);
  const tokenSubject = String(payload?.sub || payload?.user_id || '').trim();
  const exp = Number(payload?.exp);

  return {
    format: header && payload ? 'jwt' : 'opaque',
    algorithm: typeof header?.alg === 'string' ? header.alg.slice(0, 16) : null,
    kidPresent: Boolean(header?.kid),
    claimNames: payload && typeof payload === 'object' ? Object.keys(payload).sort().slice(0, 80) : [],
    hasEmailClaim: Boolean(tokenEmail),
    hasSubjectClaim: Boolean(tokenSubject),
    hasExpiryClaim: Number.isFinite(exp),
    expired: Number.isFinite(exp) ? exp * 1000 <= Date.now() : null,
    forwardedEmailPresent: Boolean(forwardedEmail),
    forwardedUserIdPresent: Boolean(forwardedUserId),
    forwardedEmailMatchesTokenClaim: tokenEmail ? safeEqual(forwardedEmail, tokenEmail) : null,
    forwardedUserIdMatchesTokenClaim: tokenSubject && forwardedUserId
      ? safeEqual(forwardedUserId, tokenSubject)
      : null,
  };
}

function logImsRejection(reason, req, token, options = {}, details = {}) {
  const logger = options.logger || console;
  logger.warn?.('[aep-lab-profile-mcp] ims-auth-rejected', JSON.stringify({
    reason,
    ...details,
    bearer: describeImsBearerForLog(token, req),
  }));
}

function normalizeSandboxList(raw) {
  const values = Array.isArray(raw) ? raw : [raw];
  return [...new Set(values
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => /^[a-z0-9][a-z0-9_-]{0,47}$/.test(value)))];
}

function imsKeyId(subject, email) {
  return `ims-${createHash('sha256').update(String(subject || email), 'utf8').digest('hex').slice(0, 12)}`;
}

function imsIdentityFromProfile(raw) {
  const candidates = [raw, raw?.profile, raw?.user, ...(Array.isArray(raw?.profiles) ? raw.profiles : [])]
    .filter((value) => value && typeof value === 'object');
  for (const profile of candidates) {
    const email = normalizeEmail(profile.email || profile.emailAddress || profile.user_email);
    if (!email) continue;
    return {
      email,
      emailVerified: profile.email_verified !== false && profile.emailVerified !== false,
      subject: String(profile.sub || profile.user_id || profile.userId || profile.id || '').trim(),
    };
  }
  return { email: '', emailVerified: false, subject: '' };
}

async function fetchImsJson(fetchImpl, url, token) {
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json', authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return { ok: false, status: response.status, body: null };
  try {
    return { ok: true, status: response.status, body: await response.json() };
  } catch {
    return { ok: false, status: 502, body: null };
  }
}

async function resolveImsEnrollment(email, db) {
  if (!db) {
    return { ok: false, status: 503, message: 'IMS enrollment lookup is temporarily unavailable.' };
  }

  try {
    const snap = await db.collection(KEYS_COLLECTION).where('principalEmail', '==', email).get();
    const active = snap.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() || {}) }))
      .filter((entry) => !entry.revoked);
    if (active.length === 0) {
      return {
        ok: false,
        status: 403,
        message: 'No active AEP Lab enrollment was found for this Adobe user. Generate one sandbox-scoped MCP key in the AEP Lab Portal, then retry; the key itself is not entered in Coworker.',
      };
    }

    const allowedSandboxes = normalizeSandboxList(active.flatMap((entry) => (
      entry.sandbox ? [entry.sandbox] : entry.allowedSandboxes
    )));
    if (allowedSandboxes.length === 0) {
      return { ok: false, status: 403, message: 'The AEP Lab enrollment has no active sandbox scope.' };
    }

    const principalUid = String(active.find((entry) => entry.principalUid)?.principalUid || '').trim().slice(0, 128);
    const principalLabel = String(active.find((entry) => entry.principalLabel)?.principalLabel || email).trim().slice(0, 120);
    return {
      ok: true,
      principalUid: principalUid || null,
      principalLabel,
      allowedSandboxes,
      allowedSet: new Set(allowedSandboxes),
    };
  } catch (err) {
    console.warn('[aep-lab-profile-mcp] IMS enrollment lookup failed:', err?.message || err);
    return { ok: false, status: 503, message: 'IMS enrollment lookup is temporarily unavailable.' };
  }
}

/**
 * Validate Coworker's Adobe IMS bearer token and resolve sandbox enrollment.
 * The bearer token is checked with IMS UserInfo; forwarded identity headers are
 * treated only as consistency checks, never as proof of identity.
 *
 * @param {import('express').Request} req
 * @param {{ fetchImpl?: typeof fetch, db?: object | null, now?: number }} [options]
 */
export async function validateImsBearer(req, options = {}) {
  const authHeader = String(req.headers.authorization || '').trim();
  if (!/^Bearer\s+\S+$/i.test(authHeader)) {
    return { ok: false, status: 401, message: 'Missing Authorization: Bearer IMS token.' };
  }

  const orgId = String(req.headers['x-gw-ims-org-id'] || '').trim();
  if (!/^[A-Za-z0-9]+@AdobeOrg$/.test(orgId)) {
    return { ok: false, status: 401, message: 'Missing or invalid x-gw-ims-org-id header.' };
  }

  const token = authHeader.replace(/^Bearer\s+/i, '');
  const forwardedEmail = normalizeEmail(req.headers['x-gw-ims-email']);
  const cacheKey = hashApiKey(`${token}\n${orgId}\n${forwardedEmail}`);
  const now = Number(options.now ?? Date.now());
  const cached = imsPrincipalCache.get(cacheKey);
  if (cached && now - cached.cachedAt < IMS_CACHE_TTL_MS) return cached.result;

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  let userInfoResult;
  try {
    userInfoResult = await fetchImsJson(fetchImpl, IMS_USERINFO_URL, token);
  } catch (err) {
    console.warn('[aep-lab-profile-mcp] IMS UserInfo request failed:', err?.message || err);
    return { ok: false, status: 503, message: 'Adobe IMS authentication is temporarily unavailable.' };
  }

  if (!userInfoResult.ok) {
    logImsRejection('userinfo-http-status', req, token, options, { userinfoStatus: userInfoResult.status });
    if (userInfoResult.status === 502) {
      return { ok: false, status: 502, message: 'Adobe IMS returned an invalid identity response.' };
    }
    return { ok: false, status: userInfoResult.status === 401 ? 401 : 403, message: 'Invalid or expired Adobe IMS token.' };
  }

  let identity = imsIdentityFromProfile(userInfoResult.body);
  let identitySource = 'userinfo';
  if (!identity.email) {
    let profileResult;
    try {
      profileResult = await fetchImsJson(fetchImpl, IMS_PROFILE_URL, token);
    } catch (err) {
      console.warn('[aep-lab-profile-mcp] IMS Profile request failed:', err?.message || err);
      return { ok: false, status: 503, message: 'Adobe IMS authentication is temporarily unavailable.' };
    }
    if (!profileResult.ok) {
      logImsRejection('profile-http-status', req, token, options, { profileStatus: profileResult.status });
      return {
        ok: false,
        status: profileResult.status === 502 ? 502 : (profileResult.status === 401 ? 401 : 403),
        message: profileResult.status === 502
          ? 'Adobe IMS returned an invalid identity response.'
          : 'Adobe IMS did not provide a usable corporate profile for this session.',
      };
    }
    identity = imsIdentityFromProfile(profileResult.body);
    identitySource = 'profile';
  }

  const email = identity.email;
  if (!email || !email.endsWith('@adobe.com') || !identity.emailVerified) {
    logImsRejection('userinfo-corporate-identity', req, token, options, {
      userinfoEmailPresent: Boolean(email),
      userinfoEmailVerified: identity.emailVerified,
      identitySource,
    });
    return { ok: false, status: 403, message: 'A verified Adobe corporate identity is required.' };
  }
  if (forwardedEmail && forwardedEmail !== email) {
    logImsRejection('forwarded-email-mismatch', req, token, options);
    return { ok: false, status: 403, message: 'Forwarded IMS identity does not match the validated bearer token.' };
  }

  const db = Object.hasOwn(options, 'db') ? options.db : await getFirestoreDb();
  const enrollment = await resolveImsEnrollment(email, db);
  if (!enrollment.ok) {
    logImsRejection('enrollment-rejected', req, token, options, { enrollmentStatus: enrollment.status });
    return enrollment;
  }

  const keyId = imsKeyId(identity.subject, email);
  const result = {
    ok: true,
    keyId,
    source: 'ims',
    principalEmail: email,
    principalUid: enrollment.principalUid,
    principalAccess: {
      keyId,
      allowedSandboxes: enrollment.allowedSandboxes,
      allowedSet: enrollment.allowedSet,
      principalLabel: enrollment.principalLabel,
      source: 'ims-enrollment',
    },
    forwardMcpApiKey: loadAuthConfig().apiKey,
  };
  imsPrincipalCache.set(cacheKey, { cachedAt: now, result });
  return result;
}

/**
 * Validate incoming MCP HTTP request API key.
 * Ops shared key (env) OR per-user Firestore mcpApiKeys.
 *
 * @param {import('express').Request} req
 * @returns {Promise<{ ok: true, keyId: string, source?: string } | { ok: false, status: number, message: string }>}
 */
export async function validateMcpApiKey(req) {
  const provided = String(req.headers[MCP_KEY_HEADER] || req.headers['X-AEP-Lab-Mcp-Key'] || '').trim();

  if (!provided) {
    return {
      ok: false,
      status: 401,
      message: `Missing ${MCP_KEY_HEADER} header.`,
    };
  }

  const cfg = loadAuthConfig();
  if (safeEqual(provided, cfg.apiKey)) {
    return { ok: true, keyId: cfg.keyId, source: 'env' };
  }

  const userAuth = await validateUserGeneratedKey(provided);
  if (userAuth) {
    return userAuth;
  }

  return {
    ok: false,
    status: 403,
    message: 'Invalid MCP API key.',
  };
}

/** Accept the existing MCP API key or Coworker's signed-in Adobe IMS session. */
export async function validateMcpRequest(req, options = {}) {
  const provided = String(req.headers[MCP_KEY_HEADER] || req.headers['X-AEP-Lab-Mcp-Key'] || '').trim();
  if (provided) return validateMcpApiKey(req);
  return validateImsBearer(req, options);
}

/**
 * Ensure sandbox is on the MCP allowlist for the current principal (case-insensitive).
 * Uses Firestore mcpSandboxAllowlist/{keyId} when present, else env fallback.
 *
 * @param {string | undefined | null} sandbox
 * @returns {{ ok: true, sandbox: string } | { ok: false, message: string, allowedSandboxes: string[] }}
 */
export function assertSandboxAllowed(sandbox) {
  const access = getPrincipalAccess();
  if (access) {
    return assertSandboxAllowedForAccess(sandbox, access);
  }

  const cfg = loadAuthConfig();
  return assertSandboxAllowedForAccess(sandbox, {
    allowedSandboxes: cfg.allowedSandboxes,
    allowedSet: cfg.allowedSet,
  });
}

/** Backward-compatible export name for callers of the former OAuth scaffold. */
export const validateOAuthBearer = validateImsBearer;
