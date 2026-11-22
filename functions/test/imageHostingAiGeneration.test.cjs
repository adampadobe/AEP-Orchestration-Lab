'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const { test } = require('node:test');

const originalLoad = Module._load;
Module._load = function (request, ...args) {
  if (request === 'firebase-admin') return {};
  return originalLoad.call(this, request, ...args);
};
let aiGenerateReplacement;
try {
  ({ aiGenerateReplacement } = require('../imageHostingLibrary'));
} finally {
  Module._load = originalLoad;
}

function mockGenAI(t, generateContent) {
  const constructors = [];
  t.mock.method(Module, '_load', function (request, ...args) {
    if (request === '@google/genai') {
      return {
        GoogleGenAI: class {
          constructor(options) {
            constructors.push(options);
            this.models = { generateContent };
          }
        },
      };
    }
    return originalLoad.call(this, request, ...args);
  });
  return constructors;
}

function setEnv(t, values) {
  for (const [key, value] of Object.entries(values)) {
    const previous = process.env[key];
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test('sends image generation settings and parses the first inline image', async (t) => {
  setEnv(t, {
    GCLOUD_PROJECT: 'primary-project',
    GCP_PROJECT: 'secondary-project',
    GOOGLE_CLOUD_PROJECT: 'other-project',
    VERTEX_LOCATION: 'europe-west1',
    VERTEX_GEMINI_IMAGE_MODEL: 'custom-image-model',
  });
  let request;
  const constructors = mockGenAI(t, async (input) => {
    request = input;
    return {
      candidates: [{
        content: { parts: [{ text: 'Here is an image' }, { inlineData: { data: 'aGVsbG8=', mimeType: 'image/webp' } }] },
      }],
    };
  });

  const result = await aiGenerateReplacement({
    classification: { category: 'hero_banner' }, brandName: 'Example',
    subject: 'Ocean', alt: 'Blue water', sourceUrl: 'https://example.com/image.jpg',
  });
  const prompt = 'Create a wide marketing hero banner for Example. Ocean — Blue water. Professional photography style, clean composition, brand-appropriate colours. (Source reference: example.com.)';
  assert.deepEqual(constructors, [{ vertexai: true, project: 'primary-project', location: 'europe-west1' }]);
  assert.deepEqual(request, {
    model: 'custom-image-model',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { temperature: 0.3, responseModalities: ['IMAGE', 'TEXT'] },
  });
  assert.deepEqual(result, { bytes: Buffer.from('hello'), contentType: 'image/webp', prompt });
});

test('retains project precedence, defaults, and category-specific prompts', async (t) => {
  setEnv(t, {
    GCLOUD_PROJECT: undefined, GCP_PROJECT: 'secondary-project', GOOGLE_CLOUD_PROJECT: 'ignored-project',
    VERTEX_LOCATION: undefined, VERTEX_GEMINI_IMAGE_MODEL: undefined,
  });
  const requests = [];
  const constructors = mockGenAI(t, async (input) => {
    requests.push(input);
    return { candidates: [{ content: { parts: [{ inlineData: { data: 'eA==' } }] } }] };
  });
  const cases = [
    [{ classification: { category: 'logo' }, brandName: 'Example', subject: 'A mark' },
      'Create a clean, professional logo mark suitable for the brand "Example". A mark. Flat, high-contrast, centred on a transparent or white background, no extra text, suitable for use at small sizes.'],
    [{ classification: { category: 'product' } },
      'Create a clean product photo. A product from this brand. White background, soft studio lighting, centred subject.'],
    [{ classification: { category: 'portrait' }, alt: 'A person' },
      'Create a professional business portrait headshot. A person. Neutral background, friendly expression.'],
    [{ classification: { category: 'other' } },
      'Create a brand-appropriate image. other. Professional quality.'],
    [{}, 'Create a brand-appropriate image. Marketing imagery.. Professional quality.'],
  ];
  for (const [opts, prompt] of cases) {
    const result = await aiGenerateReplacement(opts);
    assert.equal(result.prompt, prompt);
    assert.equal(result.contentType, 'image/png');
    assert.deepEqual(result.bytes, Buffer.from('x'));
  }
  assert.equal(constructors[0].project, 'secondary-project');
  assert.equal(constructors[0].location, 'us-central1');
  assert.equal(requests[0].model, 'gemini-2.5-flash-image');
  delete process.env.GCP_PROJECT;
  await aiGenerateReplacement({});
  assert.equal(constructors.at(-1).project, 'aep-orchestration-lab');
});

test('preserves no-candidate and missing-image errors', async (t) => {
  let response = {};
  mockGenAI(t, async () => response);
  await assert.rejects(aiGenerateReplacement({}), { message: 'Gemini image: no candidate returned' });
  response = { candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: 'blocked' }] } }] };
  await assert.rejects(aiGenerateReplacement({}), {
    message: 'Gemini image: no image in response (finish=SAFETY, text="blocked")',
  });
  response = { candidates: [{}] };
  await assert.rejects(aiGenerateReplacement({}), { message: 'Gemini image: no image in response (finish=unknown)' });
});

test('propagates SDK errors without adding application-level retries', async (t) => {
  const error = Object.assign(new Error('quota exceeded'), { status: 429 });
  let calls = 0;
  mockGenAI(t, async () => { calls++; throw error; });
  await assert.rejects(aiGenerateReplacement({}), (err) => err === error);
  assert.equal(calls, 1);
});
