'use strict';

const { randomUUID, timingSafeEqual } = require('node:crypto');
const core = require('./pdfPersonalisationCore');
const docxData = require('./pdfPersonalisationDocxData');
const store = require('./pdfPersonalisationStore');
const journeyAction = require('./pdfJourneyActionService');
const journeyTemplates = require('./pdfJourneyTemplates');
const journeyTemplateContract = require('./pdfJourneyTemplateContract');

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

async function validateJourneyTemplatePublication(input, deps = {}) {
  const analysis = input.analysis || journeyTemplateContract.analyseTemplate(input.sourceFile);
  const mappings = journeyTemplateContract.normalizeMappings(analysis.fields, input.fieldMappings);
  const samplePayload = input.samplePayload && typeof input.samplePayload === 'object'
    ? input.samplePayload
    : {};
  const sampleData = core.normaliseDocumentMergeData(
    samplePayload.data && typeof samplePayload.data === 'object' ? samplePayload.data : samplePayload,
  );
  const recipient = {
    firstName: String(samplePayload.firstName || sampleData.firstName || '').trim(),
    lastName: String(samplePayload.lastName || sampleData.lastName || '').trim(),
  };
  const mappedData = journeyTemplateContract.applyMappings(sampleData, mappings, recipient);
  journeyTemplateContract.validateMappedData(mappedData, mappings);
  const credentials = {
    clientId: deps.getPdfClientId(),
    clientSecret: deps.getPdfClientSecret(),
  };
  let pdfBuffer;
  if (analysis.kind === 'html') {
    const html = Buffer.from(String(input.sourceFile.base64 || ''), 'base64').toString('utf8');
    const rendered = core.renderHtmlTemplate(core.validateHtmlTemplate(html), mappedData, {});
    pdfBuffer = await core.convertHtmlZipToPdf(
      await core.createHtmlZip(rendered.renderedHtml),
      {},
      credentials,
      deps,
    );
  } else {
    const sourceDocument = core.normaliseSourceDocument(input.sourceFile);
    pdfBuffer = await core.convertDocumentToPdf(sourceDocument, mappedData, credentials, deps);
  }
  const pageCount = await core.pdfPageCount(pdfBuffer);
  const expectedPageCount = Math.max(1, Math.min(20, Number(input.expectedPageCount) || 1));
  if (pageCount !== expectedPageCount) {
    throw new core.PdfPersonalisationError(
      `Template generated ${pageCount} pages; expected ${expectedPageCount}. Correct the layout before publishing.`,
      400,
      'PDF_JOURNEY_TEMPLATE_PAGE_COUNT_MISMATCH',
    );
  }
  return {
    analysis,
    mappings,
    sampleData,
    recipient,
    mappedData,
    pageCount,
    expectedPageCount,
    validatedAt: new Date().toISOString(),
  };
}

function hasDocumentValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function mapDocumentTemplateData(sourceDocument, data, deps = {}) {
  if (!sourceDocument || !/\.docx$/i.test(String(sourceDocument.fileName || ''))) return data;
  const analyse = deps.analyseJourneyTemplate || journeyTemplateContract.analyseTemplate;
  const analysis = analyse({
    fileName: sourceDocument.fileName,
    mimeType: sourceDocument.mimeType,
    base64: Buffer.from(sourceDocument.buffer || []).toString('base64'),
  });
  const mappings = (Array.isArray(analysis && analysis.suggestedMappings)
    ? analysis.suggestedMappings
    : []).filter((mapping) => String(mapping && mapping.source || '').trim());
  if (!mappings.length) return data;

  const mapped = journeyTemplateContract.applyMappings(data, mappings);
  mappings.forEach((mapping) => {
    if (!hasDocumentValue(mapped[mapping.target]) && hasDocumentValue(data[mapping.target])) {
      mapped[mapping.target] = data[mapping.target];
    }
  });
  return core.normaliseDocumentMergeData(mapped);
}

