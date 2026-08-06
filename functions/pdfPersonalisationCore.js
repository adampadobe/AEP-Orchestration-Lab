'use strict';

const { createHash } = require('node:crypto');
const { Readable } = require('node:stream');
const archiver = require('archiver');
const Handlebars = require('handlebars');

const MAX_TEMPLATE_BYTES = 1_500_000;
const MAX_DATA_BYTES = 250_000;
const MAX_DOCUMENT_MERGE_DATA_BYTES = 8 * 1024 * 1024;
const MAX_RENDERED_HTML_BYTES = 2_000_000;
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_SOURCE_DOCUMENT_BYTES = 10 * 1024 * 1024;

const SUPPORTED_SOURCE_DOCUMENTS = Object.freeze({
  bmp: 'image/bmp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  rtf: 'text/rtf',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  txt: 'text/plain',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});

class PdfPersonalisationError extends Error {
  constructor(message, status = 400, code = 'PDF_PERSONALISATION_INVALID') {
    super(message);
    this.name = 'PdfPersonalisationError';
    this.status = status;
    this.code = code;
  }
}

function utf8Bytes(value) {
  return Buffer.byteLength(String(value || ''), 'utf8');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function plainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function safeDocumentName(value) {
  const raw = String(value || 'personalised-document.pdf').trim();
  const withoutExt = raw.replace(/\.pdf$/i, '');
  const clean = withoutExt
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._ -]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 100);
  return `${clean || 'personalised-document'}.pdf`;
}

function safeSourceDocumentName(value) {
  const raw = String(value || '').trim();
  const extensionMatch = raw.match(/\.([a-zA-Z0-9]{2,5})$/);
  const extension = String(extensionMatch && extensionMatch[1] || '').toLowerCase();
  if (!SUPPORTED_SOURCE_DOCUMENTS[extension]) {
    throw new PdfPersonalisationError(
      'Unsupported source document type.',
      400,
      'PDF_SOURCE_DOCUMENT_TYPE_UNSUPPORTED',
    );
  }
  const base = raw.slice(0, -(extension.length + 1))
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._ -]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 100);
  return `${base || 'source-document'}.${extension}`;
}

function normaliseSourceDocument(value) {
  if (!plainObject(value)) {
    throw new PdfPersonalisationError(
      'sourceDocument is required for document conversion.',
      400,
      'PDF_SOURCE_DOCUMENT_REQUIRED',
    );
  }
  const fileName = safeSourceDocumentName(value.fileName || value.name);
  const extension = fileName.split('.').pop().toLowerCase();
  const expectedMimeType = SUPPORTED_SOURCE_DOCUMENTS[extension];
  const suppliedMimeType = String(value.mimeType || '').trim().toLowerCase();
  if (suppliedMimeType && suppliedMimeType !== expectedMimeType
    && !(expectedMimeType === 'image/jpeg' && suppliedMimeType === 'image/jpg')) {
    throw new PdfPersonalisationError(
      'Source document MIME type does not match its file extension.',
      400,
      'PDF_SOURCE_DOCUMENT_MIME_MISMATCH',
    );
  }
  const base64 = String(value.base64 || '').replace(/\s+/g, '');
  if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new PdfPersonalisationError(
      'sourceDocument.base64 must contain valid base64 file data.',
      400,
      'PDF_SOURCE_DOCUMENT_BASE64_INVALID',
    );
  }
  if (base64.length > Math.ceil(MAX_SOURCE_DOCUMENT_BYTES / 3) * 4 + 4) {
    throw new PdfPersonalisationError(
      `Source document exceeds ${MAX_SOURCE_DOCUMENT_BYTES} bytes.`,
      413,
      'PDF_SOURCE_DOCUMENT_TOO_LARGE',
    );
  }
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length) {
    throw new PdfPersonalisationError('Source document is empty.', 400, 'PDF_SOURCE_DOCUMENT_EMPTY');
  }
  if (buffer.length > MAX_SOURCE_DOCUMENT_BYTES) {
    throw new PdfPersonalisationError(
      `Source document exceeds ${MAX_SOURCE_DOCUMENT_BYTES} bytes.`,
      413,
      'PDF_SOURCE_DOCUMENT_TOO_LARGE',
    );
  }
  return {
    fileName,
    mimeType: expectedMimeType,
    buffer,
    size: buffer.length,
    sha256: sha256(buffer),
  };
}

