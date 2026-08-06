'use strict';

const { randomUUID, timingSafeEqual } = require('node:crypto');
const core = require('./pdfPersonalisationCore');
const store = require('./pdfPersonalisationStore');

const DEFAULT_ALLOWED_EMAILS = ['apalmer@adobe.com'];

function allowedEmails() {
  const configured = String(process.env.PDF_PERSONALISATION_ALLOWED_EMAILS || '').trim();
  const values = configured ? configured.split(',') : DEFAULT_ALLOWED_EMAILS;
  return new Set(values.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean));
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function routePath(req) {
  const raw = String(req.originalUrl || req.url || req.path || '/').split('?')[0];
  const marker = '/api/pdf-personalisation';
  const markerIndex = raw.indexOf(marker);
  const path = markerIndex >= 0 ? raw.slice(markerIndex + marker.length) : raw;
  return `/${String(path || '').replace(/^\/+/, '')}`.replace(/\/+$/, '') || '/';
}

function jsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  try {
    return JSON.parse(Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : String(req.rawBody || '{}'));
  } catch {
    throw new core.PdfPersonalisationError('Invalid JSON body.', 400, 'PDF_REQUEST_JSON_INVALID');
  }
}

async function authorise(req, deps = {}) {
  const configuredServiceKey = deps.getServiceApiKey
    ? String(deps.getServiceApiKey() || '').trim()
    : '';
  const suppliedServiceKey = String(req.get && req.get('x-pdf-api-key') || '').trim();
  if (configuredServiceKey && constantTimeEqual(suppliedServiceKey, configuredServiceKey)) {
    return { principalId: 'service:ajo', ownerUid: null, type: 'service', email: null };
  }
  const claims = await deps.verifyIdTokenClaimsFromRequest(req);
  if (!claims || !claims.uid || claims.isAnonymous || !claims.email) {
    throw new core.PdfPersonalisationError('Sign in with an authorised Adobe account.', 401, 'PDF_AUTH_REQUIRED');
  }
  if (!allowedEmails().has(String(claims.email).toLowerCase())) {
    throw new core.PdfPersonalisationError('This account cannot use PDF personalisation.', 403, 'PDF_AUTH_FORBIDDEN');
  }
  return {
    principalId: `user:${claims.uid}`,
    ownerUid: claims.uid,
    type: 'portal',
    email: claims.email,
  };
}

