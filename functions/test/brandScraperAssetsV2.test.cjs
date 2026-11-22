'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const genai = require('@google/genai');
const { classifyWithGemini } = require('../brandScraperAssetsV2');

async function withEnv(values, run) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function installGenaiMock(t, { options, request, response, error }) {
  t.mock.method(genai, 'GoogleGenAI', function (clientOptions) {
    options.value = clientOptions;
    return {
      models: {
        generateContent: async (input) => {
          request.value = input;
          if (error) throw error;
          return response;
        },
      },
    };
  });
}

test('sends the multimodal Vertex request with the legacy project precedence', async (t) => {
  const options = { value: null };
  const request = { value: null };
  installGenaiMock(t, {
    options,
    request,
    response: {
      candidates: [{
        finishReason: 'STOP',
        content: { parts: [{ text: '{"category":"logo","subject":"Brand mark","text_detected":"","confidence":"high"}' }] },
      }],
    },
  });

  const result = await withEnv({
    GCLOUD_PROJECT: 'gcloud-project',
    GCP_PROJECT: 'gcp-project',
    GOOGLE_CLOUD_PROJECT: 'google-project',
    VERTEX_LOCATION: 'europe-west1',
    VERTEX_GEMINI_VISION_MODEL: 'vision-model',
  }, () => classifyWithGemini(Buffer.from('image bytes'), 'image/jpeg'));

  assert.deepEqual(options.value, {
    vertexai: true,
    project: 'gcloud-project',
    location: 'europe-west1',
  });
  assert.deepEqual(request.value.contents, [{
    role: 'user',
    parts: [
      { inlineData: { data: Buffer.from('image bytes').toString('base64'), mimeType: 'image/jpeg' } },
      { text: 'Classify this image.' },
    ],
  }]);
  assert.deepEqual({
    model: request.value.model,
    config: {
      temperature: request.value.config.temperature,
      maxOutputTokens: request.value.config.maxOutputTokens,
      responseMimeType: request.value.config.responseMimeType,
    },
  }, {
    model: 'vision-model',
    config: {
      temperature: 0.1,
      maxOutputTokens: 512,
      responseMimeType: 'application/json',
    },
  });
  assert.equal(request.value.config.systemInstruction.role, 'system');
  assert.match(request.value.config.systemInstruction.parts[0].text, /image classifier/);
  assert.deepEqual(result, {
    category: 'logo',
    subject: 'Brand mark',
    text_detected: '',
    confidence: 'high',
  });
});

test('preserves fallback project selection, image MIME default, and malformed JSON behavior', async (t) => {
  const options = { value: null };
  const request = { value: null };
  installGenaiMock(t, {
    options,
    request,
    response: {
      candidates: [{
        finishReason: 'STOP',
        content: { parts: [{ text: 'not valid JSON' }] },
      }],
    },
  });

  const result = await withEnv({
    GCLOUD_PROJECT: undefined,
    GCP_PROJECT: 'gcp-project',
    GOOGLE_CLOUD_PROJECT: 'google-project',
    VERTEX_LOCATION: undefined,
    VERTEX_GEMINI_VISION_MODEL: undefined,
  }, () => classifyWithGemini(Buffer.from('image bytes')));

  assert.deepEqual(options.value, {
    vertexai: true,
    project: 'gcp-project',
    location: 'us-central1',
  });
  assert.equal(request.value.model, 'gemini-2.5-flash');
  assert.equal(request.value.contents[0].parts[0].inlineData.mimeType, 'image/png');
  assert.deepEqual(result, {
    category: 'unknown',
    subject: 'not valid JSON',
    text_detected: '',
    confidence: 'low',
  });
});

test('uses the lab project fallback instead of GOOGLE_CLOUD_PROJECT', async (t) => {
  const options = { value: null };
  const request = { value: null };
  installGenaiMock(t, {
    options,
    request,
    response: {
      candidates: [{
        finishReason: 'STOP',
        content: { parts: [{ text: '{"category":"unknown"}' }] },
      }],
    },
  });

  await withEnv({
    GCLOUD_PROJECT: undefined,
    GCP_PROJECT: undefined,
    GOOGLE_CLOUD_PROJECT: 'google-project',
    VERTEX_LOCATION: undefined,
  }, () => classifyWithGemini(Buffer.from('image')));

  assert.deepEqual(options.value, {
    vertexai: true,
    project: 'aep-orchestration-lab',
    location: 'us-central1',
  });
});

test('preserves the no-candidate error', async (t) => {
  const options = { value: null };
  const request = { value: null };
  installGenaiMock(t, { options, request, response: { candidates: [] } });
  await assert.rejects(classifyWithGemini(Buffer.from('image')), /^Error: no candidates$/);
});

test('preserves the empty-response error and finish reason', async (t) => {
  const options = { value: null };
  const request = { value: null };
  installGenaiMock(t, {
    options,
    request,
    response: {
      candidates: [{
        finishReason: 'MAX_TOKENS',
        content: { parts: [{ text: '' }] },
      }],
    },
  });
  await assert.rejects(
    classifyWithGemini(Buffer.from('image')),
    /^Error: empty response \(finishReason=MAX_TOKENS\)$/
  );
});

test('propagates SDK request errors unchanged', async (t) => {
  const options = { value: null };
  const request = { value: null };
  const sdkError = Object.assign(new Error('Vertex request failed'), { code: 503 });
  installGenaiMock(t, { options, request, error: sdkError });
  await assert.rejects(classifyWithGemini(Buffer.from('image')), (error) => error === sdkError);
});
