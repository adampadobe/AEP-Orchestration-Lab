'use strict';

const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { PdfPersonalisationError, validateHtmlTemplate } = require('./pdfPersonalisationCore');

const TEMPLATE_DEFINITIONS = Object.freeze({
  'booking-confirmation': Object.freeze({
    name: 'booking-confirmation',
    label: 'Booking confirmation',
    fileName: 'booking-confirmation.html',
    documentName: 'booking-confirmation.pdf',
    subject: 'Your booking confirmation',
  }),
  'checkin-confirmation': Object.freeze({
    name: 'checkin-confirmation',
    label: 'Check-in confirmation',
    fileName: 'checkin-confirmation.html',
    documentName: 'checkin-confirmation.pdf',
    subject: 'Your check-in confirmation',
  }),
});

const templateCache = new Map();

function listTemplates() {
  return Object.values(TEMPLATE_DEFINITIONS).map((template) => ({
    name: template.name,
    label: template.label,
    documentName: template.documentName,
    subject: template.subject,
  }));
}

function getTemplate(name) {
  const key = String(name || '').trim().toLowerCase();
  const definition = TEMPLATE_DEFINITIONS[key];
  if (!definition) {
    throw new PdfPersonalisationError(
      `Unknown templateName. Use one of: ${Object.keys(TEMPLATE_DEFINITIONS).join(', ')}.`,
      400,
      'PDF_JOURNEY_TEMPLATE_INVALID',
    );
  }
  if (!templateCache.has(key)) {
    const path = join(__dirname, 'assets', 'pdf-templates', definition.fileName);
    templateCache.set(key, validateHtmlTemplate(readFileSync(path, 'utf8')));
  }
  return { ...definition, htmlTemplate: templateCache.get(key) };
}

module.exports = {
  TEMPLATE_DEFINITIONS,
  listTemplates,
  getTemplate,
};
