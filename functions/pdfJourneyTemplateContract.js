'use strict';

const PizZip = require('pizzip');
const { DOMParser } = require('@xmldom/xmldom');
const core = require('./pdfPersonalisationCore');

const CANONICAL_SOURCES = Object.freeze([
  'bookingReference', 'ticketNumber', 'flightNumber', 'carrierCode', 'flightDate',
  'firstName', 'lastName', 'passengerName',
  'departureAirport', 'arrivalAirport', 'originCity', 'destinationCity',
  'departureAirportName', 'arrivalAirportName', 'departureTerminal', 'arrivalTerminal',
  'departureDateTime', 'arrivalDateTime', 'boardingTime', 'departureTime',
  'gate', 'seat', 'zone', 'totalPaid', 'currency',
  'Barcode', 'FF_Image', 'Offer',
]);

const FIELD_ALIASES = Object.freeze({
  flight: 'carrierCode',
  flightnumber: 'flightNumber',
  date: 'flightDate',
  passengername: 'passengerName',
  bookingref: 'bookingReference',
  bookingreference: 'bookingReference',
  boarding: 'originCity',
  destination: 'destinationCity',
  ocode: 'departureAirport',
  boardingairport: 'departureAirportName',
  terminal: 'departureTerminal',
  dcode: 'arrivalAirport',
  destinationairport: 'arrivalAirportName',
  dterminal: 'arrivalTerminal',
  btime: 'boardingTime',
  dtime: 'departureTime',
  gate: 'gate',
  seat: 'seat',
  zone: 'zone',
  barcode: 'Barcode',
  ffimage: 'FF_Image',
  offer: 'Offer',
});

function plainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizedKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function cleanTemplateField(value) {
  return String(value || '').trim().replace(/^`|`$/g, '').trim().slice(0, 120);
}

