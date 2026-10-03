'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const prompt = require('../pdfTravelImagePrompt');

test('resolveDestination prefers city, then airport name, then IATA code', () => {
  assert.equal(prompt.resolveDestination({ destinationCity: 'Lisbon', arrivalAirport: 'LHR' }), 'Lisbon');
  assert.equal(prompt.resolveDestination({ arrivalAirportName: 'Dubai International Airport' }), 'Dubai');
  assert.equal(prompt.resolveDestination({ flightDetails: [{ arrivalAirport: 'cdg' }] }), 'Paris');
  assert.equal(prompt.resolveDestination({ destination: { code: 'ZZZ' } }), 'ZZZ');
  assert.equal(prompt.resolveDestination({}), '');
});

test('buildTravelImagePrompt is generic, sanitised and seasonal', () => {
  const out = prompt.buildTravelImagePrompt({
    destinationCity: 'Rome<script>',
    departureDateTime: '2026-07-10T09:00:00Z',
    firstName: 'Alex',
    email: 'alex@example.com',
  });
  assert.equal(out.destination, 'Rome script');
  assert.equal(out.season, 'summer');
  assert.match(out.prompt, /Rome script in summer/);
  assert.doesNotMatch(out.prompt, /Alex|example\.com|</);
  assert.equal(out.negativePrompt, prompt.NEGATIVE_PROMPT);
  assert.equal(prompt.buildTravelImagePrompt({}), null);
});

test('promptHash is stable and varies with provider and aspect', () => {
  const base = { provider: 'firefly', model: 'image5', prompt: 'p', aspectRatio: '16:9' };
  assert.equal(prompt.promptHash(base), prompt.promptHash({ ...base }));
  assert.notEqual(prompt.promptHash(base), prompt.promptHash({ ...base, aspectRatio: '1:1' }));
  assert.notEqual(prompt.promptHash(base), prompt.promptHash({ ...base, provider: 'foundry' }));
});

test('seasonFor handles invalid dates', () => {
  assert.equal(prompt.seasonFor('nope'), '');
  assert.equal(prompt.seasonFor('2026-01-05'), 'winter');
});
