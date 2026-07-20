#!/usr/bin/env node
/**
 * Smoke test for Decisioning catalog normalize + assess (offline) and optional live API.
 *
 * Usage:
 *   node scripts/decisioning-catalog-test.mjs
 *   AEP_LAB_SMOKE_SANDBOX=apalmer node scripts/decisioning-catalog-test.mjs --live
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const catalogService = require('../functions/decisioningCatalogService');
const assessService = require('../functions/decisioningCatalogAssessService');

const offer = catalogService.normalizeOfferItem({
  id: 'o1',
  _experience: {
    decisioning: {
      decisionitem: {
        itemName: 'Demo offer',
        itemPriority: 1,
        itemCalendarConstraints: { endDate: '2020-01-01T00:00:00Z' },
      },
    },
  },
});

if (offer.lifecycleStatus !== 'Expired') {
  console.error('[decisioning-catalog-test] normalize offer failed', offer);
  process.exit(1);
}

const strat = catalogService.normalizeSelectionStrategy({
  id: 's1',
  name: 'Main',
  rank: { priority: 1, order: { orderEvaluationType: 'static' } },
});

if (strat.rankingType !== 'static') {
  console.error('[decisioning-catalog-test] normalize strategy failed', strat);
  process.exit(1);
}

const report = assessService.assessCatalogHealth({
  offers: [offer],
  collections: [{ id: 'c1', name: 'Empty', hasRules: false, constraintCount: 0 }],
  strategies: [strat],
});

console.log('[decisioning-catalog-test] offline ok', {
  expired: report.findings.expiredOffers.length,
  emptyCollections: report.findings.emptyCollections.length,
  suggestions: report.suggestions.length,
});

const live = process.argv.includes('--live');
if (!live) {
  console.log('[decisioning-catalog-test] pass (offline). Use --live for API call.');
  process.exit(0);
}

const origin = String(process.env.AEP_LAB_API_ORIGIN || 'https://aep-orchestration-lab.web.app').replace(/\/$/, '');
const sandbox = String(process.env.AEP_LAB_SMOKE_SANDBOX || 'apalmer').trim();

const schemaResp = await fetch(`${origin}/api/decisioning/catalog/schema?sandbox=${encodeURIComponent(sandbox)}`);
const schemaData = await schemaResp.json().catch(() => ({}));
console.log('[decisioning-catalog-test] schema', schemaResp.status, {
  schemaId: schemaData.schemaId || null,
  source: schemaData.source || null,
});

const assessResp = await fetch(`${origin}/api/decisioning/catalog/assess`, {
  method: 'POST',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  body: JSON.stringify({ sandbox }),
});
const assessData = await assessResp.json().catch(() => ({}));
console.log('[decisioning-catalog-test] assess', assessResp.status, {
  healthy: assessData.summary?.healthy,
  suggestions: Array.isArray(assessData.suggestions) ? assessData.suggestions.length : null,
  counts: assessData.counts,
});

process.exit(assessResp.ok ? 0 : 1);
