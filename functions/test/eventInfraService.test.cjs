'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  findInteractionDetailsLiteMixin,
  findTravelHotelExperienceV1Mixin,
  findB2cEventIdentityV1Mixin,
  mixinExtendsExperienceEventClass,
  isExcludedDebugFieldGroupTitle,
  matchesInteractionDetailsLiteTitle,
  matchesTravelHotelExperienceV1Title,
  matchesB2cEventIdentityV1Title,
  buildInteractionDetailsLiteExperienceEventFieldGroup,
  buildTravelHotelExperienceV1ExperienceEventFieldGroup,
  buildB2cEventIdentityV1ExperienceEventFieldGroup,
  buildEventSchemaIdentityDescriptorPairs,
  buildRemoveFieldGroupPatchOps,
  findWrongInteractionDetailsLiteRefsOnSchema,
  REQUIRED_EVENT_EXPERIENCE_FIELD_GROUP_TITLES,
  SETUP_EVENT_INFRA_SUBSTEPS,
  runEventInfraStep,
} = require('../eventInfraService');
const {
  buildEventLabCoreV1ExperienceEventFieldGroup,
  EVENT_LAB_CORE_V1_FG_TITLE,
} = require('../eventLabCoreFieldGroup');

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

test('findInteractionDetailsLiteMixin excludes AEP Lab Test DEBUG field groups', () => {
  const rows = [
    {
      title: 'AEP Lab Test Interaction Details Lite DEBUG',
      $id: 'https://ns.adobe.com/prisacar/mixins/interaction-details-lite-debug',
      'meta:intendedToExtend': [EE_CLASS],
    },
    {
      title: 'Interaction Details Lite',
      $id: 'https://ns.adobe.com/prisacar/mixins/interaction-details-lite',
      'meta:intendedToExtend': [EE_CLASS],
    },
  ];
  const hit = findInteractionDetailsLiteMixin(rows);
  assert.ok(hit);
  assert.equal(hit.title, 'Interaction Details Lite');
});

test('findInteractionDetailsLiteMixin prefers global OOTB over tenant copy', () => {
  const rows = [
    {
      title: 'Interaction Details Lite',
      $id: 'https://ns.adobe.com/prisacar/mixins/interaction-details-lite',
      'meta:intendedToExtend': [EE_CLASS],
    },
    {
      title: 'Interaction Details Lite',
      $id: 'https://ns.adobe.com/xdm/mixins/experienceevent-interaction-details-lite',
      'meta:intendedToExtend': [EE_CLASS],
    },
  ];
  const hit = findInteractionDetailsLiteMixin(rows);
  assert.ok(hit);
  assert.equal(hit.$id, 'https://ns.adobe.com/xdm/mixins/experienceevent-interaction-details-lite');
});

test('isExcludedDebugFieldGroupTitle flags lab test and DEBUG titles', () => {
  assert.equal(isExcludedDebugFieldGroupTitle('AEP Lab Test Interaction Details Lite DEBUG'), true);
  assert.equal(isExcludedDebugFieldGroupTitle('Interaction Details Lite'), false);
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
  const core = body.properties._prisacar.properties.interactionDetails.properties.core.properties;
  assert.ok(core.channel);
  assert.ok(core.deviceType);
  assert.ok(core.source);
  assert.equal(core.channel.type, 'string');
  assert.equal(core.deviceType.type, 'string');
  assert.equal(core.source.type, 'string');
  assert.equal(body.properties.interactionDetails, undefined);
});

