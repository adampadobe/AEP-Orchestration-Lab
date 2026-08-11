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

test('rejects publishing when a required mapped field has no sample value', () => {
  assert.throws(
    () => contract.validateMappedData({}, [{ target: 'Gate', source: 'gate', required: true }]),
    (error) => error.code === 'PDF_JOURNEY_TEMPLATE_SAMPLE_INCOMPLETE',
  );
});
