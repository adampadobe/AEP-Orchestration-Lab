'use strict';

const { createHash } = require('crypto');

const TRAVEL_PRODUCT_CATALOG = Object.freeze([
  { product_code: 'SEAT_STD', product_name: 'Standard seat selection', category: 'seat', cabin_eligibility: 'all', price_from: 12 },
  { product_code: 'SEAT_WINDOW', product_name: 'Window seat selection', category: 'seat', cabin_eligibility: 'all', price_from: 18 },
  { product_code: 'SEAT_XL', product_name: 'Extra-legroom seat', category: 'seat', cabin_eligibility: 'all', price_from: 35 },
  { product_code: 'UPG_PREM_ECON', product_name: 'Premium economy upgrade', category: 'upgrade', cabin_eligibility: 'economy', price_from: 180 },
  { product_code: 'UPG_BUSINESS', product_name: 'Business class upgrade', category: 'upgrade', cabin_eligibility: 'economy,premium_economy', price_from: 650 },
  { product_code: 'BAG_23KG', product_name: '23 kg checked bag', category: 'bag', cabin_eligibility: 'all', price_from: 35 },
  { product_code: 'LOUNGE', product_name: 'Airport lounge access', category: 'lounge', cabin_eligibility: 'all', price_from: 45 },
  { product_code: 'FASTTRACK', product_name: 'Fast track security', category: 'fast_track', cabin_eligibility: 'all', price_from: 15 },
].map((product) => Object.freeze({ ...product, currency: 'GBP' })));

const HERO_PROFILE_NAMES = Object.freeze([
  ['Amelia', 'Clarke'],
  ['Oliver', 'Bennett'],
  ['Sofia', 'Patel'],
  ['Noah', 'Williams'],
  ['Isabella', 'Morgan'],
  ['Ethan', 'Shah'],
  ['Grace', 'Turner'],
  ['Leo', 'Campbell'],
  ['Maya', 'Roberts'],
  ['Freddie', 'Walker'],
]);

const ROUTES = Object.freeze([
  { origin: 'LHR', destination: 'CDG', city: 'Paris' },
  { origin: 'LGW', destination: 'BCN', city: 'Barcelona' },
  { origin: 'MAN', destination: 'AMS', city: 'Amsterdam' },
  { origin: 'LHR', destination: 'JFK', city: 'New York' },
  { origin: 'EDI', destination: 'MAD', city: 'Madrid' },
]);

function hashNumber(seed) {
  return createHash('sha256').update(String(seed)).digest().readUInt32BE(0);
}

