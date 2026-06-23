#!/usr/bin/env node
/**
 * Phase 2 unit tests: persona builder + auth (no live lab API).
 */

import { buildPersonaAttributes, resolveBatchEmail } from '../src/personaBuilder.mjs';
import { LAB_INDUSTRY_KEYS } from '../src/industries.mjs';
import { loadAuthConfig, validateMcpApiKey } from '../src/auth.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function mockReq(headers = {}) {
  return { headers };
}

async function run() {
  process.env.AEP_LAB_MCP_API_KEY = 'phase2-test-key';
  process.env.AEP_LAB_MCP_BATCH_STORE = 'memory';

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

  const noKey = validateMcpApiKey(mockReq({}));
  assert(!noKey.ok, 'rejects missing MCP key');

  const badKey = validateMcpApiKey(mockReq({ 'x-aep-lab-mcp-key': 'wrong' }));
  assert(!badKey.ok, 'rejects wrong MCP key');

  const goodKey = validateMcpApiKey(mockReq({ 'x-aep-lab-mcp-key': 'phase2-test-key' }));
  assert(goodKey.ok, 'accepts valid MCP key (provisioning uses same key)');

  console.log(JSON.stringify({ ok: true, tests: 'phase2 persona + single-key auth' }));
}

run().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err) }));
  process.exit(1);
});
