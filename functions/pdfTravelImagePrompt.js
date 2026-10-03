'use strict';

const crypto = require('crypto');

const IATA_CITY = {
  RUH: 'Riyadh', JED: 'Jeddah', DMM: 'Dammam', AUH: 'Abu Dhabi', DXB: 'Dubai', DOH: 'Doha',
  LHR: 'London', LGW: 'London', CDG: 'Paris', AMS: 'Amsterdam', FCO: 'Rome', MAD: 'Madrid',
  BCN: 'Barcelona', LIS: 'Lisbon', ATH: 'Athens', IST: 'Istanbul', FRA: 'Frankfurt', MUC: 'Munich',
  ZRH: 'Zurich', VIE: 'Vienna', CPH: 'Copenhagen', DUB: 'Dublin', EDI: 'Edinburgh', JFK: 'New York',
  LAX: 'Los Angeles', SFO: 'San Francisco', MIA: 'Miami', SIN: 'Singapore', HND: 'Tokyo', NRT: 'Tokyo',
  HKG: 'Hong Kong', BKK: 'Bangkok', SYD: 'Sydney', CPT: 'Cape Town', CAI: 'Cairo', MLE: 'Maldives',
};

const NEGATIVE_PROMPT = 'text, words, letters, logos, watermarks, people, faces, crowds, distorted architecture, low quality';

function clean(value, max = 80) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f<>{}"`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function firstFlight(data) {
  return Array.isArray(data.flightDetails) && data.flightDetails[0] && typeof data.flightDetails[0] === 'object'
    ? data.flightDetails[0]
    : {};
}

function resolveDestination(data = {}) {
  const input = data && typeof data === 'object' ? data : {};
  const flight = firstFlight(input);
  const destination = input.destination && typeof input.destination === 'object' ? input.destination : {};
  const city = clean(
    input.destinationCity
      || destination.city
      || (typeof input.destination === 'string' ? input.destination : '')
      || input.arrivalCity,
  );
  if (city) return city;
  const airportName = clean(input.arrivalAirportName || flight.arrivalAirportName);
  if (airportName) return airportName.replace(/\b(international\s+)?airport\b/ig, '').trim() || airportName;
  const code = clean(input.arrivalAirport || flight.arrivalAirport || destination.code, 8).toUpperCase();
  if (code) return IATA_CITY[code] || code;
  return '';
}

function seasonFor(value) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return '';
  const month = date.getUTCMonth();
  if (month <= 1 || month === 11) return 'winter';
  if (month <= 4) return 'spring';
  if (month <= 7) return 'summer';
  return 'autumn';
}

function buildTravelImagePrompt(data = {}) {
  const destination = resolveDestination(data);
  if (!destination) return null;
  const flight = firstFlight(data || {});
  const season = seasonFor((data && data.departureDateTime) || flight.departureDateTime);
  const when = season ? ` in ${season}` : '';
  return {
    destination,
    season: season || null,
    prompt: `Editorial premium travel photograph of ${destination}${when}, iconic landmark and skyline at golden hour, `
      + 'warm natural light, wide cinematic composition, magazine quality, no text, no logos, no people.',
    negativePrompt: NEGATIVE_PROMPT,
  };
}

function promptHash({ provider, model, prompt, aspectRatio }) {
  return crypto
    .createHash('sha256')
    .update([provider || '', model || '', prompt || '', aspectRatio || ''].join('|'))
    .digest('hex')
    .slice(0, 40);
}

module.exports = {
  NEGATIVE_PROMPT,
  buildTravelImagePrompt,
  promptHash,
  resolveDestination,
  seasonFor,
};
