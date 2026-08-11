'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../pdfJourneyActionService');
const templates = require('../pdfJourneyTemplates');
const core = require('../pdfPersonalisationCore');

function firestoreFixture() {
  const records = new Map();
  function refFor(id) {
    return {
      id,
      async get() {
        const value = records.get(id);
        return { exists: !!value, data: () => structuredClone(value) };
      },
      async set(value, options) {
        const next = options && options.merge
          ? { ...(records.get(id) || {}), ...structuredClone(value) }
          : structuredClone(value);
        records.set(id, next);
      },
    };
  }
  return {
    records,
    collection() {
      return { doc: refFor };
    },
    async runTransaction(callback) {
      return callback({
        async get(ref) { return ref.get(); },
        set(ref, value, options) {
          const previous = records.get(ref.id) || {};
          records.set(ref.id, options && options.merge
            ? { ...previous, ...structuredClone(value) }
            : structuredClone(value));
        },
      });
    },
  };
}

function bookingRequest(overrides = {}) {
  return {
    requestId: 'journey-test-12345678',
    templateName: 'booking-confirmation',
    emailAddress: 'Traveller@Example.com',
    firstName: 'Amelia',
    lastName: 'Palmer',
    documentName: 'booking-EK8F2Q.pdf',
    data: {
      bookingReference: 'EK8F2Q',
      ticketNumber: '1761234567890',
      flightNumber: 'EK 001',
      departureAirport: 'DXB',
      arrivalAirport: 'LHR',
      departureDateTime: '2026-08-12T07:45:00Z',
      arrivalDateTime: '2026-08-12T15:10:00Z',
      totalPaid: 1280.5,
      currency: 'GBP',
    },
    ...overrides,
  };
}

test('exposes the two built-in journey templates', () => {
  assert.deepEqual(templates.listTemplates().map((item) => item.name), [
    'booking-confirmation',
    'checkin-confirmation',
  ]);
  assert.match(templates.getTemplate('booking-confirmation').htmlTemplate, /Booking reference/);
  assert.match(templates.getTemplate('checkin-confirmation').htmlTemplate, /CHECK-IN CONFIRMED/);
  assert.throws(
    () => templates.getTemplate('unknown'),
    (error) => error.code === 'PDF_JOURNEY_TEMPLATE_INVALID',
  );
});

test('normalises flat journey booking fields for the HTML template', () => {
  const input = service.normaliseRequest(bookingRequest());
  assert.equal(input.recipient.emailAddress, 'traveller@example.com');
  assert.deepEqual(input.data.passenger, { firstName: 'Amelia', lastName: 'Palmer' });
  assert.equal(input.data.flightDetails[0].flightNumber, 'EK 001');
  assert.equal(input.data.fareDetails.totalPaid, 1280.5);
  assert.equal(input.documentName, 'booking-EK8F2Q.pdf');
  assert.equal(input.campaignId, service.DEFAULT_CAMPAIGN_ID);
});

test('accepts a valid per-request campaign override and rejects invalid IDs', () => {
  const campaignId = '97b40686-ed37-4697-a137-10d18e4902f5';
  const input = service.normaliseRequest(bookingRequest({ campaignId }));
  assert.equal(input.campaignId, campaignId);
  assert.equal(
    service.normaliseRequest(bookingRequest({ campaignId: '   ' })).campaignId,
    service.DEFAULT_CAMPAIGN_ID,
  );
  assert.throws(
    () => service.normaliseRequest(bookingRequest({ campaignId: 'not-a-campaign-id' })),
    (error) => error.code === 'PDF_JOURNEY_CAMPAIGN_ID_INVALID',
  );
});

test('normalises flat check-in fields into the nested template contract', () => {
  const input = service.normaliseRequest(bookingRequest({
    templateName: 'checkin-confirmation',
    data: {
      bookingReference: 'RX8F2Q',
      flightNumber: 'RX 123',
      originCode: 'RUH',
      originCity: 'Riyadh',
      destinationCode: 'JED',
      destinationCity: 'Jeddah',
      boardingTime: '08:30',
      gate: 'A12',
      seat: '24A',
      zone: '3',
    },
  }));
  assert.equal(input.data.origin.code, 'RUH');
  assert.equal(input.data.destination.code, 'JED');
  assert.equal(input.data.times.boarding, '08:30');
  assert.equal(input.data.passenger.firstName, 'Amelia');
});

