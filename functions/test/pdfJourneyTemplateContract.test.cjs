'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PizZip = require('pizzip');
const contract = require('../pdfJourneyTemplateContract');

function docxFixture() {
  const zip = new PizZip();
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
      xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
      <w:body>
        <w:p><w:r><w:t>{{</w:t></w:r><w:r><w:t>PassengerName</w:t></w:r><w:r><w:t>}}</w:t></w:r></w:p>
        <w:p><w:r><w:t>{{\`Flight Number\`}}</w:t></w:r></w:p>
        <w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Picture" descr="{&quot;location-path&quot;:&quot;Barcode&quot;}"/></wp:inline></w:drawing></w:r></w:p>
      </w:body>
    </w:document>`);
  return zip.generate({ type: 'nodebuffer' });
}

test('detects fragmented DOCX text tags and Adobe image placeholders', () => {
  const analysis = contract.analyseTemplate({
    fileName: 'boarding-pass.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    base64: docxFixture().toString('base64'),
  });
  assert.deepEqual(analysis.fields, [
    { name: 'PassengerName', type: 'text' },
    { name: 'Flight Number', type: 'text' },
    { name: 'Barcode', type: 'image' },
  ]);
  assert.deepEqual(analysis.suggestedMappings.map(({ target, source }) => ({ target, source })), [
    { target: 'PassengerName', source: 'passengerName' },
    { target: 'Flight Number', source: 'flightNumber' },
    { target: 'Barcode', source: 'Barcode' },
  ]);
});

test('detects HTML data arguments without treating helpers as template fields', () => {
  const fields = contract.extractHtmlFields(`
    <p>{{data.firstName}}</p>
    <p>{{formatDateTime data.departureDateTime}}</p>
    <p>{{formatCurrency data.totalPaid data.currency}}</p>
  `);
  assert.deepEqual(fields, [
    { name: 'firstName', type: 'text' },
    { name: 'departureDateTime', type: 'text' },
    { name: 'totalPaid', type: 'text' },
    { name: 'currency', type: 'text' },
  ]);
});

test('recognises order-confirmation aliases without changing generic flight mappings', () => {
  const orderFields = [
    { name: 'Order ID' }, { name: 'Fno' }, { name: 'Flight' }, { name: 'TravelTime' },
  ];
  assert.equal(contract.suggestSource('Order ID', orderFields), 'bookingReference');
  assert.equal(contract.suggestSource('TravelTime', orderFields), 'travelTime');
  assert.equal(contract.suggestSource('Flight', orderFields), 'aircraftType');
  assert.equal(contract.suggestSource('Flight'), 'carrierCode');
});

test('maps the stable AJO payload into template-specific fields', () => {
  const mappings = [
    { target: 'PassengerName', source: 'passengerName', required: true, type: 'text' },
    { target: 'Flight Number', source: 'flightNumber', required: true, type: 'text' },
    { target: 'Date', source: 'flightDate', required: true, type: 'text' },
  ];
  const mapped = contract.applyMappings({
    flightNumber: 'RX 401',
    departureDateTime: '2026-08-12T09:15:00Z',
  }, mappings, { firstName: 'Adam', lastName: 'Palmer' });
  assert.equal(mapped.PassengerName, 'Adam Palmer');
  assert.equal(mapped['Flight Number'], 'RX 401');
  assert.equal(mapped.Date, '12 AUG 2026');
  assert.deepEqual(contract.validateMappedData(mapped, mappings), { missing: [] });
});

test('uses template-shaped sample values when canonical AJO fields are not present', () => {
  const mappings = contract.normalizeMappings([
    { name: 'Order ID', type: 'text' },
    { name: 'TravelTime', type: 'text' },
    { name: 'Destination_Image', type: 'image' },
  ], [
    { target: 'Order ID', source: 'bookingReference', required: true, type: 'text' },
    { target: 'TravelTime', source: 'travelTime', required: true, type: 'text' },
    { target: 'Destination_Image', source: 'FF_Image', required: false, type: 'image' },
  ], { allowFieldSelection: true });
  const templateSample = {
    'Order ID': 'RX12236YX28SR',
    TravelTime: '1hr 40 Mins',
    Destination_Image: 'https://example.com/riyadh.png',
  };
  const mapped = contract.applyMappings(templateSample, mappings);
  assert.equal(mapped['Order ID'], 'RX12236YX28SR');
  assert.equal(mapped.TravelTime, '1hr 40 Mins');
  assert.equal(mapped.Destination_Image, 'https://example.com/riyadh.png');
  assert.deepEqual(contract.validateMappedData(mapped, mappings), { missing: [] });
  const canonicalSample = contract.sampleDataForMappings(templateSample, mapped, mappings);
  assert.equal(canonicalSample.bookingReference, 'RX12236YX28SR');
  assert.equal(canonicalSample.travelTime, '1hr 40 Mins');
  assert.equal(canonicalSample.FF_Image, 'https://example.com/riyadh.png');
});

test('allows editable publication mappings to add custom fields and remove detected fields', () => {
  const mappings = contract.normalizeMappings([
    { name: 'Order ID', type: 'text' },
    { name: 'Unused tag', type: 'text' },
  ], [
    { target: 'Order ID', source: 'bookingReference', required: true, type: 'text' },
    { target: 'Aircraft', source: 'aircraftType', required: false, type: 'text' },
  ], { allowFieldSelection: true });
  assert.deepEqual(mappings, [
    { target: 'Order ID', source: 'bookingReference', required: true, type: 'text' },
    { target: 'Aircraft', source: 'aircraftType', required: false, type: 'text' },
  ]);
  assert.throws(
    () => contract.normalizeMappings([], [{ target: 'Unsafe', source: 'data.aircraft' }], { allowFieldSelection: true }),
    (error) => error.code === 'PDF_JOURNEY_TEMPLATE_MAPPING_REQUIRED',
  );
});

test('rejects publishing when a required mapped field has no sample value', () => {
  assert.throws(
    () => contract.validateMappedData({}, [{ target: 'Gate', source: 'gate', required: true }]),
    (error) => error.code === 'PDF_JOURNEY_TEMPLATE_SAMPLE_INCOMPLETE',
  );
});

test('builds a deduplicated dynamic input schema from published mappings', () => {
  const schema = contract.buildInputSchema([
    { target: 'Flight Number', source: 'flightNumber', required: true, type: 'text' },
    { target: 'Flight', source: 'flightNumber', required: false, type: 'text' },
    { target: 'Barcode', source: 'Barcode', required: false, type: 'image' },
    { target: 'Date', source: 'departureDateTime', required: true, type: 'text' },
  ], {
    flightNumber: 'RX 401',
    departureDateTime: '2026-08-12T09:15:00+03:00',
    Barcode: 'https://example.com/barcode.png',
  });
  assert.deepEqual(schema.map((field) => field.name), ['flightNumber', 'Barcode', 'departureDateTime']);
  assert.equal(schema[0].required, true);
  assert.deepEqual(schema[0].targetFields, ['Flight Number', 'Flight']);
  assert.equal(schema[1].dataType, 'image');
  assert.equal(schema[2].dataType, 'dateTime');
});

test('builds input schema entries for safe custom AJO fields', () => {
  const schema = contract.buildInputSchema([
    { target: 'TravelTime', source: 'travelTime', required: true, type: 'text' },
    { target: 'Aircraft', source: 'aircraftType', required: false, type: 'text' },
  ], { travelTime: '1hr 40 Mins', aircraftType: 'Boeing 787-9' });
  assert.deepEqual(schema.map((field) => ({ name: field.name, label: field.label, required: field.required })), [
    { name: 'travelTime', label: 'Travel duration', required: true },
    { name: 'aircraftType', label: 'Aircraft type', required: false },
  ]);
});
