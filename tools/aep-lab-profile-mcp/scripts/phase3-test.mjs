#!/usr/bin/env node
/**
 * Phase 3 / 3.1 unit tests: persona parity, segment hints, ACL, rate limits.
 */

import { createHash } from 'node:crypto';
import {
  buildPersonaAttributes,
  normalizeSegmentHint,
  TRAVEL_SEGMENT_HINTS,
  FSI_SEGMENT_HINTS,
  RETAIL_SEGMENT_HINTS,
} from '../src/personaBuilder.mjs';
import { loadAuthConfig, validateMcpApiKey, validateOAuthBearer } from '../src/auth.mjs';
import { assertSandboxAllowedForAccess } from '../src/sandboxAllowlist.mjs';
import { checkBatchJobRate, checkEdgeSendRate, checkGenerateRate } from '../src/rateLimiter.mjs';
import { keyIdFromApiKey } from '../src/auditLog.mjs';
import { LAB_INDUSTRY_KEYS } from '../src/industries.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function mockReq(headers = {}) {
  return { headers };
}

const INDUSTRY_REQUIRED_PATHS = {
  travel: [
    'individualCharacteristics.travel.favouriteAirlineCompany',
    ['individualCharacteristics.travel.recentStay', 'hotelName'],
  ],
  fsi: ['individualCharacteristics.fsi.financialDetails.creditScore', 'personalFinances.creditScores'],
  retail: ['individualCharacteristics.retail.favoriteStore', 'orderProfile.lifetimeValue'],
  telecom: ['telecomSubscription.bundleName', 'telecomSubscription.mobileSubscription'],
  media: ['media.accountType', 'subscriptions'],
  sports: ['industrySports.favouriteSport', 'scoring.product.affinity'],
  generic: ['individualCharacteristics.core.favouriteCategory'],
};

function getPathValue(attrs, path) {
  if (Array.isArray(path)) {
    const [base, key] = path;
    const obj = attrs[base];
    return obj && typeof obj === 'object' ? obj[key] : undefined;
  }
  return attrs[path];
}

function testIndustryPersonas() {
  for (const industry of LAB_INDUSTRY_KEYS) {
    const attrs = buildPersonaAttributes(industry, `${industry}@test.com`);
    assert(Object.keys(attrs).length > 5, `${industry}: non-empty persona`);
    for (const path of INDUSTRY_REQUIRED_PATHS[industry] || []) {
      const val = getPathValue(attrs, path);
      const label = Array.isArray(path) ? `${path[0]}.${path[1]}` : path;
      assert(val != null && val !== '', `${industry}: ${label}`);
    }
  }
}

function testFsiIncomeCreditCorrelation() {
  const samples = Array.from({ length: 30 }, () => buildPersonaAttributes('fsi', 'fsi@test.com', 'high_net_worth'));
  for (const attrs of samples) {
    const score = Number(attrs['individualCharacteristics.fsi.financialDetails.creditScore']);
    assert(score >= 780, 'high_net_worth credit score >= 780');
    assert(attrs['industryFsi.householdIncomeBand'] === '500k_plus', 'high_net_worth income band');
  }

  const rebuild = buildPersonaAttributes('fsi', 'rebuild@test.com', 'credit_rebuild');
  const rebuildScore = Number(rebuild['individualCharacteristics.fsi.financialDetails.creditScore']);
  assert(rebuildScore <= 579, 'credit_rebuild score <= 579');
  assert(rebuild['industryFsi.creditScoreBand'] === 'poor', 'credit_rebuild poor band');
}

