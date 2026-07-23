'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PROVISION_RECIPES,
  getProvisionRecipe,
  listProvisionRecipeIds,
  buildCreateTableStatement,
  buildCreateTableStatements,
  validateProvisionProposal,
} = require('../snowflakeProvisionRecipes');
const { handleProvision } = require('../snowflakeProvisionService');

describe('snowflakeProvisionRecipes', () => {
  it('lists travel allowlisted recipe ids', () => {
    const ids = listProvisionRecipeIds();
    assert.ok(ids.includes('travel.base_profiles.v1'));
    assert.ok(ids.includes('travel.agentic_phase1.preinstalled.v1'));
    assert.ok(ids.includes('travel.agentic_all.preinstalled.v1'));
    for (const industry of ['fsi', 'retail', 'telecom', 'media', 'sports']) {
      assert.ok(ids.includes(`${industry}.profile_customer.v1`));
      assert.ok(ids.includes(`${industry}.all.v1`));
    }
    assert.equal(Object.keys(PROVISION_RECIPES).length, ids.length);
  });

  it('builds six idempotent CREATE statements for every industry all recipe', () => {
    for (const industry of ['fsi', 'retail', 'telecom', 'media', 'sports']) {
      const statements = buildCreateTableStatements(
        getProvisionRecipe(`${industry}.all.v1`),
        'TRAVEL_DATABASE',
        'AEP_SCHEMA',
      );
      assert.equal(statements.length, 6);
      assert.equal(new Set(statements.map((entry) => entry.table)).size, 6);
      for (const statement of statements) {
        assert.match(statement.sql, /^CREATE TABLE IF NOT EXISTS /);
        assert.doesNotMatch(statement.sql, /\b(?:DROP|ALTER|DELETE)\b/i);
      }
    }
  });

  it('builds industry CRM CREATE TABLE statements from allowlisted schemas', () => {
    const recipe = getProvisionRecipe('fsi.profile_customer.v1');
    const { sql, fqTable } = buildCreateTableStatement(recipe, 'DEMO_DB', 'PUBLIC');
    assert.equal(fqTable, 'DEMO_DB.PUBLIC.AGENTIC_FSI_PROFILE_CUSTOMER');
    assert.match(sql, /HOUSEHOLDINCOME NUMBER\(18,2\)/);
    assert.match(sql, /TESTPROFILE BOOLEAN/);
    assert.doesNotMatch(sql, /DROP|ALTER|TRUNCATE/i);
  });

  it('buildCreateTableStatement emits CREATE TABLE IF NOT EXISTS only', () => {
    const recipe = getProvisionRecipe('travel.base_profiles.v1');
    const { sql, fqTable } = buildCreateTableStatement(recipe, 'DEMO_DB', 'PUBLIC');
    assert.match(sql, /^CREATE TABLE IF NOT EXISTS DEMO_DB\.PUBLIC\.BASE_PROFILES \(/);
    assert.match(sql, /CRMID VARCHAR\(64\)/);
    assert.equal(fqTable, 'DEMO_DB.PUBLIC.BASE_PROFILES');
    assert.doesNotMatch(sql, /DROP|ALTER|TRUNCATE/i);
  });

  it('validateProvisionProposal rejects unknown recipe_id', () => {
    const bad = validateProvisionProposal({
      industry: 'travel',
      recipe_id: 'travel.evil_drop.v1',
    });
    assert.equal(bad.ok, false);
    assert.ok(bad.errors.some((e) => /Unknown recipe_id/.test(e)));
  });

  it('validateProvisionProposal accepts retail allowlisted recipe', () => {
    const ok = validateProvisionProposal({
      industry: 'retail',
      recipe_id: 'retail.profile_customer.v1',
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.resolved.recipe_id, 'retail.profile_customer.v1');
  });

  it('validateProvisionProposal treats legacy proposed_tables as read-only', () => {
    const proposal = validateProvisionProposal({
      industry: 'retail',
      proposed_tables: ['RETAIL_SECRET_TABLE'],
    });
    assert.equal(proposal.ok, true);
    assert.ok(proposal.warnings.some((warning) => /read-only legacy input/.test(warning)));
  });
});

describe('snowflakeProvisionService.handleProvision', () => {
  it('rejects missing recipe_id', async () => {
    const result = await handleProvision({
      labUser: 'uid-test',
      sandbox: 'apalmer',
      industry: 'travel',
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'MISSING_RECIPE_ID');
  });

  it('rejects allowlist miss before connecting', async () => {
    const result = await handleProvision({
      labUser: 'uid-test',
      sandbox: 'apalmer',
      industry: 'travel',
      recipe_id: 'travel.not-in-registry.v9',
      dry_run: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'PROPOSAL_INVALID');
  });
});
