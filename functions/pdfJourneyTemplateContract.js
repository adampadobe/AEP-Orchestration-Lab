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
  'arrivalTime', 'travelTime', 'aircraftType',
  'gate', 'seat', 'zone', 'totalPaid', 'currency',
  'Barcode', 'FF_Image', 'Offer',
]);

const CANONICAL_SOURCE_DEFINITIONS = Object.freeze({
  bookingReference: { label: 'Booking reference', dataType: 'string' },
  ticketNumber: { label: 'Ticket number', dataType: 'string' },
  flightNumber: { label: 'Flight number', dataType: 'string' },
  carrierCode: { label: 'Carrier code', dataType: 'string' },
  flightDate: { label: 'Flight date', dataType: 'string' },
  firstName: { label: 'First name', dataType: 'string', recipientField: true },
  lastName: { label: 'Last name', dataType: 'string', recipientField: true },
  passengerName: { label: 'Passenger name', dataType: 'string', recipientField: true },
  departureAirport: { label: 'Departure airport code', dataType: 'string' },
  arrivalAirport: { label: 'Arrival airport code', dataType: 'string' },
  originCity: { label: 'Origin city', dataType: 'string' },
  destinationCity: { label: 'Destination city', dataType: 'string' },
  departureAirportName: { label: 'Departure airport name', dataType: 'string' },
  arrivalAirportName: { label: 'Arrival airport name', dataType: 'string' },
  departureTerminal: { label: 'Departure terminal', dataType: 'string' },
  arrivalTerminal: { label: 'Arrival terminal', dataType: 'string' },
  departureDateTime: { label: 'Departure date and time', dataType: 'dateTime' },
  arrivalDateTime: { label: 'Arrival date and time', dataType: 'dateTime' },
  boardingTime: { label: 'Boarding time', dataType: 'string' },
  departureTime: { label: 'Display departure time', dataType: 'string' },
  arrivalTime: { label: 'Display arrival time', dataType: 'string' },
  travelTime: { label: 'Travel duration', dataType: 'string' },
  aircraftType: { label: 'Aircraft type', dataType: 'string' },
  gate: { label: 'Boarding gate', dataType: 'string' },
  seat: { label: 'Seat number', dataType: 'string' },
  zone: { label: 'Boarding zone', dataType: 'string' },
  totalPaid: { label: 'Total paid', dataType: 'decimal' },
  currency: { label: 'Currency', dataType: 'string' },
  Barcode: { label: 'Barcode image', dataType: 'image' },
  FF_Image: { label: 'Feature image', dataType: 'image' },
  Offer: { label: 'Offer image', dataType: 'image' },
});

