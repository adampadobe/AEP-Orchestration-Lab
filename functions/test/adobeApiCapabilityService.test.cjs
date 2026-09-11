'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ADOBE_API_CAPABILITIES,
  BASE_IMS_SCOPES,
  TOKEN_PROFILES,
  capabilityCatalog,
} = require('../adobeApiCapabilityRegistry');
const {
  AJO_SUPPRESSION_URL,
  GENSTUDIO_EXPERIENCES_URL,
  createAdobeApiCapabilityService,
  normalizeExperience,
  redactAddresses,
} = require('../adobeApiCapabilityService');

test('capability catalog keeps 35 unique services and action-specific token profiles', () => {
  assert.equal(ADOBE_API_CAPABILITIES.length, 35);
  assert.equal(new Set(ADOBE_API_CAPABILITIES.map((item) => item.id)).size, 35);
  assert.equal(capabilityCatalog().totals.services, 35);
  assert.ok(ADOBE_API_CAPABILITIES.find((item) => item.id === 'journey-optimizer').scopes.includes('cjm.suppression_service.client.all'));
  assert.ok(ADOBE_API_CAPABILITIES.find((item) => item.id === 'genstudio').scopes.includes('aem.experimental'));
  assert.ok(TOKEN_PROFILES.ajoSuppressionRead.includes('cjm.suppression_service.client.all'));
  assert.equal(TOKEN_PROFILES.ajoSuppressionRead.includes('cjm.suppression_service.client.delete'), false);
  assert.ok(BASE_IMS_SCOPES.every((scope) => TOKEN_PROFILES.genstudioRead.includes(scope)));
  assert.ok(TOKEN_PROFILES.genstudioRead.length < 10, 'token profile should stay narrow');
});

test('address redaction masks nested email and domain fields', () => {
  assert.deepEqual(redactAddresses({ items: [{ address: 'person@example.com', domain: 'example.com', reason: 'manual' }] }), {
    items: [{ address: 'p***@***.com', domain: '***.com', reason: 'manual' }],
  });
});

test('normalizes additive GenStudio summaries without exposing arbitrary asset fields', () => {
  assert.deepEqual(normalizeExperience({
    experienceId: 'exp-1', title: 'Approved card', channel: 'email', languages: ['en_US'],
    brands: [{ name: 'Example' }], campaigns: [{ name: 'Launch' }], assets: [{ secret: true }],
  }), {
    id: 'exp-1', title: 'Approved card', channel: 'email', languages: ['en_US'], brands: ['Example'],
    campaigns: ['Launch'], createdAt: null, modifiedAt: null, selfLink: '',
  });
});

test('read-only probes use fixed hosts, bounded results, narrow scopes, and sandbox headers', async () => {
  const previousFetch = global.fetch;
  const calls = [];
  const scopes = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith(AJO_SUPPRESSION_URL)) {
      return new Response(JSON.stringify({ items: [{ address: 'person@example.com', reason: 'manual' }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ items: [{ experienceId: 'exp-1', title: 'Approved', channel: 'email' }] }), { status: 200 });
  };
  const service = createAdobeApiCapabilityService({
    getAccessToken: async (requestedScopes) => { scopes.push(requestedScopes); return 'token'; },
    getClientId: () => 'client-id',
    getImsOrg: () => 'org-id',
  });
  try {
    const ajo = await service.listAjoAddresses({ sandbox: 'apalmer', type: 'allowed', limit: 999 });
    const genstudio = await service.listGenstudioExperiences({ limit: 999, cursor: 'next' });
    assert.equal(ajo.limit, 100);
    assert.equal(ajo.data.items[0].address, 'p***@***.com');
    assert.equal(genstudio.limit, 50);
    assert.equal(genstudio.experiences[0].id, 'exp-1');
    assert.equal(new URL(calls[0].url).origin + new URL(calls[0].url).pathname, AJO_SUPPRESSION_URL);
    assert.equal(calls[0].init.headers['x-sandbox-name'], 'apalmer');
    assert.equal(new URL(calls[1].url).origin + new URL(calls[1].url).pathname, GENSTUDIO_EXPERIENCES_URL);
    assert.equal(calls[1].init.headers['x-sandbox-name'], undefined);
    assert.ok(scopes[0].includes('cjm.suppression_service.client.all'));
    assert.equal(scopes[0].includes('cjm.suppression_service.client.delete'), false);
    assert.ok(scopes[1].includes('aem.experimental'));
  } finally {
    global.fetch = previousFetch;
  }
});

test('AJO probe rejects unknown list types before authentication', async () => {
  const service = createAdobeApiCapabilityService({
    getAccessToken: async () => { throw new Error('should not authenticate'); },
    getClientId: () => 'client-id',
    getImsOrg: () => 'org-id',
  });
  await assert.rejects(() => service.listAjoAddresses({ sandbox: 'apalmer', type: 'global' }), /client or allowed/);
});
