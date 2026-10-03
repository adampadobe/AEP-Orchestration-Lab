'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const images = require('../pdfGeneratedImageService');
const creative = require('../creativeImageService');
const core = require('../pdfPersonalisationCore');

function fakeStore(cached = {}) {
  const saved = [];
  return {
    saved,
    lookup: async (hash) => cached[hash] || null,
    save: async (hash, buffer, meta) => { saved.push({ hash, buffer, meta }); return `https://storage.googleapis.com/b/${hash}.jpg`; },
  };
}

function fakeClient(overrides = {}) {
  const calls = [];
  return {
    calls,
    foundryModelId: overrides.foundryModelId || '',
    providers: () => ({ firefly: true, foundry: Boolean(overrides.foundryModelId) }),
    generateFirefly: async (args) => {
      calls.push(['firefly', args]);
      if (overrides.fireflyError) throw overrides.fireflyError;
      return { provider: 'firefly', model: 'image5', sourceUrl: 'https://x.amazonaws.com/a.png' };
    },
    generateFoundry: async (args) => {
      calls.push(['foundry', args]);
      return { provider: 'foundry', model: overrides.foundryModelId, sourceUrl: 'https://x.adobe.io/a.png' };
    },
    downloadImage: async () => Buffer.from('raw'),
  };
}

const data = { destinationCity: 'Paris', departureDateTime: '2026-04-01T10:00:00Z' };

test('normaliseImageGeneration supports nested and flat opt-in', () => {
  assert.equal(images.normaliseImageGeneration({}), null);
  assert.deepEqual(images.normaliseImageGeneration({ imageGeneration: { enabled: true } }),
    { enabled: true, provider: 'firefly', aspectRatio: '16:9' });
  assert.deepEqual(images.normaliseImageGeneration({ generateImage: 'true', imageProvider: 'Foundry', imageAspectRatio: '1:1' }),
    { enabled: true, provider: 'foundry', aspectRatio: '1:1' });
  assert.throws(() => images.normaliseImageGeneration({ imageGeneration: { enabled: true, provider: 'dalle' } }),
    { code: 'PDF_IMAGE_PROVIDER_INVALID', status: 400 });
});

test('generateTravelImage generates, converts and stores on cache miss', async () => {
  const store = fakeStore();
  const client = fakeClient();
  const out = await images.generateTravelImage({ data }, {
    creativeImageClient: client,
    generatedImageStore: store,
    toPdfJpeg: async () => Buffer.from('jpeg'),
  });
  assert.equal(out.status, 'generated');
  assert.equal(out.provider, 'firefly');
  assert.equal(out.destination, 'Paris');
  assert.equal(store.saved.length, 1);
  assert.equal(store.saved[0].buffer.toString(), 'jpeg');
  assert.equal(client.calls.length, 1);
});

test('generateTravelImage reuses cached image without calling Firefly', async () => {
  const client = fakeClient();
  const first = await images.generateTravelImage({ data }, {
    creativeImageClient: client, generatedImageStore: fakeStore(), toPdfJpeg: async (b) => b,
  });
  const cachedStore = fakeStore({ [first.promptHash]: 'https://storage.googleapis.com/b/cached.jpg' });
  const second = await images.generateTravelImage({ data }, {
    creativeImageClient: fakeClient(), generatedImageStore: cachedStore,
  });
  assert.equal(second.status, 'cached');
  assert.equal(second.url, 'https://storage.googleapis.com/b/cached.jpg');
  assert.equal(cachedStore.saved.length, 0);
});

test('generateTravelImage requires a destination', async () => {
  await assert.rejects(images.generateTravelImage({ data: {} }, { creativeImageClient: fakeClient() }),
    { code: 'PDF_IMAGE_DESTINATION_MISSING', status: 422 });
});

test('foundry requests fail clearly when not configured', async () => {
  await assert.rejects(images.generateTravelImage({ data, provider: 'foundry' }, {
    creativeImageClient: fakeClient(), generatedImageStore: fakeStore(),
  }), { code: 'FOUNDRY_NOT_CONFIGURED' });
});

test('previewTravelImage maps creative errors to HTTP-safe errors', async () => {
  const error = new creative.CreativeImageError('blocked', 'FIREFLY_CONTENT_FILTERED', 451);
  await assert.rejects(images.previewTravelImage({ data }, {
    creativeImageClient: fakeClient({ fireflyError: error }), generatedImageStore: fakeStore(),
  }), (err) => err instanceof core.PdfPersonalisationError && err.code === 'FIREFLY_CONTENT_FILTERED' && err.status === 451);
});

test('availableProviders tolerates missing credentials', () => {
  assert.deepEqual(images.availableProviders({}), { firefly: false, foundry: false });
  assert.deepEqual(images.availableProviders({ creativeImageClient: fakeClient({ foundryModelId: 'm' }) }),
    { firefly: true, foundry: true });
});

test('applyImageToData sets FF_Image and mapped targets', () => {
  const out = images.applyImageToData({ a: 1 }, 'https://u', [{ source: 'FF_Image', target: 'heroImage' }]);
  assert.deepEqual(out, { a: 1, FF_Image: 'https://u', heroImage: 'https://u' });
});

test('resolveForRecord returns generated fields or falls back without throwing', async () => {
  assert.equal(await images.resolveForRecord({ data }), null);
  const ok = await images.resolveForRecord({ data, imageGeneration: { enabled: true, provider: 'firefly' } }, {
    creativeImageClient: fakeClient(), generatedImageStore: fakeStore(), toPdfJpeg: async (b) => b,
  });
  assert.equal(ok.fields.imageStatus, 'generated');
  assert.match(ok.data.FF_Image, /^https:\/\/storage\.googleapis\.com\//);

  const original = { ...data, FF_Image: 'https://cdn.example.com/orig.jpg' };
  const failed = await images.resolveForRecord({ data: original, imageGeneration: { enabled: true, provider: 'firefly' } }, {
    creativeImageClient: fakeClient({ fireflyError: new creative.CreativeImageError('down', 'FIREFLY_SUBMIT_FAILED', 503) }),
    generatedImageStore: fakeStore(),
  });
  assert.equal(failed.fields.imageStatus, 'fallback');
  assert.equal(failed.fields.imageUrl, 'https://cdn.example.com/orig.jpg');
  assert.equal(failed.fields.imageError.code, 'FIREFLY_SUBMIT_FAILED');
  assert.equal(failed.data, original);
});
