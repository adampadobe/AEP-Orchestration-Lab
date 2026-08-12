'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../pdfPersonalisationService');

function request(headers = {}, url = '/api/pdf-personalisation/generate') {
  const normalised = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return {
    originalUrl: url,
    get(name) { return normalised[String(name || '').toLowerCase()] || ''; },
  };
}

function response() {
  return {
    headersSent: false,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; this.headersSent = true; return this; },
    end() { this.headersSent = true; return this; },
  };
}

function templateRepositoryDeps() {
  const records = new Map();
  const objects = new Map();
  return {
    setCors() {},
    getServiceApiKey: () => '',
    verifyIdTokenClaimsFromRequest: async () => ({
      uid: 'user-1', email: 'apalmer@adobe.com', isAnonymous: false,
    }),
    randomId: () => 'template-route-1',
    now: () => new Date('2026-08-06T12:00:00Z'),
    firestore: {
      collection() {
        return {
          doc(id) {
            return {
              async set(value) { records.set(id, structuredClone(value)); },
              async get() {
                const value = records.get(id);
                return { exists: !!value, data: () => structuredClone(value) };
              },
            };
          },
          where(field, _operator, expected) {
            return {
              async get() {
                return {
                  docs: Array.from(records.values())
                    .filter((value) => value[field] === expected)
                    .map((value) => ({ data: () => structuredClone(value) })),
                };
              },
            };
          },
        };
      },
    },
    bucket: {
      file(path) {
        return {
          async save(bytes) { objects.set(path, Buffer.from(bytes)); },
          async download() { return [Buffer.from(objects.get(path))]; },
        };
      },
    },
  };
}

test('normalises Hosting and direct function route paths', () => {
  assert.equal(service.routePath(request({}, '/api/pdf-personalisation/templates?x=1')), '/templates');
  assert.equal(service.routePath(request({}, '/generate')), '/generate');
  assert.equal(service.routePath(request({}, '/api/pdf-personalisation/download/token/')), '/download/token');
});

test('authorises the configured AJO service key with a constant-time comparison', async () => {
  const principal = await service.authorise(request({ 'x-pdf-api-key': 'correct-key' }), {
    getServiceApiKey: () => 'correct-key',
    verifyIdTokenClaimsFromRequest: async () => null,
  });
  assert.equal(principal.type, 'service');
  assert.equal(principal.principalId, 'service:ajo');
  assert.equal(service.constantTimeEqual('same', 'same'), true);
  assert.equal(service.constantTimeEqual('same', 'different'), false);
});

test('authorises a user-generated journey key with journey-only scope', async () => {
  const principal = await service.authorise(request({ 'x-pdf-api-key': 'pdf_generated-key-value-long-enough' }), {
    getServiceApiKey: () => 'different-ops-key',
    validateJourneyApiKey: async () => ({
      ok: true,
      keyId: 'abc123abc123',
      principalUid: 'user-1',
      principalEmail: 'apalmer@adobe.com',
    }),
    verifyIdTokenClaimsFromRequest: async () => null,
  });
  assert.equal(principal.type, 'service');
  assert.equal(principal.scope, 'journey-action');
  assert.equal(principal.keyId, 'abc123abc123');
});

test('authorises a user-generated MCP key with stable owner and sandbox scope', async () => {
  const principal = await service.authorise(request({ 'x-aep-lab-mcp-key': 'mcp-secret' }), {
    getServiceApiKey: () => '',
    validateMcpApiKey: async () => ({
      ok: true,
      keyId: 'mcp-key-1',
      principalUid: 'user-1',
      principalEmail: 'apalmer@adobe.com',
      sandbox: 'apalmer',
    }),
    verifyIdTokenClaimsFromRequest: async () => null,
  });
  assert.equal(principal.type, 'mcp');
  assert.equal(principal.principalId, 'mcp:user-1:apalmer');
  assert.equal(principal.ownerUid, 'user-1');
  assert.equal(principal.sandbox, 'apalmer');
  assert.equal(service.scopedSandbox(principal, 'apalmer'), 'apalmer');
  assert.throws(
    () => service.scopedSandbox(principal, 'another-sandbox'),
    (error) => error.code === 'PDF_MCP_SANDBOX_FORBIDDEN',
  );
});

