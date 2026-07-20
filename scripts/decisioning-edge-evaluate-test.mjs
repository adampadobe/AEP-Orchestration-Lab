#!/usr/bin/env node
/**
 * Smoke test for POST /api/decisioning/edge-evaluate payload builder (no live Edge call).
 * Optional live call when AEP_LAB_API_ORIGIN + sandbox profile env vars are set.
 *
 * Usage:
 *   node scripts/decisioning-edge-evaluate-test.mjs
 *   AEP_LAB_SMOKE_EMAIL=... AEP_LAB_SMOKE_ECID=... AEP_LAB_SMOKE_SANDBOX=apalmer node scripts/decisioning-edge-evaluate-test.mjs --live
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildEdgeDecisionInteractPayload,
  buildSurfacesFromPageUrl,
} = require('../functions/decisioningEdgeEvaluateService.js');

const args = process.argv.slice(2);
const live = args.includes('--live');

const placements = [
  { key: 'topRibbon', fragment: 'TopRibbon', label: 'Top ribbon' },
  { key: 'hero', fragment: 'hero-banner', label: 'Hero banner' },
];

const config = {
  targetPageUrl: 'https://aep-orchestration-lab.web.app/profile-viewer/content-decision-live-edge.html',
  edgePersonalizationMode: 'surfaces',
  placements,
};

const built = buildEdgeDecisionInteractPayload(config, {
  email: 'demo+001@adobetest.com',
  ecid: '62722406001178632594092146103219305888',
});

if (!built.ok) {
  console.error('[decisioning-edge-evaluate-test] builder failed:', built.error);
  process.exit(1);
}

console.log('[decisioning-edge-evaluate-test] builder ok', {
  mode: built.mode,
  surfaceCount: built.surfaces?.length,
  hasQuery: !!built.payload?.query?.personalization,
  identityKeys: Object.keys(built.identityMap || {}),
});

const surfacesOnly = buildSurfacesFromPageUrl(config.targetPageUrl, placements);
console.log('[decisioning-edge-evaluate-test] sample surfaces', surfacesOnly.slice(0, 2));

if (!live) {
  console.log('[decisioning-edge-evaluate-test] pass (offline builder only). Use --live for API call.');
  process.exit(0);
}

const origin = String(process.env.AEP_LAB_API_ORIGIN || 'https://aep-orchestration-lab.web.app').replace(/\/$/, '');
const sandbox = String(process.env.AEP_LAB_SMOKE_SANDBOX || 'apalmer').trim();
const email = String(process.env.AEP_LAB_SMOKE_EMAIL || '').trim();
const ecid = String(process.env.AEP_LAB_SMOKE_ECID || '').trim();

if (!email && !ecid) {
  console.error('[decisioning-edge-evaluate-test] --live requires AEP_LAB_SMOKE_EMAIL and/or AEP_LAB_SMOKE_ECID');
  process.exit(1);
}

const url = new URL('/api/decisioning/edge-evaluate', origin);
const resp = await fetch(url, {
  method: 'POST',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  body: JSON.stringify({ sandbox, email: email || undefined, ecid: ecid || undefined }),
});

const data = await resp.json().catch(() => ({}));
console.log('[decisioning-edge-evaluate-test] live status', resp.status, {
  ok: data.ok,
  propositionCount: Array.isArray(data.propositions) ? data.propositions.length : null,
  requestId: data.requestId || null,
  error: data.error || null,
});

process.exit(resp.ok && data.ok !== false ? 0 : 1);
