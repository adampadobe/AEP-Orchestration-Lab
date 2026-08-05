'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  AUDIENCES_BASE,
  normalizeAudience,
  listAudiences,
  getAudience,
  deleteAudience,
} = require('../audienceManagementService');

describe('audienceManagementService', () => {
  it('normalizes audience audit fields and timestamps', () => {
    const row = normalizeAudience({
      id: 'aud-1',
      audienceId: 'alias-1',
      name: 'Old demo audience',
      originName: 'REAL_TIME_CUSTOMER_PROFILE',
      creationTime: 1_700_000_000_000,
      updateEpoch: 1_710_000_000,
      dependencies: [{ id: 'base-1' }],
      dependents: ['child-1'],
      _etag: 'etag-1',
    });
    assert.equal(row.id, 'aud-1');
    assert.equal(row.createdAt, '2023-11-14T22:13:20.000Z');
    assert.equal(row.updatedAt, '2024-03-09T16:00:00.000Z');
    assert.deepEqual(row.dependencies, ['base-1']);
    assert.deepEqual(row.dependents, ['child-1']);
  });

  it('uses only the allowlisted audiences endpoint and scoped Adobe headers', async () => {
    const previousFetch = global.fetch;
    const calls = [];
    global.fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ children: [{ id: 'aud-1', name: 'One' }], _page: { totalPages: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    try {
      const result = await listAudiences({
        token: 'token', clientId: 'client', orgId: 'org', sandbox: 'apalmer', name: 'One', limit: 10,
      });
      assert.equal(result.count, 1);
      const requestUrl = new URL(calls[0].url);
      assert.equal(`${requestUrl.origin}${requestUrl.pathname}`, AUDIENCES_BASE);
      assert.equal(requestUrl.searchParams.get('name'), 'One');
      assert.equal(requestUrl.searchParams.get('property'), 'audienceId');
      assert.equal(calls[0].init.headers['x-sandbox-name'], 'apalmer');
    } finally {
      global.fetch = previousFetch;
    }
  });

  it('GETs then DELETEs one encoded audience id', async () => {
    const previousFetch = global.fetch;
    const calls = [];
    global.fetch = async (url, init) => {
      calls.push({ url: String(url), method: init.method });
      if (init.method === 'GET') {
        return new Response(JSON.stringify({ id: 'aud/1', name: 'Exact audience' }), { status: 200 });
      }
      return new Response(null, { status: 204 });
    };
    try {
      const auth = { token: 't', clientId: 'c', orgId: 'o', sandbox: 'apalmer', audienceId: 'aud/1' };
      const detail = await getAudience(auth);
      const deleted = await deleteAudience(auth);
      assert.equal(detail.name, 'Exact audience');
      assert.equal(deleted.status, 204);
      assert.deepEqual(calls.map((call) => call.method), ['GET', 'DELETE']);
      assert.ok(calls.every((call) => call.url.endsWith('/aud%2F1')));
    } finally {
      global.fetch = previousFetch;
    }
  });
});