function validateRemoteReferences(html) {
  const urlPattern = /(?:src|href)\s*=\s*["']\s*([^"']+)|url\(\s*["']?\s*([^"')\s]+)/gi;
  let match;
  while ((match = urlPattern.exec(html))) {
    const raw = String(match[1] || match[2] || '').trim();
    if (!raw || raw.startsWith('#') || raw.startsWith('data:') || raw.startsWith('cid:')) continue;
    if (!/^https:\/\//i.test(raw)) {
      throw new PdfPersonalisationError(
        `Template resource URLs must use HTTPS or data URLs: ${raw.slice(0, 120)}`,
        400,
        'PDF_TEMPLATE_RESOURCE_URL_INVALID',
      );
    }
    try {
      const host = new URL(raw).hostname.toLowerCase();
      const privateHost = host === 'localhost' || host === '0.0.0.0' || host === '::1'
        || host.endsWith('.local') || host.startsWith('127.') || host.startsWith('10.')
        || host.startsWith('192.168.') || host.startsWith('169.254.')
        || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
      if (privateHost) {
        throw new PdfPersonalisationError(
          `Template resource URL cannot target a private host: ${host}`,
          400,
          'PDF_TEMPLATE_PRIVATE_URL_BLOCKED',
        );
      }
    } catch (error) {
      if (error instanceof PdfPersonalisationError) throw error;
      throw new PdfPersonalisationError('Template contains an invalid resource URL.', 400, 'PDF_TEMPLATE_RESOURCE_URL_INVALID');
    }
  }
}

function validateHtmlTemplate(value) {
  const html = String(value || '');
  if (!html.trim()) {
    throw new PdfPersonalisationError('htmlTemplate is required.', 400, 'PDF_TEMPLATE_REQUIRED');
  }
  if (utf8Bytes(html) > MAX_TEMPLATE_BYTES) {
    throw new PdfPersonalisationError(
      `HTML template exceeds ${MAX_TEMPLATE_BYTES} bytes.`,
      413,
      'PDF_TEMPLATE_TOO_LARGE',
    );
  }
  if (/<\s*(script|iframe|object|embed|base|form)\b/i.test(html)) {
    throw new PdfPersonalisationError(
      'Static PDF templates cannot contain script, iframe, object, embed, base, or form elements.',
      400,
      'PDF_TEMPLATE_ACTIVE_CONTENT_BLOCKED',
    );
  }
  if (/javascript\s*:/i.test(html) || /file\s*:/i.test(html)) {
    throw new PdfPersonalisationError(
      'Template contains a blocked javascript: or file: reference.',
      400,
      'PDF_TEMPLATE_ACTIVE_URL_BLOCKED',
    );
  }
  validateRemoteReferences(html);
  return html;
}

function normaliseData(value) {
  if (!plainObject(value)) {
    throw new PdfPersonalisationError('data must be a JSON object.', 400, 'PDF_DATA_INVALID');
  }
  let serialised;
  try {
    serialised = JSON.stringify(value);
  } catch {
    throw new PdfPersonalisationError('data must be JSON serialisable.', 400, 'PDF_DATA_INVALID');
  }
  if (utf8Bytes(serialised) > MAX_DATA_BYTES) {
    throw new PdfPersonalisationError(`data exceeds ${MAX_DATA_BYTES} bytes.`, 413, 'PDF_DATA_TOO_LARGE');
  }
  return value;
}

function normaliseDocumentMergeData(value) {
  if (!plainObject(value)) {
    throw new PdfPersonalisationError('data must be a JSON object.', 400, 'PDF_DATA_INVALID');
  }
  let serialised;
  try {
    serialised = JSON.stringify(value);
  } catch {
    throw new PdfPersonalisationError('data must be JSON serialisable.', 400, 'PDF_DATA_INVALID');
  }
  if (utf8Bytes(serialised) > MAX_DOCUMENT_MERGE_DATA_BYTES) {
    throw new PdfPersonalisationError(
      `Document merge data exceeds ${MAX_DOCUMENT_MERGE_DATA_BYTES} bytes.`,
      413,
      'PDF_DOCUMENT_MERGE_DATA_TOO_LARGE',
    );
  }
  return value;
}

function hasMergeData(value) {
  return plainObject(value) && Object.keys(value).length > 0;
}

function normaliseOptions(value) {
  const options = plainObject(value) ? value : {};
  return {
    pageWidth: clampNumber(options.pageWidth, 8.27, 3, 20),
    pageHeight: clampNumber(options.pageHeight, 11.69, 3, 30),
    includeHeaderFooter: options.includeHeaderFooter === true,
    waitTimeToLoad: Math.round(clampNumber(options.waitTimeToLoad, 100, 0, 10_000)),
    locale: String(options.locale || 'en-GB').trim().slice(0, 35) || 'en-GB',
    timeZone: String(options.timeZone || 'UTC').trim().slice(0, 80) || 'UTC',
  };
}

function normaliseGenerateRequest(body) {
  const input = plainObject(body) ? body : {};
  const conversionMode = String(input.conversionMode || 'html').trim().toLowerCase();
  if (conversionMode !== 'html' && conversionMode !== 'document') {
    throw new PdfPersonalisationError(
      'conversionMode must be html or document.',
      400,
      'PDF_CONVERSION_MODE_INVALID',
    );
  }
  const templateId = String(input.templateId || '').trim().slice(0, 100);
  const inlineTemplate = input.htmlTemplate == null ? '' : String(input.htmlTemplate);
  if (conversionMode === 'html' && !templateId && !inlineTemplate.trim()) {
    throw new PdfPersonalisationError('Provide templateId or htmlTemplate.', 400, 'PDF_TEMPLATE_REQUIRED');
  }
  if (conversionMode === 'html' && templateId && inlineTemplate.trim()) {
    throw new PdfPersonalisationError('Provide templateId or htmlTemplate, not both.', 400, 'PDF_TEMPLATE_AMBIGUOUS');
  }
  const idempotencyKey = String(input.idempotencyKey || '').trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    throw new PdfPersonalisationError(
      'idempotencyKey must contain 8 to 200 characters.',
      400,
      'PDF_IDEMPOTENCY_KEY_INVALID',
    );
  }
  const sourceDocument = conversionMode === 'document'
    ? normaliseSourceDocument(input.sourceDocument)
    : null;
  const data = conversionMode === 'document'
    ? normaliseDocumentMergeData(input.data || {})
    : normaliseData(input.data || {});
  const documentMerge = conversionMode === 'document' && hasMergeData(data);
  if (documentMerge && !/\.docx$/i.test(sourceDocument.fileName)) {
    throw new PdfPersonalisationError(
      'JSON personalisation requires a DOCX template. Leave data as {} for direct conversion of other file types.',
      400,
      'PDF_DOCUMENT_MERGE_DOCX_REQUIRED',
    );
  }
  const defaultDocumentName = sourceDocument
    ? sourceDocument.fileName.replace(/\.[^.]+$/, '.pdf')
    : 'personalised-document.pdf';
  return {
    conversionMode,
    templateId: conversionMode === 'html' ? templateId : '',
    htmlTemplate: conversionMode === 'html' && inlineTemplate ? validateHtmlTemplate(inlineTemplate) : '',
    data,
    sourceDocument,
    documentOperation: conversionMode === 'document'
      ? (documentMerge ? 'document-merge' : 'create-pdf')
      : 'html-to-pdf',
    options: normaliseOptions(input.options),
    documentName: safeDocumentName(input.documentName || defaultDocumentName),
    idempotencyKey,
  };
}

function handlebarsEnvironment() {
  const engine = Handlebars.create();
  engine.registerHelper('formatDate', function formatDate(value, options) {
    if (!value) return '';
    const root = options && options.data && options.data.root || {};
    const settings = root._pdf || {};
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    try {
      return new Intl.DateTimeFormat(settings.locale || 'en-GB', {
        dateStyle: 'medium',
        timeZone: settings.timeZone || 'UTC',
      }).format(date);
    } catch {
      return date.toISOString().slice(0, 10);
    }
  });
  engine.registerHelper('formatDateTime', function formatDateTime(value, options) {
    if (!value) return '';
    const root = options && options.data && options.data.root || {};
    const settings = root._pdf || {};
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    try {
      return new Intl.DateTimeFormat(settings.locale || 'en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: settings.timeZone || 'UTC',
      }).format(date);
    } catch {
      return date.toISOString();
    }
  });
  engine.registerHelper('formatCurrency', function formatCurrency(value, currency, options) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    const root = options && options.data && options.data.root || {};
    const settings = root._pdf || {};
    try {
      return new Intl.NumberFormat(settings.locale || 'en-GB', {
        style: 'currency',
        currency: String(currency || 'GBP').toUpperCase(),
      }).format(number);
    } catch {
      return `${String(currency || '').toUpperCase()} ${number.toFixed(2)}`.trim();
    }
  });
  return engine;
}

