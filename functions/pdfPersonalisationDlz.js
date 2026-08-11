'use strict';

const { Readable } = require('node:stream');
const { PdfPersonalisationError, safeDocumentName } = require('./pdfPersonalisationCore');

const CREDENTIALS_URL = 'https://platform.adobe.io/data/foundation/connectors/landingzone/credentials?type=user_drop_zone';
const DEFAULT_PREFIX = 'pdf-personalisation';
const CACHE_MS = 5 * 60 * 1000;
const DLZ_RETENTION_DAYS = 7;

let credentialCache = { value: null, expiresAtMs: 0 };

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

function objectPath(jobId, createdAt, prefix = DEFAULT_PREFIX) {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${normalisePrefix(prefix)}/${yyyy}/${mm}/${dd}/${safeSegment(jobId)}.pdf`;
}

function sandboxName(deps = {}) {
  return String(deps.adobeSandbox || process.env.ADOBE_SANDBOX_NAME || 'apalmer').trim();
}

function validateCredentials(value) {
  const credentials = value && typeof value === 'object' ? value : {};
  const containerName = String(credentials.containerName || '').trim();
  const storageAccountName = String(credentials.storageAccountName || '').trim();
  const sasUri = String(credentials.SASUri || '').trim();
  if (!containerName || !storageAccountName || !sasUri) {
    throw new PdfPersonalisationError(
      'Adobe Data Landing Zone credentials are unavailable.',
      503,
      'PDF_DLZ_NOT_CONFIGURED',
    );
  }
  let parsed;
  try { parsed = new URL(sasUri); } catch (_error) {}
  if (!parsed || parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.blob.core.windows.net')) {
    throw new PdfPersonalisationError(
      'Adobe Data Landing Zone returned an unsupported storage endpoint.',
      502,
      'PDF_DLZ_ENDPOINT_INVALID',
    );
  }
  return { ...credentials, containerName, storageAccountName, SASUri: sasUri };
}

async function getCredentials(deps = {}) {
  if (typeof deps.getDlzCredentials === 'function') {
    return validateCredentials(await deps.getDlzCredentials());
  }
  if (credentialCache.value && Date.now() < credentialCache.expiresAtMs) {
    return credentialCache.value;
  }
  if (typeof deps.getAdobeAccessToken !== 'function' || typeof deps.aepHeaders !== 'function') {
    throw new PdfPersonalisationError(
      'Adobe Data Landing Zone authentication is not configured.',
      503,
      'PDF_DLZ_NOT_CONFIGURED',
    );
  }
  const accessToken = await deps.getAdobeAccessToken();
  const response = await (deps.fetch || fetch)(CREDENTIALS_URL, {
    method: 'GET',
    headers: {
      ...deps.aepHeaders(accessToken),
      'x-sandbox-name': sandboxName(deps),
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new PdfPersonalisationError(
      `Adobe Data Landing Zone credentials request failed (HTTP ${response.status}).`,
      502,
      'PDF_DLZ_CREDENTIALS_FAILED',
    );
  }
  const credentials = validateCredentials(await response.json());
  credentialCache = { value: credentials, expiresAtMs: Date.now() + CACHE_MS };
  return credentials;
}

function signedObjectUrl(credentials, path) {
  const url = new URL(credentials.SASUri);
  const encodedPath = String(path || '').split('/').map(encodeURIComponent).join('/');
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${encodedPath}`;
  return url;
}

function dlzExpiry(createdAt) {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  return new Date(date.getTime() + DLZ_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

async function uploadPdf(input, deps = {}) {
  const credentials = await getCredentials(deps);
  const path = objectPath(input.jobId, input.createdAt, deps.dlzPrefix);
  const pdfBuffer = Buffer.from(input.pdfBuffer || []);
  const response = await (deps.fetch || fetch)(signedObjectUrl(credentials, path), {
    method: 'PUT',
    headers: {
      'x-ms-blob-type': 'BlockBlob',
      'x-ms-version': '2022-11-02',
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeDocumentName(input.documentName)}"`,
    },
    body: pdfBuffer,
  });
  if (!response.ok) {
    throw new PdfPersonalisationError(
      `Adobe Data Landing Zone upload failed (HTTP ${response.status}).`,
      502,
      'PDF_DLZ_UPLOAD_FAILED',
    );
  }
  const verified = await (deps.fetch || fetch)(signedObjectUrl(credentials, path), { method: 'HEAD' });
  const verifiedSize = Number(verified.headers && verified.headers.get('content-length'));
  if (!verified.ok || verifiedSize !== pdfBuffer.length) {
    throw new PdfPersonalisationError(
      'Adobe Data Landing Zone upload could not be verified.',
      502,
      'PDF_DLZ_VERIFY_FAILED',
    );
  }
  return {
    dlzContainer: credentials.containerName,
    dlzStorageAccount: credentials.storageAccountName,
    dlzObjectPath: path,
    dlzPlatformPath: `${credentials.containerName}/${path}`,
    dlzUri: `dlz://${credentials.storageAccountName}/${credentials.containerName}/${path}`,
    dlzExpiresAt: dlzExpiry(input.createdAt),
  };
}

async function openPdf(record, deps = {}, options = {}) {
  const path = String(record && record.dlzObjectPath || '').trim();
  if (!path) return null;
  const credentials = await getCredentials(deps);
  if (record.dlzContainer && credentials.containerName !== record.dlzContainer) return null;
  const response = await (deps.fetch || fetch)(signedObjectUrl(credentials, path), {
    method: options.headOnly ? 'HEAD' : 'GET',
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new PdfPersonalisationError(
      `Adobe Data Landing Zone download failed (HTTP ${response.status}).`,
      502,
      'PDF_DLZ_DOWNLOAD_FAILED',
    );
  }
  const responseBody = response.body;
  const stream = options.headOnly || !responseBody
    ? null
    : typeof responseBody.getReader === 'function' ? Readable.fromWeb(responseBody) : responseBody;
  return {
    stream,
    contentLength: Number(response.headers && response.headers.get('content-length') || record.size || 0),
  };
}

module.exports = {
  CREDENTIALS_URL,
  DEFAULT_PREFIX,
  DLZ_RETENTION_DAYS,
  normalisePrefix,
  objectPath,
  getCredentials,
  signedObjectUrl,
  uploadPdf,
  openPdf,
};
