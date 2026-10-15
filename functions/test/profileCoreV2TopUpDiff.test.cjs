'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { diffManifestAgainstMixin } = require('../profileInfraFactory');

const leaf = (type) => ({ type });

function present(entries) {
  return { set: new Set(Object.keys(entries)), map: new Map(Object.entries(entries)) };
}

const manifest = {
  travelReservations: {
    type: 'object',
    properties: {
      flightReservations: {
        type: 'object',
        properties: {
          flightNumber: leaf('string'),
          departureDateTime: { type: 'string', format: 'date-time' },
          checkedBags: leaf('integer'),
        },
      },
    },
  },
};

test('diff adds new leaves under an already-present manifest subtree', () => {
  const live = present({
    travelReservations: leaf('object'),
    'travelReservations.flightReservations': leaf('object'),
    'travelReservations.flightReservations.flightNumber': leaf('string'),
  });
  const d = diffManifestAgainstMixin(manifest, live.set, live.map, new Set());
  assert.deepEqual(
    d.needsAdd.map((a) => a.path).sort(),
    ['travelReservations.flightReservations.checkedBags', 'travelReservations.flightReservations.departureDateTime']
  );
  assert.equal(d.needsAdd.find((a) => a.path.endsWith('checkedBags')).schema.type, 'integer');
  assert.deepEqual(d.alreadyPresent, ['travelReservations']);
  assert.deepEqual(d.conflicts, []);
});

test('diff adds one missing intermediate object instead of its leaves', () => {
  const live = present({ travelReservations: leaf('object') });
  const d = diffManifestAgainstMixin(manifest, live.set, live.map, new Set());
  assert.deepEqual(d.needsAdd.map((a) => a.path), ['travelReservations.flightReservations']);
});

test('diff reports nested type conflicts without adding', () => {
  const live = present({
    travelReservations: leaf('object'),
    'travelReservations.flightReservations': leaf('object'),
    'travelReservations.flightReservations.flightNumber': leaf('string'),
    'travelReservations.flightReservations.departureDateTime': leaf('string'),
    'travelReservations.flightReservations.checkedBags': leaf('number'),
  });
  const d = diffManifestAgainstMixin(manifest, live.set, live.map, new Set());
  assert.deepEqual(d.needsAdd, []);
  assert.equal(d.conflicts.length, 1);
  assert.equal(d.conflicts[0].path, 'travelReservations.flightReservations.checkedBags');
});

test('diff does not add leaves under a $ref-blocked ancestor', () => {
  const live = present({
    travelReservations: leaf('object'),
    'travelReservations.flightReservations': leaf('object'),
  });
  const d = diffManifestAgainstMixin(manifest, live.set, live.map, new Set(['travelReservations.flightReservations']));
  assert.deepEqual(d.needsAdd, []);
  assert.equal(d.conflicts.length, 3);
});

test('diff is a no-op when the full subtree is present', () => {
  const live = present({
    travelReservations: leaf('object'),
    'travelReservations.flightReservations': leaf('object'),
    'travelReservations.flightReservations.flightNumber': leaf('string'),
    'travelReservations.flightReservations.departureDateTime': leaf('string'),
    'travelReservations.flightReservations.checkedBags': leaf('integer'),
  });
  const d = diffManifestAgainstMixin(manifest, live.set, live.map, new Set());
  assert.deepEqual(d.needsAdd, []);
  assert.deepEqual(d.conflicts, []);
});
