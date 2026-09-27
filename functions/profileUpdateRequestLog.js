'use strict';

/**
 * Request/result summaries for POST /api/profile/update. `[profileUpdateProxy.request]` and
 * `[profileUpdateProxy.result]` are value-free (paths, counts, place leaves, masked email + hash).
 * `[profileUpdateProxy.payload]` carries the exact envelope streamed to DCS, values included, for
 * troubleshooting demo profiles; correlate the three lines by `emailHash`.
 */

const crypto = require('crypto');

const MAX_LOGGED_PATHS = 60;
const MAX_PAYLOAD_LOG_CHARS = 200000;
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

/**
 * Full troubleshooting entry: the exact envelope streamed to DCS (demo profile data, including
 * values) plus the DCS response. Truncated to stay under the 256 KB Cloud Logging entry limit.
 */
function buildPayloadLogEntry({ emailHash: hash, outcome, payload, streamingResponse, maxChars } = {}) {
  const limit = Number.isFinite(maxChars) && maxChars > 0 ? maxChars : MAX_PAYLOAD_LOG_CHARS;
  const json = JSON.stringify(payload === undefined ? null : payload);
  return {
    emailHash: hash || null,
    outcome: outcome || null,
    payloadChars: json.length,
    payloadTruncated: json.length > limit,
    payloadJson: json.length > limit ? json.slice(0, limit) : json,
    ...(streamingResponse !== undefined ? { streamingResponse } : {}),
  };
}

module.exports = {
  maskEmail,
  emailHash,
  summarizeProfileUpdateRequest,
  summarizeProfileUpdatePayload,
  buildPayloadLogEntry,
};
