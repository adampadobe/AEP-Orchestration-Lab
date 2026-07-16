'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildEventGeneratorXdm,
  buildLabFirestoreGeneratorPresets,
  resolveGeneratorPreset,
  LAB_EVENT_TOOL_TARGET_ID,
  LAB_DECISION_LAB_TARGET_ID,
} = require('../eventGeneratorService');

test('buildLabFirestoreGeneratorPresets returns empty when no datastreams', () => {
  assert.deepEqual(buildLabFirestoreGeneratorPresets('kirkham', null, null), []);
  assert.deepEqual(buildLabFirestoreGeneratorPresets('kirkham', {}, {}), []);
});

test('buildLabFirestoreGeneratorPresets includes event tool Edge preset', () => {
  const out = buildLabFirestoreGeneratorPresets('apalmer', { datastreamId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', datastreamTitle: 'My DS' }, null);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, LAB_EVENT_TOOL_TARGET_ID);
  assert.equal(out[0].transport, 'edge');
  assert.equal(out[0].dataStreamId, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  assert.match(out[0].label, /apalmer/);
  assert.match(out[0].label, /My DS/);
});

test('buildLabFirestoreGeneratorPresets includes decision lab when both configured', () => {
  const out = buildLabFirestoreGeneratorPresets(
    'sb1',
    { datastreamId: '11111111-1111-1111-1111-111111111111' },
    { datastreamId: '22222222-2222-2222-2222-222222222222' },
  );
  assert.equal(out.length, 2);
  assert.equal(out[0].id, LAB_EVENT_TOOL_TARGET_ID);
  assert.equal(out[1].id, LAB_DECISION_LAB_TARGET_ID);
  assert.equal(out[1].dataStreamId, '22222222-2222-2222-2222-222222222222');
});

test('buildEventGeneratorXdm merges insurance quoteForm into _demoemea.public', () => {
  const ecid = '03976612467829823963241934423837679452';
  const xdm = buildEventGeneratorXdm({
    eventType: 'insurance.quoteForm.step1complete',
    ecid,
    public: {
      quoteForm: { fullname: 'Ava Thomas', postcode: 'SW1A 1AA', step1complete: true },
      bankSubscribtion: { yes: true },
    },
  });
  assert.ok(xdm._demoemea && xdm._demoemea.public);
  assert.equal(xdm._demoemea.public.quoteForm.fullname, 'Ava Thomas');
  assert.equal(xdm._demoemea.public.quoteForm.postcode, 'SW1A 1AA');
  assert.equal(xdm._demoemea.public.bankSubscribtion.yes, true);
  assert.equal(xdm.eventType, 'insurance.quoteForm.step1complete');
});

test('buildEventGeneratorXdm maps hospitality public to root and tenant hotel.bookingDetails + web channel', () => {
  const ecid = '03976612467829823963241934423837679452';
  const xdm = buildEventGeneratorXdm({
    eventType: 'hotel.room.select',
    ecid,
    channel: 'Web',
    public: {
      hotelPropertyName: 'Manchester Deansgate',
      hotelDestination: 'Manchester',
      hotelCheckIn: '2026-06-01',
      hotelCheckOut: '2026-06-03',
      hotelNights: 2,
      hotelQuotedTotal: '189.00',
      hotelItineraryId: 'piit_test123',
      hotelRoomType: 'double',
    },
  });
  assert.equal(xdm.interactionDetails, undefined);
  assert.ok(xdm.channel && xdm.channel['@type'] === 'https://ns.adobe.com/xdm/channel-types/web');
  assert.ok(xdm.hotel && xdm.hotel.bookingDetails);
  assert.equal(xdm.hotel.bookingDetails.hotelName, 'Manchester Deansgate');
  assert.equal(xdm.hotel.bookingDetails.hotelLocation, 'Manchester');
  assert.equal(xdm.hotel.bookingDetails.checkInDate, '2026-06-01');
  assert.equal(xdm.hotel.bookingDetails.checkOutDate, '2026-06-03');
  assert.equal(xdm.hotel.bookingDetails.nightsStay, 2);
  assert.equal(xdm.hotel.bookingDetails.confirmationNumber, 'piit_test123');
  assert.equal(xdm.hotel.bookingDetails.roomType, 'double');
  assert.equal(xdm._demoemea.interactionDetails.core.channel, 'web');
  assert.ok(xdm._demoemea.hotel && xdm._demoemea.hotel.bookingDetails);
  assert.equal(xdm._demoemea.hotel.bookingDetails.hotelName, 'Manchester Deansgate');
});

test('buildEventGeneratorXdm merges bookingParty into _demoemea.public', () => {
  const ecid = '03976612467829823963241934423837679452';
  const xdm = buildEventGeneratorXdm({
    eventType: 'hotel.booking.complete',
    ecid,
    public: {
      bookingParty: {
        eventPerspective: 'stayer',
        bookerStayerSamePerson: false,
        booker: { firstName: 'Ann', email: 'ann@example.com' },
        stayer: { firstName: 'Bob', lastName: 'Lee', email: 'bob@example.com', isGuestOfRecord: true },
      },
    },
  });
  assert.ok(xdm._demoemea.public.bookingParty);
  assert.equal(xdm._demoemea.public.bookingParty.eventPerspective, 'stayer');
  assert.equal(xdm._demoemea.public.bookingParty.booker.firstName, 'Ann');
  assert.equal(xdm._demoemea.public.bookingParty.stayer.email, 'bob@example.com');
});

test('buildEventGeneratorXdm email-primary _demoemea uses Email identity only (no ECID)', () => {
  const xdm = buildEventGeneratorXdm({
    eventType: 'hotel.booking.stayerIdentified',
    email: 'stayer@example.com',
    primaryIdentity: 'email',
    public: { hotelPropertyName: 'Test Inn' },
  });
  assert.ok(xdm.identityMap.Email);
  assert.equal(xdm.identityMap.Email[0].id, 'stayer@example.com');
  assert.equal(xdm.identityMap.Email[0].primary, true);
  assert.equal(xdm.identityMap.ECID, undefined);
  assert.deepEqual(xdm._demoemea.identification.core, { email: 'stayer@example.com' });
});

test('buildEventGeneratorXdm infers web channel for hotel.* when channel omitted (standard channel + interactionDetails)', () => {
  const ecid = '03976612467829823963241934423837679452';
  const xdm = buildEventGeneratorXdm({
    eventType: 'hotel.room.select',
    ecid,
    public: { hotelPropertyName: 'Test Inn' },
  });
  assert.equal(xdm._demoemea.interactionDetails.core.channel, 'web');
  assert.equal(xdm.interactionDetails, undefined);
  assert.equal(xdm.channel['@type'], 'https://ns.adobe.com/xdm/channel-types/web');
});

test('buildEventGeneratorXdm maps pageName to web.webPageDetails for web page view events', () => {
  const ecid = '03976612467829823963241934423837679452';
  const xdm = buildEventGeneratorXdm({
    eventType: 'web.webpagedetails.pageViews',
    ecid,
    pageName: 'FNB Home',
    channel: 'Web',
  });
  assert.ok(xdm.web && xdm.web.webPageDetails);
  assert.equal(xdm.web.webPageDetails.name, 'FNB Home');
  assert.equal(xdm.web.webPageDetails.viewName, 'FNB Home');
});

test('buildEventGeneratorXdm fills default web page title for page view when body omits name/URL', () => {
  const ecid = '03976612467829823963241934423837679452';
  const xdm = buildEventGeneratorXdm({
    eventType: 'web.webPageDetails.pageViews',
    ecid,
    channel: 'Web',
  });
  assert.ok(xdm.web && xdm.web.webPageDetails);
  assert.equal(xdm.web.webPageDetails.name, 'AEP lab demo');
});

test('buildEventGeneratorXdm merges Sky News Insider tenant interestTypes and profile roots', () => {
  const ecid = '03976612467829823963241934423837679452';
  const xdm = buildEventGeneratorXdm({
    eventType: 'insider.registered',
    ecid,
    email: 'kirkham+public-1@adobetest.com',
    channel: 'Web',
    tenant: {
      interestTypes: { interests: ['sport', 'politics'] },
    },
    person: { name: { firstName: 'Alex', lastName: 'Kim' } },
    homeAddress: { street1: '1 High St', city: 'London', postalCode: 'SW1A 1AA', country: 'GB' },
    personalEmail: { address: 'kirkham+public-1@adobetest.com' },
    public: { insider: { plan: 'monthly' } },
  });
  assert.deepEqual(xdm._demoemea.interestTypes.interests, ['sport', 'politics']);
  assert.equal(xdm.person.name.firstName, 'Alex');
  assert.equal(xdm.homeAddress.postalCode, 'SW1A 1AA');
  assert.equal(xdm.personalEmail.address, 'kirkham+public-1@adobetest.com');
  assert.equal(xdm._demoemea.public.insider.plan, 'monthly');
});

test('buildEventGeneratorXdm merges nested industry retail into _demoemea.public.retail', () => {
  const ecid = '03976612467829823963241934423837679452';
  const xdm = buildEventGeneratorXdm({
    eventType: 'commerce.purchases',
    ecid,
    public: { retail: { productName: 'Featured product', sku: 'SKU-001', orderValue: 49.99 } },
  });
  assert.ok(xdm._demoemea && xdm._demoemea.public && xdm._demoemea.public.retail);
  assert.equal(xdm._demoemea.public.retail.productName, 'Featured product');
  assert.equal(xdm._demoemea.public.retail.sku, 'SKU-001');
  assert.equal(xdm._demoemea.public.retail.orderValue, 49.99);
});

test('buildEventGeneratorXdm nested public sector donation under public.public', () => {
  const ecid = '03976612467829823963241934423837679452';
  const xdm = buildEventGeneratorXdm({
    eventType: 'donation.made',
    ecid,
    public: { public: { donationAmount: 25, donationDate: '2026-07-16' } },
  });
  assert.equal(xdm._demoemea.public.public.donationAmount, 25);
  assert.equal(xdm._demoemea.public.public.donationDate, '2026-07-16');
  assert.equal(xdm._demoemea.omnichannelCdpUseCasePack.donatedAmount, 25);
});

test('buildEventGeneratorXdm maps nested public.travel to hotel.bookingDetails', () => {
  const ecid = '03976612467829823963241934423837679452';
  const xdm = buildEventGeneratorXdm({
    eventType: 'hotel.booking',
    ecid,
    channel: 'Web',
    public: {
      travel: {
        hotelName: 'Premier Inn London',
        hotelLocation: 'London',
        checkInDate: '2026-08-01',
        confirmationNumber: 'BK-DEMO-001',
        hotelItineraryId: 'ITN-DEMO-001',
      },
    },
  });
  assert.ok(xdm.hotel && xdm.hotel.bookingDetails);
  assert.equal(xdm.hotel.bookingDetails.hotelName, 'Premier Inn London');
  assert.equal(xdm.hotel.bookingDetails.hotelLocation, 'London');
  assert.equal(xdm.hotel.bookingDetails.checkInDate, '2026-08-01');
  assert.equal(xdm.hotel.bookingDetails.confirmationNumber, 'ITN-DEMO-001');
  assert.ok(xdm._demoemea.hotel && xdm._demoemea.hotel.bookingDetails);
});

test('resolveGeneratorPreset defaults to lab-event-tool-edge and rejects silent static fallback', () => {
  const staticOnly = [
    { id: 'edge-46677-donation', transport: 'edge', dataStreamId: '46677fd7-9db0-4f16-898c-b424d0245c38' },
  ];
  const missing = resolveGeneratorPreset(staticOnly, '', 'prisacar');
  assert.equal(missing.ok, false);
  assert.equal(missing.requestedId, LAB_EVENT_TOOL_TARGET_ID);
  assert.match(missing.error, /not configured/);

  const virtual = buildLabFirestoreGeneratorPresets('prisacar', { datastreamId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }, null);
  const resolved = resolveGeneratorPreset([...virtual, ...staticOnly], '', 'prisacar');
  assert.equal(resolved.ok, true);
  assert.equal(resolved.preset.id, LAB_EVENT_TOOL_TARGET_ID);

  const explicit = resolveGeneratorPreset(staticOnly, 'edge-46677-donation', 'prisacar');
  assert.equal(explicit.ok, true);
  assert.equal(explicit.preset.id, 'edge-46677-donation');
});