test('rejects an invalid MCP key without falling back to portal authentication', async () => {
  await assert.rejects(
    service.authorise(request({ 'x-aep-lab-mcp-key': 'bad-key' }), {
      getServiceApiKey: () => '',
      validateMcpApiKey: async () => ({ ok: false }),
      verifyIdTokenClaimsFromRequest: async () => ({
        uid: 'user-1', email: 'apalmer@adobe.com', isAnonymous: false,
      }),
    }),
    (error) => error.code === 'PDF_MCP_AUTH_INVALID',
  );
});

test('allows portal users to create, list, and revoke their journey API keys', async () => {
  const calls = [];
  const handler = service.createHandler({
    setCors() {},
    getServiceApiKey: () => '',
    verifyIdTokenClaimsFromRequest: async () => ({
      uid: 'user-1', email: 'apalmer@adobe.com', isAnonymous: false,
    }),
    listJourneyApiKeys: async (uid) => [{ keyId: 'abc123abc123', keyPrefix: 'pdf_example', keyLabel: uid }],
    createJourneyApiKey: async (input) => {
      calls.push(input);
      return { key: 'pdf_one-time-secret', keyId: 'abc123abc123', keyPrefix: 'pdf_one-time', keyLabel: input.keyLabel };
    },
    revokeJourneyApiKey: async (uid, keyId) => ({ keyId, uid, revoked: true }),
    maxJourneyApiKeys: 10,
  });

  const getReq = Object.assign(request({}, '/api/pdf-personalisation/journey-action/keys'), { method: 'GET' });
  const getRes = response();
  await handler(getReq, getRes);
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.body.keys[0].key, undefined);

  const postReq = Object.assign(request({}, '/api/pdf-personalisation/journey-action/keys'), {
    method: 'POST', body: { keyLabel: 'Booking journey' },
  });
  const postRes = response();
  await handler(postReq, postRes);
  assert.equal(postRes.statusCode, 201);
  assert.equal(postRes.body.key, 'pdf_one-time-secret');
  assert.deepEqual(calls[0], { uid: 'user-1', email: 'apalmer@adobe.com', keyLabel: 'Booking journey' });

  const deleteReq = Object.assign(request({}, '/api/pdf-personalisation/journey-action/keys?keyId=abc123abc123'), {
    method: 'DELETE', query: { keyId: 'abc123abc123' },
  });
  const deleteRes = response();
  await handler(deleteReq, deleteRes);
  assert.equal(deleteRes.statusCode, 200);
  assert.equal(deleteRes.body.revoked, true);
});

test('allows portal users to manage their custom-action template library', async () => {
  const savedInputs = [];
  const handler = service.createHandler({
    setCors() {},
    getServiceApiKey: () => '',
    verifyIdTokenClaimsFromRequest: async () => ({
      uid: 'user-1', email: 'apalmer@adobe.com', isAnonymous: false,
    }),
    listBuiltinJourneyTemplates: () => [{ templateName: 'booking-confirmation', source: 'builtin' }],
    listJourneyTemplates: async () => [{ templateName: 'airport-welcome', source: 'uploaded' }],
    analyseJourneyTemplate: () => ({
      kind: 'html', fields: [], suggestedMappings: [], canonicalSources: [],
    }),
    validateJourneyTemplatePublication: async () => ({
      analysis: { kind: 'html', fields: [] }, mappings: [], pageCount: 1,
      expectedPageCount: 1, validatedAt: '2026-08-11T20:00:00.000Z',
    }),
    saveJourneyTemplate: async (input) => { savedInputs.push(input); return { templateName: input.templateName }; },
    archiveJourneyTemplate: async (uid, name) => ({ uid, templateName: name, archived: true }),
  });

  const getReq = Object.assign(request({}, '/api/pdf-personalisation/journey-action/template-library'), { method: 'GET' });
  const getRes = response();
  await handler(getReq, getRes);
  assert.equal(getRes.statusCode, 200);
  assert.deepEqual(getRes.body.templates.map((item) => item.templateName), ['booking-confirmation', 'airport-welcome']);

  const analyseReq = Object.assign(request({}, '/api/pdf-personalisation/journey-action/template-analysis'), {
    method: 'POST', body: { sourceFile: { fileName: 'welcome.html', base64: 'eA==' } },
  });
  const analyseRes = response();
  await handler(analyseReq, analyseRes);
  assert.equal(analyseRes.statusCode, 200);
  assert.equal(analyseRes.body.status, 'analysed');

  const postReq = Object.assign(request({}, '/api/pdf-personalisation/journey-action/template-library'), {
    method: 'POST',
    body: { templateName: 'airport-welcome', sourceFile: { fileName: 'welcome.html', base64: 'eA==' } },
  });
  const postRes = response();
  await handler(postReq, postRes);
  assert.equal(postRes.statusCode, 201);
  assert.equal(postRes.body.status, 'published');
  assert.equal(savedInputs[0].ownerUid, 'user-1');

  const deleteReq = Object.assign(request({}, '/api/pdf-personalisation/journey-action/template-library?templateName=airport-welcome'), {
    method: 'DELETE', query: { templateName: 'airport-welcome' },
  });
  const deleteRes = response();
  await handler(deleteReq, deleteRes);
  assert.equal(deleteRes.statusCode, 200);
  assert.equal(deleteRes.body.archived, true);
});

