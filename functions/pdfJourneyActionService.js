'use strict';

const { randomUUID } = require('node:crypto');
const admin = require('firebase-admin');
const core = require('./pdfPersonalisationCore');
const pdfStore = require('./pdfPersonalisationStore');
const templates = require('./pdfJourneyTemplates');

const JOBS_COLLECTION = 'pdfJourneyActionJobs';
const AJO_EXECUTION_URL = 'https://platform.adobe.io/ajo/im/executions/unitary';
const DEFAULT_CAMPAIGN_ID = '30f45cd3-da50-436c-ae46-d0ab8f521f14';
const SEGMENT_ID = 'f6db4dba-5b81-419f-9e74-cc00a66830e1';
const PROCESSING_LEASE_MS = 10 * 60 * 1000;
const MAX_WORKER_ATTEMPTS = 3;

function plainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getFirestore(deps = {}) {
  if (deps.firestore) return deps.firestore;
  try {
    admin.app();
  } catch (_error) {
    admin.initializeApp();
  }
  return admin.firestore();
}

function now(deps = {}) {
  return deps.now ? deps.now() : new Date();
}

function cleanText(value, maxLength = 200) {
  return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength);
}

function validateRequestId(value) {
  const requestId = cleanText(value, 200);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/.test(requestId)) {
    throw new core.PdfPersonalisationError(
      'requestId must contain 8 to 200 letters, numbers, dots, underscores, colons, or hyphens.',
      400,
      'PDF_JOURNEY_REQUEST_ID_INVALID',
    );
  }
  return requestId;
}

function validateEmail(value) {
  const emailAddress = cleanText(value, 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress)) {
    throw new core.PdfPersonalisationError(
      'emailAddress must be a valid email address.',
      400,
      'PDF_JOURNEY_EMAIL_INVALID',
    );
  }
  return emailAddress;
}

function copyObject(value) {
  return JSON.parse(JSON.stringify(value));
}

function firstValue(...values) {
  return values.find((value) => value != null && String(value).trim() !== '');
}

function normaliseTemplateData(templateName, value, recipient) {
  const data = copyObject(core.normaliseData(value || {}));
  data.firstName = cleanText(firstValue(data.firstName, recipient.firstName), 100);
  data.lastName = cleanText(firstValue(data.lastName, recipient.lastName), 100);
  const passenger = plainObject(data.passenger) ? data.passenger : {};
  passenger.firstName = cleanText(firstValue(passenger.firstName, data.firstName, recipient.firstName), 100);
  passenger.lastName = cleanText(firstValue(passenger.lastName, data.lastName, recipient.lastName), 100);
  data.passenger = passenger;

  if (templateName === 'booking-confirmation') {
    if (!Array.isArray(data.flightDetails) || data.flightDetails.length === 0) {
      const flight = plainObject(data.flight) ? data.flight : {};
      data.flightDetails = [{
        flightNumber: cleanText(firstValue(flight.flightNumber, data.flightNumber), 40),
        departureAirport: cleanText(firstValue(flight.departureAirport, data.departureAirport), 20),
        arrivalAirport: cleanText(firstValue(flight.arrivalAirport, data.arrivalAirport), 20),
        departureDateTime: cleanText(firstValue(flight.departureDateTime, data.departureDateTime), 80),
        arrivalDateTime: cleanText(firstValue(flight.arrivalDateTime, data.arrivalDateTime), 80),
      }];
    }
    const fare = plainObject(data.fareDetails) ? data.fareDetails : {};
    data.fareDetails = {
      ...fare,
      totalPaid: firstValue(fare.totalPaid, data.totalPaid, 0),
      currency: cleanText(firstValue(fare.currency, data.currency, 'GBP'), 8).toUpperCase(),
    };
  }

  if (templateName === 'checkin-confirmation') {
    const origin = plainObject(data.origin) ? data.origin : {};
    const destination = plainObject(data.destination) ? data.destination : {};
    const times = plainObject(data.times) ? data.times : {};
    data.origin = {
      ...origin,
      code: cleanText(firstValue(origin.code, data.departureAirport, data.originCode), 20),
      city: cleanText(firstValue(origin.city, data.originCity), 100),
    };
    data.destination = {
      ...destination,
      code: cleanText(firstValue(destination.code, data.arrivalAirport, data.destinationCode), 20),
      city: cleanText(firstValue(destination.city, data.destinationCity), 100),
    };
    data.times = {
      ...times,
      boarding: cleanText(firstValue(times.boarding, data.boardingTime), 40),
      departure: cleanText(firstValue(times.departure, data.departureTime), 40),
    };
  }
  return core.normaliseData(data);
}

