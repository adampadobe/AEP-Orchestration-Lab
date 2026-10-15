'use strict';

/**
 * Travel active-flight contract: every leaf the shared flight-trip builder
 * (web/profile-viewer/travel-flight-trip.js) streams must exist — with a
 * compatible type — in the Profile Core v2 manifest (travelReservations.*) or
 * in the Profile Travel v1 / v2 field-group specs the infra creates when they
 * are missing (individualCharacteristics.travel.*).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const FlightTrip = require('../../web/profile-viewer/travel-flight-trip.js');
const { getManifestForIndustry } = require('../profileCoreV2Manifest');
const {
  TRAVEL_PROFILE_V1_PROPERTIES,
  TRAVEL_PROFILE_V2_PROPERTIES,
  TRAVEL_INDUSTRY_FIELD_GROUPS,
} = require('../travelProfileInfraService');
const { resolveIndustryFgEntry } = require('../profileInfraFactory');

const NOW = Date.parse('2026-07-20T12:00:00Z');

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function leafAt(root, dotted) {
  let node = { properties: root };
  for (const part of dotted.split('.')) {
    node = node && node.properties ? node.properties[part] : undefined;
    if (!node) return undefined;
  }
  return node;
}

function assertCompatible(path, leaf, value) {
  assert.ok(leaf, `${path} missing from schema spec`);
  if (Number.isInteger(value)) assert.equal(leaf.type, 'integer', `${path} should be integer`);
  else assert.equal(leaf.type, 'string', `${path} should be string`);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    assert.equal(leaf.format, 'date', `${path} carries a date`);
  }
  if (typeof value === 'string' && /T\d{2}:\d{2}/.test(value)) {
    assert.equal(leaf.format, 'date-time', `${path} carries a datetime`);
  }
}

function allTrips() {
  const out = [];
  for (const activeFlight of ['Yes', 'No']) {
    for (let seed = 1; seed <= 40; seed += 1) {
      out.push(FlightTrip.buildFlightTrip({
        activeFlight,
        dep: { code: 'LHR', city: 'London', country: 'United Kingdom' },
        arr: { code: 'SIN', city: 'Singapore', country: 'Singapore' },
        airline: 'Singapore Airlines',
        flightNumber: 'SQ317',
        confirmationNumber: 'XYZ789',
        flightClass: 'first',
        rng: seeded(seed),
        now: NOW,
      }));
    }
  }
  return out;
}

describe('travel active-flight schema contract', () => {
  const manifest = getManifestForIndustry('travel');
  const travelSpec = {
    individualCharacteristics: {
      properties: {
        travel: {
          properties: {
            ...TRAVEL_PROFILE_V1_PROPERTIES.individualCharacteristics.properties.travel.properties,
            ...TRAVEL_PROFILE_V2_PROPERTIES.individualCharacteristics.properties.travel.properties,
          },
        },
      },
    },
  };

  it('travelReservations.* leaves exist in the Profile Core v2 manifest', () => {
    for (const trip of allTrips()) {
      for (const [path, value] of Object.entries(FlightTrip.tripToAttributePaths(trip))) {
        if (!path.startsWith('travelReservations.')) continue;
        assertCompatible(path, leafAt(manifest, path), value);
      }
    }
  });

  it('individualCharacteristics.travel.* leaves exist in Profile Travel v1 / v2 specs', () => {
    for (const trip of allTrips()) {
      for (const [path, value] of Object.entries(FlightTrip.tripToAttributePaths(trip))) {
        if (!path.startsWith('individualCharacteristics.travel.')) continue;
        assertCompatible(path, leafAt(travelSpec, path), value);
      }
    }
  });

  it('individualCharacteristics.travel.* is never added to the Core v2 manifest', () => {
    assert.equal(leafAt(manifest, 'individualCharacteristics.travel'), undefined);
  });

  it('Profile Travel v1 / v2 entries are optional, createIfMissing, exact-title', () => {
    for (const label of ['Profile Travel v1', 'Profile Travel v2']) {
      const entry = TRAVEL_INDUSTRY_FIELD_GROUPS.find((e) => e.label === label);
      assert.ok(entry, `${label} entry missing`);
      assert.equal(entry.optional, true);
      assert.equal(entry.createIfMissing.title, label);
    }
    const v2 = TRAVEL_INDUSTRY_FIELD_GROUPS.find((e) => e.label === 'Profile Travel v2');
    const tenant = [
      { title: 'Profile Travel v1', $id: 'https://ns.adobe.com/t/mixins/v1' },
      { title: 'Profile Travel v2', $id: 'https://ns.adobe.com/t/mixins/v2' },
      { title: 'Profile Travel v3', $id: 'https://ns.adobe.com/t/mixins/v3' },
    ];
    assert.equal(resolveIndustryFgEntry(v2, tenant, []).ref, 'https://ns.adobe.com/t/mixins/v2');

    const missing = resolveIndustryFgEntry(v2, tenant.slice(0, 1), []);
    assert.equal(missing.resolved, false);
    assert.equal(missing.needsCreate.spec.title, 'Profile Travel v2');
  });
});