function publicBaseUrl(req) {
  const configured = String(process.env.PDF_PERSONALISATION_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const forwardedProto = String(req.get && req.get('x-forwarded-proto') || 'https').split(',')[0].trim();
  const host = String(req.get && (req.get('x-forwarded-host') || req.get('host')) || '').split(',')[0].trim();
  if (host && !host.includes('cloudfunctions.net')) {
    return `${forwardedProto || 'https'}://${host}/api/pdf-personalisation`;
  }
  return 'https://aep-orchestration-lab.web.app/api/pdf-personalisation';
}

async function responseForReadyJob(job, req, deps = {}) {
  const token = await store.issueDownloadToken(job, deps);
  const downloadUrl = `${publicBaseUrl(req)}/download/${encodeURIComponent(token)}`;
  return {
    status: 'ready',
    jobId: job.jobId,
    conversionMode: job.conversionMode || 'html',
    documentOperation: job.documentOperation || null,
    sourceName: job.sourceName || null,
    templateId: job.templateId || null,
    documentName: job.documentName,
    mimeType: job.mimeType,
    size: job.size,
    sha256: job.sha256,
    createdAt: job.createdAt,
    expiresAt: job.expiresAt,
    storageProvider: job.storageProvider || 'gcs',
    storageUri: job.s3Uri || null,
    downloadUrl,
    previewUrl: `${downloadUrl}?disposition=inline`,
    ajoHandoff: {
      attachmentName: job.documentName,
      attachmentMimeType: job.mimeType,
      attachmentUrl: downloadUrl,
    },
  };
}

function downloadDisposition(req) {
  const requested = String(req && req.query && req.query.disposition || '').trim().toLowerCase();
  return requested === 'inline' ? 'inline' : 'attachment';
}

async function resolveTemplate(input, principal, deps = {}) {
  if (!input.templateId) return { htmlTemplate: input.htmlTemplate, templateId: null };
  const template = await store.getTemplate(input.templateId, deps);
  if (!template) {
    throw new core.PdfPersonalisationError('Template was not found.', 404, 'PDF_TEMPLATE_NOT_FOUND');
  }
  if (principal.type === 'portal' && template.ownerUid !== principal.ownerUid) {
    throw new core.PdfPersonalisationError('Template was not found.', 404, 'PDF_TEMPLATE_NOT_FOUND');
  }
  return { htmlTemplate: template.htmlTemplate, templateId: template.templateId };
}

function sendError(res, error) {
  const known = error instanceof core.PdfPersonalisationError;
  const status = known ? error.status : 500;
  const code = known ? error.code : 'PDF_PERSONALISATION_INTERNAL';
  if (!known) console.error('[pdfPersonalisation]', String(error && error.stack || error));
  if (!res.headersSent) {
    res.status(status).json({
      status: 'error',
      error: code,
      message: known ? error.message : 'PDF personalisation failed.',
    });
  }
}

async function handleDownload(req, res, token, deps = {}) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'GET only' });
    return;
  }
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
    res.status(404).send('not found');
    return;
  }
  const record = await store.resolveDownloadToken(token, deps);
  if (!record) {
    res.status(404).send('not found or expired');
    return;
  }
  const opened = await store.openDownload(record, deps, { headOnly: req.method === 'HEAD' });
  if (!opened) {
    res.status(404).send('not found');
    return;
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${downloadDisposition(req)}; filename="${core.safeDocumentName(record.documentName)}"`,
  );
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, no-transform');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const contentLength = Number(opened.contentLength || record.size || 0);
  if (contentLength) res.setHeader('Content-Length', String(contentLength));
  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }
  opened.stream
    .on('error', (error) => {
      console.error('[pdfPersonalisation] download stream', String(error && error.message || error));
      if (!res.headersSent) res.status(500).send('download failed');
    })
    .pipe(res);
}

function createHandler(deps) {
  const required = deps || {};
  if (typeof required.verifyIdTokenClaimsFromRequest !== 'function') {
    throw new Error('createHandler requires verifyIdTokenClaimsFromRequest');
  }
  return async function pdfPersonalisationHandler(req, res) {
    required.setCors(res, 'GET, POST, HEAD, OPTIONS');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    const path = routePath(req);
    const downloadMatch = path.match(/^\/download\/([^/]+)$/);
    try {
      if (downloadMatch) {
        await handleDownload(req, res, decodeURIComponent(downloadMatch[1]), required);
        return;
      }

      const principal = await authorise(req, required);

      if (path === '/templates' && req.method === 'GET') {
        if (principal.type !== 'portal') {
          throw new core.PdfPersonalisationError('Portal authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        res.status(200).json({ templates: await store.listTemplates(principal.ownerUid, required) });
        return;
      }

      if (path === '/templates' && req.method === 'POST') {
        if (principal.type !== 'portal') {
          throw new core.PdfPersonalisationError('Portal authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        const body = jsonBody(req);
        const saved = await store.saveTemplate({
          ownerUid: principal.ownerUid,
          name: body.name,
          htmlTemplate: body.htmlTemplate,
        }, required);
        const { ownerUid: _ownerUid, objectPath: _objectPath, ...response } = saved;
        res.status(201).json(response);
        return;
      }

      if (path === '/preview' && req.method === 'POST') {
        if (principal.type !== 'portal') {
          throw new core.PdfPersonalisationError('Portal authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        const body = jsonBody(req);
        const templateId = String(body.templateId || '').trim();
        const resolved = templateId
          ? await resolveTemplate({ templateId }, principal, required)
          : { htmlTemplate: core.validateHtmlTemplate(body.htmlTemplate), templateId: null };
        const rendered = core.renderHtmlTemplate(resolved.htmlTemplate, core.normaliseData(body.data || {}), body.options);
        res.status(200).json({
          status: 'preview',
          templateId: resolved.templateId,
          renderedHtml: rendered.renderedHtml,
          templateHash: rendered.templateHash,
          renderedHash: rendered.renderedHash,
          renderedBytes: Buffer.byteLength(rendered.renderedHtml, 'utf8'),
        });
        return;
      }

      if (path === '/generate' && req.method === 'POST') {
        const input = core.normaliseGenerateRequest(jsonBody(req));
        let resolved = { templateId: null, htmlTemplate: '' };
        let rendered = null;
        if (input.conversionMode === 'html') {
          resolved = await resolveTemplate(input, principal, required);
          rendered = core.renderHtmlTemplate(resolved.htmlTemplate, input.data, input.options);
        }
        const hash = core.requestHash(input, rendered && rendered.templateHash);
        const jobId = randomUUID();
        const claim = await store.claimIdempotency({
          principalId: principal.principalId,
          idempotencyKey: input.idempotencyKey,
          requestHash: hash,
          jobId,
        }, required);
        if (claim.status === 'ready') {
          const existing = await store.getJob(claim.jobId, required);
          if (!existing) {
            throw new core.PdfPersonalisationError('Stored PDF metadata is unavailable.', 503, 'PDF_JOB_METADATA_MISSING');
          }
          res.status(200).json({ ...(await responseForReadyJob(existing, req, required)), reused: true });
          return;
        }
        if (claim.status === 'processing') {
          res.status(202).json({ status: 'processing', jobId: claim.jobId, retryAfterSeconds: 5 });
          return;
        }
        try {
          const credentials = {
            clientId: required.getPdfClientId(),
            clientSecret: required.getPdfClientSecret(),
          };
          let pdfBuffer;
          if (input.conversionMode === 'document') {
            pdfBuffer = await core.convertDocumentToPdf(input.sourceDocument, input.data, credentials, required);
          } else {
            const zipBuffer = await core.createHtmlZip(rendered.renderedHtml);
            pdfBuffer = await core.convertHtmlZipToPdf(zipBuffer, input.options, credentials, required);
          }
          const record = await store.saveReadyJob({
            jobId,
            principalId: principal.principalId,
            ownerUid: principal.ownerUid,
            conversionMode: input.conversionMode,
            documentOperation: input.documentOperation,
            sourceName: input.sourceDocument && input.sourceDocument.fileName,
            sourceHash: input.sourceDocument && input.sourceDocument.sha256,
            templateId: resolved.templateId,
            templateHash: rendered && rendered.templateHash,
            renderedHash: rendered && rendered.renderedHash,
            requestHash: hash,
            idempotencyDocId: claim.docId,
            documentName: input.documentName,
            pdfBuffer,
            createdAt: new Date(),
          }, required);
          res.status(201).json({ ...(await responseForReadyJob(record, req, required)), reused: false });
          return;
        } catch (error) {
          await store.markFailed({
            idempotencyDocId: claim.docId,
            errorCode: error && error.code || 'PDF_GENERATION_FAILED',
          }, required).catch(() => {});
          if (error instanceof core.PdfPersonalisationError) throw error;
          console.error('[pdfPersonalisation] Adobe conversion', String(error && error.stack || error));
          throw new core.PdfPersonalisationError(
            'Adobe PDF Services could not generate the document.',
            502,
            'PDF_SERVICES_GENERATION_FAILED',
          );
        }
      }

      const statusMatch = path.match(/^\/status\/([a-f0-9-]{16,50})$/i);
      if (statusMatch && req.method === 'GET') {
        const job = await store.getJob(statusMatch[1], required);
        if (!job || (principal.type === 'portal' && job.principalId !== principal.principalId)) {
          throw new core.PdfPersonalisationError('PDF job was not found.', 404, 'PDF_JOB_NOT_FOUND');
        }
        res.status(200).json(await responseForReadyJob(job, req, required));
        return;
      }

      res.status(404).json({ error: 'PDF personalisation route not found' });
    } catch (error) {
      sendError(res, error);
    }
  };
}

module.exports = {
  DEFAULT_ALLOWED_EMAILS,
  allowedEmails,
  constantTimeEqual,
  routePath,
  authorise,
  publicBaseUrl,
  downloadDisposition,
  createHandler,
};
