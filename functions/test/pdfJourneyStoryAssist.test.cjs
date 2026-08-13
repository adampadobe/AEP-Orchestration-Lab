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
  assert.deepEqual(result.recipient, {
    emailAddress: 'traveller@example.com',
    firstName: 'Amelia',
    lastName: 'Morgan',
    documentName: 'boarding-pass.pdf',
  });
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

test('requires a complete generated scenario and reuses safe form images and delivery email', async () => {
  let capturedPayload;
  let capturedOptions;
  const result = await assist.suggest({
    ownerUid: 'story-user-complete',
    story: 'Create a premium Riyadh to Dubai boarding pass next month.',
    templateName: 'riyadh-pass',
    templateLabel: 'Riyadh Air boarding pass',
    documentName: 'riyadh-pass.pdf',
    recipient: { emailAddress: 'test-recipient@example.com' },
    currentValues: { Offer: 'https://example.com/hosted-offer.png' },
    inputSchema: [
      { name: 'bookingReference', label: 'Booking reference', dataType: 'string' },
      { name: 'departureDateTime', label: 'Departure date time', dataType: 'dateTime' },
      { name: 'totalPaid', label: 'Total paid', dataType: 'decimal' },
      { name: 'Offer', label: 'Special offer', dataType: 'image' },
    ],
  }, {
    callGemini: async (_systemPrompt, userPrompt, options) => {
      capturedPayload = JSON.parse(userPrompt);
      capturedOptions = options;
      return JSON.stringify({
        recipient: { emailAddress: 'generated@example.com', firstName: 'Noura', lastName: 'Al-Saud', documentName: 'noura-pass.pdf' },
        values: {
          bookingReference: 'RA7K2P',
          departureDateTime: '2026-09-18T09:15:00+03:00',
          totalPaid: 825,
        },
        missingFields: ['Offer'],
        summary: 'Created a premium Riyadh to Dubai boarding-pass scenario.',
      });
    },
    now: () => new Date('2026-08-13T12:00:00Z'),
    randomUUID: () => 'scenario-seed-123',
  });

  assert.equal(capturedPayload.generationContext.randomSeed, 'scenario-seed-123');
  assert.equal(capturedPayload.generationContext.currentDate, '2026-08-13T12:00:00.000Z');
  assert.equal(capturedPayload.availableImageValues.Offer, 'https://example.com/hosted-offer.png');
  assert.equal(capturedPayload.currentRecipient.emailAddress, 'test-recipient@example.com');
  assert.equal(capturedPayload.currentRecipient.firstName, undefined);
  assert.equal(capturedOptions.temperature, 0.75);
  assert.deepEqual(capturedOptions.responseSchema.properties.values.required, [
    'bookingReference', 'departureDateTime', 'totalPaid', 'Offer',
  ]);
  assert.equal(result.recipient.emailAddress, 'test-recipient@example.com');
  assert.equal(result.recipient.firstName, 'Noura');
  assert.equal(result.values.Offer, 'https://example.com/hosted-offer.png');
  assert.deepEqual(result.missingFields, []);
});

test('uses an email explicitly supplied in the story over the current delivery email', () => {
  const result = assist.completeRecipient({
    recipient: { firstName: 'Aisha', lastName: 'Khan', documentName: 'pass.pdf' },
    values: {},
    missingFields: [],
    summary: 'Scenario generated.',
  }, { emailAddress: 'current@example.com' }, { name: 'boarding-pass' }, 'Send it to new.recipient@example.com');
  assert.equal(result.recipient.emailAddress, 'new.recipient@example.com');
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
