import assert from 'node:assert/strict';
import test from 'node:test';

import { createFireflyApiClient, FireflyApiError } from '../src/fireflyApiClient.mjs';

const env = {
  FIREFLY_CLIENT_ID: 'client-id',
  FIREFLY_CLIENT_SECRET: 'client-secret',
  FIREFLY_SCOPES: 'firefly_api,ff_apis',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('exchanges server credentials once and submits an Image 5 async generation', async () => {
  const requests = [];
  const client = createFireflyApiClient({
    env,
    fetchImpl: async (url, options = {}) => {
      requests.push({ url: String(url), options });
      if (String(url).includes('/ims/token/v3')) {
        return jsonResponse({ access_token: 'access-token', expires_in: 3600 });
      }
      return jsonResponse({
        jobId: 'job-123',
        statusUrl: 'https://firefly-api.adobe.io/v4/status/job-123',
        cancelUrl: 'https://firefly-api.adobe.io/v4/cancel/job-123',
      }, 202);
    },
    now: () => 1_000,
  });

  const first = await client.submitGenerate({ prompt: 'A desert resort', aspect_ratio: '16:9' });
  const second = await client.submitGenerate({ prompt: 'A second resort', aspect_ratio: '1:1' });

  assert.equal(first.job_id, 'job-123');
  assert.equal(first.status_url, 'https://firefly-api.adobe.io/v4/status/job-123');
  assert.equal(second.job_id, 'job-123');
  assert.equal(requests.filter(({ url }) => url.includes('/ims/token/v3')).length, 1);
  const submit = requests.find(({ url }) => url.endsWith('/v4/images/generate-async'));
  assert.ok(submit);
  assert.equal(submit.options.headers.Authorization, 'Bearer access-token');
  assert.equal(submit.options.headers['x-api-key'], 'client-id');
  assert.equal(submit.options.headers['x-model-version'], 'image5');
  assert.deepEqual(JSON.parse(submit.options.body), {
    prompt: 'A desert resort',
    aspectRatio: '16:9',
    resolutionLevel: '2.4MP',
    modelId: 'firefly_image',
    numVariations: 1,
    referenceBlobs: [],
  });
});

test('status normalizes output URLs and cancel uses only trusted Adobe job URLs', async () => {
  const requests = [];
  const client = createFireflyApiClient({
    env,
    fetchImpl: async (url, options = {}) => {
      requests.push({ url: String(url), options });
      if (String(url).includes('/ims/token/v3')) return jsonResponse({ access_token: 'token', expires_in: 3600 });
      if ((options.method || 'GET') === 'PUT') return new Response(null, { status: 204 });
      return jsonResponse({
        status: 'succeeded',
        result: { outputs: [{ image: { url: 'https://example.windows.net/result.jpg' } }] },
      });
    },
  });

  const status = await client.getJobStatus('https://firefly-api.adobe.io/v4/status/job-1');
  assert.deepEqual(status.output_urls, ['https://example.windows.net/result.jpg']);
  await client.cancelJob('https://firefly-api.adobe.io/v4/cancel/job-1');
  assert.equal(requests.at(-1).options.method, 'PUT');
  await assert.rejects(
    () => client.getJobStatus('https://attacker.example/steal'),
    /untrusted Adobe job URL/,
  );
});

test('errors never expose credentials or Adobe response bodies', async () => {
  const client = createFireflyApiClient({
    env,
    fetchImpl: async (url) => String(url).includes('/ims/token/v3')
      ? jsonResponse({ access_token: 'token', expires_in: 3600 })
      : new Response('client-secret and upstream details', { status: 401 }),
  });

  await assert.rejects(
    () => client.submitGenerate({ prompt: 'test', aspect_ratio: '1:1' }),
    (error) => error instanceof FireflyApiError
      && /HTTP 401/.test(error.message)
      && !error.message.includes('client-secret'),
  );
});
