import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { buildPersonaAttributes } from '../src/personaBuilder.mjs';
import { normalizeSegmentHint } from '../src/personaBuilder/segments.mjs';

const require = createRequire(import.meta.url);
const webTrip = require('../../../web/profile-viewer/travel-flight-trip.js');
const mcpTrip = require('../src/personaBuilder/flightTrip.cjs');

const NOW = Date.parse('2026-07-20T12:00:00Z');
const DAY = 86400000;
const OFFSET_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/;
const BOOKINGS = 'individualCharacteristics.travel.flightBookings';
const RES = 'travelReservations.flightReservations';

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function trip(activeFlight, seed, extra = {}) {
  return webTrip.buildFlightTrip({
    activeFlight,
    dep: { code: 'LHR', city: 'London', country: 'United Kingdom' },
    arr: { code: 'JFK', city: 'New York', country: 'United States' },
    airline: 'British Airways',
    flightNumber: 'BA117',
    confirmationNumber: 'ABC123',
    flightClass: 'business',
    rng: seeded(seed),
    now: NOW,
    ...extra,
  });
}

describe('travel flight trip builder', () => {
  it('web module and MCP copy are byte-identical (npm run sync:travel-flight-trip)', () => {
    const webSrc = readFileSync(fileURLToPath(new URL('../../../web/profile-viewer/travel-flight-trip.js', import.meta.url)), 'utf8');
    const mcpSrc = readFileSync(fileURLToPath(new URL('../src/personaBuilder/flightTrip.cjs', import.meta.url)), 'utf8');
    assert.ok(mcpSrc.endsWith(webSrc), 'flightTrip.cjs drifted from web/profile-viewer/travel-flight-trip.js');
    assert.deepEqual(Object.keys(mcpTrip).sort(), Object.keys(webTrip).sort());
  });

  it('Yes → departure within the 30-day window (or airborne) with next* leaves', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const t = trip('Yes', seed);
      const depMs = Date.parse(t.reservation.departureDateTime);
      const arrMs = Date.parse(t.reservation.arrivalDateTime);
      assert.equal(t.activeFlight, 'Yes');
      assert.equal(t.bookings.activeFlight, 'Yes');
      assert.ok(arrMs > NOW, `seed ${seed}: arrival must be in the future`);
      assert.ok(depMs <= NOW + 30 * DAY, `seed ${seed}: departure beyond 30 days`);
      assert.ok(['booked', 'checked_in', 'in_air'].includes(t.reservation.flightStatus));
      if (depMs <= NOW) assert.equal(t.reservation.flightStatus, 'in_air');
      assert.equal(t.bookings.nextBookedAirport, 'JFK');
      assert.equal(t.bookings.nextBookedBookingRef, 'ABC123');
      assert.match(t.bookings.nextBookedOutbound, /^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('No → whole trip in the past, last* only', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const t = trip('No', seed);
      assert.equal(t.bookings.activeFlight, 'No');
      assert.ok(['completed', 'landed'].includes(t.reservation.flightStatus));
      assert.ok(Date.parse(t.reservation.arrivalDateTime) < NOW);
      if (t.reservation.returnArrivalDateTime) {
        assert.ok(Date.parse(t.reservation.returnArrivalDateTime) < NOW, `seed ${seed}: return leg in the future`);
      }
      for (const k of Object.keys(t.bookings)) assert.ok(!k.startsWith('next'), `seed ${seed}: unexpected ${k}`);
      assert.equal(t.bookings.lastBookedAirport, 'JFK');
    }
  });

  it('emits ISO datetimes with offsets and arrival after departure', () => {
    for (const af of ['Yes', 'No']) {
      for (let seed = 1; seed <= 50; seed += 1) {
        const r = trip(af, seed).reservation;
        assert.match(r.departureDateTime, OFFSET_ISO);
        assert.match(r.arrivalDateTime, OFFSET_ISO);
        assert.equal(
          Date.parse(r.arrivalDateTime) - Date.parse(r.departureDateTime),
          r.flightDurationMinutes * 60000,
        );
        assert.equal(r.flightDate, r.departureDateTime.slice(0, 10));
        if (r.tripType === 'return') {
          assert.match(r.returnDepartureDateTime, OFFSET_ISO);
          assert.ok(Date.parse(r.returnDepartureDateTime) > Date.parse(r.arrivalDateTime));
        } else {
          assert.equal(r.returnDepartureDateTime, undefined);
        }
      }
    }
  });

  it('derives activeFlight from an explicit departureDateTime and rejects invalid ones', () => {
    assert.equal(trip(undefined, 1, { departureDateTime: new Date(NOW + 5 * DAY).toISOString() }).activeFlight, 'Yes');
    assert.equal(trip(undefined, 1, { departureDateTime: new Date(NOW - 40 * DAY).toISOString() }).activeFlight, 'No');
    assert.throws(() => trip('Yes', 1, { departureDateTime: 'not-a-date' }), /Invalid departureDateTime/);
  });

  it('accepts boolean and string flag values', () => {
    assert.equal(trip(true, 3).activeFlight, 'Yes');
    assert.equal(trip(false, 3).activeFlight, 'No');
    assert.equal(webTrip.normalizeActiveFlight('yes'), 'Yes');
    assert.equal(webTrip.normalizeActiveFlight('false'), 'No');
  });
});

