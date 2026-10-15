/**
 * Travel flight-trip builder — shared by the Profile Viewer Travel generator
 * (browser global `AepTravelFlightTrip`) and the AEP Lab Profile MCP travel
 * persona (CommonJS copy at tools/aep-lab-profile-mcp/src/personaBuilder/flightTrip.cjs).
 *
 * CANONICAL SOURCE: this file. After editing run `npm run sync:travel-flight-trip`;
 * `npm run verify:travel-flight-trip` fails when the MCP copy drifts.
 *
 * Produces one coherent trip for a given "active flight" state:
 *   - activeFlight "Yes" → outbound departs within the next 30 days, or the
 *     customer is in the air right now. `flightBookings.next*` describes it.
 *   - activeFlight "No"  → only a completed past trip; `flightBookings.last*`
 *     describes it and no `next*` leaves are emitted.
 *
 * Output groups (keys are relative to their XDM parent, tenant-relative):
 *   reservation → travelReservations.flightReservations.*      (Profile Core v2)
 *   bookings    → individualCharacteristics.travel.flightBookings.* (Profile Travel v2; strings/dates)
 *   travel      → individualCharacteristics.travel.*          (Profile Travel v1)
 *
 * Pure: pass `rng` and `now` for deterministic output (tests).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AepTravelFlightTrip = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ACTIVE_WINDOW_DAYS = 30;
  const MINUTE = 60000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  const RESERVATION_PREFIX = 'travelReservations.flightReservations';
  const BOOKINGS_PREFIX = 'individualCharacteristics.travel.flightBookings';
  const TRAVEL_PREFIX = 'individualCharacteristics.travel';

  /** IATA → airport name, IANA time zone, coordinates, marketing region. */
  const AIRPORT_META = {
    LHR: { name: 'London Heathrow Airport', tz: 'Europe/London', lat: 51.47, lon: -0.4543, region: 'Europe' },
    CDG: { name: 'Paris Charles de Gaulle Airport', tz: 'Europe/Paris', lat: 49.0097, lon: 2.5479, region: 'Europe' },
    FRA: { name: 'Frankfurt Airport', tz: 'Europe/Berlin', lat: 50.0379, lon: 8.5622, region: 'Europe' },
    MUC: { name: 'Munich Airport', tz: 'Europe/Berlin', lat: 48.3538, lon: 11.7861, region: 'Europe' },
    AMS: { name: 'Amsterdam Airport Schiphol', tz: 'Europe/Amsterdam', lat: 52.3105, lon: 4.7683, region: 'Europe' },
    MAD: { name: 'Adolfo Suárez Madrid–Barajas Airport', tz: 'Europe/Madrid', lat: 40.4983, lon: -3.5676, region: 'Europe' },
    BCN: { name: 'Josep Tarradellas Barcelona–El Prat Airport', tz: 'Europe/Madrid', lat: 41.2974, lon: 2.0833, region: 'Europe' },
    FCO: { name: 'Rome Fiumicino Airport', tz: 'Europe/Rome', lat: 41.8003, lon: 12.2389, region: 'Europe' },
    IST: { name: 'Istanbul Airport', tz: 'Europe/Istanbul', lat: 41.2753, lon: 28.7519, region: 'Europe' },
    DUB: { name: 'Dublin Airport', tz: 'Europe/Dublin', lat: 53.4264, lon: -6.2499, region: 'Europe' },
    KEF: { name: 'Keflavík International Airport', tz: 'Atlantic/Reykjavik', lat: 63.985, lon: -22.6056, region: 'Europe' },
    DXB: { name: 'Dubai International Airport', tz: 'Asia/Dubai', lat: 25.2532, lon: 55.3657, region: 'Middle East' },
    AUH: { name: 'Zayed International Airport', tz: 'Asia/Dubai', lat: 24.433, lon: 54.6511, region: 'Middle East' },
    DOH: { name: 'Hamad International Airport', tz: 'Asia/Qatar', lat: 25.2731, lon: 51.6081, region: 'Middle East' },
    SIN: { name: 'Singapore Changi Airport', tz: 'Asia/Singapore', lat: 1.3644, lon: 103.9915, region: 'Asia Pacific' },
    HKG: { name: 'Hong Kong International Airport', tz: 'Asia/Hong_Kong', lat: 22.308, lon: 113.9185, region: 'Asia Pacific' },
    BKK: { name: 'Suvarnabhumi Airport', tz: 'Asia/Bangkok', lat: 13.69, lon: 100.7501, region: 'Asia Pacific' },
    ICN: { name: 'Incheon International Airport', tz: 'Asia/Seoul', lat: 37.4602, lon: 126.4407, region: 'Asia Pacific' },
    NRT: { name: 'Narita International Airport', tz: 'Asia/Tokyo', lat: 35.772, lon: 140.3929, region: 'Asia Pacific' },
    HND: { name: 'Tokyo Haneda Airport', tz: 'Asia/Tokyo', lat: 35.5494, lon: 139.7798, region: 'Asia Pacific' },
    SYD: { name: 'Sydney Kingsford Smith Airport', tz: 'Australia/Sydney', lat: -33.9399, lon: 151.1753, region: 'Asia Pacific' },
    JNB: { name: 'O. R. Tambo International Airport', tz: 'Africa/Johannesburg', lat: -26.1392, lon: 28.246, region: 'Africa' },
    YYZ: { name: 'Toronto Pearson International Airport', tz: 'America/Toronto', lat: 43.6777, lon: -79.6248, region: 'North America' },
    JFK: { name: 'John F. Kennedy International Airport', tz: 'America/New_York', lat: 40.6413, lon: -73.7781, region: 'North America' },
    EWR: { name: 'Newark Liberty International Airport', tz: 'America/New_York', lat: 40.6895, lon: -74.1745, region: 'North America' },
    BOS: { name: 'Boston Logan International Airport', tz: 'America/New_York', lat: 42.3656, lon: -71.0096, region: 'North America' },
    IAD: { name: 'Washington Dulles International Airport', tz: 'America/New_York', lat: 38.9531, lon: -77.4565, region: 'North America' },
    ATL: { name: 'Hartsfield–Jackson Atlanta International Airport', tz: 'America/New_York', lat: 33.6407, lon: -84.4277, region: 'North America' },
    MIA: { name: 'Miami International Airport', tz: 'America/New_York', lat: 25.7959, lon: -80.287, region: 'North America' },
    ORD: { name: "O'Hare International Airport", tz: 'America/Chicago', lat: 41.9742, lon: -87.9073, region: 'North America' },
    DFW: { name: 'Dallas/Fort Worth International Airport', tz: 'America/Chicago', lat: 32.8998, lon: -97.0403, region: 'North America' },
    DEN: { name: 'Denver International Airport', tz: 'America/Denver', lat: 39.8561, lon: -104.6737, region: 'North America' },
    LAS: { name: 'Harry Reid International Airport', tz: 'America/Los_Angeles', lat: 36.084, lon: -115.1537, region: 'North America' },
    LAX: { name: 'Los Angeles International Airport', tz: 'America/Los_Angeles', lat: 33.9416, lon: -118.4085, region: 'North America' },
    SFO: { name: 'San Francisco International Airport', tz: 'America/Los_Angeles', lat: 37.6213, lon: -122.379, region: 'North America' },
    SEA: { name: 'Seattle–Tacoma International Airport', tz: 'America/Los_Angeles', lat: 47.4502, lon: -122.3088, region: 'North America' },
  };

  const FLIGHT_STATUSES = ['booked', 'checked_in', 'in_air', 'landed', 'completed'];
  const TRIP_PURPOSES = ['leisure', 'leisure', 'business', 'business', 'family', 'visiting_friends_relatives'];
  const BOOKING_CHANNELS = ['website', 'website', 'mobile_app', 'mobile_app', 'travel_agent', 'call_centre'];
  const EXTRAS = ['Extra legroom seat', 'Checked bag', 'Priority boarding', 'Lounge access', 'Meal upgrade', 'Wi-Fi pass', 'Fast track security'];
  const SEAT_LETTERS = { first: 'ADFK', business: 'ACDFHK', premium_economy: 'ABCDEFGK', economy: 'ABCDEFGHJK' };
  const SEAT_ROWS = { first: [1, 2], business: [3, 9], premium_economy: [10, 15], economy: [16, 45] };

  function rInt(rng, lo, hi) { return Math.floor(rng() * (hi - lo + 1)) + lo; }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

  function normalizeActiveFlight(v) {
    if (v === true) return 'Yes';
    if (v === false) return 'No';
    const s = String(v == null ? '' : v).trim().toLowerCase();
    if (s === 'yes' || s === 'true' || s === 'y') return 'Yes';
    if (s === 'no' || s === 'false' || s === 'n') return 'No';
    return null;
  }

  function airportMeta(code) {
    return AIRPORT_META[String(code || '').trim().toUpperCase()] || null;
  }

  function haversineKm(a, b) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /** Block time: ~830 km/h cruise + 35 min taxi/climb, rounded to 5 min; 180 min when unknown. */
  function flightDurationMinutes(depCode, arrCode) {
    const a = airportMeta(depCode);
    const b = airportMeta(arrCode);
    if (!a || !b) return 180;
    const mins = (haversineKm(a, b) / 830) * 60 + 35;
    return Math.max(45, Math.round(mins / 5) * 5);
  }

  /** Minutes east of UTC for `tz` at instant `ms` (Intl-based; works in browsers and Node). */
  function tzOffsetMinutes(ms, tz) {
    if (!tz || tz === 'UTC') return 0;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(ms));
    const get = (t) => Number(parts.find((p) => p.type === t).value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / MINUTE);
  }

  /** ISO-8601 local wall time with UTC offset, e.g. 2026-10-18T09:40:00+01:00. */
  function formatLocalIso(ms, tz) {
    const off = tzOffsetMinutes(ms, tz);
    const local = new Date(ms + off * MINUTE).toISOString().slice(0, 19);
    if (off === 0) return `${local}Z`;
    const sign = off > 0 ? '+' : '-';
    const abs = Math.abs(off);
    return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  }

  function localDate(ms, tz) { return formatLocalIso(ms, tz).slice(0, 10); }

  /** Northern-hemisphere meteorological season from the YYYY-MM-DD month. */
  function seasonForDate(isoDate) {
    const m = Number(String(isoDate).slice(5, 7));
    if (m === 12 || m <= 2) return 'Winter';
    if (m <= 5) return 'Spring';
    if (m <= 8) return 'Summer';
    return 'Autumn';
  }

  function roundTo5Min(ms) { return Math.round(ms / (5 * MINUTE)) * 5 * MINUTE; }

  function returnFlightNumber(outbound) {
    const m = String(outbound || '').match(/^([A-Z0-9]{2})(\d{1,4})$/i);
    if (!m) return '';
    const n = (Number(m[2]) % 9999) + 1;
    return `${m[1].toUpperCase()}${String(n).padStart(m[2].length, '0')}`;
  }

  function statusFor(depMs, arrMs, now) {
    if (now >= arrMs) return now - arrMs <= 6 * HOUR ? 'landed' : 'completed';
    if (now >= depMs) return 'in_air';
    return depMs - now <= 24 * HOUR ? 'checked_in' : 'booked';
  }

  function pickExtras(rng) {
    const n = rInt(rng, 0, 3);
    if (n === 0) return 'None';
    const pool = EXTRAS.slice();
    const out = [];
    for (let i = 0; i < n; i += 1) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return out.join(', ');
  }

  function seatFor(rng, flightClass) {
    const cls = SEAT_ROWS[flightClass] ? flightClass : 'economy';
    const [lo, hi] = SEAT_ROWS[cls];
    return `${rInt(rng, lo, hi)}${pick(rng, SEAT_LETTERS[cls].split(''))}`;
  }

  function airportFields(airport) {
    const code = String((airport && airport.code) || '').trim().toUpperCase();
    const meta = airportMeta(code);
    return {
      code,
      city: (airport && airport.city) || '',
      country: (airport && airport.country) || '',
      name: (airport && airport.name) || (meta ? meta.name : ''),
      tz: meta ? meta.tz : 'UTC',
      region: meta ? meta.region : '',
    };
  }

  /**
   * @param {object} opts
   * @param {'Yes'|'No'|boolean|string|null} [opts.activeFlight] - omitted → derived from departureDateTime, else random 50/50
   * @param {{code:string, city?:string, country?:string, name?:string}} opts.dep
   * @param {{code:string, city?:string, country?:string, name?:string}} opts.arr
   * @param {string} [opts.airline] - display name, e.g. "British Airways"
   * @param {string} [opts.flightNumber]
   * @param {string} [opts.confirmationNumber]
   * @param {string} [opts.flightClass] - economy | premium_economy | business | first
   * @param {string} [opts.departureDateTime] - ISO override for the outbound departure
   * @param {'one_way'|'return'} [opts.tripType]
   * @param {() => number} [opts.rng]
   * @param {number} [opts.now] - epoch ms
   */
  function buildFlightTrip(opts) {
    const o = opts || {};
    const rng = typeof o.rng === 'function' ? o.rng : Math.random;
    const now = Number.isFinite(o.now) ? o.now : Date.now();
    const dep = airportFields(o.dep);
    const arr = airportFields(o.arr);
    const flightClass = o.flightClass || 'economy';
    const duration = flightDurationMinutes(dep.code, arr.code);

    let active = normalizeActiveFlight(o.activeFlight);
    let depMs = null;
    if (o.departureDateTime) {
      const parsed = Date.parse(o.departureDateTime);
      if (!Number.isFinite(parsed)) throw new Error(`Invalid departureDateTime "${o.departureDateTime}"`);
      depMs = parsed;
      if (!active) {
        const inWindow = depMs + duration * MINUTE > now && depMs <= now + ACTIVE_WINDOW_DAYS * DAY;
        active = inWindow ? 'Yes' : 'No';
      }
    }
    if (!active) active = rng() < 0.5 ? 'Yes' : 'No';

    if (depMs == null) {
      if (active === 'Yes') {
        // ~10% are airborne right now; the rest depart between +2h and +30d.
        if (duration >= 60 && rng() < 0.1) depMs = now - rInt(rng, 15, duration - 15) * MINUTE;
        else depMs = now + rInt(rng, 2 * 60, ACTIVE_WINDOW_DAYS * 24 * 60) * MINUTE;
      } else {
        depMs = now - rInt(rng, 3, 120) * DAY - rInt(rng, 0, 23 * 60) * MINUTE;
      }
      depMs = roundTo5Min(depMs);
    }
    const arrMs = depMs + duration * MINUTE;

    let tripType = o.tripType === 'one_way' || o.tripType === 'return' ? o.tripType : (rng() < 0.65 ? 'return' : 'one_way');
    let retDepMs = null;
    if (tripType === 'return') {
      const stayDays = rInt(rng, 2, 14);
      retDepMs = roundTo5Min(arrMs + stayDays * DAY + rInt(rng, -6 * 60, 6 * 60) * MINUTE);
      // A completed ("No") trip must be fully in the past.
      if (active === 'No' && retDepMs + duration * MINUTE > now - HOUR) {
        tripType = 'one_way';
        retDepMs = null;
      }
    }
    const retArrMs = retDepMs != null ? retDepMs + duration * MINUTE : null;

    const premium = flightClass === 'business' || flightClass === 'first';
    const leadDays = rInt(rng, 3, 120);
    const bookingMs = Math.min(now, depMs - leadDays * DAY);
    const confirmation = o.confirmationNumber || '';
    const flightNumber = o.flightNumber || '';

    const reservation = {
      departureAirportCode: dep.code,
      departureAirportName: dep.name,
      departureCity: dep.city,
      departureCountry: dep.country,
      arrivalAirportCode: arr.code,
      arrivalAirportName: arr.name,
      arrivalCity: arr.city,
      arrivalCountry: arr.country,
      airlineName: o.airline || '',
      flightNumber,
      flightDate: localDate(depMs, dep.tz),
      departureDateTime: formatLocalIso(depMs, dep.tz),
      arrivalDateTime: formatLocalIso(arrMs, arr.tz),
      flightDurationMinutes: duration,
      flightStatus: statusFor(depMs, arrMs, now),
      tripType,
      seatNumber: seatFor(rng, flightClass),
      checkedBags: premium ? rInt(rng, 1, 2) : rInt(rng, 0, 2),
      bookingChannel: pick(rng, BOOKING_CHANNELS),
      bookingDate: localDate(bookingMs, dep.tz),
    };
    if (confirmation) reservation.confirmationNumber = confirmation;
    if (tripType === 'return') {
      reservation.returnFlightNumber = returnFlightNumber(flightNumber);
      reservation.returnDepartureDateTime = formatLocalIso(retDepMs, arr.tz);
      reservation.returnArrivalDateTime = formatLocalIso(retArrMs, dep.tz);
    }
    for (const k of Object.keys(reservation)) {
      if (reservation[k] === '' || reservation[k] == null) delete reservation[k];
    }

    const outboundDate = localDate(depMs, dep.tz);
    const inboundDate = retDepMs != null ? localDate(retDepMs, arr.tz) : null;
    const bookings = {
      activeFlight: active,
      bookings: rInt(rng, active === 'Yes' ? 2 : 1, 14),
      destinationPropensity: arr.region || 'Europe',
      openComplaint: rng() < 0.05 ? 'Yes' : 'No',
    };
    const travel = {
      primaryTripPurpose: pick(rng, TRIP_PURPOSES),
      avgTripLength: rInt(rng, 2, 14),
      avgDaysBookingBeforeTrip: leadDays,
      lastTravelCode: confirmation || undefined,
    };

    if (active === 'Yes') {
      bookings.nextBookedAirport = arr.code;
      if (confirmation) bookings.nextBookedBookingRef = confirmation;
      bookings.nextBookedOutbound = outboundDate;
      if (inboundDate) bookings.nextBookedInbound = inboundDate;
      bookings.nextBookedSeason = seasonForDate(outboundDate);
      bookings.nextBookedExtras = pickExtras(rng);
      // Repeat customers also carry their previous, completed trip.
      const prevCodes = Object.keys(AIRPORT_META).filter((c) => c !== dep.code && c !== arr.code);
      const prevArr = pick(rng, prevCodes);
      const prevOutMs = depMs - rInt(rng, 30, 365) * DAY;
      const prevStay = rInt(rng, 2, 14);
      bookings.lastBookedAirport = prevArr;
      bookings.lastBookedBookingRef = randomPnr(rng);
      bookings.lastBookedOutbound = localDate(prevOutMs, dep.tz);
      bookings.lastBookedInbound = localDate(prevOutMs + prevStay * DAY, AIRPORT_META[prevArr].tz);
      bookings.lastBookedSeason = seasonForDate(bookings.lastBookedOutbound);
      bookings.lastBookedExtras = pickExtras(rng);
    } else {
      bookings.lastBookedAirport = arr.code;
      if (confirmation) bookings.lastBookedBookingRef = confirmation;
      bookings.lastBookedOutbound = outboundDate;
      if (inboundDate) bookings.lastBookedInbound = inboundDate;
      bookings.lastBookedSeason = seasonForDate(outboundDate);
      bookings.lastBookedExtras = pickExtras(rng);
    }
    if (travel.lastTravelCode === undefined) delete travel.lastTravelCode;

    return { activeFlight: active, reservation, bookings, travel };
  }

  function randomPnr(rng) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 6; i += 1) out += chars.charAt(Math.floor(rng() * chars.length));
    return out;
  }

  /** Flatten a trip into tenant-relative dot paths ready for `push()` / `assign()`. */
  function tripToAttributePaths(trip) {
    const out = {};
    if (!trip) return out;
    for (const [k, v] of Object.entries(trip.reservation || {})) out[`${RESERVATION_PREFIX}.${k}`] = v;
    for (const [k, v] of Object.entries(trip.bookings || {})) out[`${BOOKINGS_PREFIX}.${k}`] = v;
    for (const [k, v] of Object.entries(trip.travel || {})) out[`${TRAVEL_PREFIX}.${k}`] = v;
    return out;
  }

  return {
    ACTIVE_WINDOW_DAYS,
    AIRPORT_META,
    FLIGHT_STATUSES,
    RESERVATION_PREFIX,
    BOOKINGS_PREFIX,
    TRAVEL_PREFIX,
    airportMeta,
    buildFlightTrip,
    flightDurationMinutes,
    formatLocalIso,
    normalizeActiveFlight,
    seasonForDate,
    tripToAttributePaths,
  };
});