test('rejects journey-scoped keys on manual PDF routes', async () => {
  const handler = service.createHandler({
    setCors() {},
    getServiceApiKey: () => '',
    validateJourneyApiKey: async () => ({ ok: true, keyId: 'abc123abc123' }),
    verifyIdTokenClaimsFromRequest: async () => null,
  });
  const req = Object.assign(request(
    { 'x-pdf-api-key': 'pdf_generated-key-value-long-enough' },
    '/api/pdf-personalisation/generate',
  ), { method: 'POST', body: {} });
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'PDF_AUTH_SCOPE_FORBIDDEN');
});

test('authorises only non-anonymous allow-listed Firebase users', async () => {
  const previous = process.env.PDF_PERSONALISATION_ALLOWED_EMAILS;
  process.env.PDF_PERSONALISATION_ALLOWED_EMAILS = 'apalmer@adobe.com';
  try {
    const principal = await service.authorise(request(), {
      getServiceApiKey: () => '',
      verifyIdTokenClaimsFromRequest: async () => ({
        uid: 'user-1', email: 'apalmer@adobe.com', isAnonymous: false,
      }),
    });
    assert.equal(principal.type, 'portal');
    assert.equal(principal.ownerUid, 'user-1');

    await assert.rejects(
      service.authorise(request(), {
        getServiceApiKey: () => '',
        verifyIdTokenClaimsFromRequest: async () => ({
          uid: 'user-2', email: 'someone@example.com', isAnonymous: false,
        }),
      }),
      (error) => error.code === 'PDF_AUTH_FORBIDDEN',
    );
    await assert.rejects(
      service.authorise(request(), {
        getServiceApiKey: () => '',
        verifyIdTokenClaimsFromRequest: async () => ({ uid: 'anon', email: null, isAnonymous: true }),
      }),
      (error) => error.code === 'PDF_AUTH_REQUIRED',
    );
  } finally {
    if (previous === undefined) delete process.env.PDF_PERSONALISATION_ALLOWED_EMAILS;
    else process.env.PDF_PERSONALISATION_ALLOWED_EMAILS = previous;
  }
});

test('queues the authenticated AJO journey action and returns its durable job response', async () => {
  const handler = service.createHandler({
    setCors() {},
    getServiceApiKey: () => 'journey-key',
    verifyIdTokenClaimsFromRequest: async () => null,
    enqueueJourneyAction: async (body) => ({
      status: 'queued',
      jobId: 'a'.repeat(40),
      requestId: body.requestId,
      templateName: body.templateName,
      campaignId: 'campaign-1',
      acceptedAt: '2026-08-11T15:00:00.000Z',
      reused: false,
    }),
  });
  const req = Object.assign(request(
    { 'x-pdf-api-key': 'journey-key' },
    '/api/pdf-personalisation/journey-action',
  ), {
    method: 'POST',
    body: { requestId: 'event-12345678', templateName: 'booking-confirmation' },
  });
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 202);
  assert.equal(res.body.status, 'queued');
  assert.equal(res.body.requestId, 'event-12345678');
});