function renderHtmlTemplate(htmlTemplate, data, options = {}) {
  const html = validateHtmlTemplate(htmlTemplate);
  const safeData = normaliseData(data || {});
  const settings = normaliseOptions(options);
  let rendered;
  try {
    const template = handlebarsEnvironment().compile(html, {
      noEscape: false,
      strict: false,
      preventIndent: true,
    });
    rendered = template({ data: safeData, _pdf: settings });
  } catch (error) {
    throw new PdfPersonalisationError(
      `Template rendering failed: ${String(error && error.message || error)}`,
      400,
      'PDF_TEMPLATE_RENDER_FAILED',
    );
  }
  if (utf8Bytes(rendered) > MAX_RENDERED_HTML_BYTES) {
    throw new PdfPersonalisationError('Rendered HTML is too large.', 413, 'PDF_RENDERED_HTML_TOO_LARGE');
  }
  // Validate again after merge so triple-brace expressions cannot inject
  // active content or unsafe resource URLs through personalised data.
  validateHtmlTemplate(rendered);
  return {
    renderedHtml: rendered,
    templateHash: sha256(html),
    renderedHash: sha256(rendered),
    options: settings,
  };
}

async function createHtmlZip(renderedHtml) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    archive.on('warning', (error) => reject(error));
    archive.on('error', (error) => reject(error));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.append(Buffer.from(String(renderedHtml), 'utf8'), { name: 'index.html' });
    archive.finalize().catch(reject);
  });
}

