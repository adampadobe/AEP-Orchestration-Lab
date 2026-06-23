#!/usr/bin/env node
/**
 * Phase 3 unit tests: segment hints, sandbox ACL helpers, rate limits, OAuth stub, audit keyId.
 */

import { createHash } from 'node:crypto';
import { buildPersonaAttributes, normalizeSegmentHint, TRAVEL_SEGMENT_HINTS } from '../src/personaBuilder.mjs';
import { loadAuthConfig, validateMcpApiKey, validateOAuthBearer } from '../src/auth.mjs';
import { assertSandboxAllowedForAccess } from '../src/sandboxAllowlist.mjs';
import { checkBatchJobRate, checkGenerateRate } from '../src/rateLimiter.mjs';
import { keyIdFromApiKey } from '../src/auditLog.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function mockReq(headers = {}) {
  return { headers };
}

async function run() {
  process.env.AEP_LAB_MCP_API_KEY = 'phase3-test-key';
  process.env.AEP_LAB_MCP_BATCH_STORE = 'memory';
  process.env.AEP_LAB_MCP_FIRESTORE = 'off';

  for (const hint of TRAVEL_SEGMENT_HINTS) {
    const attrs = buildPersonaAttributes('travel', 'hotel@test.com', hint);
    assert(attrs['hotel.bookingDetails.hotelName'], `${hint}: hotelName`);
    assert(attrs['hotel.bookingDetails.totalNights'] >= 5, `${hint}: totalNights`);
    assert(attrs['scoring.core.propensityScore'] != null, `${hint}: propensity`);
  }

  const reactivation = buildPersonaAttributes('travel', 'r@test.com', 'hotel_reactivation');
  const checkout = new Date(String(reactivation['hotel.bookingDetails.checkOutDate']));
  const daysAgo = (Date.now() - checkout.getTime()) / 86400000;
  assert(daysAgo > 365, 'reactivation checkout >365 days ago');

  const highValue = buildPersonaAttributes('travel', 'hv@test.com', 'hotel_high_value');
  assert(highValue['loyalty.tier'] === 'platinum', 'high value platinum');

  const badHint = normalizeSegmentHint('invalid', 'travel');
  assert(String(badHint).includes('Unknown'), 'invalid travel hint error');

  const retailHint = normalizeSegmentHint('hotel_high_value', 'retail');
  assert(String(retailHint).includes('not supported'), 'retail segment_hint rejected');

  loadAuthConfig();
  const cfg = loadAuthConfig();
  assert(keyIdFromApiKey('phase3-test-key') === cfg.keyId, 'keyId stable');

  const access = {
    allowedSandboxes: ['kirkham'],
    allowedSet: new Set(['kirkham']),
  };
  assert(assertSandboxAllowedForAccess('kirkham', access).ok, 'kirkham allowed');
  assert(!assertSandboxAllowedForAccess('apalmer', access).ok, 'apalmer blocked for kirkham ACL');

  const genKey = 'rate-gen-' + Date.now();
  for (let i = 0; i < 30; i += 1) {
    assert(checkGenerateRate(genKey).ok, `generate rate ${i}`);
  }
  assert(!checkGenerateRate(genKey).ok, 'generate rate capped at 30/min');

  const batchKey = 'rate-batch-' + Date.now();
  for (let i = 0; i < 3; i += 1) {
    assert(checkBatchJobRate(batchKey).ok, `batch rate ${i}`);
  }
  assert(!checkBatchJobRate(batchKey).ok, 'batch rate capped at 3/hr');

  const oauthOff = validateOAuthBearer(mockReq());
  assert(!oauthOff.ok && oauthOff.message.includes('not configured'), 'oauth off by default');

  process.env.AEP_LAB_MCP_OAUTH_ISSUER = 'https://issuer.example';
  process.env.AEP_LAB_MCP_OAUTH_AUDIENCE = 'mcp-audience';
  const oauthStub = validateOAuthBearer(mockReq({ authorization: 'Bearer fake' }));
  assert(!oauthStub.ok && oauthStub.message.includes('not implemented'), 'oauth stub when env set');

  const goodKey = validateMcpApiKey(mockReq({ 'x-aep-lab-mcp-key': 'phase3-test-key' }));
  assert(goodKey.ok, 'api key ok');

  console.log(JSON.stringify({ ok: true, tests: 'phase3 segment hints + ACL + rate limits + oauth stub' }));
}

run().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err) }));
  process.exit(1);
});
