'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  EVENT_INDUSTRY_FIELD_GROUP_SPECS,
  EVENT_INDUSTRY_PUBLIC_FG_TITLE,
  INDUSTRY_PUBLIC_SLICE_IDS,
  buildEventIndustryFieldGroupForSpec,
} = require('../eventIndustryFieldGroups');

const EE_CLASS = 'https://ns.adobe.com/xdm/context/experienceevent';

test('EVENT_INDUSTRY_FIELD_GROUP_SPECS covers all catalog industry ids', () => {
  const specIds = EVENT_INDUSTRY_FIELD_GROUP_SPECS.map((s) => s.industryId).sort();
  assert.deepEqual(specIds, [...INDUSTRY_PUBLIC_SLICE_IDS].sort());
  assert.equal(EVENT_INDUSTRY_FIELD_GROUP_SPECS.length, 8);
});

test('buildEventIndustryFieldGroupForSpec nests leaves under tenant public slice', () => {
  const retail = EVENT_INDUSTRY_FIELD_GROUP_SPECS.find((s) => s.industryId === 'retail');
  assert.ok(retail);
  const body = buildEventIndustryFieldGroupForSpec('demoemea', retail);
  assert.equal(body.title, 'AEP Lab - Event Retail v1');
  assert.deepEqual(body['meta:intendedToExtend'], [EE_CLASS]);
  const tenant = body.properties._demoemea;
  assert.ok(tenant && tenant.properties.public);
  const slice = tenant.properties.public.properties.retail;
  assert.ok(slice && slice.properties.productName);
  assert.ok(slice.properties.sku);
  assert.ok(slice.properties.orderValue);
});

test('buildEventIndustryFieldGroupForSpec public sector uses public.public path', () => {
  const pub = EVENT_INDUSTRY_FIELD_GROUP_SPECS.find((s) => s.industryId === 'public');
  const body = buildEventIndustryFieldGroupForSpec('demoemea', pub);
  assert.equal(body.title, 'AEP Lab - Event Public Sector v1');
  assert.ok(body.properties._demoemea.properties.public.properties.public.properties.donationAmount);
});

test('retired monolith title constant preserved for detach', () => {
  assert.equal(EVENT_INDUSTRY_PUBLIC_FG_TITLE, 'AEP Lab - Event Industry Public v1');
});
