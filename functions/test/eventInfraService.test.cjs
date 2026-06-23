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
  buildEventSchemaIdentityDescriptorPairs,
  SETUP_EVENT_INFRA_SUBSTEPS,
  runEventInfraStep,
} = require('../eventInfraService');

const EE_CLASS = 'https://ns.adobe.com/xdm/context/experienceevent';
const TENANT = 'prisacar';

test('findInteractionDetailsLiteMixin matches by title without meta:intendedToExtend (list profile gap)', () => {
  const rows = [
    {
      title: 'Interaction Details Lite',
      $id: 'https://ns.adobe.com/prisacar/mixins/interaction-details-lite',
    },
  ];
  const hit = findInteractionDetailsLiteMixin(rows);
  assert.ok(hit);
  assert.equal(hit.$id, rows[0].$id);
});

test('findTravelHotelExperienceV1Mixin matches title variants without EE class metadata', () => {
  const rows = [
    { title: 'Travel - Hotel Experience v1', $id: 'https://ns.adobe.com/prisacar/mixins/hotel-v1' },
  ];
  const hit = findTravelHotelExperienceV1Mixin(rows);
  assert.ok(hit);
  assert.match(hit.title, /Hotel Experience v1/i);
});

test('matchesInteractionDetailsLiteTitle accepts spacing variants', () => {
  assert.equal(matchesInteractionDetailsLiteTitle('InteractionDetails Lite'), true);
  assert.equal(matchesInteractionDetailsLiteTitle('Interaction Details Lite'), true);
});

test('mixinExtendsExperienceEventClass accepts string or array meta:intendedToExtend', () => {
  assert.equal(mixinExtendsExperienceEventClass({ 'meta:intendedToExtend': EE_CLASS }), true);
  assert.equal(mixinExtendsExperienceEventClass({ 'meta:intendedToExtend': [EE_CLASS] }), true);
  assert.equal(mixinExtendsExperienceEventClass({ 'meta:intendedToExtend': ['https://ns.adobe.com/xdm/context/profile'] }), false);
});

test('buildInteractionDetailsLiteExperienceEventFieldGroup wraps fields under tenant namespace', () => {
  const body = buildInteractionDetailsLiteExperienceEventFieldGroup(TENANT);
  assert.equal(body.title, 'Interaction Details Lite');
  assert.deepEqual(body['meta:intendedToExtend'], [EE_CLASS]);
  assert.ok(body.properties._prisacar);
  assert.ok(body.properties._prisacar.properties.interactionDetails);
  assert.ok(body.properties._prisacar.properties.interactionDetails.properties.core.properties.channel);
  assert.equal(body.properties.interactionDetails, undefined);
});

test('buildTravelHotelExperienceV1ExperienceEventFieldGroup wraps hotel under tenant namespace', () => {
  const body = buildTravelHotelExperienceV1ExperienceEventFieldGroup(TENANT);
  assert.equal(body.title, 'Travel - Hotel Experience v1');
  const hotel = body.properties._prisacar.properties.hotel;
  assert.ok(hotel.properties.bookingDetails);
  assert.ok(hotel.properties.bookingDetails.properties.hotelName);
  assert.ok(hotel.properties.checkOut.properties.overallRating);
  assert.equal(body.properties.hotel, undefined);
});

test('SETUP_EVENT_INFRA_SUBSTEPS chains ensure → schema → attach → dataset', () => {
  assert.deepEqual(
    SETUP_EVENT_INFRA_SUBSTEPS.map((s) => s.step),
    ['ensureFieldGroups', 'createSchema', 'attachRecommendedFieldGroups', 'createDataset']
  );
});

test('runEventInfraStep setupEventInfra validates required fields without calling AEP', async () => {
  const missingDataset = await runEventInfraStep('test-sb', 'token', 'client', 'org', 'setupEventInfra', {
    schemaTitle: 'My Schema',
  });
  assert.equal(missingDataset.ok, false);
  assert.match(missingDataset.error, /datasetName/i);

  const missingSchema = await runEventInfraStep('test-sb', 'token', 'client', 'org', 'setupEventInfra', {
    datasetName: 'My Dataset',
  });
  assert.equal(missingSchema.ok, false);
  assert.match(missingSchema.error, /schemaTitle/i);
});

test('matchesTravelHotelExperienceV1Title accepts en-dash variant', () => {
  assert.equal(matchesTravelHotelExperienceV1Title('Travel – Hotel Experience v1'), true);
});

test('buildEventSchemaIdentityDescriptorPairs registers ECID + Email as secondary tenant paths', () => {
  const pairs = buildEventSchemaIdentityDescriptorPairs('_prisacar');
  assert.equal(pairs.length, 2);
  assert.deepEqual(
    pairs.map((p) => ({ path: p.path, namespace: p.namespace, isPrimary: p.isPrimary })),
    [
      { path: '/_prisacar/identification/core/ecid', namespace: 'ECID', isPrimary: false },
      { path: '/_prisacar/identification/core/email', namespace: 'Email', isPrimary: false },
    ]
  );
});

test('buildEventSchemaIdentityDescriptorPairs defaults tenant to _demoemea', () => {
  const pairs = buildEventSchemaIdentityDescriptorPairs();
  assert.equal(pairs[0].path, '/_demoemea/identification/core/ecid');
  assert.equal(pairs[1].path, '/_demoemea/identification/core/email');
  assert.equal(pairs.every((p) => p.isPrimary === false), true);
});
