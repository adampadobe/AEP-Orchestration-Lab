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
  snowflakeProfileBundle,
  snowflakeProvision,
} from '../src/labApiClient.mjs';
import manifestModule from '../../../functions/snowflakeIndustryManifest.js';
import provisionModule from '../../../functions/snowflakeProvisionRecipes.js';
const { validateIndustryProposal, validateTravelProposal } = manifestModule;
const { buildCreateTableStatements, getProvisionRecipe, validateProvisionProposal } = provisionModule;

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
  assert(typeof snowflakeProfileBundle === 'function', 'snowflakeProfileBundle export');
  assert(typeof snowflakeProvision === 'function', 'snowflakeProvision export');

  const paths = {
    catalog: '/api/snowflake/industry-catalog',
    tableStructure: '/api/snowflake/agentic/table-structure',
    validateProposal: '/api/snowflake/industry-validate-proposal',
    provision: '/api/snowflake/provision',
    generateFull: '/api/snowflake/agentic/generate-full',
    enrichProfiles: '/api/snowflake/agentic/enrich-profiles',
    profileBundle: '/api/snowflake/agentic/profile-bundle',
  };

  assert(snowflakeIndustryCatalog.toString().includes(paths.catalog), 'catalog path');
  assert(snowflakeTableStructure.toString().includes(paths.tableStructure), 'table structure path');
  assert(snowflakeValidateProposal.toString().includes(paths.validateProposal), 'validate path');
  assert(snowflakeProvision.toString().includes(paths.provision), 'provision path');
  assert(snowflakeGenerateFull.toString().includes(paths.generateFull), 'generate-full path');
  assert(snowflakeEnrichProfiles.toString().includes(paths.enrichProfiles), 'enrich path');
  assert(snowflakeProfileBundle.toString().includes(paths.profileBundle), 'profile bundle path');

  const valid = validateTravelProposal({
    count: 3,
    eventTypes: ['website', 'booking'],
  });
  assert(valid.ok === true, 'manifest validateTravelProposal accepts website+booking');

  const invalid = validateTravelProposal({ eventTypes: ['bogus'] });
  assert(invalid.ok === false, 'manifest rejects bogus event type');

  const provisionOk = validateProvisionProposal({
    industry: 'travel',
    recipe_id: 'travel.base_profiles.v1',
  });
  assert(provisionOk.ok === true, 'provision recipe validates');

  for (const industry of ['fsi', 'retail', 'telecom', 'media', 'sports']) {
    const industryProvision = validateProvisionProposal({
      industry,
      recipe_id: `${industry}.all.v1`,
    });
    assert(industryProvision.ok === true, `${industry} all-table provision recipe validates`);
    assert(
      buildCreateTableStatements(
        getProvisionRecipe(`${industry}.all.v1`),
        'TRAVEL_DATABASE',
        'AEP_SCHEMA',
      ).length === 6,
      `${industry} all recipe builds six tables`,
    );
  }
  assert(
    validateIndustryProposal({ industry: 'retail', eventTypes: ['order', 'rewards'] }).ok === true,
    'retail event manifest validates',
  );

  console.log(JSON.stringify({ ok: true, suite: 'snowflake-catalog-mcp-test', paths }));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