function uniqueFields(fields) {
  const seen = new Set();
  return fields.filter((field) => {
    const key = `${field.type}:${field.name}`;
    if (!field.name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function textContent(node) {
  let result = '';
  const walk = (current) => {
    if (!current) return;
    if (current.nodeType === 3 || current.nodeType === 4) result += current.data || '';
    for (let child = current.firstChild; child; child = child.nextSibling) walk(child);
  };
  walk(node);
  return result;
}

function extractDocxFields(bytes) {
  let zip;
  try {
    zip = new PizZip(bytes);
  } catch (_error) {
    throw new core.PdfPersonalisationError(
      'The DOCX template could not be opened.',
      400,
      'PDF_JOURNEY_TEMPLATE_DOCX_INVALID',
    );
  }
  const partNames = Object.keys(zip.files).filter((name) => (
    /^word\/(?:document|header\d+|footer\d+)\.xml$/.test(name)
  ));
  if (!partNames.includes('word/document.xml')) {
    throw new core.PdfPersonalisationError(
      'The DOCX template does not contain word/document.xml.',
      400,
      'PDF_JOURNEY_TEMPLATE_DOCX_INVALID',
    );
  }
  const fields = [];
  partNames.forEach((partName) => {
    const document = new DOMParser().parseFromString(zip.file(partName).asText(), 'application/xml');
    const paragraphs = Array.from(document.getElementsByTagName('w:p'));
    paragraphs.forEach((paragraph) => {
      const runs = Array.from(paragraph.getElementsByTagName('w:t'));
      const combined = runs.map((run) => textContent(run)).join('');
      const pattern = /{{\s*([^{}]+?)\s*}}/g;
      let match;
      while ((match = pattern.exec(combined))) {
        fields.push({ name: cleanTemplateField(match[1]), type: 'text' });
      }
    });
    const drawings = Array.from(document.getElementsByTagName('wp:docPr'));
    drawings.forEach((drawing) => {
      const description = String(drawing.getAttribute('descr') || '').trim();
      if (!description) return;
      try {
        const metadata = JSON.parse(description);
        const name = cleanTemplateField(metadata['location-path']);
        if (name) fields.push({ name, type: 'image' });
      } catch (_error) {
        // Decorative image descriptions are not merge fields.
      }
    });
  });
  return uniqueFields(fields);
}

function extractHtmlFields(html) {
  const fields = [];
  const pattern = /{{{?\s*([^{}#\/!][^{}]*?)\s*}?}}/g;
  let match;
  while ((match = pattern.exec(String(html || '')))) {
    const expression = String(match[1] || '').trim().split(/\s+/)[0];
    const name = cleanTemplateField(expression.replace(/^data\./, ''));
    if (name) fields.push({ name, type: 'text' });
  }
  return uniqueFields(fields);
}

function suggestSource(fieldName) {
  const normalized = normalizedKey(fieldName);
  if (FIELD_ALIASES[normalized]) return FIELD_ALIASES[normalized];
  return CANONICAL_SOURCES.find((source) => normalizedKey(source) === normalized) || '';
}

function analyseTemplate(sourceFile) {
  const rawName = String(sourceFile && (sourceFile.fileName || sourceFile.name) || '').trim();
  const extension = String(rawName.split('.').pop() || '').toLowerCase();
  if (extension === 'html' || extension === 'htm') {
    const base64 = String(sourceFile.base64 || '').replace(/\s+/g, '');
    const html = core.validateHtmlTemplate(Buffer.from(base64, 'base64').toString('utf8'));
    const fields = extractHtmlFields(html);
    return {
      kind: 'html',
      sourceFileName: rawName,
      fields,
      suggestedMappings: fields.map((field) => ({
        target: field.name,
        source: suggestSource(field.name),
        required: true,
        type: field.type,
      })),
      canonicalSources: CANONICAL_SOURCES,
    };
  }
  const normalized = core.normaliseSourceDocument(sourceFile);
  const fields = extension === 'docx' ? extractDocxFields(normalized.buffer) : [];
  return {
    kind: 'document',
    sourceFileName: normalized.fileName,
    fields,
    suggestedMappings: fields.map((field) => ({
      target: field.name,
      source: suggestSource(field.name),
      required: field.type === 'text',
      type: field.type,
    })),
    canonicalSources: CANONICAL_SOURCES,
  };
}

function normalizeMappings(fields, value) {
  const supplied = Array.isArray(value) ? value : [];
  const byTarget = new Map(supplied.map((item) => [String(item && item.target || '').trim(), item || {}]));
  return fields.map((field) => {
    const input = byTarget.get(field.name) || {};
    const source = String(input.source || suggestSource(field.name)).trim();
    if (!source || !CANONICAL_SOURCES.includes(source)) {
      throw new core.PdfPersonalisationError(
        `Map template field "${field.name}" to a supported AJO payload field.`,
        400,
        'PDF_JOURNEY_TEMPLATE_MAPPING_REQUIRED',
      );
    }
    return {
      target: field.name,
      source,
      required: input.required === undefined ? field.type === 'text' : input.required === true,
      type: field.type,
    };
  });
}

function getPath(value, path) {
  return String(path || '').split('.').reduce((current, key) => (
    current && Object.prototype.hasOwnProperty.call(current, key) ? current[key] : undefined
  ), value);
}

function formatFlightDate(value) {
  const parsed = new Date(String(value || ''));
  if (!Number.isFinite(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(parsed).toUpperCase();
}

function canonicalContext(data, recipient = {}) {
  const input = plainObject(data) ? data : {};
  const firstName = String(input.firstName || recipient.firstName || '').trim();
  const lastName = String(input.lastName || recipient.lastName || '').trim();
  const flightNumber = String(input.flightNumber || '').trim();
  return {
    ...input,
    firstName,
    lastName,
    passengerName: String(input.passengerName || `${firstName} ${lastName}`).trim(),
    carrierCode: String(input.carrierCode || flightNumber.split(/\s+/)[0] || '').trim(),
    flightDate: String(input.flightDate || formatFlightDate(input.departureDateTime)).trim(),
  };
}

function applyMappings(data, mappings, recipient = {}) {
  const output = JSON.parse(JSON.stringify(plainObject(data) ? data : {}));
  const context = canonicalContext(output, recipient);
  (Array.isArray(mappings) ? mappings : []).forEach((mapping) => {
    output[mapping.target] = getPath(context, mapping.source);
  });
  return output;
}

function validateMappedData(data, mappings) {
  const missing = (Array.isArray(mappings) ? mappings : []).filter((mapping) => {
    if (!mapping.required) return false;
    const value = data[mapping.target];
    return value === undefined || value === null || String(value).trim() === '';
  }).map((mapping) => mapping.target);
  if (missing.length) {
    throw new core.PdfPersonalisationError(
      `Sample JSON does not provide required template fields: ${missing.join(', ')}.`,
      400,
      'PDF_JOURNEY_TEMPLATE_SAMPLE_INCOMPLETE',
    );
  }
  return { missing: [] };
}

module.exports = {
  CANONICAL_SOURCES,
  extractDocxFields,
  extractHtmlFields,
  suggestSource,
  analyseTemplate,
  normalizeMappings,
  canonicalContext,
  applyMappings,
  validateMappedData,
};
