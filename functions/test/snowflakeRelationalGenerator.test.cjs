'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createRecipient } = require('../snowflakeRecipientFactory');
const { generateTravelRelationalRecords } = require('../snowflakeRelationalGenerator');

function generate(index, hero = false) {
  const crmId = `CRM${1000 + index}`;
  const recipient = createRecipient({
    industry: 'travel',
    crmId,
    email: `traveler${index}@example.com`,
    hero,
  });
  const profile = {
    CRMID: crmId,
    ECID: `ecid-${index}`,
    EMAIL: `traveler${index}@example.com`,
    EMAILIDSHA256: `hash-${index}`,
    FIRSTNAME: hero ? 'Amelia' : `Traveler${index}`,
    LASTNAME: 'Demo',
    TESTPROFILE: true,
  };
  return generateTravelRelationalRecords({
    recipient,
    profile,
    index,
    hero,
    asOfDate: '2026-10-15',
    runStamp: '2026-10-15 00:00:00.000',
  });
}

describe('snowflakeRelationalGenerator travel model', () => {
  it('uses stable parent and ordinal child keys for idempotent merges', () => {
    const first = generate(1);
    const again = generate(1);
    assert.deepEqual(first, again);
    assert.equal(first.reservation.reservation_id, `${first.reservation.recipient_id}-RES-001`);
    assert.equal(first.segments[0].segment_id, `${first.reservation.reservation_id}-SEG-001`);
    assert.equal(first.passengers[0].passenger_id, `${first.reservation.reservation_id}-PAX-001`);
  });

  it('keeps booking events aligned with relational booking and flight data', () => {
    const records = generate(2);
    const outbound = records.segments[0];
    assert.equal(records.bookingEvent.PNR, records.reservation.pnr_locator);
    assert.equal(records.bookingEvent.OUTBOUNDFLIGHTNUMBER, outbound.flight_number);
    assert.equal(records.bookingEvent.OUTBOUNDDEPARTUREDATE, outbound.departure_utc);
    assert.equal(records.upcomingTripDate, outbound.departure_utc.slice(0, 10));
  });

  it('assigns a real segment key to every disruption event', () => {
    const disrupted = Array.from({ length: 10 }, (_, index) => generate(index))
      .find(({ scenario }) => scenario === 'disrupted');
    assert.ok(disrupted);
    assert.ok(disrupted.segments.some((segment) => segment.segment_id === disrupted.disruptionEvents[0].SEGMENT_ID));
  });

  it('uses a Boolean booking seat flag and keeps the seat number on the ancillary purchase', () => {
    for (let index = 0; index < 10; index += 1) {
      const records = generate(index);
      const seatPurchases = records.ancillaries.filter(({ product_code }) => product_code.startsWith('SEAT'));
      assert.equal(records.bookingEvent.SEATSELECTION, seatPurchases.length > 0, records.scenario);
      for (const purchase of seatPurchases) {
        assert.equal(purchase.seat_number, '18A');
        assert.equal(purchase.recipient_id, records.reservation.recipient_id);
        assert.equal(purchase.segment_id, records.segments[0].segment_id);
        assert.equal(purchase.passenger_id, records.passengers[0].passenger_id);
      }
    }
  });

  it('guarantees hero trip, tier, seat, consent, and scenario requirements', () => {
    const recipient = createRecipient({ industry: 'travel', crmId: 'CRM1001', hero: true });
    const records = generateTravelRelationalRecords({
      recipient,
      profile: { CRMID: 'CRM1001', ECID: 'ecid-hero', FIRSTNAME: 'Amelia', LASTNAME: 'Clarke', TESTPROFILE: true },
      index: 0,
      hero: true,
      asOfDate: '2026-10-15',
      runStamp: '2026-10-15 00:00:00.000',
    });
    assert.equal(recipient.consentWhatsapp, 'y');
    assert.equal(records.scenario, 'seat_not_selected');
    assert.equal(records.reservation.scenario, 'seat_not_selected');
    assert.equal(records.upcomingTripDate, '2027-04-03');
    assert.equal(records.ancillaries.some(({ product_code }) => product_code.startsWith('SEAT')), false);
  });

  it('maintains the required 60/20/10/10 scenario proportions over ten records', () => {
    const scenarios = Array.from({ length: 10 }, (_, index) => generate(index).scenario);
    assert.deepEqual(
      scenarios.reduce((counts, scenario) => ({ ...counts, [scenario]: (counts[scenario] || 0) + 1 }), {}),
      { seat_not_selected: 6, seat_bought_in_journey: 2, upgraded_cabin: 1, disrupted: 1 },
    );
  });
});