test('persists owner-scoped uploaded template metadata in the queued job contract', () => {
  const input = service.normaliseRequest(bookingRequest({ templateName: 'airport-welcome' }), {
    resolvedTemplate: {
      name: 'airport-welcome',
      subject: 'Airport welcome',
      documentName: 'airport-welcome.pdf',
      kind: 'document',
      source: 'uploaded',
      sourceHash: 'a'.repeat(64),
      sourceFileName: 'airport-welcome.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      objectPath: 'pdf-personalisation/journey-templates/owner/airport-welcome/source.docx',
      ownerUid: 'user-1',
    },
  });
  assert.equal(input.templateKind, 'document');
  assert.equal(input.templateSource, 'uploaded');
  assert.equal(input.templateOwnerUid, 'user-1');
  assert.equal(input.templateSourceName, 'airport-welcome.docx');
  assert.equal(input.data.firstName, 'Amelia');
  assert.equal(input.data.Barcode, undefined);
});

test('preserves optional DOCX image variables using the document-merge data allowance', () => {
  const largeImageDataUri = `data:image/png;base64,${'A'.repeat(1_600_000)}`;
  const input = service.normaliseRequest(bookingRequest({
    templateName: 'ra-boarding-pass-template',
    data: {
      bookingReference: 'RA8F2Q',
      Barcode: largeImageDataUri,
      FF_Image: 'data:image/jpeg;base64,ZmFrZS1mZWF0dXJlLWltYWdl',
      Offer: 'data:image/png;base64,ZmFrZS1vZmZlci1pbWFnZQ==',
    },
  }), {
    resolvedTemplate: {
      name: 'ra-boarding-pass-template',
      subject: 'Your Riyadh Air boarding pass',
      documentName: 'riyadh-air-boarding-pass.pdf',
      kind: 'document',
      source: 'uploaded',
      sourceHash: 'b'.repeat(64),
      sourceFileName: 'Riyadh_Air_Boarding_Pass_Template.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      objectPath: 'pdf-personalisation/journey-templates/owner/ra-boarding-pass-template/source.docx',
      ownerUid: 'user-1',
    },
  });
  assert.equal(input.data.Barcode, largeImageDataUri);
  assert.match(input.data.FF_Image, /^data:image\/jpeg;base64,/);
  assert.match(input.data.Offer, /^data:image\/png;base64,/);
});

test('applies stored template mappings to the stable custom-action payload', () => {
  const input = service.normaliseRequest(bookingRequest({
    templateName: 'ra-boarding-pass-template',
    firstName: 'Adam',
    lastName: 'Palmer',
    data: {
      bookingReference: 'RA8F2Q',
      flightNumber: 'RX 401',
      departureDateTime: '2026-08-12T09:15:00Z',
      boardingTime: '08:30',
    },
  }), {
    resolvedTemplate: {
      name: 'ra-boarding-pass-template',
      subject: 'Your Riyadh Air boarding pass',
      documentName: 'riyadh-air-boarding-pass.pdf',
      kind: 'document',
      source: 'uploaded',
      sourceHash: 'c'.repeat(64),
      sourceFileName: 'Riyadh_Air_Boarding_Pass_Template.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      objectPath: 'pdf-personalisation/journey-templates/owner/ra-boarding-pass-template/source.docx',
      ownerUid: 'user-1',
      version: 2,
      fieldMappings: [
        { target: 'PassengerName', source: 'passengerName', required: true, type: 'text' },
        { target: 'Flight Number', source: 'flightNumber', required: true, type: 'text' },
        { target: 'Date', source: 'flightDate', required: true, type: 'text' },
        { target: 'B_time', source: 'boardingTime', required: true, type: 'text' },
      ],
    },
  });
  assert.equal(input.data.PassengerName, 'Adam Palmer');
  assert.equal(input.data['Flight Number'], 'RX 401');
  assert.equal(input.data.Date, '12 AUG 2026');
  assert.equal(input.data.B_time, '08:30');
  assert.equal(input.templateVersion, 2);
});