async function streamToBuffer(readStream, maxBytes = MAX_PDF_BYTES + 1) {
  const chunks = [];
  let total = 0;
  for await (const chunk of readStream) {
    const bytes = Buffer.from(chunk);
    total += bytes.length;
    if (total > maxBytes) {
      throw new PdfPersonalisationError(
        `Generated PDF exceeds the ${MAX_PDF_BYTES} byte AJO attachment limit.`,
        422,
        'PDF_OUTPUT_TOO_LARGE',
      );
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function validatePdfBuffer(value) {
  const pdf = Buffer.from(value || []);
  if (pdf.length < 5 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new PdfPersonalisationError('Adobe PDF Services returned an invalid PDF.', 502, 'PDF_OUTPUT_INVALID');
  }
  if (pdf.length > MAX_PDF_BYTES) {
    throw new PdfPersonalisationError(
      `Generated PDF exceeds the ${MAX_PDF_BYTES} byte AJO attachment limit.`,
      422,
      'PDF_OUTPUT_TOO_LARGE',
    );
  }
  return pdf;
}

async function convertHtmlZipToPdf(zipBuffer, options, credentials, deps = {}) {
  const sdk = deps.pdfSdk || require('@adobe/pdfservices-node-sdk');
  const clientId = String(credentials && credentials.clientId || '').trim();
  const clientSecret = String(credentials && credentials.clientSecret || '').trim();
  if (!clientId || !clientSecret) {
    throw new PdfPersonalisationError(
      'Adobe PDF Services credentials are not configured.',
      503,
      'PDF_SERVICES_NOT_CONFIGURED',
    );
  }
  const serviceCredentials = new sdk.ServicePrincipalCredentials({ clientId, clientSecret });
  const pdfServices = deps.pdfServices || new sdk.PDFServices({ credentials: serviceCredentials });
  const inputAsset = await pdfServices.upload({
    readStream: Readable.from(Buffer.from(zipBuffer)),
    mimeType: sdk.MimeType.ZIP,
  });
  const settings = normaliseOptions(options);
  const params = new sdk.HTMLToPDFParams({
    pageLayout: new sdk.PageLayout({
      pageWidth: settings.pageWidth,
      pageHeight: settings.pageHeight,
    }),
    includeHeaderFooter: settings.includeHeaderFooter,
    waitTimeToLoad: settings.waitTimeToLoad,
  });
  const pollingURL = await pdfServices.submit({
    job: new sdk.HTMLToPDFJob({ inputAsset, params }),
  });
  const response = await pdfServices.getJobResult({
    pollingURL,
    resultType: sdk.HTMLToPDFResult,
  });
  const streamAsset = await pdfServices.getContent({ asset: response.result.asset });
  return validatePdfBuffer(await streamToBuffer(streamAsset.readStream));
}

async function convertDocumentToPdf(sourceDocument, data, credentials, deps = {}) {
  const sdk = deps.pdfSdk || require('@adobe/pdfservices-node-sdk');
  const clientId = String(credentials && credentials.clientId || '').trim();
  const clientSecret = String(credentials && credentials.clientSecret || '').trim();
  if (!clientId || !clientSecret) {
    throw new PdfPersonalisationError(
      'Adobe PDF Services credentials are not configured.',
      503,
      'PDF_SERVICES_NOT_CONFIGURED',
    );
  }
  const input = sourceDocument && sourceDocument.buffer
    ? sourceDocument
    : normaliseSourceDocument(sourceDocument);
  const serviceCredentials = new sdk.ServicePrincipalCredentials({ clientId, clientSecret });
  const pdfServices = deps.pdfServices || new sdk.PDFServices({ credentials: serviceCredentials });
  const inputAsset = await pdfServices.upload({
    readStream: Readable.from(Buffer.from(input.buffer)),
    mimeType: input.mimeType,
  });
  const documentMerge = hasMergeData(data);
  const job = documentMerge
    ? new sdk.DocumentMergeJob({
      inputAsset,
      params: new sdk.DocumentMergeParams({
        jsonDataForMerge: data,
        outputFormat: sdk.OutputFormat.PDF,
      }),
    })
    : new sdk.CreatePDFJob({ inputAsset });
  const pollingURL = await pdfServices.submit({ job });
  const response = await pdfServices.getJobResult({
    pollingURL,
    resultType: documentMerge ? sdk.DocumentMergeResult : sdk.CreatePDFResult,
  });
  const streamAsset = await pdfServices.getContent({ asset: response.result.asset });
  return validatePdfBuffer(await streamToBuffer(streamAsset.readStream));
}

function requestHash(input, templateHash) {
  if (input.conversionMode === 'document') {
    return sha256(JSON.stringify({
      conversionMode: input.conversionMode,
      sourceDocumentHash: input.sourceDocument.sha256,
      sourceDocumentMimeType: input.sourceDocument.mimeType,
      documentOperation: input.documentOperation,
      data: input.data,
      documentName: input.documentName,
    }));
  }
  return sha256(JSON.stringify({
    conversionMode: input.conversionMode || 'html',
    templateHash,
    data: input.data,
    options: input.options,
    documentName: input.documentName,
  }));
}

module.exports = {
  MAX_TEMPLATE_BYTES,
  MAX_DATA_BYTES,
  MAX_DOCUMENT_MERGE_DATA_BYTES,
  MAX_RENDERED_HTML_BYTES,
  MAX_PDF_BYTES,
  MAX_SOURCE_DOCUMENT_BYTES,
  SUPPORTED_SOURCE_DOCUMENTS,
  PdfPersonalisationError,
  sha256,
  safeDocumentName,
  safeSourceDocumentName,
  normaliseSourceDocument,
  validateHtmlTemplate,
  normaliseData,
  normaliseDocumentMergeData,
  hasMergeData,
  normaliseOptions,
  normaliseGenerateRequest,
  renderHtmlTemplate,
  createHtmlZip,
  streamToBuffer,
  validatePdfBuffer,
  convertHtmlZipToPdf,
  convertDocumentToPdf,
  requestHash,
};