function testSegmentHints() {
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

  for (const hint of FSI_SEGMENT_HINTS) {
    const norm = normalizeSegmentHint(hint, 'fsi');
    assert(norm === hint, `fsi hint ${hint} normalizes`);
    const attrs = buildPersonaAttributes('fsi', 'fsi@test.com', hint);
    assert(attrs['personalFinances.creditScores'], `fsi ${hint} creditScores`);
  }

  for (const hint of RETAIL_SEGMENT_HINTS) {
    const norm = normalizeSegmentHint(hint, 'retail');
    assert(norm === hint, `retail hint ${hint} normalizes`);
    const attrs = buildPersonaAttributes('retail', 'retail@test.com', hint);
    assert(attrs['orderProfile.lifetimeValue'] != null, `retail ${hint} LTV`);
  }

  const vip = buildPersonaAttributes('retail', 'vip@test.com', 'loyalty_vip');
  assert(vip['loyalty.tier'] === 'platinum', 'loyalty_vip platinum');
  assert(Number(vip['orderProfile.lifetimeValue']) >= 25000, 'loyalty_vip high LTV');

  const abandoner = buildPersonaAttributes('retail', 'ab@test.com', 'cart_abandoner');
  assert(Number(abandoner['scoring.core.propensityScore']) <= 0.35 || Number(abandoner['scoring.core.propensityScore']) <= 35,
    'cart_abandoner low propensity');

  const badTravel = normalizeSegmentHint('invalid', 'travel');
  assert(String(badTravel).includes('Unknown'), 'invalid travel hint error');

  const badRetail = normalizeSegmentHint('hotel_high_value', 'retail');
  assert(String(badRetail).includes('Unknown'), 'travel hint rejected for retail');

  const badGeneric = normalizeSegmentHint('loyalty_vip', 'generic');
  assert(String(badGeneric).includes('not supported'), 'retail hint rejected for generic');
}

async function run() {
  process.env.AEP_LAB_MCP_API_KEY = 'phase3-test-key';
  process.env.AEP_LAB_MCP_BATCH_STORE = 'memory';
  process.env.AEP_LAB_MCP_FIRESTORE = 'off';

  testIndustryPersonas();
  testFsiIncomeCreditCorrelation();
  testSegmentHints();

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

  const edgeKey = 'rate-edge-' + Date.now();
  for (let i = 0; i < 30; i += 1) {
    assert(checkEdgeSendRate(edgeKey).ok, `edge send rate ${i}`);
  }
  assert(!checkEdgeSendRate(edgeKey).ok, 'edge send rate capped at 30/min');

  const { registerListEventTargetsTool } = await import('../src/tools/listEventTargets.mjs');
  const { registerSendProfileEventTool } = await import('../src/tools/sendProfileEvent.mjs');
  const { registerSendEdgeEventTool } = await import('../src/tools/sendEdgeEvent.mjs');
  assert(typeof registerListEventTargetsTool === 'function', 'registerListEventTargetsTool');
  assert(typeof registerSendProfileEventTool === 'function', 'registerSendProfileEventTool');
  assert(typeof registerSendEdgeEventTool === 'function', 'registerSendEdgeEventTool');

  const oauthOff = validateOAuthBearer(mockReq());
  assert(!oauthOff.ok && oauthOff.message.includes('not configured'), 'oauth off by default');

  process.env.AEP_LAB_MCP_OAUTH_ISSUER = 'https://issuer.example';
  process.env.AEP_LAB_MCP_OAUTH_AUDIENCE = 'mcp-audience';
  const oauthStub = validateOAuthBearer(mockReq({ authorization: 'Bearer fake' }));
  assert(!oauthStub.ok && oauthStub.message.includes('not implemented'), 'oauth stub when env set');

  const goodKey = validateMcpApiKey(mockReq({ 'x-aep-lab-mcp-key': 'phase3-test-key' }));
  assert(goodKey.ok, 'api key ok');

  console.log(JSON.stringify({
    ok: true,
    tests: 'phase3.2 persona parity + segment hints + ACL + rate limits + event tools',
    industries: LAB_INDUSTRY_KEYS.length,
    segmentPacks: { travel: TRAVEL_SEGMENT_HINTS, fsi: FSI_SEGMENT_HINTS, retail: RETAIL_SEGMENT_HINTS },
  }));
}

run().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err) }));
  process.exit(1);
});
