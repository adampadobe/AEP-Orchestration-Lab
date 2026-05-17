'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildEventGeneratorXdm,
  buildLabFirestoreGeneratorPresets,
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
  assert.equal(xdm.interactionDetails.core.channel, 'web');
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

test('buildEventGeneratorXdm infers web channel for hotel.* when channel omitted (standard channel + interactionDetails)', () => {
  const ecid = '03976612467829823963241934423837679452';
  const xdm = buildEventGeneratorXdm({
    eventType: 'hotel.room.select',
    ecid,
    public: { hotelPropertyName: 'Test Inn' },
  });
  assert.equal(xdm._demoemea.interactionDetails.core.channel, 'web');
  assert.equal(xdm.interactionDetails.core.channel, 'web');
  assert.equal(xdm.channel['@type'], 'https://ns.adobe.com/xdm/channel-types/web');
});
