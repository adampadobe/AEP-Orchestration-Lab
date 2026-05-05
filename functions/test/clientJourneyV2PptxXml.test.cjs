/**
 * Guard: PPTX slide XML must contain exactly one XML declaration after
 * DOM round-trip (double declarations break PowerPoint open).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

const TEMPLATE = path.join(__dirname, '..', 'assets', 'client-journey-v2-template.pptx');

test('slide1.xml serializes with a single XML declaration (xmldom)', () => {
  const zip = new PizZip(fs.readFileSync(TEMPLATE));
  const slideXmlStr = zip.file('ppt/slides/slide1.xml').asText();
  const doc = new DOMParser().parseFromString(slideXmlStr, 'text/xml');
  const serialized = new XMLSerializer().serializeToString(doc);
  const decls = serialized.match(/<\?xml/g) || [];
  assert.equal(decls.length, 1, 'expected exactly one <?xml in serialized slide');
});

test('anti-pattern: prepending declaration duplicates header', () => {
  const zip = new PizZip(fs.readFileSync(TEMPLATE));
  const slideXmlStr = zip.file('ppt/slides/slide1.xml').asText();
  const doc = new DOMParser().parseFromString(slideXmlStr, 'text/xml');
  const serialized = new XMLSerializer().serializeToString(doc);
  const doubled =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + serialized;
  const badCount = (doubled.match(/<\?xml/g) || []).length;
  assert.equal(badCount, 2, 'fixture should show why double-declaration is invalid');
});
