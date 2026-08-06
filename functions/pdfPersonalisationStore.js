'use strict';

const { createHash, randomBytes, randomUUID } = require('node:crypto');
const admin = require('firebase-admin');
const { PdfPersonalisationError, safeDocumentName, validateHtmlTemplate } = require('./pdfPersonalisationCore');
const s3Store = require('./pdfPersonalisationS3');

const JOBS_COLLECTION = 'pdfPersonalisationJobs';
const IDEMPOTENCY_COLLECTION = 'pdfPersonalisationIdempotency';
const DOWNLOADS_COLLECTION = 'pdfPersonalisationDownloads';
const TEMPLATES_COLLECTION = 'pdfPersonalisationTemplates';
const OBJECT_PREFIX = 'pdf-personalisation';
const PROCESSING_STALE_MS = 10 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 14;

function ensureAdmin() {
  if (!admin.apps.length) admin.initializeApp();
}

function getFirestore(deps = {}) {
  if (deps.firestore) return deps.firestore;
  ensureAdmin();
  return admin.firestore();
}

function bucketName() {
  return String(
    process.env.PDF_PERSONALISATION_BUCKET
      || process.env.BRAND_SCRAPER_BUCKET
      || 'aep-orchestration-lab-brand-scrapes',
  ).trim();
}

function getBucket(deps = {}) {
  if (deps.bucket) return deps.bucket;
  ensureAdmin();
  return admin.storage().bucket(bucketName());
}

function now(deps = {}) {
  return deps.now ? deps.now() : new Date();
}

function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : String(value || '');
  return createHash('sha256').update(bytes).digest('hex');
}

function safeSegment(value, fallback = 'unknown') {
  const result = String(value || '').toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return result || fallback;
}

function retentionDays() {
  const configured = Number(process.env.PDF_PERSONALISATION_RETENTION_DAYS);
  if (!Number.isFinite(configured)) return DEFAULT_RETENTION_DAYS;
  return Math.min(30, Math.max(1, Math.round(configured)));
}

function expiryFrom(start) {
  return new Date(start.getTime() + retentionDays() * 24 * 60 * 60 * 1000);
}

