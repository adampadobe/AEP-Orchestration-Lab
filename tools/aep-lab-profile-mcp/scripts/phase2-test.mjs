#!/usr/bin/env node
/**
 * Phase 2 unit tests: persona builder, auth, profile merge (no live lab API).
 */

import { buildPersonaAttributes, resolveBatchEmail } from '../src/personaBuilder.mjs';
import { LAB_INDUSTRY_KEYS } from '../src/industries.mjs';
import { loadAuthConfig, validateMcpApiKey } from '../src/auth.mjs';
import {
  applyAttributeChangesToRows,
  attributesObjectToUpdates,
  buildActivityNarration,
  buildFullSnapshotUpdates,
  coerceProfileStreamScalar,
  extractActiveChannels,
  mergeProfileForUpdate,
  summarizeProfileTable,
} from '../src/profileMerge.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function mockReq(headers = {}) {
  return { headers };
}

async function run() {
  process.env.AEP_LAB_MCP_API_KEY = 'phase2-test-key';
  process.env.AEP_LAB_MCP_BATCH_STORE = 'memory';
  process.env.AEP_LAB_MCP_FIRESTORE = 'off';

  for (const industry of LAB_INDUSTRY_KEYS) {
    const email = `test+${industry}@adobetest.com`;
    const attrs = buildPersonaAttributes(industry, email);
    assert(typeof attrs === 'object', `${industry}: attrs object`);
    assert(attrs['personalEmail.address'] === email, `${industry}: email set`);
    assert(attrs['person.name.firstName'], `${industry}: firstName`);
    assert(attrs['person.name.lastName'], `${industry}: lastName`);
    assert(attrs['person.birthDate'], `${industry}: birthDate`);
    assert(Object.keys(attrs).length >= 8, `${industry}: rich attributes`);
  }

  const travelAttrs = buildPersonaAttributes('travel', 't@example.com');
  assert(travelAttrs['individualCharacteristics.travel.favouriteAirlineCompany'], 'travel airline');

  const email1 = resolveBatchEmail({ index: 1, baseEmail: 'user@example.com', industry: 'travel' });
  assert(email1 === 'user+travel-1@example.com', `batch email: ${email1}`);

  const email2 = resolveBatchEmail({
    index: 3,
    emailPattern: 'seed+{industry}-{n}@lab.test',
    industry: 'fsi',
  });
  assert(email2 === 'seed+fsi-3@lab.test', `pattern email: ${email2}`);

  loadAuthConfig();

  const noKey = await validateMcpApiKey(mockReq({}));
  assert(!noKey.ok, 'rejects missing MCP key');

  const badKey = await validateMcpApiKey(mockReq({ 'x-aep-lab-mcp-key': 'wrong' }));
  assert(!badKey.ok, 'rejects wrong MCP key');

  const goodKey = await validateMcpApiKey(mockReq({ 'x-aep-lab-mcp-key': 'phase2-test-key' }));
  assert(goodKey.ok, 'accepts valid MCP key (provisioning uses same key)');

  // Profile merge — full-snapshot stitch
  const sampleRows = [
    { path: 'person.name.firstName', value: 'Jane', valueType: 'string', industry: 'travel', writable: true },
    { path: 'person.name.lastName', value: 'Doe', valueType: 'string', industry: 'travel', writable: true },
    { path: 'loyalty.points', value: '100', valueType: 'number', industry: 'travel', writable: true },
    { path: 'person.name.firstName', value: 'John', valueType: 'string', industry: 'generic', writable: true },
    { path: 'consents.marketing.preferred', value: 'email', valueType: 'string', industry: 'generic', writable: false },
  ];

  const mergedRows = applyAttributeChangesToRows(sampleRows, [
    { path: 'person.name.firstName', value: 'Alex' },
    { path: 'loyalty.points', value: 250 },
  ]);
  assert(mergedRows.find((r) => r.path === 'person.name.firstName' && r.industry === 'travel').value === 'Alex', 'merge travel firstName');
  assert(mergedRows.find((r) => r.path === 'loyalty.points').value === '250', 'merge points as string row value');

  const snapshot = buildFullSnapshotUpdates({ rows: mergedRows, industry: 'travel' });
  assert(snapshot.length === 3, 'travel snapshot includes all writable travel rows');
  assert(snapshot.some((u) => u.path === 'loyalty.points' && u.value === 250), 'coerce number in snapshot');

  const stitch = mergeProfileForUpdate({
    profilePayload: { found: true, rows: sampleRows },
    industry: 'travel',
    attributeChanges: [{ path: 'person.name.firstName', value: 'Alex' }],
  });
  assert(stitch.mode === 'full_snapshot_stitch', 'stitch mode');
  assert(stitch.updates.length === 3, 'stitch sends full travel snapshot not single delta');

  const explicit = mergeProfileForUpdate({
    industry: 'generic',
    attributes: { 'person.name.firstName': 'Sam', 'person.birthDate': '1990-01-15' },
  });
  assert(explicit.mode === 'explicit_full_snapshot', 'explicit mode');
  assert(explicit.updates.length === 2, 'explicit attributes map');

  assert(coerceProfileStreamScalar('boolean', 'true') === true, 'boolean coerce');
  assert(attributesObjectToUpdates({ 'a.b': 1 }).length === 1, 'attributes to updates');

  const summary = summarizeProfileTable({ found: true, rows: sampleRows, profileEmail: 't@example.com' });
  assert(summary.attributeCount === 5, 'summary count');
  assert(summary.writableByIndustry.travel === 3, 'writable travel count');

  const active = extractActiveChannels({ channels: { email: 'in', sms: 'out', push: 'in' } });
  assert(active.includes('email') && active.includes('push'), 'active channels');
  assert(!active.includes('sms'), 'sms not active');

  const narration = buildActivityNarration({ eventCount: 3, activeChannels: ['email', 'push'], preferredMarketingChannel: 'email' });
  assert(narration.includes('3 events'), 'narration events');
  assert(narration.includes('email + push active'), 'narration channels');

  const {
    assessIndustrySandboxConfig,
    buildOnboardingPlan,
    buildSandboxProfileConfigReport,
    docIdForSandbox,
    extractConnectionManifest,
  } = await import('../src/sandboxConfig.mjs');

  assert(docIdForSandbox('apalmer/kirkham') === 'apalmer_kirkham', 'docId sanitize');

  const manifest = extractConnectionManifest({
    ok: true,
    record: {
      id: 'apalmer',
      streaming: { url: 'https://dcs.example/ingest', flowId: 'flow-1', datasetId: 'ds1', schemaId: 'sch1', xdmKey: '_demoemea' },
    },
  });
  assert(manifest.connectionReady && manifest.connectionComplete, 'connection manifest complete');

  const assessment = assessIndustrySandboxConfig({
    industry: 'travel',
    sandbox: 'apalmer',
    infraStatus: { schemaFound: true, schemaInUnion: true, datasetFound: true, datasetProfileEnabled: true },
    connectionResponse: { record: { streaming: { url: 'https://x', flowId: 'f1' } } },
  });
  assert(assessment.ready, 'industry ready when infra + connection');

  const report = buildSandboxProfileConfigReport({
    sandbox: 'newbox',
    statusAllIndustries: {
      travel: { schemaFound: false, schemaInUnion: false, datasetFound: false, datasetProfileEnabled: false },
    },
    connectionsByIndustry: {},
    industryFilter: ['travel'],
  });
  assert(!report.ready && report.notReadyIndustries.includes('travel'), 'not ready report');

  const plan = buildOnboardingPlan(report);
  assert(plan.steps.some((s) => s.tool === 'lab_provision_profile_infra_step'), 'plan includes provision');

  console.log(JSON.stringify({ ok: true, tests: 'phase2 persona + auth + profile merge + sandbox config' }));
}

run().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err) }));
  process.exit(1);
});
