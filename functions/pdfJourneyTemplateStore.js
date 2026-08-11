'use strict';

const admin = require('firebase-admin');
const core = require('./pdfPersonalisationCore');
const builtins = require('./pdfJourneyTemplates');

const TEMPLATES_COLLECTION = 'pdfJourneyTemplates';
const OBJECT_PREFIX = 'pdf-personalisation/journey-templates';

function ensureAdmin() {
  if (!admin.apps.length) admin.initializeApp();
}

function getFirestore(deps = {}) {
  if (deps.firestore) return deps.firestore;
  ensureAdmin();
  return admin.firestore();
}

function getBucket(deps = {}) {
  if (deps.bucket) return deps.bucket;
  ensureAdmin();
  const name = String(
    process.env.PDF_PERSONALISATION_BUCKET
      || process.env.BRAND_SCRAPER_BUCKET
      || 'aep-orchestration-lab-brand-scrapes',
  ).trim();
  return admin.storage().bucket(name);
}

function now(deps = {}) {
  return deps.now ? deps.now() : new Date();
}

function normalizeTemplateName(value) {
  const name = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(name)) {
    throw new core.PdfPersonalisationError(
      'Template name must contain 3 to 80 lowercase letters, numbers, or hyphens.',
      400,
      'PDF_JOURNEY_TEMPLATE_NAME_INVALID',
    );
  }
  return name;
}

function cleanText(value, fallback, maxLength) {
  return String(value || fallback || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function templateDocId(ownerUid, templateName) {
  return core.sha256(`${String(ownerUid || '')}\n${normalizeTemplateName(templateName)}`).slice(0, 40);
}

function ownerPath(ownerUid) {
  return core.sha256(String(ownerUid || '')).slice(0, 20);
}

function sourceExtension(fileName) {
  const match = String(fileName || '').toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  return match ? match[1] : '';
}

function safeHtmlSourceName(fileName) {
  const raw = String(fileName || 'template.html').trim();
  const base = raw.replace(/\.html?$/i, '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._ -]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 100);
  return `${base || 'template'}.html`;
}

function decodeBase64(value, maxBytes) {
  const base64 = String(value || '').replace(/\s+/g, '');
  if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
    throw new core.PdfPersonalisationError(
      'Template file must contain valid base64 data.',
      400,
      'PDF_JOURNEY_TEMPLATE_BASE64_INVALID',
    );
  }
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length || buffer.length > maxBytes) {
    throw new core.PdfPersonalisationError(
      `Template file exceeds ${maxBytes} bytes.`,
      413,
      'PDF_JOURNEY_TEMPLATE_TOO_LARGE',
    );
  }
  return buffer;
}

function builtinMetadata() {
  return builtins.listTemplates().map((item) => ({
    ...item,
    templateName: item.name,
    label: item.label,
    kind: 'html',
    source: 'builtin',
    sourceFileName: `${item.name}.html`,
    mimeType: 'text/html',
    canDelete: false,
  }));
}

function serializeRecord(record) {
  return {
    templateName: record.templateName,
    name: record.templateName,
    label: record.label,
    subject: record.subject,
    documentName: record.documentName,
    kind: record.kind,
    source: 'uploaded',
    sourceFileName: record.sourceFileName,
    mimeType: record.mimeType,
    size: record.size,
    sourceHash: record.sourceHash,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    canDelete: true,
  };
}

async function saveTemplate(input, deps = {}) {
  const ownerUid = String(input && input.ownerUid || '').trim().slice(0, 128);
  if (!ownerUid) throw new core.PdfPersonalisationError('Template owner is required.', 400, 'PDF_JOURNEY_TEMPLATE_OWNER_REQUIRED');
  const templateName = normalizeTemplateName(input.templateName);
  if (builtins.TEMPLATE_DEFINITIONS[templateName]) {
    throw new core.PdfPersonalisationError(
      'That template name is reserved by a built-in template.',
      409,
      'PDF_JOURNEY_TEMPLATE_NAME_RESERVED',
    );
  }
  const sourceFile = input.sourceFile && typeof input.sourceFile === 'object' ? input.sourceFile : {};
  const rawName = String(sourceFile.fileName || sourceFile.name || '').trim();
  const extension = sourceExtension(rawName);
  let kind;
  let sourceFileName;
  let mimeType;
  let bytes;

  if (extension === 'html' || extension === 'htm') {
    kind = 'html';
    sourceFileName = safeHtmlSourceName(rawName);
    mimeType = 'text/html';
    const rawBytes = decodeBase64(sourceFile.base64, core.MAX_TEMPLATE_BYTES);
    const html = core.validateHtmlTemplate(rawBytes.toString('utf8'));
    bytes = Buffer.from(html, 'utf8');
  } else {
    kind = 'document';
    const normalized = core.normaliseSourceDocument(sourceFile);
    sourceFileName = normalized.fileName;
    mimeType = normalized.mimeType;
    bytes = normalized.buffer;
  }

  const db = getFirestore(deps);
  const id = templateDocId(ownerUid, templateName);
  const ref = db.collection(TEMPLATES_COLLECTION).doc(id);
  const existing = await ref.get();
  if (existing.exists && (existing.data() || {}).status === 'active') {
    throw new core.PdfPersonalisationError(
      `Template "${templateName}" already exists. Delete it before uploading a replacement.`,
      409,
      'PDF_JOURNEY_TEMPLATE_EXISTS',
    );
  }

  const sourceHash = core.sha256(bytes);
  const objectPath = `${OBJECT_PREFIX}/${ownerPath(ownerUid)}/${templateName}/${sourceHash.slice(0, 20)}.${extension === 'htm' ? 'html' : extension}`;
  const timestamp = now(deps).toISOString();
  await getBucket(deps).file(objectPath).save(bytes, {
    contentType: kind === 'html' ? 'text/html; charset=utf-8' : mimeType,
    resumable: false,
    validation: 'crc32c',
    metadata: {
      cacheControl: 'private, no-store, max-age=0',
      metadata: { templateName, ownerUidHash: ownerPath(ownerUid), sourceHash },
    },
  });
  const record = {
    templateId: id,
    templateName,
    ownerUid,
    label: cleanText(input.label, templateName, 120),
    subject: cleanText(input.subject, 'Your travel document', 180),
    documentName: core.safeDocumentName(input.documentName || `${templateName}.pdf`),
    kind,
    objectPath,
    sourceFileName,
    mimeType,
    size: bytes.length,
    sourceHash,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await ref.set(record);
  return serializeRecord(record);
}

async function listUploadedTemplates(ownerUid, deps = {}) {
  const uid = String(ownerUid || '').trim().slice(0, 128);
  if (!uid) return [];
  const snapshot = await getFirestore(deps)
    .collection(TEMPLATES_COLLECTION)
    .where('ownerUid', '==', uid)
    .get();
  return snapshot.docs
    .map((doc) => doc.data() || {})
    .filter((record) => record.status === 'active')
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))
    .map(serializeRecord);
}