test('binds an uploaded journey template lookup to the generated key owner', async () => {
  let resolvedFor;
  let queuedDeps;
  const handler = service.createHandler({
    setCors() {},
    getServiceApiKey: () => 'different-ops-key',
    validateJourneyApiKey: async () => ({
      ok: true,
      keyId: 'abc123abc123',
      principalUid: 'user-1',
      principalEmail: 'apalmer@adobe.com',
    }),
    verifyIdTokenClaimsFromRequest: async () => null,
    resolveJourneyTemplateMetadata: async (name, ownerUid) => {
      resolvedFor = { name, ownerUid };
      return {
        name,
        subject: 'Airport welcome',
        documentName: 'airport-welcome.pdf',
        kind: 'html',
        source: 'uploaded',
        sourceHash: 'a'.repeat(64),
        objectPath: 'pdf-personalisation/journey-templates/owner/airport-welcome/source.html',
        ownerUid,
      };
    },
    enqueueJourneyAction: async (body, deps) => {
      queuedDeps = deps;
      return {
        status: 'queued', jobId: 'a'.repeat(40), requestId: body.requestId,
        templateName: body.templateName, campaignId: 'campaign-1',
        acceptedAt: '2026-08-11T15:00:00.000Z', reused: false,
      };
    },
  });
  const req = Object.assign(request(
    { 'x-pdf-api-key': 'pdf_generated-key-value-long-enough' },
    '/api/pdf-personalisation/journey-action',
  ), {
    method: 'POST',
    body: { requestId: 'event-12345678', templateName: 'airport-welcome' },
  });
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 202);
  assert.deepEqual(resolvedFor, { name: 'airport-welcome', ownerUid: 'user-1' });
  assert.equal(queuedDeps.templateOwnerUid, 'user-1');
  assert.equal(queuedDeps.resolvedTemplate.source, 'uploaded');
});

test('does not expose the journey custom action to portal authentication', async () => {
  const handler = service.createHandler({
    setCors() {},
    getServiceApiKey: () => 'journey-key',
    verifyIdTokenClaimsFromRequest: async () => ({
      uid: 'user-1', email: 'apalmer@adobe.com', isAnonymous: false,
    }),
  });
  const req = Object.assign(request({}, '/api/pdf-personalisation/journey-action'), {
    method: 'POST', body: {},
  });
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'PDF_AUTH_FORBIDDEN');
});

test('uses the canonical Hosting handoff URL when a direct function URL is called', () => {
  const previous = process.env.PDF_PERSONALISATION_PUBLIC_BASE_URL;
  delete process.env.PDF_PERSONALISATION_PUBLIC_BASE_URL;
  try {
    const req = request({ host: 'us-central1-aep-orchestration-lab.cloudfunctions.net' });
    assert.equal(
      service.publicBaseUrl(req),
      'https://aep-orchestration-lab.web.app/api/pdf-personalisation',
    );
  } finally {
    if (previous !== undefined) process.env.PDF_PERSONALISATION_PUBLIC_BASE_URL = previous;
  }
});

test('only opts into inline PDF rendering when explicitly requested', () => {
  assert.equal(service.downloadDisposition({ query: { disposition: 'inline' } }), 'inline');
  assert.equal(service.downloadDisposition({ query: { disposition: 'INLINE' } }), 'inline');
  assert.equal(service.downloadDisposition({ query: { disposition: 'attachment' } }), 'attachment');
  assert.equal(service.downloadDisposition({ query: { disposition: 'anything-else' } }), 'attachment');
  assert.equal(service.downloadDisposition({}), 'attachment');
});

test('allows only known private storage locations on download links', () => {
  assert.equal(service.downloadStorage({ query: { storage: 'dlz' } }), 'dlz');
  assert.equal(service.downloadStorage({ query: { storage: 'S3' } }), 's3');
  assert.equal(service.downloadStorage({ query: { storage: 'gcs' } }), 'gcs');
  assert.equal(service.downloadStorage({ query: { storage: 'unknown' } }), '');
});

