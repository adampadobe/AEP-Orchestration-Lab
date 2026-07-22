'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  PHASE_TABLES,
  ENRICH_EVENT_TYPES,
  EVENT_GROUPS,
  TRAVEL_MANIFEST,
  getIndustryManifest,
  listSupportedIndustries,
  validateTravelProposal,
} = require('../snowflakeIndustryManifest');
const { projectManifest, validateTravelProposal: validateFromService } = require('../snowflakeIndustryCatalogService');

describe('snowflakeIndustryManifest', () => {
  it('exports travel phase tables matching Agentic runner', () => {
    assert.equal(PHASE_TABLES.phase1.length, 4);
    assert.equal(PHASE_TABLES.phase2.length, 5);
    assert.equal(PHASE_TABLES.phase3.length, 5);
    assert.ok(PHASE_TABLES.phase1.includes('AGENTIC_TRAVEL_PROFILE_CUSTOMER'));
    assert.ok(PHASE_TABLES.phase1.includes('AGENTIC_TRAVEL_EVENT_WEBSITE'));
  });

  it('aligns dual-load target with query table', () => {
    assert.equal(TRAVEL_MANIFEST.dualLoad.defaultTargetTable, 'AGENTIC_TRAVEL_PROFILE_CUSTOMER');
    assert.equal(TRAVEL_MANIFEST.dualLoad.queryTable, 'AGENTIC_TRAVEL_PROFILE_CUSTOMER');
    assert.equal(TRAVEL_MANIFEST.dualLoad.mapperSchema, 'AGENTIC_TRAVEL_PROFILE_CUSTOMER');
    assert.equal(TRAVEL_MANIFEST.dualLoad.defaultMode, 'crm_generate');
    assert.notEqual(TRAVEL_MANIFEST.baseProfiles.legacyBatchTable, TRAVEL_MANIFEST.dualLoad.defaultTargetTable);
  });

  it('documents shared Firestore email generation for dual-load and Snowflake batch', () => {
    assert.equal(TRAVEL_MANIFEST.emailGeneration.pattern, '<local>+DDMMYYYY-N@<domain>');
    assert.equal(TRAVEL_MANIFEST.emailGeneration.source, 'labProfileGenerationPrefs');
    assert.match(TRAVEL_MANIFEST.dualLoad.note, /Firestore/);
    assert.equal(TRAVEL_MANIFEST.emailGeneration.snowflakeOnlyBatch.default, 'use_generation_prefs:true — reserves N emails from Firestore before INSERT');
  });

  it('lists enrich event types and phase groups', () => {
    assert.deepEqual(EVENT_GROUPS.phase1, ['website', 'booking']);
    assert.ok(ENRICH_EVENT_TYPES.includes('mobile'));
    assert.ok(ENRICH_EVENT_TYPES.includes('pos'));
    assert.equal(ENRICH_EVENT_TYPES.length, 10);
  });

  it('getIndustryManifest returns travel and rejects unknown', () => {
    assert.equal(getIndustryManifest('travel').industry, 'travel');
    assert.equal(getIndustryManifest('Travel').industry, 'travel');
    assert.equal(getIndustryManifest('retail').status, 'draft');
    assert.equal(getIndustryManifest('fsi'), null);
    assert.deepEqual(listSupportedIndustries().sort(), ['retail', 'travel']);
  });

  it('validateTravelProposal accepts known phases and event types', () => {
    const ok = validateTravelProposal({
      phases: ['phase1', 'phase2'],
      eventTypes: ['website', 'mobile'],
      count: 10,
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.errors.length, 0);
    assert.deepEqual(ok.resolved.phases, ['phase1', 'phase2']);
    assert.deepEqual(ok.resolved.eventTypes, ['website', 'mobile']);
  });

  it('validateTravelProposal rejects unknown event type and bad count', () => {
    const bad = validateTravelProposal({
      eventTypes: ['not-a-real-type'],
      count: 5000,
    });
    assert.equal(bad.ok, false);
    assert.ok(bad.errors.some((e) => /Unknown enrich event type/.test(e)));
    assert.ok(bad.errors.some((e) => /count must be between/.test(e)));
  });

  it('projectManifest includes runner configured flags without secrets', () => {
    const prevUrl = process.env.AGENTIC_TRAVEL_RUNNER_URL;
    const prevSecret = process.env.AGENTIC_TRAVEL_RUNNER_HMAC_SECRET;
    delete process.env.AGENTIC_TRAVEL_RUNNER_URL;
    delete process.env.AGENTIC_TRAVEL_RUNNER_HMAC_SECRET;
    try {
      const projected = projectManifest('travel');
      assert.equal(projected.runner.configured, false);
      assert.equal(projected.runner.runnerUrlSet, false);
      assert.ok(!('secret' in projected.runner));
    } finally {
      if (prevUrl != null) process.env.AGENTIC_TRAVEL_RUNNER_URL = prevUrl;
      if (prevSecret != null) process.env.AGENTIC_TRAVEL_RUNNER_HMAC_SECRET = prevSecret;
    }
  });

  it('catalog service re-exports validateTravelProposal', () => {
    const result = validateFromService({ eventTypes: ['hotel'] });
    assert.equal(result.ok, true);
  });
});
