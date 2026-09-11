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

test('submits an official Firefly Video v3 request with controls and keyframes', async () => {
  const requests = [];
  const client = createFireflyApiClient({
    env,
    fetchImpl: async (url, options = {}) => {
      requests.push({ url: String(url), options });
      if (String(url).includes('/ims/token/v3')) return jsonResponse({ access_token: 'video-token', expires_in: 3600 });
      return jsonResponse({
        jobId: 'video-job-1',
        statusUrl: 'https://firefly-api.adobe.io/v3/status/video-job-1',
        cancelUrl: 'https://firefly-api.adobe.io/v3/cancel/video-job-1',
      }, 202);
    },
  });

  const job = await client.submitVideoGenerate({
    prompt: 'A cinematic desert resort reveal',
    size: '1080x1920',
    bit_rate_factor: 20,
    seed: 42,
    camera_motion: 'camera zoom out',
    prompt_style: 'cinematic',
    shot_angle: 'aerial shot',
    shot_size: 'long shot',
    start_frame_url: 'https://demo-assets.storage.googleapis.com/start.png?sig=redacted',
    end_frame_url: 'https://example.windows.net/end.png?sig=redacted',
  });

  assert.equal(job.job_id, 'video-job-1');
  const submit = requests.find(({ url }) => url.endsWith('/v3/videos/generate'));
  assert.ok(submit);
  assert.equal(submit.options.headers['x-model-version'], 'video1_standard');
  assert.deepEqual(JSON.parse(submit.options.body), {
    prompt: 'A cinematic desert resort reveal',
    sizes: [{ width: 1080, height: 1920 }],
    bitRateFactor: 20,
    seeds: [42],
    image: {
      conditions: [
        { source: { url: 'https://demo-assets.storage.googleapis.com/start.png?sig=redacted' }, placement: { position: 0 } },
        { source: { url: 'https://example.windows.net/end.png?sig=redacted' }, placement: { position: 1 } },
      ],
    },
    videoSettings: {
      cameraMotion: 'camera zoom out',
      promptStyle: 'cinematic',
      shotAngle: 'aerial shot',
      shotSize: 'long shot',
    },
  });
});

test('rejects unsupported Firefly video sizes and untrusted keyframe hosts before submission', async () => {
  const client = createFireflyApiClient({ env, fetchImpl: async () => { throw new Error('should not call Adobe'); } });
  await assert.rejects(
    () => client.submitVideoGenerate({ prompt: 'test', size: '100x100' }),
    /unsupported Firefly video size/,
  );
  await assert.rejects(
    () => client.submitVideoGenerate({ prompt: 'test', start_frame_url: 'https://attacker.example/start.png' }),
    /Adobe-supported storage domain/,
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
