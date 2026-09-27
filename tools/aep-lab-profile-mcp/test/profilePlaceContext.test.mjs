import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { resolveIndustryForPath } from '../src/framework/attributeOwnership.mjs';
import { planDualStreamGenerate } from '../src/framework/dualStreamGenerate.mjs';
import { buildFullSnapshotUpdates } from '../src/profileMerge.mjs';
import { buildPersonaAttributes, mergePersonaAttributes } from '../src/personaBuilder.mjs';
import {
  PLACE_PRESETS,
  buildPlaceContextPersonaAttributes,
} from '../src/personaBuilder/placeContext.mjs';

const require = createRequire(import.meta.url);
const webPlace = require('../../../web/profile-viewer/profile-place-context.js');
const industryAttributeMap = require('../../../functions/industryAttributeMap.js');

const PLACE_KEYS = [
  'profilePlaceContext.latitude',
  'profilePlaceContext.longitude',
  'profilePlaceContext.accuracyMeters',
  'profilePlaceContext.neighborhood',
  'profilePlaceContext.city',
  'profilePlaceContext.regionCode',
  'profilePlaceContext.countryCode',
  'profilePlaceContext.lastSeenAt',
  'profilePlaceContext.source',
];

function placeKeysOf(attrs) {
  return Object.keys(attrs).filter((k) => k.startsWith('profilePlaceContext.'));
}

describe('MCP place context ownership', () => {
  it('routes tenant-relative and tenant-prefixed place paths to generic, matching functions', () => {
    for (const path of [
      'profilePlaceContext.latitude',
      '_demoemea.profilePlaceContext.city',
      'profilePlaceContext.geohash',
    ]) {
      assert.equal(resolveIndustryForPath(path).industry, 'generic', path);
      assert.equal(industryAttributeMap.resolveIndustryForPath(path).industry, 'generic', `functions: ${path}`);
    }
  });
});

describe('MCP persona place context', () => {
  it('presets match the web Profile Viewer presets exactly (drift guard)', () => {
    assert.deepEqual(PLACE_PRESETS, webPlace.PRESETS);
  });

  it('emits typed tenant-relative place leaves with source mcp-persona and no geohash', () => {
    const now = new Date('2026-07-10T12:00:00Z');
    const attrs = buildPlaceContextPersonaAttributes({ preset: 'riyadh', now, rng: () => 0.25 });
    assert.deepEqual(placeKeysOf(attrs).sort(), [...PLACE_KEYS].sort());
    assert.equal(typeof attrs['profilePlaceContext.latitude'], 'number');
    assert.equal(typeof attrs['profilePlaceContext.longitude'], 'number');
    assert.equal(Number.isInteger(attrs['profilePlaceContext.accuracyMeters']), true);
    assert.equal(attrs['profilePlaceContext.city'], 'Riyadh');
    assert.equal(attrs['profilePlaceContext.countryCode'], 'SA');
    assert.equal(attrs['profilePlaceContext.regionCode'], 'SA-01');
    assert.equal(attrs['profilePlaceContext.source'], 'mcp-persona');
    assert.equal(attrs['profilePlaceContext.geohash'], undefined);
    const seen = Date.parse(attrs['profilePlaceContext.lastSeenAt']);
    assert.ok(seen <= now.getTime() && seen >= now.getTime() - 6 * 3600 * 1000);
  });

  it('matches the web generator for the same rng/now (only source differs)', () => {
    const now = new Date('2026-07-10T12:00:00Z');
    const seq = () => {
      let i = 0;
      const vals = [0.1, 0.7, 0.3, 0.9, 0.5, 0.2];
      return () => vals[i++ % vals.length];
    };
    const web = webPlace.generateSample('london', { rng: seq(), now });
    const mcp = buildPlaceContextPersonaAttributes({ preset: 'london', now, rng: seq() });
    for (const [leaf, value] of Object.entries(web)) {
      if (leaf === 'source') continue;
      assert.equal(mcp[`profilePlaceContext.${leaf}`], value, leaf);
    }
  });

  it('every persona industry carries place context', () => {
    for (const industry of ['generic', 'retail', 'travel', 'fsi', 'telecom', 'media', 'sports']) {
      const attrs = buildPersonaAttributes(industry, `p+${industry}@example.com`);
      assert.deepEqual(placeKeysOf(attrs).sort(), [...PLACE_KEYS].sort(), industry);
    }
  });

  it('caller place overrides replace the persona place block wholesale (no mixed cities)', () => {
    const base = buildPersonaAttributes('generic', 'p@example.com');
    const merged = mergePersonaAttributes(base, {
      'profilePlaceContext.latitude': 24.7743,
      'profilePlaceContext.longitude': 46.6384,
      'profilePlaceContext.city': 'Riyadh',
    });
    assert.deepEqual(placeKeysOf(merged).sort(), [
      'profilePlaceContext.city',
      'profilePlaceContext.latitude',
      'profilePlaceContext.longitude',
    ]);
    assert.equal(merged['person.name.firstName'], base['person.name.firstName']);
  });

  it('merge keeps persona place when the caller sends no place keys', () => {
    const base = buildPersonaAttributes('generic', 'p@example.com');
    const merged = mergePersonaAttributes(base, { 'person.name.firstName': 'Noura' });
    assert.deepEqual(placeKeysOf(merged).sort(), [...PLACE_KEYS].sort());
    assert.equal(merged['person.name.firstName'], 'Noura');
  });

  it('dual-stream generate sends place in the generic_base step for industry profiles', () => {
    const attributes = buildPersonaAttributes('retail', 'p@example.com');
    const plan = planDualStreamGenerate({ industry: 'retail', attributes, email: 'p@example.com' });
    const genericStep = plan.steps.find((s) => s.role === 'generic_base');
    const overlay = plan.steps.find((s) => s.role === 'industry_overlay');
    assert.ok(genericStep, 'generic step exists');
    assert.deepEqual(placeKeysOf(genericStep.attributes).sort(), [...PLACE_KEYS].sort());
    if (overlay) assert.deepEqual(placeKeysOf(overlay.attributes), []);
  });
});

describe('MCP full-snapshot round-trip keeps place context', () => {
  it('keeps writable generic place rows with number coercion', () => {
    const rows = [
      { path: '_demoemea.profilePlaceContext.latitude', value: '40.7233', valueType: 'number', industry: 'generic', writable: true },
      { path: '_demoemea.profilePlaceContext.longitude', value: '-74.003', valueType: 'number', industry: 'generic', writable: true },
      { path: '_demoemea.profilePlaceContext.city', value: 'New York', valueType: 'string', industry: 'generic', writable: true },
      { path: '_demoemea.profilePlaceContext.geohash', value: 'dr5rsjr', valueType: 'string', industry: 'generic', writable: true },
      { path: 'person.name.firstName', value: 'Ava', valueType: 'string', industry: 'generic', writable: true },
    ];
    const updates = buildFullSnapshotUpdates({ rows, industry: 'generic' });
    const byPath = Object.fromEntries(updates.map((u) => [u.path, u.value]));
    assert.equal(byPath['_demoemea.profilePlaceContext.latitude'], 40.7233);
    assert.equal(byPath['_demoemea.profilePlaceContext.longitude'], -74.003);
    assert.equal(byPath['_demoemea.profilePlaceContext.city'], 'New York');
    assert.equal(byPath['person.name.firstName'], 'Ava');
  });
});