async function authorise(req, deps = {}) {
  const configuredServiceKey = deps.getServiceApiKey
    ? String(deps.getServiceApiKey() || '').trim()
    : '';
  const suppliedServiceKey = String(req.get && req.get('x-pdf-api-key') || '').trim();
  if (configuredServiceKey && constantTimeEqual(suppliedServiceKey, configuredServiceKey)) {
    return { principalId: 'service:ajo', ownerUid: null, type: 'service', email: null, scope: 'all' };
  }
  if (suppliedServiceKey && typeof deps.validateJourneyApiKey === 'function') {
    const keyAuth = await deps.validateJourneyApiKey(suppliedServiceKey);
    if (keyAuth && keyAuth.ok) {
      return {
        principalId: `service:pdf-key:${keyAuth.keyId}`,
        ownerUid: keyAuth.principalUid || null,
        type: 'service',
        email: keyAuth.principalEmail || null,
        scope: 'journey-action',
        keyId: keyAuth.keyId,
      };
    }
  }
  const suppliedMcpKey = String(req.get && req.get('x-aep-lab-mcp-key') || '').trim();
  if (suppliedMcpKey) {
    const keyAuth = typeof deps.validateMcpApiKey === 'function'
      ? await deps.validateMcpApiKey(suppliedMcpKey)
      : null;
    if (!keyAuth || !keyAuth.ok || !keyAuth.principalUid || !keyAuth.sandbox) {
      throw new core.PdfPersonalisationError('Invalid MCP API key.', 401, 'PDF_MCP_AUTH_INVALID');
    }
    return {
      principalId: `mcp:${keyAuth.principalUid}:${keyAuth.sandbox}`,
      ownerUid: keyAuth.principalUid,
      type: 'mcp',
      email: keyAuth.principalEmail || null,
      scope: 'pdf-mcp',
      keyId: keyAuth.keyId,
      sandbox: keyAuth.sandbox,
    };
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

function isOwnerPrincipal(principal) {
  return !!principal && (principal.type === 'portal' || principal.type === 'mcp') && !!principal.ownerUid;
}

function scopedSandbox(principal, supplied) {
  const requested = String(supplied || '').trim();
  if (!principal || principal.type !== 'mcp') return requested || null;
  if (requested && requested !== principal.sandbox) {
    throw new core.PdfPersonalisationError(
      `Sandbox "${requested}" does not match this MCP key's "${principal.sandbox}" scope.`,
      403,
      'PDF_MCP_SANDBOX_FORBIDDEN',
    );
  }
  return principal.sandbox;
}

function canAccessOwnedRecord(record, principal) {
  if (record && principal && principal.type === 'service' && principal.scope === 'all') return true;
  if (!record || !isOwnerPrincipal(principal) || record.ownerUid !== principal.ownerUid) return false;
  if (principal.type !== 'mcp') return true;
  return !record.sandbox || record.sandbox === principal.sandbox;
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
  const gatewayUrl = `${publicBaseUrl(req)}/download/${encodeURIComponent(token)}`;
  const storageUrl = (storage, disposition) => {
    const params = new URLSearchParams({ storage });
    if (disposition) params.set('disposition', disposition);
    return `${gatewayUrl}?${params.toString()}`;
  };
  const storageLocations = {};
  if (job.dlzObjectPath) {
    storageLocations.dlz = {
      provider: 'Adobe AJO email-attachment DLZ',
      primary: true,
      uri: job.dlzUri,
      objectPath: job.dlzObjectPath,
      platformPath: job.dlzPlatformPath,
      expiresAt: job.dlzExpiresAt,
      downloadUrl: storageUrl('dlz'),
      previewUrl: storageUrl('dlz', 'inline'),
    };
  }
  if (job.s3Key) {
    storageLocations.s3 = {
      provider: 'Amazon S3',
      backup: true,
      uri: job.s3Uri,
      objectPath: job.s3Key,
      downloadUrl: storageUrl('s3'),
      previewUrl: storageUrl('s3', 'inline'),
    };
  }
  if (job.gcsObjectPath) {
    storageLocations.gcs = {
      provider: 'Google Cloud Storage',
      backup: true,
      uri: job.gcsUri || `gs://${process.env.PDF_PERSONALISATION_BUCKET || 'aep-orchestration-lab-brand-scrapes'}/${job.gcsObjectPath}`,
      objectPath: job.gcsObjectPath,
      downloadUrl: storageUrl('gcs'),
      previewUrl: storageUrl('gcs', 'inline'),
    };
  }
  const primaryLocation = storageLocations.dlz
    || storageLocations.s3
    || storageLocations.gcs;
  const downloadUrl = primaryLocation ? primaryLocation.downloadUrl : gatewayUrl;
  const previewUrl = primaryLocation ? primaryLocation.previewUrl : `${gatewayUrl}?disposition=inline`;
  return {
    status: 'ready',
    jobId: job.jobId,
    conversionMode: job.conversionMode || 'html',
    sandbox: job.sandbox || null,
    documentOperation: job.documentOperation || null,
    sourceName: job.sourceName || null,
    templateId: job.templateId || null,
    documentName: job.documentName,
    mimeType: job.mimeType,
    size: job.size,
    sha256: job.sha256,
    createdAt: job.createdAt,
    expiresAt: job.expiresAt,
    storageProvider: job.dlzObjectPath ? 'dlz' : job.storageProvider || 'gcs',
    storageUri: primaryLocation && primaryLocation.uri || null,
    storageLocations,
    downloadUrl,
    previewUrl,
    ajoHandoff: {
      attachmentName: job.documentName,
      attachmentMimeType: job.mimeType,
      attachmentUrl: downloadUrl,
      ...(job.dlzObjectPath ? {
        attachment: {
          name: job.documentName,
          contentType: job.mimeType,
          source: { type: 'dlzPath', path: job.dlzObjectPath },
        },
      } : {}),
    },
  };
}

function downloadDisposition(req) {
  const requested = String(req && req.query && req.query.disposition || '').trim().toLowerCase();
  return requested === 'inline' ? 'inline' : 'attachment';
}

function downloadStorage(req) {
  const requested = String(req && req.query && req.query.storage || '').trim().toLowerCase();
  return ['dlz', 's3', 'gcs'].includes(requested) ? requested : '';
}

async function resolveTemplate(input, principal, deps = {}) {
  if (!input.templateId) return { htmlTemplate: input.htmlTemplate, templateId: null };
  const template = await store.getTemplate(input.templateId, deps);
  if (!template) {
    throw new core.PdfPersonalisationError('Template was not found.', 404, 'PDF_TEMPLATE_NOT_FOUND');
  }
  if (!canAccessOwnedRecord(template, principal)) {
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

async function callJourneyKeyStore(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof core.PdfPersonalisationError) throw error;
    const status = Number(error && error.status);
    if (status >= 400 && status < 500) {
      throw new core.PdfPersonalisationError(
        String(error && error.message || 'PDF journey key request failed.'),
        status,
        'PDF_JOURNEY_KEY_REQUEST_FAILED',
      );
    }
    throw error;
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
  const opened = await store.openDownload(record, deps, {
    headOnly: req.method === 'HEAD',
    storage: downloadStorage(req),
  });
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
    required.setCors(res, 'GET, POST, DELETE, HEAD, OPTIONS');
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

      if (path === '/journey-action/keys' && req.method === 'GET') {
        if (principal.type !== 'portal') {
          throw new core.PdfPersonalisationError('Portal authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        const keys = await callJourneyKeyStore(() => required.listJourneyApiKeys(principal.ownerUid));
        res.status(200).json({
          keys,
          maxActiveKeys: Number(required.maxJourneyApiKeys || 10),
          warning: 'Full API keys are shown only once when generated.',
        });
        return;
      }

      if (path === '/journey-action/keys' && req.method === 'POST') {
        if (principal.type !== 'portal') {
          throw new core.PdfPersonalisationError('Portal authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        const body = jsonBody(req);
        const created = await callJourneyKeyStore(() => required.createJourneyApiKey({
          uid: principal.ownerUid,
          email: principal.email,
          keyLabel: body.keyLabel,
        }));
        res.status(201).json({
          ...created,
          warning: 'Copy this API key now. It will not be shown again.',
        });
        return;
      }

      if (path === '/journey-action/keys' && req.method === 'DELETE') {
        if (principal.type !== 'portal') {
          throw new core.PdfPersonalisationError('Portal authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        const keyId = String(req.query && req.query.keyId || '').trim();
        res.status(200).json(await callJourneyKeyStore(
          () => required.revokeJourneyApiKey(principal.ownerUid, keyId),
        ));
        return;
      }

      if (path === '/journey-action/template-library' && req.method === 'GET') {
        if (!isOwnerPrincipal(principal)) {
          throw new core.PdfPersonalisationError('User authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        scopedSandbox(principal, req.query && req.query.sandbox);
        const uploaded = await callJourneyKeyStore(
          () => required.listJourneyTemplates(principal.ownerUid, {
            sandbox: scopedSandbox(principal, req.query && req.query.sandbox),
          }),
        );
        res.status(200).json({
          templates: [...required.listBuiltinJourneyTemplates(), ...uploaded],
          uploadedCount: uploaded.length,
        });
        return;
      }

      if (path === '/journey-action/template-analysis' && req.method === 'POST') {
        if (!isOwnerPrincipal(principal)) {
          throw new core.PdfPersonalisationError('User authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        const body = jsonBody(req);
        scopedSandbox(principal, body.sandbox);
        const analysis = await Promise.resolve(
          required.analyseJourneyTemplate
            ? required.analyseJourneyTemplate(body.sourceFile)
            : journeyTemplateContract.analyseTemplate(body.sourceFile),
        );
        res.status(200).json({ status: 'analysed', ...analysis });
        return;
      }

      if (path === '/journey-action/template-library' && req.method === 'POST') {
        if (!isOwnerPrincipal(principal)) {
          throw new core.PdfPersonalisationError('User authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        const body = jsonBody(req);
        const sandbox = scopedSandbox(principal, body.sandbox);
        const validation = await (required.validateJourneyTemplatePublication || validateJourneyTemplatePublication)({
          sourceFile: body.sourceFile,
          samplePayload: body.samplePayload,
          fieldMappings: body.fieldMappings,
          expectedPageCount: body.expectedPageCount,
        }, required);
        const saved = await callJourneyKeyStore(() => required.saveJourneyTemplate({
          ownerUid: principal.ownerUid,
          sandbox,
          templateName: body.templateName,
          label: body.label,
          subject: body.subject,
          documentName: body.documentName,
          sourceFile: body.sourceFile,
          fieldDefinitions: validation.analysis.fields,
          fieldMappings: validation.mappings,
          inputSchema: journeyTemplateContract.buildInputSchema(
            validation.mappings,
            validation.sampleData,
            validation.recipient,
          ),
          sampleData: validation.sampleData,
          expectedPageCount: validation.expectedPageCount,
          validation: {
            pageCount: validation.pageCount,
            validatedAt: validation.validatedAt,
          },
          replace: body.replace === true,
        }));
        res.status(201).json({
          status: 'published',
          template: saved,
          validation: {
            pageCount: validation.pageCount,
            expectedPageCount: validation.expectedPageCount,
            mappedFields: validation.mappings.length,
          },
        });
        return;
      }

      if (path === '/journey-action/template-library' && req.method === 'DELETE') {
        if (!isOwnerPrincipal(principal)) {
          throw new core.PdfPersonalisationError('User authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        const sandbox = scopedSandbox(principal, req.query && req.query.sandbox);
        const templateName = String(req.query && req.query.templateName || '').trim();
        res.status(200).json(await callJourneyKeyStore(
          () => required.archiveJourneyTemplate(principal.ownerUid, templateName, { sandbox }),
        ));
        return;
      }

      if (path === '/journey-action/campaigns' && req.method === 'GET') {
        if (principal.type !== 'portal') {
          throw new core.PdfPersonalisationError('Portal authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        const sandbox = scopedSandbox(principal, req.query && req.query.sandbox);
        const campaigns = await required.listJourneyCampaigns(principal.ownerUid, sandbox);
        res.status(200).json({ campaigns, sandbox });
        return;
      }

      if (path === '/journey-action/campaigns' && req.method === 'POST') {
        if (principal.type !== 'portal') {
          throw new core.PdfPersonalisationError('Portal authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        const body = jsonBody(req);
        const sandbox = scopedSandbox(principal, body.sandbox);
        const campaigns = await required.saveJourneyCampaigns(principal.ownerUid, sandbox, body.campaigns);
        res.status(200).json({ campaigns, sandbox });
        return;
      }

      if (path === '/journey-action/story-assist' && req.method === 'POST') {
        if (principal.type !== 'portal') {
          throw new core.PdfPersonalisationError('Portal authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        const body = jsonBody(req);
        const sandbox = scopedSandbox(principal, body.sandbox);
        const resolvedTemplate = await required.resolveJourneyTemplateMetadata(body.templateName, principal.ownerUid);
        if (resolvedTemplate.sandbox && sandbox && resolvedTemplate.sandbox !== sandbox) {
          throw new core.PdfPersonalisationError(
            'The selected template belongs to a different Adobe sandbox.',
            403,
            'PDF_JOURNEY_TEMPLATE_SANDBOX_FORBIDDEN',
          );
        }
        if (typeof required.suggestJourneyStoryFields !== 'function') {
          throw new core.PdfPersonalisationError('Gemini story assistance is unavailable.', 503, 'PDF_STORY_ASSIST_UNAVAILABLE');
        }
        try {
          const storedInputSchema = Array.isArray(resolvedTemplate.inputSchema) ? resolvedTemplate.inputSchema : [];
          const inputSchema = storedInputSchema.length
            ? storedInputSchema
            : journeyTemplateContract.buildInputSchema(
              resolvedTemplate.fieldMappings || [],
              resolvedTemplate.sampleData || {},
              body.recipient || {},
            );
          const suggestion = await required.suggestJourneyStoryFields({
            ownerUid: principal.ownerUid,
            story: body.story,
            templateName: resolvedTemplate.templateName || resolvedTemplate.name,
            templateLabel: resolvedTemplate.label,
            documentName: resolvedTemplate.documentName,
            inputSchema,
            defaults: resolvedTemplate.sampleData || {},
            recipient: body.recipient,
          });
          res.status(200).json({ status: 'suggested', templateName: resolvedTemplate.templateName || resolvedTemplate.name, ...suggestion });
        } catch (error) {
          const status = Number(error && error.status) || 502;
          throw new core.PdfPersonalisationError(
            String(error && error.message || 'Gemini could not interpret this story.'),
            status,
            String(error && error.code || 'PDF_STORY_ASSIST_FAILED'),
          );
        }
        return;
      }

      const portalJourneyStatusMatch = path.match(/^\/journey-action\/test-status\/([a-f0-9]{40})$/);
      if (portalJourneyStatusMatch && req.method === 'GET') {
        if (principal.type !== 'portal') {
          throw new core.PdfPersonalisationError('Portal authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        const record = await (required.getJourneyActionRecord || journeyAction.getRecord)(
          portalJourneyStatusMatch[1],
          required,
        );
        if (!record || record.requestedByUid !== principal.ownerUid) {
          throw new core.PdfPersonalisationError('Journey PDF job was not found.', 404, 'PDF_JOURNEY_JOB_NOT_FOUND');
        }
        const status = (required.journeyActionResponse || journeyAction.statusResponse)(record);
        let pdf = null;
        if (record.pdfJobId) {
          const pdfRecord = await (required.getPdfJob || store.getJob)(record.pdfJobId, required);
          if (pdfRecord && pdfRecord.ownerUid === principal.ownerUid) {
            pdf = await responseForReadyJob(pdfRecord, req, required);
          }
        }
        res.status(200).json({ ...status, pdf });
        return;
      }

      if (path === '/journey-action/test-send' && req.method === 'POST') {
        if (principal.type !== 'portal') {
          throw new core.PdfPersonalisationError('Portal authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        const body = jsonBody(req);
        const sandbox = scopedSandbox(principal, body.sandbox);
        const resolvedTemplate = await required.resolveJourneyTemplateMetadata(body.templateName, principal.ownerUid);
        if (resolvedTemplate.sandbox && sandbox && resolvedTemplate.sandbox !== sandbox) {
          throw new core.PdfPersonalisationError(
            'The selected template belongs to a different Adobe sandbox.',
            403,
            'PDF_JOURNEY_TEMPLATE_SANDBOX_FORBIDDEN',
          );
        }
        const campaigns = await required.listJourneyCampaigns(principal.ownerUid, sandbox);
        if (!campaigns.some((campaign) => campaign.campaignId === String(body.campaignId || '').trim())) {
          throw new core.PdfPersonalisationError(
            'Choose a campaign saved in the transactional campaign dropdown.',
            400,
            'PDF_JOURNEY_CAMPAIGN_NOT_SAVED',
          );
        }
        const queued = await (required.enqueueJourneyAction || journeyAction.enqueue)(body, {
          ...required,
          resolvedTemplate,
          templateOwnerUid: principal.ownerUid,
          requestedByUid: principal.ownerUid,
        });
        res.status(queued.reused ? 200 : 202).json(queued);
        return;
      }

      if (path === '/journey-action/templates' && req.method === 'GET') {
        if (principal.type !== 'service') {
          throw new core.PdfPersonalisationError('Service authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        const uploaded = principal.ownerUid && required.listJourneyTemplates
          ? await required.listJourneyTemplates(principal.ownerUid)
          : [];
        const builtins = required.listBuiltinJourneyTemplates
          ? required.listBuiltinJourneyTemplates()
          : journeyTemplates.listTemplates();
        res.status(200).json({ templates: [...builtins, ...uploaded] });
        return;
      }

      const journeyStatusMatch = path.match(/^\/journey-action\/status\/([a-f0-9]{40})$/);
      if (journeyStatusMatch && req.method === 'GET') {
        if (principal.type !== 'service') {
          throw new core.PdfPersonalisationError('Service authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        const status = await (required.getJourneyActionStatus || journeyAction.getStatus)(
          journeyStatusMatch[1],
          required,
        );
        if (!status) {
          throw new core.PdfPersonalisationError('Journey PDF job was not found.', 404, 'PDF_JOURNEY_JOB_NOT_FOUND');
        }
        res.status(200).json(status);
        return;
      }

      if (path === '/journey-action' && req.method === 'POST') {
        if (principal.type !== 'service') {
          throw new core.PdfPersonalisationError('Service authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        const body = jsonBody(req);
        const resolvedTemplate = required.resolveJourneyTemplateMetadata
          ? await required.resolveJourneyTemplateMetadata(body.templateName, principal.ownerUid)
          : null;
        const queued = await (required.enqueueJourneyAction || journeyAction.enqueue)(body, {
          ...required,
          ...(resolvedTemplate ? { resolvedTemplate } : {}),
          templateOwnerUid: principal.ownerUid || null,
          requestedByUid: principal.ownerUid || null,
        });
        res.status(queued.reused ? 200 : 202).json(queued);
        return;
      }

      if (principal.type === 'service' && principal.scope === 'journey-action') {
        throw new core.PdfPersonalisationError(
          'This API key is restricted to the PDF journey custom action.',
          403,
          'PDF_AUTH_SCOPE_FORBIDDEN',
        );
      }

      if (path === '/templates' && req.method === 'GET') {
        if (!isOwnerPrincipal(principal)) {
          throw new core.PdfPersonalisationError('User authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        const sandbox = scopedSandbox(principal, req.query && req.query.sandbox);
        res.status(200).json({ templates: await store.listTemplates(principal.ownerUid, required, { sandbox }) });
        return;
      }

      const templateMatch = path.match(/^\/templates\/([^/]+)$/);
      if (templateMatch && req.method === 'GET') {
        if (!isOwnerPrincipal(principal)) {
          throw new core.PdfPersonalisationError('User authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        let templateId = '';
        try { templateId = decodeURIComponent(templateMatch[1]); } catch (_error) {}
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(templateId)) {
          throw new core.PdfPersonalisationError('Template was not found.', 404, 'PDF_TEMPLATE_NOT_FOUND');
        }
        const template = await store.getTemplate(templateId, required);
        scopedSandbox(principal, req.query && req.query.sandbox);
        if (!canAccessOwnedRecord(template, principal)) {
          throw new core.PdfPersonalisationError('Template was not found.', 404, 'PDF_TEMPLATE_NOT_FOUND');
        }
        const {
          ownerUid: _ownerUid,
          objectPath: _objectPath,
          ...response
        } = template;
        res.status(200).json(response);
        return;
      }

      if (path === '/templates' && req.method === 'POST') {
        if (!isOwnerPrincipal(principal)) {
          throw new core.PdfPersonalisationError('User authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        const body = jsonBody(req);
        const sandbox = scopedSandbox(principal, body.sandbox);
        const saved = await store.saveTemplate({
          ownerUid: principal.ownerUid,
          sandbox,
          name: body.name,
          htmlTemplate: body.htmlTemplate,
          defaultData: body.defaultData,
          sourceFileName: body.sourceFileName,
        }, required);
        const {
          defaultData: _defaultData,
          ownerUid: _ownerUid,
          objectPath: _objectPath,
          ...response
        } = saved;
        res.status(201).json(response);
        return;
      }

      if (path === '/convert-data-document' && req.method === 'POST') {
        if (!isOwnerPrincipal(principal)) {
          throw new core.PdfPersonalisationError('User authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        const body = jsonBody(req);
        scopedSandbox(principal, body.sandbox);
        const converted = await (required.convertDocxData || docxData.convertDocxToJson)(body.sourceDocument);
        const data = core.normaliseDocumentMergeData(converted.data);
        res.status(200).json({
          status: 'converted',
          sourceName: converted.sourceName,
          format: converted.format,
          paragraphCount: converted.paragraphCount,
          fieldCount: converted.fieldCount,
          data,
        });
        return;
      }

      if (path === '/preview' && req.method === 'POST') {
        if (!isOwnerPrincipal(principal)) {
          throw new core.PdfPersonalisationError('User authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        const body = jsonBody(req);
        scopedSandbox(principal, body.sandbox);
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
        const body = jsonBody(req);
        const sandbox = scopedSandbox(principal, body.sandbox);
        const input = core.normaliseGenerateRequest(body);
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
            const documentData = mapDocumentTemplateData(input.sourceDocument, input.data, required);
            pdfBuffer = await core.convertDocumentToPdf(input.sourceDocument, documentData, credentials, required);
          } else {
            const zipBuffer = await core.createHtmlZip(rendered.renderedHtml);
            pdfBuffer = await core.convertHtmlZipToPdf(zipBuffer, input.options, credentials, required);
          }
          const record = await store.saveReadyJob({
            jobId,
            principalId: principal.principalId,
            ownerUid: principal.ownerUid,
            sandbox,
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
        scopedSandbox(principal, req.query && req.query.sandbox);
        const job = await store.getJob(statusMatch[1], required);
        if (!job || (isOwnerPrincipal(principal) && !canAccessOwnedRecord(job, principal))) {
          throw new core.PdfPersonalisationError('PDF job was not found.', 404, 'PDF_JOB_NOT_FOUND');
        }
        res.status(200).json(await responseForReadyJob(job, req, required));
        return;
      }

      if (path === '/jobs' && req.method === 'GET') {
        if (!isOwnerPrincipal(principal)) {
          throw new core.PdfPersonalisationError('User authentication is required.', 403, 'PDF_AUTH_FORBIDDEN');
        }
        const sandbox = scopedSandbox(principal, req.query && req.query.sandbox);
        const limit = Math.min(25, Math.max(1, Number(req.query && req.query.limit) || 10));
        const jobs = await store.listReadyJobs(principal.ownerUid, required, { sandbox, limit });
        const results = [];
        for (const job of jobs) results.push(await responseForReadyJob(job, req, required));
        res.status(200).json({ jobs: results, count: results.length, retentionDays: store.retentionDays() });
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
  isOwnerPrincipal,
  scopedSandbox,
  canAccessOwnedRecord,
  publicBaseUrl,
  downloadDisposition,
  downloadStorage,
  responseForReadyJob,
  validateJourneyTemplatePublication,
  mapDocumentTemplateData,
  createHandler,
};
