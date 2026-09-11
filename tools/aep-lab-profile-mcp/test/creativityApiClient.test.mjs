import assert from 'node:assert/strict';
import test from 'node:test';

import { createCreativityApiClient, CreativityApiError } from '../src/creativityApiClient.mjs';

const env = { FIREFLY_CLIENT_ID: 'client-id', FIREFLY_CLIENT_SECRET: 'client-secret' };
function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }

test('client requests narrow product scopes and fixed Adobe endpoints', async () => {
  const calls = [];
  const client = createCreativityApiClient({ env, fetchImpl: async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('/ims/token/')) return response({ access_token: `token-${calls.length}`, expires_in: 3600 });
    if (url.endsWith('/v2/edit')) return response({ jobId: 'ps-1', statusUrl: 'https://photoshop-api.adobe.io/v2/status/ps-1' }, 202);
    if (url.includes('/beta/tagged-documents?')) return response({ total: 0, documents: [] });
    throw new Error(`unexpected ${url}`);
  }});
  await client.submitPhotoshopEdit({ image: {}, edits: {}, outputs: [] });
  await client.listExpressDocuments({ limit: 1 });
  const tokenBodies = calls.filter((call) => call.url.includes('/ims/token/')).map((call) => call.options.body);
  assert.match(tokenBodies[0], /read_organizations/);
  assert.match(tokenBodies[1], /ee\.express_api/);
  assert.equal(calls.some((call) => call.url === 'https://photoshop-api.adobe.io/v2/edit'), true);
});

test('job polling rejects caller-controlled hosts', async () => {
  const client = createCreativityApiClient({ env, fetchImpl: async () => response({}) });
  await assert.rejects(() => client.getJobStatus('photoshop', 'https://evil.example/status/1'), CreativityApiError);
  await assert.rejects(() => client.getJobStatus('photoshop', 'https://express-api.adobe.io/status/1'), CreativityApiError);
});