const FIELD_ALIASES = Object.freeze({
  flight: 'carrierCode',
  flightnumber: 'flightNumber',
  date: 'flightDate',
  passengername: 'passengerName',
  bookingref: 'bookingReference',
  bookingreference: 'bookingReference',
  orderid: 'bookingReference',
  origin: 'originCity',
  traveltime: 'travelTime',
  time: 'departureTime',
  arrivaltime: 'arrivalTime',
  fno: 'flightNumber',
  guestname: 'passengerName',
  destinationimage: 'FF_Image',
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

function cleanPayloadField(value) {
  return String(value || '').trim().slice(0, 120);
}

function validPayloadField(value) {
  const field = cleanPayloadField(value);
  return /^[A-Za-z][A-Za-z0-9_]{0,119}$/.test(field)
    && !['__proto__', 'prototype', 'constructor'].includes(field);
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
  const helperNames = new Set(['formatDateTime', 'formatCurrency', 'lookup', 'log']);
  const pattern = /{{{?\s*([^{}]+?)\s*}?}}/g;
  let match;
  while ((match = pattern.exec(String(html || '')))) {
    const expression = String(match[1] || '').trim();
    if (!expression || /^[\/!]/.test(expression)) continue;
    const tokens = expression.split(/\s+/).map((token) => token.replace(/[()'"=]/g, '')).filter(Boolean);
    const dataFields = tokens
      .filter((token) => /^data\.[a-zA-Z0-9_.-]+$/.test(token))
      .map((token) => cleanTemplateField(token.replace(/^data\./, '')));
    if (dataFields.length) {
      dataFields.forEach((name) => fields.push({ name, type: 'text' }));
      continue;
    }
    const first = String(tokens[0] || '').replace(/^#/, '');
    if (!first || helperNames.has(first) || /^#/.test(expression)) continue;
    fields.push({ name: cleanTemplateField(first), type: 'text' });
  }
  return uniqueFields(fields);
}

function suggestSource(fieldName, templateFields = []) {
  const normalized = normalizedKey(fieldName);
  const fieldSet = new Set((Array.isArray(templateFields) ? templateFields : [])
    .map((field) => normalizedKey(field && field.name)));
  if (normalized === 'flight' && fieldSet.has('orderid') && fieldSet.has('fno')) return 'aircraftType';
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
        source: suggestSource(field.name, fields),
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
      source: suggestSource(field.name, fields),
      required: field.type === 'text',
      type: field.type,
    })),
    canonicalSources: CANONICAL_SOURCES,
  };
}

function normalizeMappings(fields, value, options = {}) {
  const supplied = Array.isArray(value) ? value : [];
  if (options.allowFieldSelection === true) {
    if (supplied.length > 100) {
      throw new core.PdfPersonalisationError(
        'A template can publish at most 100 mapped fields.',
        400,
        'PDF_JOURNEY_TEMPLATE_MAPPING_LIMIT',
      );
    }
    const detectedByTarget = new Map((Array.isArray(fields) ? fields : []).map((field) => [field.name, field]));
    const seen = new Set();
    return supplied.filter((item) => item && item.enabled !== false).map((item) => {
      const target = cleanTemplateField(item.target);
      const detected = detectedByTarget.get(target);
      const type = ((detected && detected.type === 'image') || item.type === 'image') ? 'image' : 'text';
      const source = cleanPayloadField(item.source || suggestSource(target));
      if (!target || /[{}\u0000-\u001f\u007f]/.test(target)) {
        throw new core.PdfPersonalisationError(
          'Each mapped template field needs a valid target name.',
          400,
          'PDF_JOURNEY_TEMPLATE_TARGET_INVALID',
        );
      }
      if (seen.has(target)) {
        throw new core.PdfPersonalisationError(
          `Template field "${target}" is mapped more than once.`,
          400,
          'PDF_JOURNEY_TEMPLATE_MAPPING_DUPLICATE',
        );
      }
      seen.add(target);
      if (!validPayloadField(source)) {
        throw new core.PdfPersonalisationError(
          `Map template field "${target}" to a lowerCamelCase AJO data field.`,
          400,
          'PDF_JOURNEY_TEMPLATE_MAPPING_REQUIRED',
        );
      }
      return {
        target,
        source,
        required: item.required === undefined ? type === 'text' : item.required === true,
        type,
      };
    });
  }
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
    const mappedValue = getPath(context, mapping.source);
    if (mappedValue !== undefined && mappedValue !== null && String(mappedValue).trim() !== '') {
      output[mapping.target] = mappedValue;
    } else if (!Object.prototype.hasOwnProperty.call(output, mapping.target)) {
      output[mapping.target] = mappedValue;
    }
  });
  return output;
}

function sampleDataForMappings(data, mappedData, mappings, recipient = {}) {
  const output = JSON.parse(JSON.stringify(plainObject(data) ? data : {}));
  const context = canonicalContext(output, recipient);
  (Array.isArray(mappings) ? mappings : []).forEach((mapping) => {
    const source = cleanPayloadField(mapping && mapping.source);
    if (!validPayloadField(source)) return;
    const existing = getPath(context, source);
    const mappedValue = mappedData && mappedData[mapping.target];
    if ((existing === undefined || existing === null || String(existing).trim() === '')
      && mappedValue !== undefined && mappedValue !== null && String(mappedValue).trim() !== '') {
      output[source] = mappedValue;
    }
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

function buildInputSchema(mappings, sampleData = {}, recipient = {}) {
  const context = canonicalContext(sampleData, recipient);
  const bySource = new Map();
  (Array.isArray(mappings) ? mappings : []).forEach((mapping) => {
    const source = String(mapping && mapping.source || '').trim();
    if (!validPayloadField(source)) return;
    const inputName = source === 'carrierCode' ? 'flightNumber' : source === 'flightDate' ? 'departureDateTime' : source;
    const definition = CANONICAL_SOURCE_DEFINITIONS[inputName] || { label: inputName, dataType: 'string' };
    const existing = bySource.get(inputName) || {
      name: inputName,
      label: definition.label,
      dataType: mapping.type === 'image' ? 'image' : definition.dataType,
      required: false,
      recipientField: definition.recipientField === true,
      targetFields: [],
      sampleValue: context[inputName] == null ? '' : context[inputName],
    };
    existing.required = existing.required || mapping.required === true;
    if (mapping.target && !existing.targetFields.includes(mapping.target)) existing.targetFields.push(mapping.target);
    bySource.set(inputName, existing);
  });
  return Array.from(bySource.values());
}

module.exports = {
  CANONICAL_SOURCES,
  CANONICAL_SOURCE_DEFINITIONS,
  extractDocxFields,
  extractHtmlFields,
  suggestSource,
  analyseTemplate,
  normalizeMappings,
  canonicalContext,
  applyMappings,
  sampleDataForMappings,
  validateMappedData,
  buildInputSchema,
};
