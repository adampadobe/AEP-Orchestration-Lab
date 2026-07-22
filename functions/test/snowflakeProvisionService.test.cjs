'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PROVISION_RECIPES,
  getProvisionRecipe,
  listProvisionRecipeIds,
  buildCreateTableStatement,
  validateProvisionProposal,
} = require('../snowflakeProvisionRecipes');
const { handleProvision } = require('../snowflakeProvisionService');

describe('snowflakeProvisionRecipes', () => {
  it('lists travel allowlisted recipe ids', () => {
    const ids = listProvisionRecipeIds();
    assert.ok(ids.includes('travel.base_profiles.v1'));
    assert.ok(ids.includes('travel.agentic_phase1.preinstalled.v1'));
    assert.ok(ids.includes('travel.agentic_all.preinstalled.v1'));
    assert.equal(Object.keys(PROVISION_RECIPES).length, ids.length);
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

  it('validateProvisionProposal accepts retail draft proposed_tables', () => {
    const ok = validateProvisionProposal({
      industry: 'retail',
      proposed_tables: ['RETAIL_PROFILE_CUSTOMER', 'RETAIL_EVENT_PURCHASE'],
    });
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.resolved.proposed_tables, [
      'RETAIL_PROFILE_CUSTOMER',
      'RETAIL_EVENT_PURCHASE',
    ]);
  });

  it('validateProvisionProposal rejects retail table not in draft manifest', () => {
    const bad = validateProvisionProposal({
      industry: 'retail',
      proposed_tables: ['RETAIL_SECRET_TABLE'],
    });
    assert.equal(bad.ok, false);
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