async function resolveTemplateMetadata(templateName, ownerUid, deps = {}) {
  const name = normalizeTemplateName(templateName);
  if (builtins.TEMPLATE_DEFINITIONS[name]) {
    const item = builtins.TEMPLATE_DEFINITIONS[name];
    const loaded = builtins.getTemplate(name);
    return {
      name,
      templateName: name,
      label: item.label,
      subject: item.subject,
      documentName: item.documentName,
      kind: 'html',
      source: 'builtin',
      sourceHash: core.sha256(loaded.htmlTemplate),
      ownerUid: null,
    };
  }
  const uid = String(ownerUid || '').trim().slice(0, 128);
  if (!uid) {
    throw new core.PdfPersonalisationError('Uploaded template was not found.', 404, 'PDF_JOURNEY_TEMPLATE_NOT_FOUND');
  }
  const snapshot = await getFirestore(deps)
    .collection(TEMPLATES_COLLECTION)
    .doc(templateDocId(uid, name))
    .get();
  if (!snapshot.exists) {
    throw new core.PdfPersonalisationError('Uploaded template was not found.', 404, 'PDF_JOURNEY_TEMPLATE_NOT_FOUND');
  }
  const record = snapshot.data() || {};
  if (record.status !== 'active' || record.ownerUid !== uid || !record.objectPath) {
    throw new core.PdfPersonalisationError('Uploaded template was not found.', 404, 'PDF_JOURNEY_TEMPLATE_NOT_FOUND');
  }
  return {
    name: record.templateName,
    templateName: record.templateName,
    label: record.label,
    subject: record.subject,
    documentName: record.documentName,
    kind: record.kind,
    source: 'uploaded',
    sourceHash: record.sourceHash,
    sourceFileName: record.sourceFileName,
    mimeType: record.mimeType,
    objectPath: record.objectPath,
    ownerUid: uid,
  };
}

async function loadTemplateSource(record, deps = {}) {
  if (record.templateSource === 'builtin') return builtins.getTemplate(record.templateName);
  const objectPath = String(record.templateObjectPath || '').trim();
  if (!objectPath.startsWith(`${OBJECT_PREFIX}/`) || !record.templateSourceHash) {
    throw new core.PdfPersonalisationError('Uploaded template source is unavailable.', 404, 'PDF_JOURNEY_TEMPLATE_SOURCE_MISSING');
  }
  const [bytes] = await getBucket(deps).file(objectPath).download();
  if (core.sha256(bytes) !== record.templateSourceHash) {
    throw new core.PdfPersonalisationError('Uploaded template source failed integrity validation.', 409, 'PDF_JOURNEY_TEMPLATE_SOURCE_CHANGED');
  }
  if (record.templateKind === 'html') {
    return { htmlTemplate: core.validateHtmlTemplate(bytes.toString('utf8')) };
  }
  return {
    sourceDocument: {
      fileName: record.templateSourceName,
      mimeType: record.templateMimeType,
      base64: bytes.toString('base64'),
    },
  };
}

async function archiveTemplate(ownerUid, templateName, deps = {}) {
  const uid = String(ownerUid || '').trim().slice(0, 128);
  const name = normalizeTemplateName(templateName);
  if (builtins.TEMPLATE_DEFINITIONS[name]) {
    throw new core.PdfPersonalisationError('Built-in templates cannot be deleted.', 400, 'PDF_JOURNEY_TEMPLATE_BUILTIN');
  }
  const ref = getFirestore(deps).collection(TEMPLATES_COLLECTION).doc(templateDocId(uid, name));
  const snapshot = await ref.get();
  if (!snapshot.exists || (snapshot.data() || {}).ownerUid !== uid) {
    throw new core.PdfPersonalisationError('Uploaded template was not found.', 404, 'PDF_JOURNEY_TEMPLATE_NOT_FOUND');
  }
  await ref.set({ status: 'archived', archivedAt: now(deps).toISOString(), updatedAt: now(deps).toISOString() }, { merge: true });
  return { templateName: name, archived: true };
}

module.exports = {
  TEMPLATES_COLLECTION,
  OBJECT_PREFIX,
  normalizeTemplateName,
  templateDocId,
  builtinMetadata,
  serializeRecord,
  saveTemplate,
  listUploadedTemplates,
  resolveTemplateMetadata,
  loadTemplateSource,
  archiveTemplate,
};
