'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildEventGeneratorXdm,
  resolveDcsStreamSandbox,
  DEFAULT_SANDBOX,
} = require('../eventGeneratorService');
const { buildGeneratorEdgeInteractXdm } = require('../eventEdgeService');
const { readEventPlace } = require('../eventPlaceContext');

const RIYADH = {
  latitude: 24.7136,
  longitude: 46.6753,
  city: 'Riyadh',
  countryCode: 'SA',
  regionCode: 'SA-01',
  neighborhood: 'Olaya',
  storeId: 'store-olaya-01',
  source: 'store-poi',
};

test('buildEventGeneratorXdm (full) applies a valid eventPlace', () => {
  const xdm = buildEventGeneratorXdm({ email: 'a@example.com', eventType: 'location.entry', eventPlace: RIYADH }, { style: 'full' });
  assert.equal(xdm.eventType, 'location.entry');
  assert.deepEqual(xdm.placeContext.geo._schema, { latitude: 24.7136, longitude: 46.6753 });
  assert.equal(xdm.placeContext.geo.city, 'Riyadh');
  assert.equal(xdm.placeContext.geo.countryCode, 'SA');
  assert.equal(xdm.placeContext.geo.stateProvince, 'SA-01');
  const sup = xdm._demoemea.eventPlaceContext;
  assert.match(sup.geohash, /^[0-9b-hjkmnp-z]{7}$/);
  assert.equal(sup.storeId, 'store-olaya-01');
  assert.equal(sup.neighborhood, 'Olaya');
  assert.equal(sup.source, 'store-poi');
});

test('buildEventGeneratorXdm (minimal) applies a valid eventPlace', () => {
  const xdm = buildEventGeneratorXdm({ email: 'a@example.com', eventType: 'pos.purchase', eventPlace: RIYADH }, { style: 'minimal' });
  assert.equal(xdm.eventType, 'pos.purchase');
  assert.equal(xdm.placeContext.geo.city, 'Riyadh');
  assert.ok(xdm._demoemea.eventPlaceContext.geohash);
});

test('eventPlace wins over legacy body.geo', () => {
  const xdm = buildEventGeneratorXdm(
    { email: 'a@example.com', geo: { latitude: 51.5, longitude: -0.12 }, eventPlace: RIYADH },
    { style: 'full' },
  );
  assert.deepEqual(xdm.placeContext.geo._schema, { latitude: 24.7136, longitude: 46.6753 });
});

test('legacy body.geo still works without eventPlace', () => {
  const xdm = buildEventGeneratorXdm({ email: 'a@example.com', geo: { latitude: 51.5, longitude: -0.12 } }, { style: 'full' });
  assert.deepEqual(xdm.placeContext.geo._schema, { latitude: 51.5, longitude: -0.12 });
  assert.equal(xdm._demoemea.eventPlaceContext, undefined);
});

test('no eventPlace leaves placeContext absent', () => {
  const xdm = buildEventGeneratorXdm({ email: 'a@example.com', eventType: 'loyalty.challenge' }, { style: 'full' });
  assert.equal(xdm.placeContext, undefined);
  assert.equal(xdm._demoemea.eventPlaceContext, undefined);
});

test('invalid eventPlace throws a 400 error', () => {
  assert.throws(
    () => buildEventGeneratorXdm({ email: 'a@example.com', eventPlace: { latitude: 200, longitude: 0 } }, { style: 'full' }),
    (err) => err.statusCode === 400 && /latitude/.test(err.message),
  );
});

test('readEventPlace is shared and returns null when absent', () => {
  assert.equal(readEventPlace({}), null);
  assert.equal(readEventPlace(null), null);
  assert.equal(readEventPlace({ eventPlace: RIYADH }).city, 'Riyadh');
  assert.throws(() => readEventPlace({ eventPlace: 'x' }), (e) => e.statusCode === 400);
});

test('edge full style applies eventPlace exactly as the generator does', () => {
  const body = { email: 'a@example.com', eventType: 'location.entry', eventPlace: RIYADH, xdmStyle: 'full' };
  const edge = buildGeneratorEdgeInteractXdm(body, { xdmStyle: 'full' });
  assert.equal(edge.placeContext.geo.city, 'Riyadh');
  assert.equal(edge._demoemea.eventPlaceContext.storeId, 'store-olaya-01');
});

test('edge minimal style still applies eventPlace', () => {
  const edge = buildGeneratorEdgeInteractXdm({ email: 'a@example.com', eventPlace: RIYADH }, { xdmStyle: 'minimal' });
  assert.equal(edge.placeContext.geo.city, 'Riyadh');
  assert.ok(edge._demoemea.eventPlaceContext.geohash);
});

test('resolveDcsStreamSandbox uses the preset-bound sandbox when none is requested', () => {
  assert.deepEqual(resolveDcsStreamSandbox('', { id: 'dcs-x' }), { ok: true, sandbox: DEFAULT_SANDBOX });
  assert.deepEqual(resolveDcsStreamSandbox('', { id: 'dcs-x', sandbox: 'apalmer' }), { ok: true, sandbox: 'apalmer' });
});

test('resolveDcsStreamSandbox accepts a matching explicit sandbox', () => {
  assert.deepEqual(resolveDcsStreamSandbox('apalmer', { id: 'dcs-x', sandbox: 'apalmer' }), { ok: true, sandbox: 'apalmer' });
  assert.deepEqual(resolveDcsStreamSandbox(DEFAULT_SANDBOX, { id: 'dcs-x' }), { ok: true, sandbox: DEFAULT_SANDBOX });
});

test('resolveDcsStreamSandbox rejects a mismatched explicit sandbox instead of streaming elsewhere', () => {
  const r = resolveDcsStreamSandbox('apalmer', { id: 'dcs-x', sandbox: 'kirkham' });
  assert.equal(r.ok, false);
  assert.equal(r.statusCode, 400);
  assert.match(r.error, /dcs-x/);
  assert.match(r.error, /kirkham/);
  assert.match(r.error, /apalmer/);
});
