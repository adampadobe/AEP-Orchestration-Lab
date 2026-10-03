'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const creative = require('../creativeImageService');

function res(status, body, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[name.toLowerCase()] || null },
    json: async () => body,
    arrayBuffer: async () => Buffer.from('img'),
  };
}

function client(responses, env = {}, clock = { t: 0 }) {
  const calls = [];
  const c = creative.createCreativeImageClient({
    getToken: async () => 'tok',
    getApiKey: async () => 'key',
    fetch: async (url, init) => { calls.push({ url, init }); return responses.shift(); },
    sleep: async (ms) => { clock.t += ms; },
    now: () => clock.t,
    env,
  });
  return { c, calls };
}

test('requires token and api key providers', () => {
  assert.throws(() => creative.createCreativeImageClient({}), /getToken/);
});

test('providers reports foundry only when model id is set', () => {
  assert.deepEqual(client([]).c.providers(), { firefly: true, foundry: false });
  assert.deepEqual(client([], { FOUNDRY_MODEL_ID: 'm1' }).c.providers(), { firefly: true, foundry: true });
});

test('generateFirefly submits image5 with shared auth and polls to success', async () => {
  const { c, calls } = client([
    res(202, { statusUrl: 'https://firefly-api.adobe.io/v4/status/1' }),
    res(200, { status: 'running' }),
    res(200, { status: 'succeeded', result: { outputs: [{ image: { url: 'https://x.s3.amazonaws.com/a.png' } }] } }),
  ]);
  const out = await c.generateFirefly({ prompt: 'Paris', aspectRatio: '4:3' });
  assert.deepEqual(out, { provider: 'firefly', model: 'image5', sourceUrl: 'https://x.s3.amazonaws.com/a.png' });
  assert.equal(calls[0].url, 'https://firefly-api.adobe.io/v4/images/generate-async');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.equal(calls[0].init.headers['x-api-key'], 'key');
  assert.equal(calls[0].init.headers['x-model-version'], 'image5');
  assert.equal(JSON.parse(calls[0].init.body).aspectRatio, '4:3');
});

test('generateFirefly maps 451 to content filtered', async () => {
  const { c } = client([res(451, {})]);
  await assert.rejects(c.generateFirefly({ prompt: 'x' }), { code: 'FIREFLY_CONTENT_FILTERED', status: 451 });
});

test('generateFirefly rejects untrusted job URLs', async () => {
  const { c } = client([res(202, { statusUrl: 'https://evil.example.com/job' })]);
  await assert.rejects(c.generateFirefly({ prompt: 'x' }), { code: 'FIREFLY_JOB_URL_UNTRUSTED' });
});

test('generateFirefly times out at the deadline', async () => {
  const responses = [res(202, { statusUrl: 'https://firefly-api.adobe.io/s' })];
  for (let i = 0; i < 20; i += 1) responses.push(res(200, { status: 'running' }));
  const { c } = client(responses);
  await assert.rejects(c.generateFirefly({ prompt: 'x', deadlineMs: 4000 }), { code: 'FIREFLY_TIMEOUT', status: 504 });
});

test('generateFoundry requires FOUNDRY_MODEL_ID', async () => {
  await assert.rejects(client([]).c.generateFoundry({ prompt: 'x' }), { code: 'FOUNDRY_NOT_CONFIGURED', status: 503 });
});

test('generateFoundry sends model header and polls result href', async () => {
  const { c, calls } = client([
    res(202, { links: { result: { href: 'https://foundry-inference.adobe.io/v1/result/9' } } }),
    res(200, { status: 'IN_PROGRESS' }),
    res(200, { outputs: [{ image: { url: 'https://acct.blob.core.windows.net/a.png' } }] }),
  ], { FOUNDRY_MODEL_ID: 'brand-model' });
  const out = await c.generateFoundry({ prompt: 'Rome', negativePrompt: 'text' });
  assert.equal(out.provider, 'foundry');
  assert.equal(out.model, 'brand-model');
  assert.equal(calls[0].init.headers['x-foundry-model-id'], 'brand-model');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.equal(calls[1].url, 'https://foundry-inference.adobe.io/v1/result/9');
});

test('generateFoundry maps 451 on poll to content filtered', async () => {
  const { c } = client([
    res(202, { links: { result: { href: 'https://foundry-inference.adobe.io/r' } } }),
    res(451, {}),
  ], { FOUNDRY_MODEL_ID: 'm' });
  await assert.rejects(c.generateFoundry({ prompt: 'x' }), { code: 'FOUNDRY_CONTENT_FILTERED' });
});

test('downloadImage rejects non-allowlisted hosts', async () => {
  await assert.rejects(client([]).c.downloadImage('https://evil.example.com/a.png'), { code: 'CREATIVE_MEDIA_URL_UNTRUSTED' });
});

test('normaliseAspectRatio defaults to 16:9', () => {
  assert.equal(creative.normaliseAspectRatio('1:1'), '1:1');
  assert.equal(creative.normaliseAspectRatio('7:3'), '16:9');
});
