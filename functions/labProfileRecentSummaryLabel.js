/**
 * Build "Recently generated" dropdown tail — mirrors Profile Viewer summariseSnapshot.
 * Accepts portal snapshot objects and/or flat XDM attribute maps from MCP.
 */

function str(v) {
  return String(v || '').trim();
}

function pickAttr(attrs, ...keys) {
  if (!attrs || typeof attrs !== 'object') return '';
  for (const k of keys) {
    const v = attrs[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function ageFromBirthDate(birthDate) {
  const s = str(birthDate);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age > 0 && age < 130 ? age : null;
}

function identityParts({ snapshot, attributes, personName, mobilePhone }) {
  const parts = [];
  let firstName = '';
  let lastName = '';
  let age = null;
  let gender = '';
  let phone = str(mobilePhone);

  if (snapshot && typeof snapshot === 'object') {
    firstName = str(snapshot.firstName);
    lastName = str(snapshot.lastName);
    if (snapshot.age != null && Number.isFinite(Number(snapshot.age))) {
      age = Math.floor(Number(snapshot.age));
    }
    gender = str(snapshot.gender);
    if (!phone) phone = str(snapshot.mobilePhone);
  }

  if (attributes && typeof attributes === 'object') {
    if (!firstName) firstName = pickAttr(attributes, 'person.name.firstName', 'person.name.firstname');
    if (!lastName) lastName = pickAttr(attributes, 'person.name.lastName', 'person.name.lastname');
    if (age == null) {
      const rawAge = pickAttr(attributes, 'individualCharacteristics.core.age');
      if (rawAge && Number.isFinite(Number(rawAge))) age = Math.floor(Number(rawAge));
      if (age == null) age = ageFromBirthDate(pickAttr(attributes, 'person.birthDate'));
    }
    if (!gender) gender = pickAttr(attributes, 'person.gender', 'person.genderType');
    if (!phone) {
      phone = pickAttr(attributes, 'mobilePhone.number', 'mobilePhone.phoneNumber', 'phone.number');
    }
  }

  if (!firstName && !lastName && personName) {
    const name = str(personName);
    const sp = name.indexOf(' ');
    if (sp > 0) {
      firstName = name.slice(0, sp);
      lastName = name.slice(sp + 1);
    } else {
      firstName = name;
    }
  }

  if (firstName || lastName) {
    const name = `${firstName} ${lastName}`.trim();
    parts.push(age ? `${name} (${age})` : name);
  }
  if (phone) parts.push(phone);
  if (gender) parts.push(gender);
  return parts;
}

function travelTailFromSnapshot(snap) {
  const t = snap && snap.travel ? snap.travel : {};
  const parts = [];
  const r = t.reservations || {};
  if (r.enabled && r.flight && (r.flight.departure || r.flight.arrival)) {
    const route = [r.flight.departure, r.flight.arrival].filter(Boolean).join('→');
    const flightBits = [route];
    if (r.flight.number) flightBits.push(r.flight.number);
    if (r.flight.class) flightBits.push(r.flight.class);
    parts.push(flightBits.join(' '));
  } else if (t.favouriteAirline) {
    parts.push(`Airline: ${t.favouriteAirline}`);
  }
  if (t.prefs && t.prefs.enabled) {
    const pp = [t.prefs.meal, t.prefs.seat, t.prefs.roomType, t.prefs.vehicleType].filter(Boolean);
    if (pp.length) parts.push(pp.join('/'));
  }
  const rs = t.recentStay;
  if (rs && rs.enabled && (rs.hotelName || rs.city)) {
    const hb = [rs.hotelName, rs.city].filter(Boolean).join(', ');
    if (hb) parts.push(`Stay: ${hb}`);
  }
  return parts;
}

function travelTailFromAttributes(attrs) {
  const parts = [];
  const dep = pickAttr(
    attrs,
    'travelReservations.flightReservations.departureAirportCode',
    'individualCharacteristics.travel.flightReservations.departureAirportCode',
  );
  const arr = pickAttr(
    attrs,
    'travelReservations.flightReservations.arrivalAirportCode',
    'individualCharacteristics.travel.flightReservations.arrivalAirportCode',
  );
  if (dep || arr) {
    const route = [dep, arr].filter(Boolean).join('→');
    const flightBits = [route];
    const num = pickAttr(attrs, 'travelReservations.flightReservations.flightNumber');
    const cls = pickAttr(attrs, 'travelReservations.flightReservations.flightClass');
    if (num) flightBits.push(num);
    if (cls) flightBits.push(cls);
    parts.push(flightBits.join(' '));
  } else {
    const airline = pickAttr(attrs, 'individualCharacteristics.travel.favouriteAirlineCompany');
    if (airline) parts.push(`Airline: ${airline}`);
  }
  const hotel = pickAttr(attrs, 'individualCharacteristics.travel.recentStay.hotelName');
  const city = pickAttr(attrs, 'individualCharacteristics.travel.recentStay.hotelCity');
  if (hotel || city) {
    const hb = [hotel, city].filter(Boolean).join(', ');
    if (hb) parts.push(`Stay: ${hb}`);
  }
  return parts;
}

function genericTail(snapshot, attributes) {
  const parts = [];
  const snap = snapshot && typeof snapshot === 'object' ? snapshot : null;
  if (snap) {
    if (snap.preferredChannel) parts.push(`Preferred ${snap.preferredChannel}`);
  }
  if (attributes && typeof attributes === 'object') {
    const ch = pickAttr(attributes, 'preferences.preferredChannel', 'individualCharacteristics.core.preferredChannel');
    if (ch && !parts.length) parts.push(`Preferred ${ch}`);
  }
  return parts;
}

function loyaltyParts(snapshot, attributes) {
  const parts = [];
  if (snapshot && snapshot.loyalty && snapshot.loyalty.enabled) {
    const lp = [];
    if (snapshot.loyalty.tier) lp.push(snapshot.loyalty.tier);
    if (snapshot.loyalty.points) lp.push(`${snapshot.loyalty.points} pts`);
    parts.push(`Loyalty: ${lp.join(' · ') || 'on'}`);
  }
  return parts;
}

function analyticsParts(snapshot) {
  const parts = [];
  if (!snapshot || typeof snapshot !== 'object') return parts;
  if (snapshot.nps) parts.push(`NPS ${snapshot.nps}`);
  if (snapshot.aov) parts.push(`AOV $${snapshot.aov}`);
  return parts;
}

/**
 * @param {object} opts
 * @param {string} [opts.industry]
 * @param {object} [opts.snapshot] Portal form snapshot
 * @param {object} [opts.attributes] Flat XDM attribute map (MCP)
 * @param {string} [opts.personName]
 * @param {string} [opts.mobilePhone]
 * @returns {string} Tail after email (joined with ·)
 */
function buildSummaryTail(opts) {
  const industry = str(opts && opts.industry).toLowerCase() || 'generic';
  const snapshot = opts && opts.snapshot;
  const attributes = opts && opts.attributes;
  const parts = identityParts({
    snapshot,
    attributes,
    personName: opts && opts.personName,
    mobilePhone: opts && opts.mobilePhone,
  });

  if (industry === 'travel') {
    if (snapshot) parts.push(...travelTailFromSnapshot(snapshot));
    else if (attributes) parts.push(...travelTailFromAttributes(attributes));
  } else {
    parts.push(...genericTail(snapshot, attributes));
  }

  parts.push(...loyaltyParts(snapshot, attributes));
  parts.push(...analyticsParts(snapshot));

  return parts.filter(Boolean).join(' · ');
}

/**
 * @param {string} email
 * @param {string} tail
 * @returns {string}
 */
function buildSummaryLabel(email, tail) {
  const e = str(email);
  const t = str(tail);
  if (!e) return t;
  if (!t) return e;
  return `${e} — ${t}`;
}

/**
 * @param {object} opts — same as buildSummaryTail plus email
 * @returns {{ tail: string, summaryLabel: string }}
 */
function buildRecentProfileLabels(opts) {
  const email = str(opts && opts.email);
  const tail = buildSummaryTail(opts);
  return {
    tail,
    summaryLabel: buildSummaryLabel(email, tail),
  };
}

module.exports = {
  buildSummaryTail,
  buildSummaryLabel,
  buildRecentProfileLabels,
};
