'use strict';

const crypto = require('node:crypto');
const { isCanonicalEcid } = require('./ecidGenerator');

const TOKEN_TTL_MS = 120_000;

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeSandbox(value) {
  return String(value || '').trim().toLowerCase();
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function createProfileMergeToken({ email, sandbox, ecid, secret, now = Date.now() }) {
  const signingSecret = String(secret || '');
  const normalizedEmail = normalizeEmail(email);
  const normalizedSandbox = normalizeSandbox(sandbox);
  const normalizedEcid = String(ecid || '').trim();
  if (!signingSecret) {
    throw Object.assign(new Error('Profile merge token signing secret is unavailable.'), {
      code: 'MERGE_TOKEN_SECRET_MISSING',
    });
  }
  if (!normalizedEmail || !normalizedSandbox || !isCanonicalEcid(normalizedEcid)) {
    throw Object.assign(new Error('Profile merge token claims are invalid.'), {
      code: 'MERGE_TOKEN_CLAIMS_INVALID',
    });
  }

  const payload = Buffer.from(JSON.stringify({
    v: 1,
    email: normalizedEmail,
    sandbox: normalizedSandbox,
    ecid: normalizedEcid,
    exp: now + TOKEN_TTL_MS,
  })).toString('base64url');
  return `${payload}.${sign(payload, signingSecret)}`;
}

function verifyProfileMergeToken({ token, email, sandbox, secret, now = Date.now() }) {
  const signingSecret = String(secret || '');
  const parts = String(token || '').split('.');
  if (!signingSecret || parts.length !== 2 || parts[0].length > 1500 || parts[1].length > 128) {
    return { ok: false, code: 'MERGE_TOKEN_INVALID', error: 'A valid profile continuation token is required.' };
  }

  const expected = sign(parts[0], signingSecret);
  const actualBytes = Buffer.from(parts[1]);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(actualBytes, expectedBytes)) {
    return { ok: false, code: 'MERGE_TOKEN_INVALID', error: 'A valid profile continuation token is required.' };
  }

  let claims;
  try {
    claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    return { ok: false, code: 'MERGE_TOKEN_INVALID', error: 'A valid profile continuation token is required.' };
  }
  if (
    claims?.v !== 1
    || !Number.isFinite(claims.exp)
    || claims.exp <= now
    || !isCanonicalEcid(String(claims.ecid || ''))
  ) {
    return {
      ok: false,
      code: claims?.exp <= now ? 'MERGE_TOKEN_EXPIRED' : 'MERGE_TOKEN_INVALID',
      error: claims?.exp <= now
        ? 'The profile continuation token expired; do not regenerate the profile automatically.'
        : 'A valid profile continuation token is required.',
    };
  }
  if (
    claims.email !== normalizeEmail(email)
    || claims.sandbox !== normalizeSandbox(sandbox)
  ) {
    return {
      ok: false,
      code: 'MERGE_TOKEN_SCOPE_MISMATCH',
      error: 'The profile continuation token does not match this email and sandbox.',
    };
  }
  return { ok: true, ecid: claims.ecid };
}

module.exports = {
  TOKEN_TTL_MS,
  createProfileMergeToken,
  verifyProfileMergeToken,
};
