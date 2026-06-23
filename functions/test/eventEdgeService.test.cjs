'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildXdm,
  buildMinimalEdgeXdm,
  shouldUseRichEdgeXdm,
} = require('../eventEdgeService');
const { buildLabFirestoreGeneratorPresets, LAB_EVENT_TOOL_TARGET_ID } = require('../eventGeneratorService');

const ECID = '62722406001178632594092146103219305888';
const EMAIL = 'demo+001@adobetest.com';

test('buildMinimalEdgeXdm is identityMap + eventType + _id + timestamp only when channel omitted', () => {
  const xdm = buildMinimalEdgeXdm({
    email: EMAIL,
    ecid: ECID,
    eventType: 'transaction',
    timestamp: '2026-06-23T12:00:00.000Z',
    _id: '12345',
  });
  assert.deepEqual(Object.keys(xdm).sort(), ['_id', 'eventType', 'identityMap', 'timestamp']);
  assert.equal(xdm.eventType, 'transaction');
  assert.equal(xdm._id, '12345');
  assert.equal(xdm.identityMap.ECID[0].id, ECID);
  assert.equal(xdm.identityMap.Email[0].id, EMAIL);
  assert.equal(xdm._demoemea, undefined);
  assert.equal(xdm.demoemea, undefined);
  assert.equal(xdm._experience, undefined);
  assert.equal(xdm.interactionDetails, undefined);
});

test('buildMinimalEdgeXdm adds root interactionDetails.core.channel without tenant mirror', () => {
  const xdm = buildMinimalEdgeXdm({
    email: EMAIL,
    ecid: ECID,
    eventType: 'transaction',
    channel: 'web',
    timestamp: '2026-06-23T12:00:00.000Z',
    _id: '12345',
  });
  assert.deepEqual(Object.keys(xdm).sort(), ['_id', 'eventType', 'identityMap', 'interactionDetails', 'timestamp']);
  assert.equal(xdm.interactionDetails.core.channel, 'web');
  assert.equal(xdm._demoemea, undefined);
  assert.equal(xdm.channel, undefined);
});

test('buildXdm minimal omits orchestration eventID unless provided', () => {
  const xdm = buildXdm({ email: EMAIL, ecid: ECID, eventType: 'transaction' });
  assert.equal(xdm._experience, undefined);
  const withOrch = buildXdm({
    email: EMAIL,
    ecid: ECID,
    eventType: 'transaction',
    eventID: 'orch-abc',
  });
  assert.equal(withOrch._experience.campaign.orchestration.eventID, 'orch-abc');
});

test('buildXdm stays minimal when only channel is set', () => {
  const xdm = buildXdm({
    email: EMAIL,
    ecid: ECID,
    eventType: 'transaction',
    channel: 'web',
  });
  assert.equal(xdm._demoemea, undefined);
  assert.equal(xdm.demoemea, undefined);
  assert.equal(xdm.interactionDetails.core.channel, 'web');
});

test('buildXdm rich when public is set', () => {
  const xdm = buildXdm({
    email: EMAIL,
    ecid: ECID,
    eventType: 'donation.made',
    public: { donationAmount: 50 },
  });
  assert.ok(xdm._demoemea.public);
  assert.equal(xdm._demoemea.public.donationAmount, 50);
});

test('buildXdm rich when xdmStyle is full', () => {
  const xdm = buildXdm({
    email: EMAIL,
    ecid: ECID,
    eventType: 'transaction',
    xdmStyle: 'full',
  });
  assert.ok(xdm._demoemea);
});

test('buildXdm rich when viewName is set', () => {
  const xdm = buildXdm({
    email: EMAIL,
    ecid: ECID,
    eventType: 'transaction',
    viewName: 'Lab demo page',
  });
  assert.ok(xdm._demoemea);
  assert.equal(xdm.web.webPageDetails.viewName, 'Lab demo page');
});

test('buildXdm minimal omits web when only identity fields set', () => {
  const xdm = buildXdm({ email: EMAIL, ecid: ECID, eventType: 'transaction' });
  assert.equal(xdm.web, undefined);
});

test('shouldUseRichEdgeXdm is false when only channel is set', () => {
  assert.equal(shouldUseRichEdgeXdm({ channel: 'web' }), false);
});

test('shouldUseRichEdgeXdm respects explicit minimal style', () => {
  assert.equal(shouldUseRichEdgeXdm({ channel: 'web', xdmStyle: 'minimal' }), false);
});

test('buildLabFirestoreGeneratorPresets uses minimal xdmStyle for event tool', () => {
  const out = buildLabFirestoreGeneratorPresets('apalmer', {
    datastreamId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  }, null);
  assert.equal(out[0].id, LAB_EVENT_TOOL_TARGET_ID);
  assert.equal(out[0].xdmStyle, 'minimal');
});
