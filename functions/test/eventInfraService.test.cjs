'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  findInteractionDetailsLiteMixin,
  findTravelHotelExperienceV1Mixin,
  mixinExtendsExperienceEventClass,
  buildInteractionDetailsLiteExperienceEventFieldGroup,
  buildTravelHotelExperienceV1ExperienceEventFieldGroup,
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

test('findTravelHotelExperienceV1Mixin matches title variants', () => {
  const rows = [
    { title: 'Travel - Hotel Experience v1', $id: 'https://ns.adobe.com/tenant/fg/hotel-v1', 'meta:intendedToExtend': [EE_CLASS] },
  ];
  const hit = findTravelHotelExperienceV1Mixin(rows);
  assert.ok(hit);
  assert.match(hit.title, /Hotel Experience v1/i);
});

test('mixinExtendsExperienceEventClass accepts string or array meta:intendedToExtend', () => {
  assert.equal(mixinExtendsExperienceEventClass({ 'meta:intendedToExtend': EE_CLASS }), true);
  assert.equal(mixinExtendsExperienceEventClass({ 'meta:intendedToExtend': [EE_CLASS] }), true);
  assert.equal(mixinExtendsExperienceEventClass({ 'meta:intendedToExtend': ['https://ns.adobe.com/xdm/context/profile'] }), false);
});

test('buildInteractionDetailsLiteExperienceEventFieldGroup targets ExperienceEvent + interactionDetails.core.channel', () => {
  const body = buildInteractionDetailsLiteExperienceEventFieldGroup();
  assert.equal(body.title, 'Interaction Details Lite');
  assert.deepEqual(body['meta:intendedToExtend'], [EE_CLASS]);
  assert.ok(body.definitions.hospitalityFields.properties.interactionDetails);
  assert.ok(body.definitions.hospitalityFields.properties.interactionDetails.properties.core.properties.channel);
});

test('buildTravelHotelExperienceV1ExperienceEventFieldGroup includes hotel.bookingDetails', () => {
  const body = buildTravelHotelExperienceV1ExperienceEventFieldGroup();
  assert.equal(body.title, 'Travel - Hotel Experience v1');
  const hotel = body.definitions.hospitalityFields.properties.hotel;
  assert.ok(hotel.properties.bookingDetails);
  assert.ok(hotel.properties.bookingDetails.properties.hotelName);
  assert.ok(hotel.properties.checkOut.properties.overallRating);
});
