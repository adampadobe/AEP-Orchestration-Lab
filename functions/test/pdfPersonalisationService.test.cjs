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