test('findWrongInteractionDetailsLiteRefsOnSchema detects debug mixin on schema', () => {
  const merged = [
    {
      title: 'AEP Lab Test Interaction Details Lite DEBUG',
      $id: 'https://ns.adobe.com/prisacar/mixins/debug-lite',
    },
    {
      title: 'Interaction Details Lite',
      $id: 'https://ns.adobe.com/prisacar/mixins/interaction-details-lite',
    },
  ];
  const schema = {
    allOf: [{ $ref: 'https://ns.adobe.com/prisacar/mixins/debug-lite' }],
    'meta:extends': ['https://ns.adobe.com/prisacar/mixins/debug-lite'],
  };
  const wrong = findWrongInteractionDetailsLiteRefsOnSchema(schema, merged);
  assert.deepEqual(wrong, ['https://ns.adobe.com/prisacar/mixins/debug-lite']);
  const ops = buildRemoveFieldGroupPatchOps(schema, wrong[0]);
  assert.equal(ops.length, 2);
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

test('findB2cEventIdentityV1Mixin matches by title', () => {
  const rows = [
    {
      title: 'B2C Event Identity v1',
      $id: 'https://ns.adobe.com/prisacar/mixins/b2c-event-identity-v1',
      'meta:intendedToExtend': ['https://ns.adobe.com/xdm/context/experienceevent'],
    },
  ];
  const hit = findB2cEventIdentityV1Mixin(rows);
  assert.ok(hit);
  assert.equal(hit.title, 'B2C Event Identity v1');
});

test('matchesB2cEventIdentityV1Title accepts spacing variants', () => {
  assert.equal(matchesB2cEventIdentityV1Title('B2C Event Identity v1'), true);
  assert.equal(matchesB2cEventIdentityV1Title('B2CEvent Identity v1'), true);
});

test('buildB2cEventIdentityV1ExperienceEventFieldGroup wraps identification.core under tenant namespace', () => {
  const body = buildB2cEventIdentityV1ExperienceEventFieldGroup(TENANT);
  assert.equal(body.title, 'B2C Event Identity v1');
  assert.ok(body.properties._prisacar);
  assert.ok(body.properties._prisacar.properties.identification.properties.core.properties.ecid);
  assert.ok(body.properties._prisacar.properties.identification.properties.core.properties.email);
  assert.equal(body.properties.identification, undefined);
});

test('REQUIRED_EVENT_EXPERIENCE_FIELD_GROUP_TITLES lists lab Event Tool parity field groups', () => {
  assert.deepEqual(REQUIRED_EVENT_EXPERIENCE_FIELD_GROUP_TITLES, [
    'Interaction Details Lite',
    'B2C Event Identity v1',
  ]);
});

const {
  schemaHasProfileUnionTag,
  schemaIncludesIdentityMapField,
  datasetHasProfileEnabledTag,
  buildAddProfileUnionPatchOps,
} = require('../eventInfraService');

test('buildAddProfileUnionPatchOps adds union tag for Profile enable (identityMap alternate primary)', () => {
  assert.deepEqual(buildAddProfileUnionPatchOps(undefined), [
    { op: 'add', path: '/meta:immutableTags', value: ['union'] },
  ]);
  assert.deepEqual(buildAddProfileUnionPatchOps(['stable']), [
    { op: 'add', path: '/meta:immutableTags/-', value: 'union' },
  ]);
  assert.deepEqual(buildAddProfileUnionPatchOps(['union']), []);
});

test('schemaIncludesIdentityMapField detects top-level identityMap on resolved schema', () => {
  assert.equal(schemaIncludesIdentityMapField({ properties: { identityMap: { type: 'object' } } }), true);
  assert.equal(schemaIncludesIdentityMapField({ properties: { eventType: { type: 'string' } } }), false);
});

test('schemaIncludesIdentityMapField accepts identityMap from base ExperienceEvent class without Core v2.1', () => {
  assert.equal(
    schemaIncludesIdentityMapField({
      'meta:class': EE_CLASS,
      allOf: [{ $ref: EE_CLASS }, { $ref: `https://ns.adobe.com/${TENANT}/mixins/interactiondetailslite` }],
      'meta:extends': [EE_CLASS],
      properties: { [`_${TENANT}`]: { type: 'object' } },
    }),
    true,
  );
  assert.equal(
    schemaIncludesIdentityMapField({
      allOf: [{ $ref: 'https://ns.adobe.com/xdm/context/profile' }],
      properties: { personID: { type: 'string' } },
    }),
    false,
  );
  assert.equal(
    schemaIncludesIdentityMapField({
      allOf: [{ properties: { identityMap: { type: 'object', 'meta:xdmType': 'map' } } }],
    }),
    true,
  );
});

test('schemaHasProfileUnionTag and datasetHasProfileEnabledTag', () => {
  assert.equal(schemaHasProfileUnionTag({ 'meta:immutableTags': ['union'] }), true);
  assert.equal(schemaHasProfileUnionTag({ 'meta:immutableTags': [] }), false);
  assert.equal(datasetHasProfileEnabledTag({ tags: { unifiedProfile: ['enabled:true'] } }), true);
  assert.equal(datasetHasProfileEnabledTag({ tags: {} }), false);
});

test('buildEventLabCoreV1ExperienceEventFieldGroup is lean root mixin without commerce', () => {
  const body = buildEventLabCoreV1ExperienceEventFieldGroup();
  assert.equal(body.title, EVENT_LAB_CORE_V1_FG_TITLE);
  assert.deepEqual(body['meta:intendedToExtend'], [EE_CLASS]);
  const props = body.definitions.eventLabCoreV1Block.properties;
  assert.ok(props.web && props.web.properties.webPageDetails);
  assert.ok(props.web.properties.webPageDetails.properties.name);
  assert.ok(props._experience && props._experience.properties.campaign.properties.orchestration.properties.eventID);
  assert.equal(props.commerce, undefined);
  assert.equal(JSON.stringify(body).includes('productListAdds'), false);
});