describe('MCP travel persona active_flight option', () => {
  it('active_flight true/false pins the flag and the trip leaves', () => {
    const yes = buildPersonaAttributes('travel', 'flyer@adobetest.com', null, { active_flight: true });
    assert.equal(yes[`${BOOKINGS}.activeFlight`], 'Yes');
    assert.ok(yes[`${BOOKINGS}.nextBookedAirport`]);
    assert.equal(yes[`${BOOKINGS}.nextBookedAirport`], yes[`${RES}.arrivalAirportCode`]);
    assert.match(yes[`${RES}.departureDateTime`], OFFSET_ISO);
    assert.ok(yes['individualCharacteristics.travel.favouriteAirlineCompany']);

    const no = buildPersonaAttributes('travel', 'flyer@adobetest.com', null, { active_flight: false });
    assert.equal(no[`${BOOKINGS}.activeFlight`], 'No');
    assert.equal(no[`${BOOKINGS}.nextBookedAirport`], undefined);
    assert.ok(Date.parse(no[`${RES}.arrivalDateTime`]) < Date.now());
  });

  it('omitted active_flight still emits a Yes/No flag', () => {
    const attrs = buildPersonaAttributes('travel', 'flyer@adobetest.com', null, {});
    assert.ok(['Yes', 'No'].includes(attrs[`${BOOKINGS}.activeFlight`]));
  });

  it('active_flyer / lapsed_flyer hints pin the flag; explicit option wins', () => {
    assert.equal(normalizeSegmentHint('active_flyer', 'travel'), 'active_flyer');
    assert.equal(normalizeSegmentHint('lapsed_flyer', 'travel'), 'lapsed_flyer');
    assert.equal(buildPersonaAttributes('travel', 'a@adobetest.com', 'active_flyer', {})[`${BOOKINGS}.activeFlight`], 'Yes');
    assert.equal(buildPersonaAttributes('travel', 'a@adobetest.com', 'lapsed_flyer', {})[`${BOOKINGS}.activeFlight`], 'No');
    assert.equal(
      buildPersonaAttributes('travel', 'a@adobetest.com', 'active_flyer', { active_flight: false })[`${BOOKINGS}.activeFlight`],
      'No',
    );
  });

  it('non-travel industries do not emit flight booking leaves', () => {
    const attrs = buildPersonaAttributes('retail', 'r@adobetest.com', null, { active_flight: true });
    assert.equal(Object.keys(attrs).some((k) => k.startsWith(BOOKINGS)), false);
  });
});