function jobObjectPath(jobId, createdAt) {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${OBJECT_PREFIX}/documents/${yyyy}/${mm}/${dd}/${safeSegment(jobId)}.pdf`;
}

function templateObjectPath(ownerUid, templateId) {
  return `${OBJECT_PREFIX}/templates/${safeSegment(ownerUid)}/${safeSegment(templateId)}/index.html`;
}

function idempotencyDocId(principalId, key) {
  return sha256(`${principalId}\n${key}`);
}

async function claimIdempotency(input, deps = {}) {
  const db = getFirestore(deps);
  const createdAt = now(deps);
  const docId = idempotencyDocId(input.principalId, input.idempotencyKey);
  const ref = db.collection(IDEMPOTENCY_COLLECTION).doc(docId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists) {
      const existing = snapshot.data() || {};
      if (existing.requestHash && existing.requestHash !== input.requestHash) {
        throw new PdfPersonalisationError(
          'This idempotency key was already used for a different document request.',
          409,
          'PDF_IDEMPOTENCY_CONFLICT',
        );
      }
      if (existing.status === 'ready' && existing.jobId) {
        return { status: 'ready', jobId: existing.jobId, docId };
      }
      const updatedMs = Date.parse(existing.updatedAt || existing.createdAt || '');
      if (existing.status === 'processing' && Number.isFinite(updatedMs)
        && createdAt.getTime() - updatedMs < PROCESSING_STALE_MS) {
        return { status: 'processing', jobId: existing.jobId, docId };
      }
    }
    transaction.set(ref, {
      principalId: input.principalId,
      idempotencyKeyHash: sha256(input.idempotencyKey),
      requestHash: input.requestHash,
      jobId: input.jobId,
      status: 'processing',
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
    });
    return { status: 'claimed', jobId: input.jobId, docId };
  });
}

async function saveReadyJob(input, deps = {}) {
  const db = getFirestore(deps);
  const createdAt = input.createdAt instanceof Date ? input.createdAt : now(deps);
  const expiresAt = expiryFrom(createdAt);
  const objectPath = jobObjectPath(input.jobId, createdAt);
  const documentName = safeDocumentName(input.documentName);
  const mode = s3Store.outputStoreMode(deps);
  let s3Record = null;
  let gcsObjectPath = null;

  if (s3Store.usesS3(mode)) {
    s3Record = await s3Store.uploadPdf({
      ...input,
      createdAt,
      expiresAt: expiresAt.toISOString(),
      documentName,
      principalIdHash: sha256(input.principalId),
    }, deps);
  }

  if (s3Store.usesGcs(mode)) {
    await getBucket(deps).file(objectPath).save(input.pdfBuffer, {
      contentType: 'application/pdf',
      resumable: false,
      validation: 'crc32c',
      metadata: {
        cacheControl: 'private, no-store, max-age=0, no-transform',
        contentDisposition: `attachment; filename="${documentName}"`,
        metadata: {
          jobId: input.jobId,
          principalIdHash: sha256(input.principalId),
          conversionMode: input.conversionMode || 'html',
          sourceHash: input.sourceHash || '',
          templateHash: input.templateHash || '',
          requestHash: input.requestHash,
          expiresAt: expiresAt.toISOString(),
        },
      },
    });
    gcsObjectPath = objectPath;
  }

  const record = {
    jobId: input.jobId,
    principalId: input.principalId,
    ownerUid: input.ownerUid || null,
    conversionMode: input.conversionMode || 'html',
    sourceName: input.sourceName || null,
    sourceHash: input.sourceHash || null,
    templateId: input.templateId || null,
    templateHash: input.templateHash || null,
    renderedHash: input.renderedHash || null,
    requestHash: input.requestHash,
    idempotencyDocId: input.idempotencyDocId,
    status: 'ready',
    storageProvider: s3Record ? 's3' : 'gcs',
    outputStoreMode: mode,
    objectPath: gcsObjectPath,
    gcsObjectPath,
    ...(s3Record || {}),
    documentName,
    mimeType: 'application/pdf',
    size: input.pdfBuffer.length,
    sha256: sha256(input.pdfBuffer),
    createdAt: createdAt.toISOString(),
    updatedAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
  const batch = db.batch();
  batch.set(db.collection(JOBS_COLLECTION).doc(input.jobId), record);
  batch.set(db.collection(IDEMPOTENCY_COLLECTION).doc(input.idempotencyDocId), {
    status: 'ready',
    jobId: input.jobId,
    updatedAt: createdAt.toISOString(),
  }, { merge: true });
  await batch.commit();
  return record;
}

async function markFailed(input, deps = {}) {
  if (!input || !input.idempotencyDocId) return;
  const db = getFirestore(deps);
  await db.collection(IDEMPOTENCY_COLLECTION).doc(input.idempotencyDocId).set({
    status: 'failed',
    errorCode: String(input.errorCode || 'PDF_GENERATION_FAILED').slice(0, 100),
    updatedAt: now(deps).toISOString(),
  }, { merge: true });
}

async function getJob(jobId, deps = {}) {
  const snapshot = await getFirestore(deps).collection(JOBS_COLLECTION).doc(String(jobId || '')).get();
  return snapshot.exists ? snapshot.data() : null;
}

async function issueDownloadToken(job, deps = {}) {
  if (!job || job.status !== 'ready') {
    throw new PdfPersonalisationError('PDF is not ready.', 409, 'PDF_NOT_READY');
  }
  if (Date.parse(job.expiresAt) <= now(deps).getTime()) {
    throw new PdfPersonalisationError('PDF has expired.', 410, 'PDF_EXPIRED');
  }
  const token = randomBytes(32).toString('base64url');
  const tokenHash = sha256(token);
  await getFirestore(deps).collection(DOWNLOADS_COLLECTION).doc(tokenHash).set({
    jobId: job.jobId,
    storageProvider: job.storageProvider || 'gcs',
    objectPath: job.objectPath || null,
    gcsObjectPath: job.gcsObjectPath || job.objectPath || null,
    s3Bucket: job.s3Bucket || null,
    s3Region: job.s3Region || null,
    s3Key: job.s3Key || null,
    documentName: job.documentName,
    mimeType: job.mimeType,
    size: job.size,
    expiresAt: job.expiresAt,
    createdAt: now(deps).toISOString(),
    accessCount: 0,
  });
  return token;
}

async function resolveDownloadToken(token, deps = {}) {
  const tokenHash = sha256(token);
  const ref = getFirestore(deps).collection(DOWNLOADS_COLLECTION).doc(tokenHash);
  const snapshot = await ref.get();
  if (!snapshot.exists) return null;
  const record = snapshot.data() || {};
  if (Date.parse(record.expiresAt || '') <= now(deps).getTime()) return null;
  try {
    await ref.set({
      lastAccessAt: now(deps).toISOString(),
      accessCount: admin.firestore.FieldValue.increment(1),
    }, { merge: true });
  } catch (_error) {
    // Download access must not fail only because audit metadata could not update.
  }
  return record;
}

async function openDownload(record, deps = {}, options = {}) {
  const gcsPath = String(record && (record.gcsObjectPath || record.objectPath) || '').trim();
  if (record && record.storageProvider === 's3' && record.s3Key) {
    try {
      const opened = await s3Store.openPdf(record, deps, options);
      if (opened) return opened;
    } catch (error) {
      if (!gcsPath) throw error;
      console.warn('[pdfPersonalisation] S3 read failed; using GCS fallback', String(error && error.message || error));
    }
  }
  if (!gcsPath) return null;
  const file = getBucket(deps).file(gcsPath);
  const [exists] = await file.exists();
  if (!exists) return null;
  return {
    stream: options.headOnly ? null : file.createReadStream(),
    contentLength: Number(record.size || 0),
  };
}

function safeTemplateName(value) {
  const name = String(value || 'Untitled PDF template').trim().replace(/\s+/g, ' ').slice(0, 120);
  return name || 'Untitled PDF template';
}

async function saveTemplate(input, deps = {}) {
  const html = validateHtmlTemplate(input.htmlTemplate);
  const db = getFirestore(deps);
  const bucket = getBucket(deps);
  const templateId = deps.randomId ? deps.randomId() : randomUUID();
  const path = templateObjectPath(input.ownerUid, templateId);
  const timestamp = now(deps).toISOString();
  await bucket.file(path).save(Buffer.from(html, 'utf8'), {
    contentType: 'text/html; charset=utf-8',
    resumable: false,
    validation: 'crc32c',
    metadata: {
      cacheControl: 'private, no-store, max-age=0',
      metadata: { templateId, ownerUidHash: sha256(input.ownerUid) },
    },
  });
  const record = {
    templateId,
    ownerUid: input.ownerUid,
    name: safeTemplateName(input.name),
    objectPath: path,
    templateHash: sha256(html),
    size: Buffer.byteLength(html, 'utf8'),
    createdAt: timestamp,
    updatedAt: timestamp,
    status: 'active',
  };
  await db.collection(TEMPLATES_COLLECTION).doc(templateId).set(record);
  return record;
}

async function getTemplate(templateId, deps = {}) {
  const db = getFirestore(deps);
  const snapshot = await db.collection(TEMPLATES_COLLECTION).doc(String(templateId || '')).get();
  if (!snapshot.exists) return null;
  const record = snapshot.data() || {};
  if (record.status !== 'active' || !record.objectPath) return null;
  const [bytes] = await getBucket(deps).file(record.objectPath).download();
  return { ...record, htmlTemplate: bytes.toString('utf8') };
}

async function listTemplates(ownerUid, deps = {}) {
  const snapshot = await getFirestore(deps).collection(TEMPLATES_COLLECTION)
    .where('ownerUid', '==', ownerUid)
    .get();
  return snapshot.docs
    .map((doc) => doc.data())
    .filter((record) => record && record.status === 'active')
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .map(({ objectPath, ownerUid: _ownerUid, ...record }) => record);
}

async function cleanupExpired(deps = {}) {
  const db = getFirestore(deps);
  const bucket = getBucket(deps);
  const cutoff = now(deps).toISOString();
  const snapshot = await db.collection(JOBS_COLLECTION)
    .where('expiresAt', '<=', cutoff)
    .limit(100)
    .get();
  let deleted = 0;
  for (const doc of snapshot.docs) {
    const job = doc.data() || {};
    const gcsPath = job.gcsObjectPath || job.objectPath;
    if (gcsPath) await bucket.file(gcsPath).delete({ ignoreNotFound: true }).catch(() => {});
    const tokenSnapshot = await db.collection(DOWNLOADS_COLLECTION).where('jobId', '==', doc.id).get();
    const batch = db.batch();
    tokenSnapshot.docs.forEach((tokenDoc) => batch.delete(tokenDoc.ref));
    if (job.idempotencyDocId) batch.delete(db.collection(IDEMPOTENCY_COLLECTION).doc(job.idempotencyDocId));
    batch.delete(doc.ref);
    await batch.commit();
    deleted += 1;
  }
  return { deleted };
}

module.exports = {
  JOBS_COLLECTION,
  IDEMPOTENCY_COLLECTION,
  DOWNLOADS_COLLECTION,
  TEMPLATES_COLLECTION,
  OBJECT_PREFIX,
  DEFAULT_RETENTION_DAYS,
  bucketName,
  retentionDays,
  jobObjectPath,
  templateObjectPath,
  idempotencyDocId,
  claimIdempotency,
  saveReadyJob,
  markFailed,
  getJob,
  issueDownloadToken,
  resolveDownloadToken,
  openDownload,
  saveTemplate,
  getTemplate,
  listTemplates,
  cleanupExpired,
};
