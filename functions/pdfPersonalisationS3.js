'use strict';

const { createHash } = require('node:crypto');
const {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');
const { PdfPersonalisationError, safeDocumentName } = require('./pdfPersonalisationCore');

const DEFAULT_BUCKET = 'adobe-demo-emea-ajo-pdf';
const DEFAULT_REGION = 'us-east-1';
const DEFAULT_PREFIX = 'pdf-personalisation';
const OUTPUT_STORE_MODES = new Set(['gcs', 's3', 'dual']);

function outputStoreMode(deps = {}) {
  const configured = String(deps.outputStoreMode || process.env.PDF_OUTPUT_STORE || 'gcs')
    .trim()
    .toLowerCase();
  return OUTPUT_STORE_MODES.has(configured) ? configured : 'gcs';
}

function usesS3(mode) {
  return mode === 's3' || mode === 'dual';
}

function usesGcs(mode) {
  return mode === 'gcs' || mode === 'dual';
}

function safeSegment(value, fallback = 'unknown') {
  const result = String(value || '').toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
    .slice(0, 100);
  return result || fallback;
}

function normalisePrefix(value) {
  return String(value || DEFAULT_PREFIX)
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .map((part) => safeSegment(part))
    .filter(Boolean)
    .join('/') || DEFAULT_PREFIX;
}

function objectKey(jobId, createdAt, prefix = DEFAULT_PREFIX) {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${normalisePrefix(prefix)}/${yyyy}/${mm}/${dd}/${safeSegment(jobId)}.pdf`;
}

function config(deps = {}, overrides = {}) {
  const bucket = String(overrides.bucket || deps.s3Bucket || process.env.PDF_S3_BUCKET || DEFAULT_BUCKET).trim();
  const region = String(overrides.region || deps.s3Region || process.env.PDF_S3_REGION || DEFAULT_REGION).trim();
  const prefix = normalisePrefix(deps.s3Prefix || process.env.PDF_S3_PREFIX || DEFAULT_PREFIX);
  const accessKeyId = String(deps.getS3AccessKeyId ? deps.getS3AccessKeyId() : '').trim();
  const secretAccessKey = String(deps.getS3SecretAccessKey ? deps.getS3SecretAccessKey() : '').trim();
  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new PdfPersonalisationError(
      'Amazon S3 output credentials are not configured.',
      503,
      'PDF_S3_NOT_CONFIGURED',
    );
  }
  return { bucket, region, prefix, accessKeyId, secretAccessKey };
}

function clientFor(deps, resolved) {
  if (deps.s3Client) return deps.s3Client;
  return new S3Client({
    region: resolved.region,
    credentials: {
      accessKeyId: resolved.accessKeyId,
      secretAccessKey: resolved.secretAccessKey,
    },
  });
}

function sha256Base64(value) {
  return createHash('sha256').update(value).digest('base64');
}

async function uploadPdf(input, deps = {}) {
  const resolved = config(deps);
  const key = objectKey(input.jobId, input.createdAt, resolved.prefix);
  const documentName = safeDocumentName(input.documentName);
  const pdfBuffer = Buffer.from(input.pdfBuffer || []);
  const response = await clientFor(deps, resolved).send(new PutObjectCommand({
    Bucket: resolved.bucket,
    Key: key,
    Body: pdfBuffer,
    ContentType: 'application/pdf',
    ContentDisposition: `attachment; filename="${documentName}"`,
    CacheControl: 'private, no-store, max-age=0, no-transform',
    ChecksumSHA256: sha256Base64(pdfBuffer),
    Metadata: {
      jobid: String(input.jobId || ''),
      principalidhash: String(input.principalIdHash || ''),
      conversionmode: String(input.conversionMode || 'html'),
      sourcehash: String(input.sourceHash || ''),
      templatehash: String(input.templateHash || ''),
      requesthash: String(input.requestHash || ''),
      expiresat: String(input.expiresAt || ''),
    },
  }));
  return {
    s3Bucket: resolved.bucket,
    s3Region: resolved.region,
    s3Key: key,
    s3Uri: `s3://${resolved.bucket}/${key}`,
    s3ETag: String(response && response.ETag || '').replace(/^"|"$/g, '') || null,
    s3ChecksumSHA256: String(response && response.ChecksumSHA256 || '') || null,
  };
}

function isMissingObjectError(error) {
  const name = String(error && (error.name || error.Code) || '');
  const status = Number(error && error.$metadata && error.$metadata.httpStatusCode);
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}

async function openPdf(record, deps = {}, options = {}) {
  const resolved = config(deps, { bucket: record.s3Bucket, region: record.s3Region });
  const common = { Bucket: resolved.bucket, Key: String(record.s3Key || '') };
  try {
    if (options.headOnly) {
      const response = await clientFor(deps, resolved).send(new HeadObjectCommand(common));
      return { stream: null, contentLength: Number(response.ContentLength || record.size || 0) };
    }
    const response = await clientFor(deps, resolved).send(new GetObjectCommand(common));
    if (!response || !response.Body) return null;
    return {
      stream: response.Body,
      contentLength: Number(response.ContentLength || record.size || 0),
    };
  } catch (error) {
    if (isMissingObjectError(error)) return null;
    throw error;
  }
}

module.exports = {
  DEFAULT_BUCKET,
  DEFAULT_REGION,
  DEFAULT_PREFIX,
  outputStoreMode,
  usesS3,
  usesGcs,
  normalisePrefix,
  objectKey,
  uploadPdf,
  openPdf,
};