test('renders both built-in templates from the flat custom-action contract', () => {
  const booking = service.normaliseRequest(bookingRequest());
  const bookingHtml = core.renderHtmlTemplate(
    templates.getTemplate(booking.templateName).htmlTemplate,
    booking.data,
  ).renderedHtml;
  assert.match(bookingHtml, /EK8F2Q/);
  assert.match(bookingHtml, /Amelia Palmer/);
  assert.doesNotMatch(bookingHtml, /{{/);

  const checkin = service.normaliseRequest(bookingRequest({
    templateName: 'checkin-confirmation',
    data: {
      bookingReference: 'RX8F2Q', flightNumber: 'RX 123',
      originCode: 'RUH', originCity: 'Riyadh',
      destinationCode: 'JED', destinationCity: 'Jeddah',
      boardingTime: '08:30', gate: 'A12', seat: '24A', zone: '3',
    },
  }));
  const checkinHtml = core.renderHtmlTemplate(
    templates.getTemplate(checkin.templateName).htmlTemplate,
    checkin.data,
  ).renderedHtml;
  assert.match(checkinHtml, /RX8F2Q/);
  assert.match(checkinHtml, /RUH/);
  assert.doesNotMatch(checkinHtml, /{{/);
});

test('enqueues once and reuses the same request without duplicating work', async () => {
  const firestore = firestoreFixture();
  const deps = { firestore, now: () => new Date('2026-08-11T15:00:00Z') };
  const first = await service.enqueue(bookingRequest(), deps);
  const second = await service.enqueue(bookingRequest(), deps);
  assert.equal(first.status, 'queued');
  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(first.jobId, second.jobId);
  await assert.rejects(
    service.enqueue(bookingRequest({ firstName: 'Different' }), deps),
    (error) => error.code === 'PDF_JOURNEY_IDEMPOTENCY_CONFLICT',
  );
});

test('builds the proven AEP recipient and DLZ attachment payload', () => {
  const campaignId = '97b40686-ed37-4697-a137-10d18e4902f5';
  const record = service.normaliseRequest(bookingRequest({ campaignId }));
  const payload = service.buildCampaignPayload(record, {
    documentName: 'booking-EK8F2Q.pdf',
    dlzObjectPath: 'pdf-personalisation/2026/08/11/job.pdf',
  });
  assert.equal(payload.recipients[0].type, 'aep');
  assert.equal(payload.recipients[0].userId, 'traveller@example.com');
  assert.equal(payload.recipients[0].namespace, 'Email');
  assert.equal(payload.campaignId, campaignId);
  assert.deepEqual(payload.recipients[0].attachments[0].source, {
    type: 'dlzPath',
    path: 'pdf-personalisation/2026/08/11/job.pdf',
  });
});

test('sends the campaign with Adobe headers and the stable request id', async () => {
  const record = service.normaliseRequest(bookingRequest());
  let captured;
  const result = await service.sendCampaign(record, {
    documentName: record.documentName,
    dlzObjectPath: 'pdf-personalisation/2026/08/11/job.pdf',
  }, {
    getAdobeAccessToken: async () => 'token',
    aepHeaders: (token) => ({ Authorization: `Bearer ${token}`, 'x-api-key': 'client' }),
    adobeSandbox: 'apalmer',
    fetch: async (url, options) => {
      captured = { url, options };
      return {
        status: 202,
        async json() { return { executionId: 'HUMA-123', requestId: record.requestId }; },
      };
    },
  });
  assert.equal(captured.url, service.AJO_EXECUTION_URL);
  assert.equal(captured.options.headers['x-sandbox-name'], 'apalmer');
  assert.equal(captured.options.headers['x-request-id'], record.requestId);
  assert.equal(JSON.parse(captured.options.body).recipients[0].type, 'aep');
  assert.deepEqual(result, { executionId: 'HUMA-123', requestId: record.requestId });
});

test('worker stores sent identifiers after PDF generation and campaign execution', async () => {
  const firestore = firestoreFixture();
  const deps = { firestore, now: () => new Date('2026-08-11T15:00:00Z') };
  const queued = await service.enqueue(bookingRequest(), deps);
  deps.generateAndStore = async () => ({
    jobId: 'pdf-job-1',
    documentName: 'booking-EK8F2Q.pdf',
    dlzObjectPath: 'pdf-personalisation/2026/08/11/pdf-job-1.pdf',
  });
  deps.sendCampaign = async () => ({ executionId: 'HUMA-456', requestId: queued.requestId });
  assert.equal(await service.processQueuedJob(queued.jobId, deps), 'sent');
  const status = await service.getStatus(queued.jobId, deps);
  assert.equal(status.status, 'sent');
  assert.equal(status.pdfJobId, 'pdf-job-1');
  assert.equal(status.ajoExecutionId, 'HUMA-456');
});
