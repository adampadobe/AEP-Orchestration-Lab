'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { flattenEntityToTableRows } = require('../profileTableHelpers');
const { deriveEventChannel } = require('../profileEventChannel');

test('deriveEventChannel prefers _demoemea.interactionDetails.core.channel', () => {
  const entity = {
    _demoemea: { interactionDetails: { core: { channel: 'web' } } },
    interactionDetails: { core: { channel: 'mobile' } },
  };
  const rows = flattenEntityToTableRows(entity);
  assert.equal(deriveEventChannel(entity, rows), 'web');
});

test('deriveEventChannel uses flattened rows when entity getters miss flat keys', () => {
  const entity = { eventType: 'com.example.custom', 'device.channel': 'web' };
  const rows = [
    { path: 'device.channel', value: 'web', attribute: 'channel' },
  ];
  assert.equal(deriveEventChannel(entity, rows), 'web');
});

test('deriveEventChannel defaults to web for web.webPageDetails.pageViews when no channel leaf', () => {
  const entity = {
    eventType: 'web.webPageDetails.pageViews',
    web: { webPageDetails: { name: 'Ferrari World Abu Dhabi — title long enough' } },
  };
  const rows = flattenEntityToTableRows(entity);
  assert.equal(deriveEventChannel(entity, rows), 'web');
});

test('deriveEventChannel does not force web when eventType is not web-scoped', () => {
  const entity = { eventType: 'hotel.room.select' };
  const rows = [];
  assert.equal(deriveEventChannel(entity, rows), '');
});