function dateAt(asOfDate, offsetDays) {
  const date = new Date(`${asOfDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date;
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

function timeAt(date, hour) {
  const value = new Date(date);
  value.setUTCHours(hour, 0, 0, 0);
  return value.toISOString();
}

function withMetadata(row, industry, runStamp, testProfile) {
  return {
    ...row,
    INDUSTRY: industry,
    VERSION_TS: runStamp,
    _RECORDCREATEDTIMESTAMP: runStamp,
    _RECORDUPDATEDTIMESTAMP: runStamp,
    TESTPROFILE: testProfile !== false,
  };
}

function chooseScenario(index) {
  return ['seat_not_selected', 'seat_not_selected', 'seat_not_selected', 'seat_not_selected',
    'seat_not_selected', 'seat_not_selected', 'seat_bought_in_journey', 'seat_bought_in_journey',
    'upgraded_cabin', 'disrupted'][index % 10];
}

function chooseOutboundOffset(index, hero) {
  if (hero) return 170;
  const bucket = index % 10;
  const span = bucket < 7 ? 51 : 101;
  const start = bucket < 7 ? 150 : 20;
  return start + (hashNumber(`departure:${index}`) % span);
}

function generateTravelRelationalRecords({
  recipient,
  profile,
  index,
  asOfDate,
  runStamp = new Date().toISOString().replace('T', ' ').replace('Z', ''),
  hero = false,
} = {}) {
  if (!recipient || !recipient.recipientId) throw new Error('recipient is required');
  if (!profile || !profile.CRMID || !profile.ECID) throw new Error('profile CRMID and ECID are required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(asOfDate || ''))) {
    throw new Error('asOfDate must use YYYY-MM-DD');
  }

  const recipientId = recipient.recipientId;
  const scenario = hero ? 'seat_not_selected' : chooseScenario(Number(index) || 0);
  const route = ROUTES[hashNumber(`${recipientId}:route`) % ROUTES.length];
  const depart = dateAt(asOfDate, chooseOutboundOffset(Number(index) || 0, hero));
  const departureUtc = timeAt(depart, 9);
  const arrivalUtc = new Date(
    new Date(departureUtc).getTime() + (2 + (hashNumber(`${recipientId}:duration`) % 9)) * 3600000,
  ).toISOString();
  const bookingDate = dateAt(asOfDate, -(hashNumber(`${recipientId}:booking`) % 31));
  const reservationId = `${recipientId}-RES-001`;
  const pnrLocator = hashNumber(`${recipientId}:pnr`).toString(36).toUpperCase().padStart(6, '0').slice(-6);
  const returnTrip = hashNumber(`${recipientId}:trip-type`) % 4 !== 0;
  const cabin = scenario === 'upgraded_cabin' ? 'business' : 'economy';
  const flightNumber = `BA${100 + (hashNumber(`${recipientId}:flight`) % 900)}`;
  const testProfile = profile.TESTPROFILE !== false;
  const reservation = withMetadata({
    reservation_id: reservationId,
    recipient_id: recipientId,
    pnr_locator: pnrLocator,
    booking_date: ymd(bookingDate),
    booking_channel: ['web', 'mobile_app', 'travel_agent'][hashNumber(`${recipientId}:channel`) % 3],
    trip_type: returnTrip ? 'return' : 'one_way',
    total_fare: 420 + (hashNumber(`${recipientId}:fare`) % 160000) / 100,
    currency: 'GBP',
    status: 'confirmed',
    scenario,
  }, 'travel', runStamp, testProfile);

  const outbound = {
    segment_id: `${reservationId}-SEG-001`,
    reservation_id: reservationId,
    recipient_id: recipientId,
    flight_number: flightNumber,
    origin: route.origin,
    destination: route.destination,
    departure_utc: departureUtc,
    arrival_utc: arrivalUtc,
    booked_cabin: cabin,
    fare_class: cabin === 'business' ? 'J' : 'Y',
    aircraft_type: 'Boeing 787-9',
    segment_status: scenario === 'disrupted' ? 'delayed' : 'scheduled',
    delay_minutes: scenario === 'disrupted' ? 75 : 0,
    gate: scenario === 'disrupted' ? 'B24' : 'A12',
  };
  const segments = [withMetadata(outbound, 'travel', runStamp, testProfile)];
  if (returnTrip) {
    const returnDate = dateAt(asOfDate, chooseOutboundOffset(Number(index) || 0, hero) + 7);
    const returnArrival = new Date(returnDate.getTime() + 3 * 3600000);
    segments.push(withMetadata({
      segment_id: `${reservationId}-SEG-002`,
      reservation_id: reservationId,
      recipient_id: recipientId,
      flight_number: `BA${100 + (hashNumber(`${recipientId}:return-flight`) % 900)}`,
      origin: route.destination,
      destination: route.origin,
      departure_utc: timeAt(returnDate, 15),
      arrival_utc: timeAt(returnArrival, 18),
      booked_cabin: cabin,
      fare_class: cabin === 'business' ? 'J' : 'Y',
      aircraft_type: 'Airbus A350-900',
      segment_status: 'scheduled',
      delay_minutes: 0,
      gate: 'C18',
    }, 'travel', runStamp, testProfile));
  }

  const passengers = [withMetadata({
    passenger_id: `${reservationId}-PAX-001`,
    reservation_id: reservationId,
    recipient_id: recipientId,
    first_name: profile.FIRSTNAME || '',
    last_name: profile.LASTNAME || '',
    passenger_type: 'adult',
    is_lead: true,
  }, 'travel', runStamp, testProfile)];
  const companionCount = hashNumber(`${recipientId}:companions`) % 3;
  for (let passengerIndex = 0; passengerIndex < companionCount; passengerIndex += 1) {
    passengers.push(withMetadata({
      passenger_id: `${reservationId}-PAX-${String(passengerIndex + 2).padStart(3, '0')}`,
      reservation_id: reservationId,
      recipient_id: null,
      first_name: `Companion${passengerIndex + 1}`,
      last_name: profile.LASTNAME || '',
      passenger_type: 'adult',
      is_lead: false,
    }, 'travel', runStamp, testProfile));
  }

  const ancillaries = [];
  if (scenario === 'seat_bought_in_journey') {
    const elapsedBookingDays = Math.floor((new Date(`${asOfDate}T00:00:00.000Z`) - bookingDate) / 86400000);
    const purchasedAt = new Date(bookingDate.getTime() + Math.min(30, elapsedBookingDays) * 86400000);
    ancillaries.push(withMetadata({
      ancillary_id: `${outbound.segment_id}-ANC-001`,
      segment_id: outbound.segment_id,
      passenger_id: passengers[0].passenger_id,
      recipient_id: recipientId,
      product_code: 'SEAT_WINDOW',
      seat_number: '18A',
      amount: 18,
      currency: 'GBP',
      purchase_channel: 'mobile_app',
      purchased_at: purchasedAt.toISOString(),
    }, 'travel', runStamp, testProfile));
  } else if (scenario === 'upgraded_cabin') {
    ancillaries.push(withMetadata({
      ancillary_id: `${outbound.segment_id}-ANC-001`,
      segment_id: outbound.segment_id,
      passenger_id: passengers[0].passenger_id,
      recipient_id: recipientId,
      product_code: 'UPG_BUSINESS',
      seat_number: null,
      amount: 650,
      currency: 'GBP',
      purchase_channel: 'web',
      purchased_at: ymd(bookingDate),
    }, 'travel', runStamp, testProfile));
  }

  const identity = {
    CRMID: profile.CRMID,
    ECID: profile.ECID,
    EMAIL: profile.EMAIL,
    EMAILIDSHA256: profile.EMAILIDSHA256,
    GAID: profile.GAID,
    LOYALTYID: profile.LOYALTYID,
    PASSPORTID: profile.PASSPORTID,
    PHONENUMBER: profile.PHONENUMBER,
    PUSHTOKENS: profile.PUSHTOKENS,
    STACKCHATID: profile.STACKCHATID,
  };
  const bookingEvent = {
    ...identity,
    _ID: `${reservationId}-EVENT`,
    TIMESTAMP: timeAt(bookingDate, 12),
    EVENTTYPE: 'purchase.completed',
    PNR: pnrLocator,
    BOOKINGSTATUS: 'confirmed',
    BOOKINGDATE: ymd(bookingDate),
    BOOKINGCHANNEL: reservation.booking_channel,
    TRIPTYPE: reservation.trip_type,
    OUTBOUNDFLIGHTNUMBER: outbound.flight_number,
    OUTBOUNDORIGIN: outbound.origin,
    OUTBOUNDDESTINATION: outbound.destination,
    OUTBOUNDDEPARTUREDATE: outbound.departure_utc,
    OUTBOUNDARRIVALDATE: outbound.arrival_utc,
    OUTBOUNDCABINCLASS: outbound.booked_cabin,
    RETURNFLIGHTNUMBER: returnTrip ? segments[1].flight_number : null,
    RETURNORIGIN: returnTrip ? segments[1].origin : null,
    RETURNDESTINATION: returnTrip ? segments[1].destination : null,
    RETURNDEPARTUREDATE: returnTrip ? segments[1].departure_utc : null,
    RETURNARRIVALDATE: returnTrip ? segments[1].arrival_utc : null,
    RETURNCABINCLASS: returnTrip ? segments[1].booked_cabin : null,
    TOTALPASSENGERS: passengers.length,
    ADULTCOUNT: passengers.length,
    CHILDCOUNT: 0,
    INFANTCOUNT: 0,
    TOTALPRICE: reservation.total_fare,
    BASEFARE: reservation.total_fare - 60,
    TAXES: 50,
    FEES: 10,
    CURRENCY: 'GBP',
    SEATSELECTION: scenario === 'seat_bought_in_journey' ? '18A' : null,
    CHANNEL: reservation.booking_channel,
    _RECORDCREATEDTIMESTAMP: runStamp,
  };
  const disruptionEvents = scenario === 'disrupted' ? [{
    ...identity,
    _ID: `D-${createHash('sha256').update(`${outbound.segment_id}:disruption`).digest('hex').slice(0, 32)}`,
    TIMESTAMP: runStamp,
    EVENTTYPE: 'flight.disrupted',
    SEGMENT_ID: outbound.segment_id,
    DISRUPTION_TYPE: 'delay',
    DISRUPTION_SEVERITY: 'moderate',
    ORIGINAL_DEPARTURE_TIME: outbound.departure_utc,
    NEW_DEPARTURE_TIME: timeAt(depart, 10),
    DELAY_MINUTES: outbound.delay_minutes,
    DISRUPTION_REASON: 'operational',
    NOTIFICATION_METHOD: 'push',
    FLIGHT_NUMBER: outbound.flight_number,
    AIRLINE: 'British Airways',
    ORIGIN_AIRPORT: outbound.origin,
    DESTINATION_AIRPORT: outbound.destination,
    ORIGINAL_GATE: 'A12',
    NEW_GATE: outbound.gate,
    CHANNEL: 'mobile_app',
    _RECORDCREATEDTIMESTAMP: runStamp,
  }] : [];

  return {
    scenario,
    reservation,
    segments,
    passengers,
    ancillaries,
    bookingEvent,
    disruptionEvents,
    catalog: TRAVEL_PRODUCT_CATALOG.map((product) => withMetadata({
      ...product,
      price_from: product.price_from,
    }, 'travel', runStamp, true)),
    upcomingTripDate: ymd(depart),
    upcomingDestination: route.city,
  };
}

module.exports = {
  HERO_PROFILE_NAMES,
  TRAVEL_PRODUCT_CATALOG,
  generateTravelRelationalRecords,
};
