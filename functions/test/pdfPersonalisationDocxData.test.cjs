'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PizZip = require('pizzip');
const converter = require('../pdfPersonalisationDocxData');

function sourceWithParagraphs(lines, fileName = 'personalisation-data.docx') {
  const paragraphs = lines.map((line) => `<w:p><w:r><w:t xml:space="preserve">${line}</w:t></w:r></w:p>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>${paragraphs}</w:body>
    </w:document>`;
  const zip = new PizZip();
  zip.folder('word').file('document.xml', xml);
  return {
    fileName,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    base64: zip.generate({ type: 'nodebuffer' }).toString('base64'),
  };
}

test('extracts and repairs a JSON object stored as Word paragraphs', async () => {
  const result = await converter.convertDocxToJson(sourceWithParagraphs([
    '{',
    '“PassengerName”: “Darakhshan Khan”,',
    '“Flight Number”: “RX 123”,',
    '}',
  ]));
  assert.equal(result.format, 'json-text');
  assert.equal(result.fieldCount, 2);
  assert.deepEqual(result.data, {
    PassengerName: 'Darakhshan Khan',
    'Flight Number': 'RX 123',
  });
});

test('converts key-value Word paragraphs and dotted keys into nested JSON', async () => {
  const result = await converter.convertDocxToJson(sourceWithParagraphs([
    'passenger.firstName: Amelia',
    'passenger.lastName: Palmer',
    'checkedIn = true',
    'bags: 2',
  ]));
  assert.equal(result.format, 'key-value');
  assert.deepEqual(result.data, {
    passenger: { firstName: 'Amelia', lastName: 'Palmer' },
    checkedIn: true,
    bags: 2,
  });
});

test('rejects Word documents without JSON or key-value data', async () => {
  await assert.rejects(
    converter.convertDocxToJson(sourceWithParagraphs(['This is ordinary prose.'])),
    (error) => error.code === 'PDF_DATA_DOCX_CONTENT_INVALID',
  );
});
