'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const assist = require('../pdfJourneyStoryAssist');

test('normalizes Gemini output to selected template fields only', async () => {
  const result = await assist.suggest({
    ownerUid: 'story-user-normalise',
    story: 'Amelia flies EK 001 from DXB to LHR and sits in 12A.',
    templateName: 'boarding-pass',
    inputSchema: [
      { name: 'flightNumber', dataType: 'string', required: true },
      { name: 'seat', dataType: 'string' },
      { name: 'totalPaid', dataType: 'decimal' },
      { name: 'Offer', dataType: 'image' },
    ],
  }, {
    callGemini: async () => JSON.stringify({
      recipient: { firstName: 'Amelia', documentName: 'boarding-pass' },
      values: {
        flightNumber: 'EK 001', seat: '12A', totalPaid: '120.50', Offer: 'http://unsafe.test/a.png', ignored: 'no',
      },
      missingFields: ['Offer', 'gate', 'Offer'],
      summary: 'Extracted a flight and seat.',
    }),
    now: () => new Date('2026-08-13T10:00:00Z'),
  });
  assert.deepEqual(result.recipient, { firstName: 'Amelia', documentName: 'boarding-pass.pdf' });
  assert.deepEqual(result.values, { flightNumber: 'EK 001', seat: '12A', totalPaid: 120.5 });
  assert.deepEqual(result.missingFields, ['Offer']);
  assert.equal(result.model, 'gemini-2.5-flash');
});

test('completes non-image fields from template defaults without auto-selecting images', () => {
  const result = assist.completeWithDefaults({
    recipient: {},
    values: { flightNumber: 'RX 401' },
    missingFields: ['departureAirportName', 'Offer'],
    summary: 'Flight extracted.',
  }, {
    departureAirportName: 'King Khalid International Airport',
    Offer: 'https://example.com/offer.png',
  }, [
    { name: 'flightNumber', dataType: 'string' },
    { name: 'departureAirportName', dataType: 'string' },
    { name: 'Offer', dataType: 'image' },
  ]);
  assert.equal(result.values.departureAirportName, 'King Khalid International Airport');
  assert.equal(result.values.Offer, undefined);
  assert.deepEqual(result.missingFields, ['Offer']);
});

test('rejects short stories and templates without a field schema', async () => {
  await assert.rejects(
    assist.suggest({ ownerUid: 'story-user-short', story: 'flight', inputSchema: [{ name: 'seat' }] }),
    (error) => error.code === 'PDF_STORY_ASSIST_STORY_REQUIRED' && error.status === 400,
  );
  await assert.rejects(
    assist.suggest({ ownerUid: 'story-user-schema', story: 'A sufficiently descriptive booking story.', inputSchema: [] }),
    (error) => error.code === 'PDF_STORY_ASSIST_SCHEMA_REQUIRED' && error.status === 400,
  );
});

test('converts Gemini failures into a bounded service error', async () => {
  await assert.rejects(
    assist.suggest({
      ownerUid: 'story-user-failure',
      story: 'A sufficiently descriptive booking story.',
      inputSchema: [{ name: 'seat', dataType: 'string' }],
    }, { callGemini: async () => { throw new Error('private upstream details'); } }),
    (error) => error.code === 'PDF_STORY_ASSIST_FAILED' && error.status === 502 && !error.message.includes('private'),
  );
});
