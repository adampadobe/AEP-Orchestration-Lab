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
  TRAVEL_PROFILE_SCHEMA_TITLE,
  runStatus,
} = require('../travelProfileInfraService');
const {
  resolveIndustryFgEntry, BASE_PROFILE_FIELD_GROUP_REFS, buildCompositeSubtreeFromManifest,
  diffManifestAgainstMixin, walkResolvedMixinTenantTree,
} = require('../profileInfraFactory');
const { projectStatusFlags } = require('../profileInfraStatusAll');

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

  describe('Travel resolved-schema readiness', () => {
    for (const state of ['missing room cost', 'missing flight subtree', 'wrong type', 'narrow numeric type',
      'unknown type', 'wider numeric type', 'ready']) {
      it(`checks the generator manifest when ${state}`, async (t) => {
        const schemaId = 'https://ns.adobe.com/demoemea/schemas/travel-test';
        const coreId = 'https://ns.adobe.com/demoemea/mixins/core-test';
        const schema = {
          title: TRAVEL_PROFILE_SCHEMA_TITLE, $id: schemaId,
          'meta:altId': '_demoemea.schemas.travel-test',
        };
        const tenant = structuredClone(buildCompositeSubtreeFromManifest(getManifestForIndustry('travel'), ''));
        const booking = tenant.properties.hotel.properties.bookingDetails.properties;
        if (state === 'missing room cost') delete booking.roomCost;
        if (state === 'missing flight subtree') delete tenant.properties.travelReservations;
        if (state === 'wrong type') booking.roomCost.type = 'string';
        if (state === 'narrow numeric type') booking.roomCost.type = 'integer';
        if (state === 'unknown type') delete booking.roomCost.type;
        if (state === 'wider numeric type') booking.totalNights.type = 'number';
        t.mock.method(globalThis, 'fetch', async (url, init) => {
          assert.equal(init.method, 'GET', 'readiness must never repair infrastructure');
          const path = new URL(url).pathname;
          let body;
          if (path.endsWith('/tenant/schemas')) body = { results: [schema] };
          else if (path.includes('/tenant/schemas/')) {
            body = {
              ...schema, 'meta:immutableTags': ['union'],
              allOf: [
                'https://ns.adobe.com/xdm/context/profile', ...BASE_PROFILE_FIELD_GROUP_REFS, coreId,
                'https://ns.adobe.com/xdm/mixins/profile/travel-preferences',
              ].map(($ref) => ({ $ref })),
              properties: { _demoemea: tenant },
            };
          } else if (path.endsWith('/tenant/fieldgroups')) {
            body = { results: [{ title: 'Profile Core v2', $id: coreId }] };
          } else if (path.endsWith('/global/fieldgroups')) body = { results: [] };
          else if (path.endsWith('/dataSets')) {
            body = { results: [{ id: 'travel-dataset', schemaRef: { id: schemaId }, tags: { unifiedProfile: ['enabled:true'] } }] };
          } else if (path.endsWith('/tenant/descriptors')) {
            body = { results: ['Email', 'ECID'].map((namespace) => ({
              '@type': 'xdm:descriptorIdentity', 'xdm:sourceSchema': schemaId,
              'xdm:namespace': namespace, 'xdm:isPrimary': namespace === 'Email',
              'xdm:sourceProperty': `/_demoemea/identification/core/${namespace.toLowerCase()}`,
            })) };
          } else assert.fail(`Unexpected registry request: ${path}`);
          return { ok: true, status: 200, json: async () => body };
        });
        const status = await runStatus('offline', 'token', 'client', 'org');
        assert.equal(status.ok, true);
        const ready = state === 'ready' || state === 'wider numeric type';
        assert.equal(status.ready, ready, JSON.stringify(status));
        assert.equal(status.prepSteps.step2_fieldGroupsIdentity, ready);
        assert.equal(status.requiredTenantFields.ready, ready);
        if (state === 'missing room cost') {
          assert.deepEqual(status.requiredTenantFields.missing, ['hotel.bookingDetails.roomCost']);
        }
        if (state === 'missing flight subtree') {
          assert.deepEqual(status.requiredTenantFields.missing, ['travelReservations']);
        }
        if (['wrong type', 'narrow numeric type', 'unknown type'].includes(state)) {
          assert.equal(status.requiredTenantFields.conflicts[0].path, 'hotel.bookingDetails.roomCost');
        }
        if (state === 'wider numeric type') {
          const walked = walkResolvedMixinTenantTree({ properties: { _demoemea: tenant } });
          const strictDiff = diffManifestAgainstMixin(
            getManifestForIndustry('travel'), walked.presentPathSet, walked.presentNodeMap, new Set(),
          );
          assert.ok(strictDiff.conflicts.some(({ path }) => path === 'hotel.bookingDetails.totalNights'),
            'provisioning must retain its strict type-conflict policy');
        }
        assert.deepEqual(projectStatusFlags(status).requiredTenantFields, status.requiredTenantFields);
      });
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
