'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  findInteractionDetailsLiteMixin,
  findTravelHotelExperienceV1Mixin,
  mixinExtendsExperienceEventClass,
  matchesInteractionDetailsLiteTitle,
  matchesTravelHotelExperienceV1Title,
  buildInteractionDetailsLiteExperienceEventFieldGroup,
  buildTravelHotelExperienceV1ExperienceEventFieldGroup,
  ensureRecommendedExperienceEventFieldGroups,
} = require('../eventInfraService');

const EE_CLASS = 'https://ns.adobe.com/xdm/context/experienceevent';

test('findInteractionDetailsLiteMixin matches ExperienceEvent-class rows by title', () => {
  const rows = [
    { title: 'Profile Core v2', 'meta:intendedToExtend': ['https://ns.adobe.com/xdm/context/profile'] },
    { title: 'Interaction Details Lite', $id: 'https://ns.adobe.com/xdm/mixins/interaction-details-lite', 'meta:intendedToExtend': [EE_CLASS] },
  ];
  const hit = findInteractionDetailsLiteMixin(rows);
  assert.ok(hit);
  assert.equal(hit.$id, 'https://ns.adobe.com/xdm/mixins/interaction-details-lite');
});

test('findInteractionDetailsLiteMixin matches compact InteractionDetails Lite title without meta:intendedToExtend', () => {
  const rows = [
    { title: 'InteractionDetails Lite', $id: 'https://ns.adobe.com/demoemea/mixins/abc', 'meta:intendedToExtend': [] },
  ];
  const hit = findInteractionDetailsLiteMixin(rows);
  assert.ok(hit);
  assert.equal(hit.$id, 'https://ns.adobe.com/demoemea/mixins/abc');
});

test('findTravelHotelExperienceV1Mixin matches title variants without meta:intendedToExtend', () => {
  const rows = [
    { title: 'Travel - Hotel Experience v1', $id: 'https://ns.adobe.com/demoemea/mixins/hotel-v1', 'meta:intendedToExtend': [] },
  ];
  const hit = findTravelHotelExperienceV1Mixin(rows);
  assert.ok(hit);
  assert.match(hit.title, /Hotel Experience v1/i);
});

test('matchesInteractionDetailsLiteTitle accepts spaced and compact titles', () => {
  assert.equal(matchesInteractionDetailsLiteTitle('Interaction Details Lite'), true);
  assert.equal(matchesInteractionDetailsLiteTitle('InteractionDetails Lite'), true);
  assert.equal(matchesInteractionDetailsLiteTitle('Profile Travel v1'), false);
});

test('matchesTravelHotelExperienceV1Title accepts en-dash variant', () => {
  assert.equal(matchesTravelHotelExperienceV1Title('Travel – Hotel Experience v1'), true);
});

test('mixinExtendsExperienceEventClass accepts string or array meta:intendedToExtend', () => {
  assert.equal(mixinExtendsExperienceEventClass({ 'meta:intendedToExtend': EE_CLASS }), true);
  assert.equal(mixinExtendsExperienceEventClass({ 'meta:intendedToExtend': [EE_CLASS] }), true);
  assert.equal(mixinExtendsExperienceEventClass({ 'meta:intendedToExtend': ['https://ns.adobe.com/xdm/context/profile'] }), false);
});

test('buildInteractionDetailsLiteExperienceEventFieldGroup wraps under tenant namespace', () => {
  const body = buildInteractionDetailsLiteExperienceEventFieldGroup('demoemea');
  assert.equal(body.title, 'Interaction Details Lite');
  assert.deepEqual(body['meta:intendedToExtend'], [EE_CLASS]);
  assert.ok(body.properties._demoemea);
  assert.ok(body.properties._demoemea.properties.interactionDetails);
  assert.ok(body.properties._demoemea.properties.interactionDetails.properties.core.properties.channel);
  assert.equal(body.properties.interactionDetails, undefined);
});

test('buildTravelHotelExperienceV1ExperienceEventFieldGroup wraps hotel under tenant namespace', () => {
  const body = buildTravelHotelExperienceV1ExperienceEventFieldGroup('demoemea');
  assert.equal(body.title, 'Travel - Hotel Experience v1');
  const hotel = body.properties._demoemea.properties.hotel;
  assert.ok(hotel.properties.bookingDetails);
  assert.ok(hotel.properties.bookingDetails.properties.hotelName);
  assert.ok(hotel.properties.checkOut.properties.overallRating);
  assert.equal(body.properties.hotel, undefined);
});

test('ensureRecommendedExperienceEventFieldGroups uses POST response when relist omits meta:intendedToExtend', async () => {
  const createdId = 'https://ns.adobe.com/demoemea/mixins/created-interaction-lite';
  const createdHotelId = 'https://ns.adobe.com/demoemea/mixins/created-hotel-v1';
  let listCalls = 0;
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('/tenant/fieldgroups?') && (!init || init.method === 'GET')) {
      listCalls += 1;
      if (listCalls <= 2) {
        return { ok: true, json: async () => ({ results: [] }) };
      }
      return {
        ok: true,
        json: async () => ({
          results: [
            { title: 'Other FG', $id: 'https://ns.adobe.com/demoemea/mixins/other' },
          ],
        }),
      };
    }
    if (u.includes('/tenant/schemas?') && (!init || init.method === 'GET')) {
      return {
        ok: true,
        json: async () => ({
          results: [{ $id: 'https://ns.adobe.com/demoemea/schemas/sample', title: 'Sample' }],
        }),
      };
    }
    if (u.includes('/global/fieldgroups?')) {
      return { ok: true, json: async () => ({ results: [] }) };
    }
    if (u.includes('/tenant/fieldgroups') && init && init.method === 'POST') {
      const body = JSON.parse(init.body);
      const id = body.title.includes('Interaction') ? createdId : createdHotelId;
      return {
        ok: true,
        json: async () => ({
          $id: id,
          title: body.title,
          'meta:intendedToExtend': [EE_CLASS],
        }),
      };
    }
    return { ok: false, json: async () => ({ message: 'unexpected fetch ' + u }) };
  };
  try {
    const out = await ensureRecommendedExperienceEventFieldGroups('sandbox', 'token', 'client', 'org');
    assert.equal(out.interactionLite.$id, createdId);
    assert.equal(out.travelHotel.$id, createdHotelId);
    assert.equal(out.created.length, 2);
    assert.equal(out.warnings.length, 0);
  } finally {
    global.fetch = originalFetch;
  }
});
