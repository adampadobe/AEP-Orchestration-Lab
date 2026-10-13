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
});

function isolatedProvision(config = { account: 'colleague', user: 'DEMO_USER', database: 'COLLEAGUE_DB', schema: 'LAB' }) {
  const catalogPath = require.resolve('../snowflakeIndustryCatalogService');
  const adminPath = require.resolve('firebase-admin');
  const servicePath = require.resolve('../snowflakeProvisionService');
  const catalogExports = require.cache[catalogPath].exports;
  const adminExports = require.cache[adminPath].exports;
  const originalService = require.cache[servicePath];
  const calls = [];
  const identities = [];
  const audit = [];
  const state = { config, failAt: null };
  try {
    require.cache[catalogPath].exports = {
      ...catalogExports,
      async withSnowflakeConnection(uid, sandbox, callback) {
        identities.push({ uid, sandbox });
        return callback({
          execute(options) {
            calls.push(options.sqlText);
            options.complete(calls.length === state.failAt ? new Error('Insufficient CREATE TABLE privileges') : null, null, []);
          },
        }, state.config);
      },
    };
    require.cache[adminPath].exports = {
      firestore: Object.assign(() => ({
        collection: () => ({ add: async (entry) => audit.push(entry) }),
      }), { FieldValue: { serverTimestamp: () => 'timestamp' } }),
    };
    delete require.cache[servicePath];
    return { handle: require('../snowflakeProvisionService').handleProvision, calls, identities, audit, state };
  } finally {
    require.cache[catalogPath].exports = catalogExports;
    require.cache[adminPath].exports = adminExports;
    require.cache[servicePath] = originalService;
  }
}

const TRAVEL_REQUEST = { labUser: 'colleague-uid', sandbox: 'colleague', industry: 'travel', recipe_id: 'travel.all.v1' };

describe('colleague travel provisioning', () => {
  it('defaults to preview with no CREATE and uses only caller UID plus sandbox', async () => {
    const mock = isolatedProvision();
    const result = await mock.handle(TRAVEL_REQUEST);
    assert.equal(result.ok, true);
    assert.equal(result.dry_run, true);
    assert.equal(result.executed, false);
    assert.equal(result.requiresConfirmation, true);
    assert.equal(result.plannedStatements.length, 16);
    assert.match(result.preview_fingerprint, /^[a-f0-9]{64}$/);
    assert.equal(mock.calls.length, 0);
    assert.deepEqual(mock.identities, [{ uid: 'colleague-uid', sandbox: 'colleague' }]);
    assert.ok(result.tables.every((table) => table.startsWith('COLLEAGUE_DB.LAB.')));
    assert.equal(mock.audit[0].dry_run, true);
  });

  it('rejects unconfirmed execution before resolving a connection', async () => {
    const mock = isolatedProvision();
    for (const confirmed of [undefined, false, 'true']) {
      const result = await mock.handle({ ...TRAVEL_REQUEST, dry_run: false, confirmed });
      assert.equal(result.error.code, 'CONFIRMATION_REQUIRED');
    }
    assert.deepEqual(mock.identities, []);
    assert.deepEqual(mock.calls, []);
  });

  it('requires an explicit saved database and schema', async () => {
    for (const config of [{ database: 'DB' }, { schema: 'LAB' }]) {
      const mock = isolatedProvision(config);
      assert.equal((await mock.handle(TRAVEL_REQUEST)).error.code, 'TARGET_REQUIRED');
      assert.deepEqual(mock.calls, []);
    }
  });

  it('binds confirmation to the saved connection, caller, sandbox, and recipe preview', async () => {
    const mock = isolatedProvision();
    const preview = await mock.handle(TRAVEL_REQUEST);
    const execute = { ...TRAVEL_REQUEST, dry_run: false, confirmed: true, preview_fingerprint: preview.preview_fingerprint };
    assert.equal((await mock.handle({ ...execute, preview_fingerprint: undefined })).error.code, 'PREVIEW_REQUIRED');
    assert.equal((await mock.handle({ ...execute, labUser: 'other-uid' })).error.code, 'PREVIEW_REQUIRED');
    assert.equal((await mock.handle({ ...execute, sandbox: 'other-sandbox' })).error.code, 'PREVIEW_REQUIRED');
    mock.state.config = { ...mock.state.config, account: 'different-account' };
    assert.equal((await mock.handle(execute)).error.code, 'PREVIEW_REQUIRED');
    assert.deepEqual(mock.calls, []);
  });

  it('reports partial failure, stops immediately, and allows idempotent retry', async () => {
    const mock = isolatedProvision();
    const preview = await mock.handle(TRAVEL_REQUEST);
    const execute = { ...TRAVEL_REQUEST, dry_run: false, confirmed: true, preview_fingerprint: preview.preview_fingerprint };
    mock.state.failAt = 3;
    const failed = await mock.handle(execute);
    assert.equal(failed.ok, false);
    assert.equal(failed.error.code, 'TABLE_CREATE_FAILED');
    assert.equal(failed.tableResults.length, 3);
    assert.equal(failed.tableResults[2].ok, false);
    assert.match(failed.tableResults[2].error, /privileges/);
    assert.equal(mock.calls.length, 3);
    mock.state.failAt = null;
    const retried = await mock.handle(execute);
    assert.equal(retried.ok, true);
    assert.equal(retried.tableResults.length, 16);
    assert.ok(mock.calls.every((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS COLLEAGUE_DB.LAB.')));
  });

  it('preserves existing non-travel execution defaults and rejects cross-industry recipes', async () => {
    const mock = isolatedProvision();
    const retail = await mock.handle({ ...TRAVEL_REQUEST, industry: 'retail', recipe_id: 'retail.all.v1' });
    assert.equal(retail.ok, true);
    assert.equal(retail.dry_run, false);
    assert.equal(mock.calls.length, 6);
    const crossIndustry = await mock.handle({ ...TRAVEL_REQUEST, industry: 'retail' });
    assert.equal(crossIndustry.error.code, 'PROPOSAL_INVALID');
    assert.equal(mock.calls.length, 6);
  });
});

describe('provision allowlist', () => {
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
