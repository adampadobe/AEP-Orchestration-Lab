'use strict';

/**
 * Value-free request/result summaries for POST /api/profile/update so Cloud Logging shows
 * which attribute paths (and which place-context leaves) a browser actually sent, without
 * logging profile values. Emails are masked; `emailHash` lets you correlate a known address.
 */

const crypto = require('crypto');

const MAX_LOGGED_PATHS = 60;
const PLACE_SEGMENT = 'profilePlaceContext';

function maskEmail(email) {
  const s = String(email || '').trim();
  const at = s.lastIndexOf('@');
  if (at < 1) return s ? '***' : '';
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  if (local.length <= 4) return `${local.slice(0, 1)}***@${domain}`;
  return `${local.slice(0, 2)}***${local.slice(-2)}@${domain}`;
}

function emailHash(email) {
  const s = String(email || '').trim().toLowerCase();
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
}

function placeLeafFromPath(path) {
  const parts = String(path).split('.');
  const i = parts.indexOf(PLACE_SEGMENT);
  return i >= 0 && i < parts.length - 1 ? parts.slice(i + 1).join('.') : null;
}

function summarizeProfileUpdateRequest({ email, updates, sandbox, dryRun, hasConsent } = {}) {
  const rows = Array.isArray(updates) ? updates : [];
  const allPaths = [];
  const placeLeaves = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || typeof row.path !== 'string' || !row.path.trim()) continue;
    const path = row.path.trim();
    allPaths.push(path);
    const leaf = placeLeafFromPath(path);
    if (leaf) placeLeaves.push(leaf);
  }
  return {
    email: maskEmail(email),
    emailHash: emailHash(email),
    sandbox: sandbox || null,
    dryRun: dryRun === true,
    hasConsent: hasConsent === true,
    updateCount: rows.length,
    placeRowCount: placeLeaves.length,
    placeLeaves,
    paths: allPaths.slice(0, MAX_LOGGED_PATHS),
    ...(allPaths.length > MAX_LOGGED_PATHS ? { pathsTruncated: true } : {}),
  };
}

function summarizeProfileUpdatePayload(payload, xdmKey = '_demoemea') {
  const entity =
    payload && payload.body && payload.body.xdmEntity && typeof payload.body.xdmEntity === 'object'
      ? payload.body.xdmEntity
      : payload && typeof payload === 'object'
        ? payload
        : {};
  const tenant = entity[xdmKey] && typeof entity[xdmKey] === 'object' ? entity[xdmKey] : {};
  const place = tenant[PLACE_SEGMENT] && typeof tenant[PLACE_SEGMENT] === 'object' ? tenant[PLACE_SEGMENT] : null;
  return {
    tenantKeys: Object.keys(tenant),
    placeInPayload: !!place,
    placeLeavesInPayload: place ? Object.keys(place) : [],
  };
}

module.exports = {
  maskEmail,
  emailHash,
  summarizeProfileUpdateRequest,
  summarizeProfileUpdatePayload,
};
