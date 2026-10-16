const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const model = require('../web/profile-viewer/british-airways-decisioning-model');

function setup(previous = 'none', previousIntent = 'none') {
  const calls = [], logs = [];
  const ctx = { sandbox: 'test', namespace: 'email', identifier: 'selected@example.test' };
  const data = {
    profileEmail: ctx.identifier, ecid: '11111111111111111111111111111111111111',
    rows: [{ path: 'testProfile', value: 'true' }, { path: '_demoemea.' + model.disruptionPath, value: previous }, { path: '_demoemea.britishAirwaysDecisioning.shoppingIntent', value: previousIntent }],
  };
  const sdk = async (command, options) => {
    calls.push({ command, options });
    if (command === 'getIdentity') return { identity: { ECID: '99999999999999999999999999999999999999' } };
    if (sandbox.failEvent) throw new Error('uncertain network failure');
    return { requestId: 'edge-response' };
  };
  const sandbox = {
    busy: false, loaded: data, loadedKey: JSON.stringify(ctx), prefix: 'baDecisioning',
    controlBaseline: { disruption: previous, intent: previousIntent }, appliedOperations: new Map(), appliedIntent: new Map(),
    dirty: true, pendingVerification: null,
    ingestionToken: 0, ingestion: null, ingestionNote: '', confirmIngestion: async () => true,
    state: { disruption: previous, intent: previousIntent }, apply: {}, run: {},
    context: () => ctx, key: JSON.stringify, current() {},
    visualiser: () => ({ getState: () => ({ ...sandbox.state }) }),
    table: async () => data, preflightSchema: async () => {},
    model: { ...model, buildSnapshots: () => [{ industry: 'travel', updates: [] }] },
    message: text => { sandbox.status = text; }, invalidateDecision() {},
    console: { log: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    global: {
      DemoTagsInjection: { ensureAlloyReady: async () => sdk },
      postProfileUpdate: async () => sandbox.failProfile ? { ok: false, data: {} } : { ok: true, data: { ok: true } },
      formatProfileUpdateError: () => 'profile rejected',
    },
  };
  vm.createContext(sandbox);
  const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'profile-viewer', 'british-airways-decisioning.js'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('  function disruptionEventXdm('), source.indexOf('  function imageFromMount(')), sandbox);
  return { sandbox, calls, logs, data };
}
test('all Operations transitions send at most once, with exact browser identity and no personalization request', async () => {
  for (const [from, to, expected] of [
    ['none', 'delay', 'DELAY'], ['none', 'cancelled', 'CANCELLATION'],
    ['delay', 'cancelled', 'CANCELLATION'], ['cancelled', 'delay', 'DELAY'],
    ['delay', 'delay', null], ['cancelled', 'cancelled', null], ['none', 'none', null],
    ['cancelled', 'none', null],
  ]) {
    const { sandbox, calls, logs } = setup(from);
    sandbox.state.disruption = to;
    await Promise.all([sandbox.save(), sandbox.save()]);
    const events = calls.filter(call => call.command === 'sendEvent');
    assert.equal(events.length, expected ? 1 : 0, `${from} -> ${to}`);
    if (expected) {
      const payload = events[0].options;
      assert.equal(payload.xdm.eventType, 'flight.disruption');
      assert.equal(payload.xdm._demoemea.flightDisruption.disruptionType, expected);
      assert.equal(payload.xdm._demoemea.flightDisruption.flightNumber, 'BA117');
      assert.equal(payload.xdm._demoemea.flightDisruption.bookingReference, 'ABC123');
      assert.equal(payload.xdm._demoemea.flightDisruption.originAirport, 'LHR');
      assert.equal(payload.xdm._demoemea.flightDisruption.destinationAirport, 'JFK');
      assert.equal(payload.xdm._demoemea.flightDisruption.delayMinutes, 180);
      assert.equal(payload.xdm.identityMap.Email[0].id, 'selected@example.test');
      assert.equal(payload.xdm.identityMap.Email[0].primary, true);
      assert.equal(payload.xdm.identityMap.ECID[0].primary, false);
      assert.equal(payload.xdm.identityMap.ECID[0].id, '99999999999999999999999999999999999999');
      assert.equal(payload.xdm._demoemea.identification.core.ecid, payload.xdm.identityMap.ECID[0].id);
      assert.equal(payload.xdm._demoemea.identification.core.email, payload.xdm.identityMap.Email[0].id);
      assert.ok(Number.isFinite(Date.parse(payload.xdm.timestamp)));
      assert.equal(payload.personalization.defaultPersonalizationEnabled, false);
      assert.equal(payload.personalization.surfaces, undefined);
      assert.equal(payload.personalization.decisionScopes, undefined);
      assert.ok(logs.some(log => log[0].includes('Edge response')));
    }
    await sandbox.save();
    assert.equal(calls.filter(call => call.command === 'sendEvent').length, expected ? 1 : 0, 'stale profile readback must not cause duplicate sends');
    assert.ok(logs.some(log => log[0] === 'No disruption event sent - operations unchanged'));
  }
});
test('profile flight values override approved defaults', () => {
  const { sandbox, data } = setup();
  for (const [leaf, value] of Object.entries({ flightNumber: 'BA222', confirmationNumber: 'REAL456', departureAirportCode: 'EDI', arrivalAirportCode: 'MAD' })) {
    data.rows.push({ path: '_demoemea.travelReservations.flightReservations.' + leaf, value });
  }
  data.rows.push({ path: '_demoemea.flightDisruption.delayMinutes', value: '45' });
  const flight = sandbox.disruptionEventXdm(data, 'delay', '99999999999999999999999999999999999999')._demoemea.flightDisruption;
  assert.deepEqual(JSON.parse(JSON.stringify(flight)), { disruptionType: 'DELAY', flightNumber: 'BA222', bookingReference: 'REAL456', originAirport: 'EDI', destinationAirport: 'MAD', delayMinutes: 45 });
});
test('failed profiles and missing browser identity emit no event; failed sends are explicit and never retried', async () => {
  const rejected = setup();
  rejected.sandbox.state.disruption = 'delay';
  rejected.sandbox.failProfile = true;
  await rejected.sandbox.save();
  assert.equal(rejected.calls.filter(call => call.command === 'sendEvent').length, 0);
  const missing = setup();
  missing.sandbox.state.disruption = 'delay';
  missing.sandbox.global.DemoTagsInjection.ensureAlloyReady = async () => async () => ({});
  await missing.sandbox.save();
  assert.match(missing.sandbox.status, /browser ECID was not returned/);
  const failed = setup();
  failed.sandbox.state.disruption = 'delay';
  failed.sandbox.failEvent = true;
  await failed.sandbox.save();
  assert.match(failed.sandbox.status, /Snapshots accepted.*tracking failed/);
  await failed.sandbox.save();
  assert.equal(failed.calls.filter(call => call.command === 'sendEvent').length, 1);
});
test('all Shopping Intent transitions send at most once, with flightSearch payload and exact browser identity', async () => {
  for (const [from, to, expectedType] of [
    ['none', 'searched', 'flight.abandoned'],
    ['none', 'abandoned', 'flight.abandoned'],
    ['searched', 'abandoned', 'flight.abandoned'],
    ['abandoned', 'searched', 'flight.abandoned'],
    ['searched', 'searched', null],
    ['abandoned', 'abandoned', null],
    ['none', 'none', null],
    ['searched', 'none', null],
    ['abandoned', 'none', null],
  ]) {
    const { sandbox, calls, logs } = setup('none', from);
    sandbox.state.intent = to;
    await Promise.all([sandbox.save(), sandbox.save()]);
    const events = calls.filter(call => call.command === 'sendEvent' && call.options.xdm.eventType !== 'flight.disruption');
    assert.equal(events.length, expectedType ? 1 : 0, `Intent: ${from} -> ${to}`);
    if (expectedType) {
      const payload = events[0].options;
      assert.equal(payload.xdm.eventType, expectedType);
      assert.equal(payload.xdm._demoemea.flightSearch.originAirport, 'LHR');
      assert.equal(payload.xdm._demoemea.flightSearch.destinationAirport, 'JFK');
      assert.equal(payload.xdm._demoemea.flightSearch.cabinClass, 'Business');
      assert.equal(payload.xdm._demoemea.flightSearch.departureDate, '2026-11-15');
      assert.equal(payload.xdm._demoemea.flightSearch.passengerCount, 2);
      assert.equal(payload.xdm._demoemea.flightSearch.searchValue, 2450.00);
      assert.equal(payload.xdm.identityMap.Email[0].id, 'selected@example.test');
      assert.equal(payload.xdm.identityMap.Email[0].primary, true);
      assert.equal(payload.xdm.identityMap.ECID[0].primary, false);
      assert.equal(payload.xdm.identityMap.ECID[0].id, '99999999999999999999999999999999999999');
      assert.equal(payload.xdm._demoemea.identification.core.ecid, payload.xdm.identityMap.ECID[0].id);
      assert.equal(payload.xdm._demoemea.identification.core.email, payload.xdm.identityMap.Email[0].id);
      assert.ok(Number.isFinite(Date.parse(payload.xdm.timestamp)));
      assert.equal(payload.personalization.defaultPersonalizationEnabled, false);
      assert.ok(logs.some(log => log[0].includes('Edge response')));
    }
    await sandbox.save();
    assert.equal(calls.filter(call => call.command === 'sendEvent' && call.options.xdm.eventType !== 'flight.disruption').length, expectedType ? 1 : 0, 'stale profile readback must not cause duplicate intent sends');
    assert.ok(logs.some(log => log[0] === 'Intent event not sent - shopping intent unchanged'));
  }
});
test('profile flight search values override fallback constants in intent payload', () => {
  const { sandbox, data } = setup('none', 'none');
  for (const [leaf, value] of Object.entries({
    departureAirportCode: 'SFO',
    arrivalAirportCode: 'LHR',
    flightClass: 'First',
    flightDate: '2027-01-10',
    numberofPassengers: '4',
  })) {
    data.rows.push({ path: '_demoemea.travelReservations.flightReservations.' + leaf, value });
  }
  const search = sandbox.intentEventXdm(data, 'searched', '99999999999999999999999999999999999999')._demoemea.flightSearch;
  assert.deepEqual(JSON.parse(JSON.stringify(search)), {
    originAirport: 'SFO',
    destinationAirport: 'LHR',
    cabinClass: 'First',
    departureDate: '2027-01-10',
    passengerCount: 4,
    searchValue: 2450.00,
  });
});