test('returns separate opaque links for DLZ, S3 and Google Cloud copies', async () => {
  const body = await service.responseForReadyJob({
    status: 'ready',
    jobId: 'job-storage-1',
    documentName: 'boarding-pass.pdf',
    mimeType: 'application/pdf',
    size: 1234,
    sha256: 'hash',
    createdAt: '2026-08-11T10:00:00.000Z',
    expiresAt: '2026-08-25T10:00:00.000Z',
    dlzContainer: 'dlz-ajoemailattachments',
    dlzObjectPath: 'pdf-personalisation/2026/08/11/job-storage-1.pdf',
    dlzPlatformPath: 'dlz-ajoemailattachments/pdf-personalisation/2026/08/11/job-storage-1.pdf',
    dlzUri: 'dlz://account/dlz-ajoemailattachments/pdf-personalisation/2026/08/11/job-storage-1.pdf',
    dlzExpiresAt: '2026-08-18T10:00:00.000Z',
    s3Key: 'pdf-personalisation/2026/08/11/job-storage-1.pdf',
    s3Uri: 's3://bucket/pdf-personalisation/2026/08/11/job-storage-1.pdf',
    gcsObjectPath: 'pdf-personalisation/documents/2026/08/11/job-storage-1.pdf',
    gcsUri: 'gs://bucket/pdf-personalisation/documents/2026/08/11/job-storage-1.pdf',
  }, request({ host: 'aep-orchestration-lab.web.app' }), templateRepositoryDeps());

  assert.equal(body.storageProvider, 'dlz');
  assert.match(body.storageLocations.dlz.downloadUrl, /storage=dlz/);
  assert.match(body.storageLocations.s3.downloadUrl, /storage=s3/);
  assert.match(body.storageLocations.gcs.downloadUrl, /storage=gcs/);
  assert.equal(body.downloadUrl, body.storageLocations.dlz.downloadUrl);
  assert.deepEqual(body.ajoHandoff.attachment.source, {
    type: 'dlzPath',
    path: 'pdf-personalisation/2026/08/11/job-storage-1.pdf',
  });
  assert.equal(JSON.stringify(body).includes('sig='), false);
});

test('saves and reloads the HTML plus default JSON repository pair', async () => {
  const handler = service.createHandler(templateRepositoryDeps());
  const saveReq = Object.assign(request({}, '/api/pdf-personalisation/templates'), {
    method: 'POST',
    body: {
      name: 'Riyadh Air boarding pass',
      sourceFileName: 'riyadh-air.html',
      htmlTemplate: '<p>{{data.passenger.name}}</p>',
      defaultData: { passenger: { name: 'DARAKHSHAN KHAN' } },
    },
  });
  const saveRes = response();
  await handler(saveReq, saveRes);
  assert.equal(saveRes.statusCode, 201);
  assert.equal(saveRes.body.templateId, 'template-route-1');
  assert.equal('defaultData' in saveRes.body, false);

  const getReq = Object.assign(request({}, '/api/pdf-personalisation/templates/template-route-1'), {
    method: 'GET',
  });
  const getRes = response();
  await handler(getReq, getRes);
  assert.equal(getRes.statusCode, 200);
  assert.equal(getRes.body.htmlTemplate, '<p>{{data.passenger.name}}</p>');
  assert.deepEqual(getRes.body.defaultData, { passenger: { name: 'DARAKHSHAN KHAN' } });
  assert.equal(getRes.body.sourceFileName, 'riyadh-air.html');
  assert.equal('ownerUid' in getRes.body, false);
  assert.equal('objectPath' in getRes.body, false);
});

test('converts an authenticated Word data document into editable JSON', async () => {
  const deps = templateRepositoryDeps();
  deps.convertDocxData = async () => ({
    sourceName: 'data.docx',
    format: 'json-text',
    paragraphCount: 4,
    fieldCount: 2,
    data: { PassengerName: 'Darakhshan Khan', FlightNumber: 'RX 123' },
  });
  const handler = service.createHandler(deps);
  const req = Object.assign(request({}, '/api/pdf-personalisation/convert-data-document'), {
    method: 'POST',
    body: { sourceDocument: { fileName: 'data.docx', base64: 'fixture' } },
  });
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'converted');
  assert.deepEqual(res.body.data, { PassengerName: 'Darakhshan Khan', FlightNumber: 'RX 123' });
});

test('maps canonical AJO data to DOCX merge fields for manual generation', () => {
  const mapped = service.mapDocumentTemplateData({
    fileName: 'boarding-pass.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('fixture'),
  }, {
    flightNumber: 'RX 123',
    passengerName: 'Darakhshan Khan',
    'Booking Ref': 'ABC1234',
    CustomField: 'Direct value',
  }, {
    analyseJourneyTemplate: () => ({
      suggestedMappings: [
        { target: 'Flight Number', source: 'flightNumber', required: true, type: 'text' },
        { target: 'PassengerName', source: 'passengerName', required: true, type: 'text' },
        { target: 'Booking Ref', source: 'bookingReference', required: true, type: 'text' },
        { target: 'CustomField', source: '', required: true, type: 'text' },
      ],
    }),
  });

  assert.equal(mapped['Flight Number'], 'RX 123');
  assert.equal(mapped.PassengerName, 'Darakhshan Khan');
  assert.equal(mapped['Booking Ref'], 'ABC1234');
  assert.equal(mapped.CustomField, 'Direct value');
});
