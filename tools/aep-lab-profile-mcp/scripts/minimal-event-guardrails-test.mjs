/**
 * Asserts Coworker minimal event guardrails: no viewName in POST body, no web.webPageDetails in XDM.
 */
import assert from 'node:assert/strict';
import { buildGeneratorPostBody } from '../src/framework/buildGeneratorPostBody.mjs';
import {
  sanitizeCoworkerEventParams,
  sanitizeCoworkerEventSteps,
} from '../src/framework/sanitizeCoworkerEventParams.mjs';
import { buildEventsFromEventTypes } from '../src/framework/demoEventPacks.mjs';

const ECID = '62722406001178632594092146103219305888';
const EMAIL = 'demo+001@adobetest.com';

function run() {
  const stripped = sanitizeCoworkerEventParams({
    event_type: 'commerce.search',
    channel: 'web',
    view_name: 'Should strip',
    view_url: 'https://example.com',
    public: { donationAmount: 50 },
  });
  assert.ok(stripped.stripped.includes('view_name'), 'view_name stripped');
  assert.ok(stripped.stripped.includes('view_url'), 'view_url stripped');
  assert.ok(stripped.stripped.includes('public'), 'public stripped');
  assert.equal(stripped.params.view_name, undefined);

  const travelRich = sanitizeCoworkerEventParams({
    event_type: 'travel.flight.search',
    channel: 'web',
    industry: 'travel',
    industry_fields: {
      departureAirport: 'LHR',
      arrivalAirport: 'DXB',
      confirmationNumber: 'VAL-001',
    },
  });
  assert.deepEqual(travelRich.errors, []);
  assert.equal(travelRich.params.xdm_style, 'full');
  assert.equal(travelRich.params.edge_minimal, false);
  assert.equal(travelRich.params.public.travel.departureAirport, 'LHR');
  assert.equal(travelRich.params.public.travel.confirmationNumber, 'VAL-001');
  assert.equal(travelRich.params.public.hotel, undefined);
  assert.equal(travelRich.richIndustry.payloadPath, '_demoemea.public.travel');

  const mediaDefaults = sanitizeCoworkerEventParams({ industry: 'media' });
  assert.deepEqual(mediaDefaults.errors, []);
  assert.equal(mediaDefaults.params.event_type, 'media.contentView');
  assert.equal(mediaDefaults.params.channel, 'web');
  assert.equal(mediaDefaults.params.public.media.contentTitle, 'Featured content');
  assert.equal(mediaDefaults.richIndustry.usedDefaults, true);

  const invalidRich = sanitizeCoworkerEventParams({
    industry: 'retail',
    industry_fields: { schemaRef: 'must-not-pass' },
  });
  assert.ok(invalidRich.errors[0].includes('Unsupported retail industry field'));

  const body = buildGeneratorPostBody({
    sandbox: 'apalmer',
    email: EMAIL,
    ecid: ECID,
    event_type: 'commerce.search',
    channel: 'web',
    timestamp: '2026-07-15T18:41:26.946Z',
  });
  assert.equal(body.viewName, undefined, 'POST body has no viewName');
  assert.equal(body.viewUrl, undefined, 'POST body has no viewUrl');
  assert.equal(body.eventType, 'commerce.search');
  assert.equal(body.channel, 'web');
  assert.ok(body.ecid && body.email, 'identity fields present');

  const richBody = buildGeneratorPostBody({
    sandbox: 'apalmer',
    email: EMAIL,
    ecid: ECID,
    ...travelRich.params,
  });
  assert.equal(richBody.xdmStyle, 'full');
  assert.equal(richBody.public.travel.arrivalAirport, 'DXB');

  const shorthand = buildEventsFromEventTypes(['donation.made', 'web.webPageDetails.pageViews'], {
    channel: 'web',
  });
  assert.equal(shorthand.length, 2);
  assert.equal(shorthand[0].view_name, undefined, 'shorthand step 1 no view_name');
  assert.equal(shorthand[1].view_name, undefined, 'shorthand step 2 no view_name');
  assert.equal(shorthand[0].event_type, 'donation.made');
  assert.equal(shorthand[0].channel, 'web');

  const batchSanitized = sanitizeCoworkerEventSteps([
    { event_type: 'donation.made', view_name: 'Donate', channel: 'web' },
    { event_type: 'transaction', channel: 'web' },
  ]);
  assert.equal(batchSanitized.events[0].view_name, undefined);
  assert.ok(batchSanitized.stripped.length >= 1);

  const richBatch = sanitizeCoworkerEventSteps([
    { event_type: 'media.contentView', industry: 'media', industry_fields: { contentTitle: 'Pilot', genre: 'Drama' } },
    { event_type: 'telecom.plan.upgrade', industry: 'telecom' },
  ]);
  assert.deepEqual(richBatch.errors, []);
  assert.equal(richBatch.events[0].public.media.contentTitle, 'Pilot');
  assert.equal(richBatch.events[0].xdm_style, 'full');
  assert.equal(richBatch.events[1].public.telecom.planAction, 'upgrade_offer');

  console.log(JSON.stringify({ ok: true, tests: 'minimal-event-guardrails' }));
}

try {
  run();
} catch (err) {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err) }));
  process.exit(1);
}