function resolveCampaignId(value, deps = {}) {
  const requested = cleanText(value, 100);
  const selected = requested || cleanText(
    deps.campaignId || process.env.PDF_JOURNEY_CAMPAIGN_ID || DEFAULT_CAMPAIGN_ID,
    100,
  );
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(selected)) {
    throw new core.PdfPersonalisationError(
      'campaignId must be a valid campaign UUID.',
      400,
      'PDF_JOURNEY_CAMPAIGN_ID_INVALID',
    );
  }
  return selected;
}

function normaliseRequest(body, deps = {}) {
  const input = plainObject(body) ? body : {};
  const requestId = validateRequestId(input.requestId);
  const template = deps.resolvedTemplate || (deps.getTemplate || templates.getTemplate)(input.templateName);
  const recipient = {
    emailAddress: validateEmail(input.emailAddress),
    firstName: cleanText(input.firstName, 100),
    lastName: cleanText(input.lastName, 100),
  };
  const data = normaliseTemplateData(template.name, input.data, recipient);
  const documentName = core.safeDocumentName(input.documentName || template.documentName);
  const selectedCampaignId = resolveCampaignId(input.campaignId, deps);
  const requestHash = core.sha256(JSON.stringify({
    templateName: template.name,
    recipient,
    data,
    documentName,
    campaignId: selectedCampaignId,
    templateSourceHash: template.sourceHash || core.sha256(template.htmlTemplate || ''),
  }));
  return {
    requestId,
    jobId: core.sha256(`ajo-pdf-action\n${requestId}`).slice(0, 40),
    requestHash,
    templateName: template.name,
    documentName,
    subject: template.subject,
    templateKind: template.kind || 'html',
    templateSource: template.source || 'builtin',
    templateSourceHash: template.sourceHash || core.sha256(template.htmlTemplate || ''),
    templateSourceName: template.sourceFileName || null,
    templateMimeType: template.mimeType || null,
    templateObjectPath: template.objectPath || null,
    templateOwnerUid: template.ownerUid || deps.templateOwnerUid || null,
    recipient,
    data,
    campaignId: selectedCampaignId,
  };
}

function actionResponse(record, reused = false) {
  return {
    status: String(record.status || 'queued'),
    jobId: record.jobId,
    requestId: record.requestId,
    templateName: record.templateName,
    campaignId: record.campaignId,
    acceptedAt: record.acceptedAt,
    reused,
  };
}

async function enqueue(body, deps = {}) {
  const input = normaliseRequest(body, deps);
  const db = getFirestore(deps);
  const ref = db.collection(JOBS_COLLECTION).doc(input.jobId);
  const acceptedAt = now(deps).toISOString();
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists) {
      const existing = snapshot.data() || {};
      if (existing.requestHash !== input.requestHash) {
        throw new core.PdfPersonalisationError(
          'This requestId was already used for a different PDF action.',
          409,
          'PDF_JOURNEY_IDEMPOTENCY_CONFLICT',
        );
      }
      return actionResponse(existing, true);
    }
    const record = {
      ...input,
      status: 'queued',
      acceptedAt,
      updatedAt: acceptedAt,
      expiresAt: new Date(Date.parse(acceptedAt) + 14 * 24 * 60 * 60 * 1000).toISOString(),
    };
    transaction.set(ref, record);
    return actionResponse(record, false);
  });
}

async function getStatus(jobId, deps = {}) {
  const cleanJobId = cleanText(jobId, 64);
  if (!/^[a-f0-9]{40}$/.test(cleanJobId)) return null;
  const snapshot = await getFirestore(deps).collection(JOBS_COLLECTION).doc(cleanJobId).get();
  if (!snapshot.exists) return null;
  const record = snapshot.data() || {};
  return {
    ...actionResponse(record, true),
    pdfJobId: record.pdfJobId || null,
    ajoExecutionId: record.ajoExecutionId || null,
    sentAt: record.sentAt || null,
    error: record.error || null,
  };
}

async function waitForReadyJob(jobId, deps = {}) {
  const sleep = deps.sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const existing = await pdfStore.getJob(jobId, deps);
    if (existing) return existing;
    await sleep(500);
  }
  throw new core.PdfPersonalisationError(
    'PDF generation is still processing.',
    503,
    'PDF_JOURNEY_GENERATION_PENDING',
  );
}

