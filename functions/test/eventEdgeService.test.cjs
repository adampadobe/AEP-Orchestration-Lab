'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildXdm,
  buildMinimalEdgeXdm,
  buildTriggerPayload,
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

test('buildMinimalEdgeXdm ignores orchestration eventID (skinny payload)', () => {
  const xdm = buildMinimalEdgeXdm({
    email: EMAIL,
    eventType: 'transaction',
    eventID: 'orch-abc',
    channel: 'web',
  });
  assert.equal(xdm._experience, undefined);
});

test('buildXdm with xdmStyle minimal ignores eventID and view fields', () => {
  const xdm = buildXdm({
    email: EMAIL,
    eventType: 'transaction',
    xdmStyle: 'minimal',
    eventID: 'orch-abc',
    viewName: 'Home',
    viewUrl: 'https://example.com',
    channel: 'email',
  });
  assert.equal(xdm._experience, undefined);
  assert.equal(xdm.web, undefined);
  assert.equal(xdm.interactionDetails.core.channel, 'email');
  assert.equal(xdm.identityMap.ECID, undefined);
  assert.equal(xdm.identityMap.Email[0].primary, true);
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

test('buildMinimalEdgeXdm email-only uses Email as primary identity', () => {
  const xdm = buildMinimalEdgeXdm({
    email: EMAIL,
    eventType: 'transaction',
    channel: 'web',
    timestamp: '2026-06-23T12:00:00.000Z',
    _id: '12345',
  });
  assert.equal(xdm.identityMap.ECID, undefined);
  assert.equal(xdm.identityMap.Email[0].id, EMAIL);
  assert.equal(xdm.identityMap.Email[0].primary, true);
  assert.equal(xdm.interactionDetails.core.channel, 'web');
  assert.equal(xdm._demoemea, undefined);
});

test('buildMinimalEdgeXdm ecid-only uses ECID as primary identity', () => {
  const xdm = buildMinimalEdgeXdm({
    ecid: ECID,
    eventType: 'advertising.conversions',
    channel: 'web',
  });
  assert.equal(xdm.identityMap.ECID[0].id, ECID);
  assert.equal(xdm.identityMap.ECID[0].primary, true);
  assert.equal(xdm.identityMap.Email, undefined);
  assert.equal(xdm._demoemea, undefined);
});

test('buildXdm with xdmStyle minimal ignores public opt-in fields', () => {
  const xdm = buildXdm({
    email: EMAIL,
    ecid: ECID,
    eventType: 'donation.made',
    xdmStyle: 'minimal',
    public: { donationAmount: 50 },
  });
  assert.equal(xdm._demoemea, undefined);
  assert.equal(xdm.public, undefined);
});

test('buildTriggerPayload uses Email primary when ecid is empty', () => {
  const template = {
    event: {
      xdm: {
        _demoemea: {
          identification: { core: { ecid: '{{ecid}}', email: '{{email}}' } },
        },
        eventType: 'advertising.conversions',
        timestamp: '{{timestamp}}',
      },
    },
  };
  const payload = buildTriggerPayload(template, '', EMAIL, 'advertising.conversions');
  const xdm = payload.event.xdm;
  assert.equal(xdm.identityMap.ECID, undefined);
  assert.equal(xdm.identityMap.Email[0].id, EMAIL);
  assert.equal(xdm.identityMap.Email[0].primary, true);
  assert.equal(xdm._demoemea.identification.core.email, EMAIL);
  assert.equal(xdm._demoemea.identification.core.ecid, undefined);
});

test('buildTriggerPayload keeps ECID primary when ecid is valid', () => {
  const template = {
    event: {
      xdm: {
        _demoemea: {
          identification: { core: { ecid: '{{ecid}}', email: '{{email}}' } },
        },
        eventType: 'advertising.conversions',
        timestamp: '{{timestamp}}',
      },
    },
  };
  const payload = buildTriggerPayload(template, ECID, EMAIL, 'advertising.conversions');
  const xdm = payload.event.xdm;
  assert.equal(xdm.identityMap.ECID[0].id, ECID);
  assert.equal(xdm.identityMap.ECID[0].primary, true);
  assert.equal(xdm.identityMap.Email[0].id, EMAIL);
  assert.equal(xdm.identityMap.Email[0].primary, false);
});

test('buildGeneratorEdgeInteractXdm minimal preset matches Event tool UI (no tenant, no webPageDetails)', () => {
  const { buildGeneratorEdgeInteractXdm } = require('../eventEdgeService');
  const xdm = buildGeneratorEdgeInteractXdm(
    { email: EMAIL, ecid: ECID, eventType: 'commerce.search', channel: 'web' },
    { id: 'lab-event-tool-edge', xdmStyle: 'minimal' },
  );
  assert.equal(xdm._demoemea, undefined);
  assert.equal(xdm._experience, undefined);
  assert.equal(xdm.web, undefined);
  assert.equal(xdm.eventType, 'commerce.search');
  assert.equal(xdm.interactionDetails.core.channel, 'web');
  assert.equal(xdm.identityMap.ECID[0].id, ECID);
  assert.equal(xdm.identityMap.Email[0].id, EMAIL);
});

test('buildGeneratorEdgeInteractXdm minimal ignores viewName and pageViews event type', () => {
  const { buildGeneratorEdgeInteractXdm } = require('../eventEdgeService');
  const xdm = buildGeneratorEdgeInteractXdm(
    {
      email: EMAIL,
      ecid: ECID,
      eventType: 'web.webPageDetails.pageViews',
      viewName: 'Home',
      viewUrl: 'https://example.com',
      channel: 'web',
    },
    { id: 'lab-event-tool-edge', xdmStyle: 'minimal' },
  );
  assert.equal(xdm.web, undefined);
  assert.equal(xdm._demoemea, undefined);
  assert.equal(xdm.eventType, 'web.webPageDetails.pageViews');
});

test('buildGeneratorEdgeInteractXdm email-only minimal avoids fake ECID fallback', () => {
  const { buildGeneratorEdgeInteractXdm } = require('../eventEdgeService');
  const xdm = buildGeneratorEdgeInteractXdm(
    { email: EMAIL, eventType: 'transaction', channel: 'web' },
    { id: 'lab-event-tool-edge', xdmStyle: 'minimal' },
  );
  assert.equal(xdm.identityMap.ECID, undefined);
  assert.equal(xdm.identityMap.Email[0].primary, true);
  assert.equal(xdm._demoemea, undefined);
  assert.equal(xdm.interactionDetails.core.channel, 'web');
});

test('parseEdgeInteractPropositions dedupes by proposition id', () => {
  const { parseEdgeInteractPropositions } = require('../eventEdgeService');
  const props = parseEdgeInteractPropositions({
    handle: [{ type: 'personalization:decisions', payload: [{ id: 'same' }, { id: 'same' }] }],
    propositions: [{ id: 'same' }],
  });
  assert.equal(props.length, 1);
});
