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
    inputSchema: Object.freeze([
      { name: 'bookingReference', label: 'Booking reference', dataType: 'string', required: true },
      { name: 'ticketNumber', label: 'Ticket number', dataType: 'string', required: false },
      { name: 'flightNumber', label: 'Flight number', dataType: 'string', required: true },
      { name: 'departureAirport', label: 'Departure airport code', dataType: 'string', required: true },
      { name: 'arrivalAirport', label: 'Arrival airport code', dataType: 'string', required: true },
      { name: 'departureDateTime', label: 'Departure date and time', dataType: 'dateTime', required: true },
      { name: 'arrivalDateTime', label: 'Arrival date and time', dataType: 'dateTime', required: true },
      { name: 'totalPaid', label: 'Total paid', dataType: 'decimal', required: false },
      { name: 'currency', label: 'Currency', dataType: 'string', required: false },
    ]),
    sampleData: Object.freeze({
      bookingReference: 'EK8F2Q', ticketNumber: '1761234567890', flightNumber: 'EK 001',
      departureAirport: 'DXB', arrivalAirport: 'LHR',
      departureDateTime: '2026-08-12T07:45:00Z', arrivalDateTime: '2026-08-12T15:10:00Z',
      totalPaid: 1280.5, currency: 'GBP',
    }),
  }),
  'checkin-confirmation': Object.freeze({
    name: 'checkin-confirmation',
    label: 'Check-in confirmation',
    fileName: 'checkin-confirmation.html',
    documentName: 'checkin-confirmation.pdf',
    subject: 'Your check-in confirmation',
    inputSchema: Object.freeze([
      { name: 'bookingReference', label: 'Booking reference', dataType: 'string', required: true },
      { name: 'flightNumber', label: 'Flight number', dataType: 'string', required: true },
      { name: 'departureAirport', label: 'Departure airport code', dataType: 'string', required: true },
      { name: 'arrivalAirport', label: 'Arrival airport code', dataType: 'string', required: true },
      { name: 'originCity', label: 'Origin city', dataType: 'string', required: true },
      { name: 'destinationCity', label: 'Destination city', dataType: 'string', required: true },
      { name: 'boardingTime', label: 'Boarding time', dataType: 'string', required: true },
      { name: 'gate', label: 'Boarding gate', dataType: 'string', required: true },
      { name: 'seat', label: 'Seat number', dataType: 'string', required: true },
      { name: 'zone', label: 'Boarding zone', dataType: 'string', required: false },
    ]),
    sampleData: Object.freeze({
      bookingReference: 'RX8F2Q', flightNumber: 'RX 123', departureAirport: 'RUH',
      arrivalAirport: 'JED', originCity: 'Riyadh', destinationCity: 'Jeddah',
      boardingTime: '08:30', gate: 'A12', seat: '24A', zone: '3',
    }),
  }),
});

const templateCache = new Map();

function listTemplates() {
  return Object.values(TEMPLATE_DEFINITIONS).map((template) => ({
    name: template.name,
    label: template.label,
    documentName: template.documentName,
    subject: template.subject,
    inputSchema: template.inputSchema,
    sampleData: template.sampleData,
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
