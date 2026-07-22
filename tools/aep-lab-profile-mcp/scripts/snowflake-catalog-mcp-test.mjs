#!/usr/bin/env node
/**
 * Offline tests for Snowflake industry catalog + Phase B MCP API wiring.
 */

import { loadAuthConfig } from '../src/auth.mjs';
import {
  snowflakeIndustryCatalog,
  snowflakeTableStructure,
  snowflakeValidateProposal,
  snowflakeGenerateFull,
  snowflakeEnrichProfiles,
} from '../src/labApiClient.mjs';
import { validateTravelProposal } from '../../../functions/snowflakeIndustryManifest.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

process.env.AEP_LAB_MCP_API_KEY = process.env.AEP_LAB_MCP_API_KEY || 'snowflake-catalog-test-key';

async function run() {
  loadAuthConfig();

  assert(typeof snowflakeIndustryCatalog === 'function', 'snowflakeIndustryCatalog export');
  assert(typeof snowflakeTableStructure === 'function', 'snowflakeTableStructure export');
  assert(typeof snowflakeValidateProposal === 'function', 'snowflakeValidateProposal export');
  assert(typeof snowflakeGenerateFull === 'function', 'snowflakeGenerateFull export');
  assert(typeof snowflakeEnrichProfiles === 'function', 'snowflakeEnrichProfiles export');

  const paths = {
    catalog: '/api/snowflake/industry-catalog',
    tableStructure: '/api/snowflake/agentic/table-structure',
    validateProposal: '/api/snowflake/industry-validate-proposal',
    generateFull: '/api/snowflake/agentic/generate-full',
    enrichProfiles: '/api/snowflake/agentic/enrich-profiles',
  };

  assert(snowflakeIndustryCatalog.toString().includes(paths.catalog), 'catalog path');
  assert(snowflakeTableStructure.toString().includes(paths.tableStructure), 'table structure path');
  assert(snowflakeValidateProposal.toString().includes(paths.validateProposal), 'validate path');
  assert(snowflakeGenerateFull.toString().includes(paths.generateFull), 'generate-full path');
  assert(snowflakeEnrichProfiles.toString().includes(paths.enrichProfiles), 'enrich path');

  const valid = validateTravelProposal({
    count: 3,
    eventTypes: ['website', 'booking'],
  });
  assert(valid.ok === true, 'manifest validateTravelProposal accepts website+booking');

  const invalid = validateTravelProposal({ eventTypes: ['bogus'] });
  assert(invalid.ok === false, 'manifest rejects bogus event type');

  console.log(JSON.stringify({ ok: true, suite: 'snowflake-catalog-mcp-test', paths }));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