async function generateAndStore(record, deps = {}) {
  const source = deps.loadJourneyTemplateSource
    ? await deps.loadJourneyTemplateSource(record)
    : templates.getTemplate(record.templateName);
  const documentTemplate = record.templateKind === 'document';
  const sourceName = String(record.templateSourceName || '').toLowerCase();
  const mergeData = documentTemplate && sourceName.endsWith('.docx')
    ? core.normaliseDocumentMergeData(record.data)
    : {};
  const input = core.normaliseGenerateRequest(documentTemplate ? {
    conversionMode: 'document',
    sourceDocument: source.sourceDocument,
    data: mergeData,
    documentName: record.documentName,
    idempotencyKey: record.requestId,
  } : {
    conversionMode: 'html',
    htmlTemplate: source.htmlTemplate,
    data: record.data,
    documentName: record.documentName,
    idempotencyKey: record.requestId,
    options: { locale: 'en-GB', timeZone: 'UTC' },
  });
  const rendered = documentTemplate
    ? null
    : core.renderHtmlTemplate(input.htmlTemplate, input.data, input.options);
  const requestHash = core.requestHash(input, rendered ? rendered.templateHash : record.templateSourceHash);
  const pdfJobId = randomUUID();
  const principalId = record.templateOwnerUid
    ? `service:ajo-journey:${core.sha256(record.templateOwnerUid).slice(0, 16)}`
    : 'service:ajo-journey';
  const claim = await pdfStore.claimIdempotency({
    principalId,
    idempotencyKey: input.idempotencyKey,
    requestHash,
    jobId: pdfJobId,
  }, deps);
  if (claim.status === 'ready') {
    const existing = await pdfStore.getJob(claim.jobId, deps);
    if (!existing) {
      throw new core.PdfPersonalisationError(
        'Stored PDF metadata is unavailable.',
        503,
        'PDF_JOB_METADATA_MISSING',
      );
    }
    return existing;
  }
  if (claim.status === 'processing') return waitForReadyJob(claim.jobId, deps);

  try {
    const credentials = {
      clientId: deps.getPdfClientId(),
      clientSecret: deps.getPdfClientSecret(),
    };
    let pdfBuffer;
    if (documentTemplate) {
      pdfBuffer = await core.convertDocumentToPdf(input.sourceDocument, input.data, credentials, deps);
    } else {
      const zipBuffer = await core.createHtmlZip(rendered.renderedHtml);
      pdfBuffer = await core.convertHtmlZipToPdf(zipBuffer, input.options, credentials, deps);
    }
    return await pdfStore.saveReadyJob({
      jobId: pdfJobId,
      principalId,
      ownerUid: record.templateOwnerUid || null,
      conversionMode: input.conversionMode,
      documentOperation: input.documentOperation,
      sourceName: documentTemplate ? input.sourceDocument.fileName : null,
      sourceHash: documentTemplate ? input.sourceDocument.sha256 : null,
      templateId: `${record.templateSource || 'builtin'}:${record.templateName}`,
      templateHash: rendered ? rendered.templateHash : record.templateSourceHash,
      renderedHash: rendered ? rendered.renderedHash : null,
      requestHash,
      idempotencyDocId: claim.docId,
      documentName: input.documentName,
      pdfBuffer,
      createdAt: now(deps),
    }, deps);
  } catch (error) {
    await pdfStore.markFailed({
      idempotencyDocId: claim.docId,
      errorCode: error && error.code || 'PDF_GENERATION_FAILED',
    }, deps).catch(() => {});
    throw error;
  }
}

function buildCampaignPayload(record, pdfRecord) {
  if (!pdfRecord || !pdfRecord.dlzObjectPath) {
    throw new core.PdfPersonalisationError(
      'Generated PDF is missing its AJO attachment DLZ path.',
      502,
      'PDF_JOURNEY_DLZ_PATH_MISSING',
    );
  }
  return {
    requestId: record.requestId,
    campaignId: record.campaignId,
    recipients: [{
      type: 'aep',
      userId: record.recipient.emailAddress,
      namespace: 'Email',
      channelData: { emailAddress: record.recipient.emailAddress },
      profile: {
        frequencyMap: { key: 'value' },
        segmentMembership: { ups: { [SEGMENT_ID]: { status: 'string' } } },
        person: { name: {
          firstName: record.recipient.firstName,
          lastName: record.recipient.lastName,
        } },
      },
      context: { subject: record.subject },
      attachments: [{
        name: pdfRecord.documentName,
        contentType: 'application/pdf',
        source: { type: 'dlzPath', path: pdfRecord.dlzObjectPath },
      }],
    }],
  };
}

async function sendCampaign(record, pdfRecord, deps = {}) {
  const accessToken = await deps.getAdobeAccessToken();
  const payload = buildCampaignPayload(record, pdfRecord);
  const request = deps.fetch || fetch;
  const response = await request(AJO_EXECUTION_URL, {
    method: 'POST',
    headers: {
      ...deps.aepHeaders(accessToken, { 'Content-Type': 'application/json' }),
      'x-sandbox-name': deps.adobeSandbox || 'apalmer',
      'x-request-id': record.requestId,
    },
    body: JSON.stringify(payload),
  });
  const responseBody = await response.json().catch(() => ({}));
  if (response.status !== 202 || !responseBody.executionId) {
    const detail = responseBody.title || responseBody.message || response.statusText || 'Campaign execution failed.';
    throw new core.PdfPersonalisationError(
      `AJO campaign rejected the PDF attachment: ${String(detail).slice(0, 300)}`,
      502,
      'PDF_JOURNEY_CAMPAIGN_FAILED',
    );
  }
  return {
    executionId: String(responseBody.executionId),
    requestId: String(responseBody.requestId || record.requestId),
  };
}

async function claimWorkerJob(jobId, deps = {}) {
  const db = getFirestore(deps);
  const ref = db.collection(JOBS_COLLECTION).doc(jobId);
  const claimedAt = now(deps);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;
    const record = snapshot.data() || {};
    if (record.status === 'sent') return { status: 'sent', record };
    if (record.status === 'failed' && Number(record.attempts || 0) >= MAX_WORKER_ATTEMPTS) {
      return { status: 'terminal', record };
    }
    const leaseUntil = Date.parse(record.leaseExpiresAt || '');
    if (record.status === 'processing' && Number.isFinite(leaseUntil) && leaseUntil > claimedAt.getTime()) {
      return { status: 'busy', record };
    }
    transaction.set(ref, {
      status: 'processing',
      updatedAt: claimedAt.toISOString(),
      leaseExpiresAt: new Date(claimedAt.getTime() + PROCESSING_LEASE_MS).toISOString(),
      attempts: Number(record.attempts || 0) + 1,
    }, { merge: true });
    return { status: 'claimed', record: { ...record, status: 'processing' } };
  });
}

async function processQueuedJob(jobId, deps = {}) {
  const claim = await claimWorkerJob(jobId, deps);
  if (!claim || ['sent', 'busy', 'terminal'].includes(claim.status)) return claim && claim.status;
  const ref = getFirestore(deps).collection(JOBS_COLLECTION).doc(jobId);
  try {
    const pdfRecord = await (deps.generateAndStore || generateAndStore)(claim.record, deps);
    const execution = await (deps.sendCampaign || sendCampaign)(claim.record, pdfRecord, deps);
    const sentAt = now(deps).toISOString();
    await ref.set({
      status: 'sent',
      updatedAt: sentAt,
      sentAt,
      leaseExpiresAt: null,
      pdfJobId: pdfRecord.jobId,
      attachmentPath: pdfRecord.dlzObjectPath,
      ajoExecutionId: execution.executionId,
      ajoRequestId: execution.requestId,
      error: null,
    }, { merge: true });
    return 'sent';
  } catch (error) {
    const failedAt = now(deps).toISOString();
    await ref.set({
      status: 'failed',
      updatedAt: failedAt,
      failedAt,
      leaseExpiresAt: null,
      error: {
        code: cleanText(error && error.code || 'PDF_JOURNEY_WORKER_FAILED', 100),
        message: cleanText(error && error.message || 'PDF journey action failed.', 500),
      },
    }, { merge: true }).catch(() => {});
    throw error;
  }
}

module.exports = {
  JOBS_COLLECTION,
  AJO_EXECUTION_URL,
  DEFAULT_CAMPAIGN_ID,
  SEGMENT_ID,
  MAX_WORKER_ATTEMPTS,
  validateRequestId,
  validateEmail,
  resolveCampaignId,
  normaliseTemplateData,
  normaliseRequest,
  actionResponse,
  enqueue,
  getStatus,
  generateAndStore,
  buildCampaignPayload,
  sendCampaign,
  claimWorkerJob,
  processQueuedJob,
};
