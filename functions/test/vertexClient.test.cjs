'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { GenerateContentResponse } = require('@google/genai');
const { getVertexClient, callGemini, callGeminiResearch, stripJsonFences } = require('../vertexClient');
const { SCHEMA } = require('../labFeedsService');

const client = getVertexClient();
const originalGenerate = client.models.generateContent;
after(() => { client.models.generateContent = originalGenerate; });

function response(text, finishReason = 'STOP', usageMetadata = {}) {
  const result = new GenerateContentResponse();
  result.candidates = [{ finishReason, content: { parts: [{ text }] } }];
  result.usageMetadata = usageMetadata;
  return result;
}

test('passes structured JSON configuration and reads the SDK response', async () => {
  let request;
  client.models.generateContent = async (input) => {
    request = input;
    return response('  {"relevance":0.8}  ');
  };
  assert.equal(await callGemini('system', 'user', {
    model: 'gemini-2.5-flash', responseSchema: SCHEMA, temperature: 0.1, maxOutputTokens: 4096,
  }), '{"relevance":0.8}');
  assert.deepEqual(request, {
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: 'user' }] }],
    config: {
      systemInstruction: { role: 'system', parts: [{ text: 'system' }] },
      responseMimeType: 'application/json', responseSchema: SCHEMA,
      temperature: 0.1, maxOutputTokens: 4096,
    },
  });
  assert.equal(getVertexClient(), client);
});

test('research strips JSON configuration and defaults to search grounding', async () => {
  let request;
  client.models.generateContent = async (input) => { request = input; return response('research'); };
  assert.equal(await callGeminiResearch('system', 'user'), 'research');
  assert.deepEqual(request.config.tools, [{ googleSearch: {} }]);
  assert.equal(request.config.responseMimeType, undefined);
  assert.equal(request.config.responseSchema, undefined);
  assert.equal(request.config.maxOutputTokens, 2048);
});

test('maps quota errors and retries only when requested', async () => {
  const cause = Object.assign(new Error('quota exceeded'), { status: 429 });
  let calls = 0;
  client.models.generateContent = async () => { calls++; throw cause; };
  await assert.rejects(callGemini('s', 'u', { model: 'test-model', retryOn429: true, retryOn429DelayMs: 0 }), (err) => {
    assert.equal(err.code, 'RATE_LIMITED');
    assert.equal(err.cause, cause);
    assert.match(err.message, /Vertex AI Gemini \(test-model\) is rate-limited \(RESOURCE_EXHAUSTED \/ 429\)/);
    return true;
  });
  assert.equal(calls, 2);
  const other = new Error('unrelated failure');
  client.models.generateContent = async () => { throw other; };
  await assert.rejects(callGemini('s', 'u'), (err) => err === other);
});

test('preserves empty, no-candidate, stop reason and truncation errors', async () => {
  client.models.generateContent = async () => new GenerateContentResponse();
  await assert.rejects(callGemini('s', 'u'), /Gemini returned no candidates/);
  client.models.generateContent = async () => response('', 'SAFETY', { promptTokenCount: 3 });
  await assert.rejects(callGemini('s', 'u'), /Gemini returned empty content \(finishReason=SAFETY, promptTokens=3/);
  client.models.generateContent = async () => response('partial', 'MAX_TOKENS', { candidatesTokenCount: 7 });
  await assert.rejects(callGemini('s', 'u', { maxOutputTokens: 10 }), (err) => {
    assert.equal(err.code, 'MAX_TOKENS');
    assert.equal(err.partialText, 'partial');
    assert.equal(err.usageMetadata.candidatesTokenCount, 7);
    return true;
  });
  assert.equal(await callGemini('s', 'u', { allowTruncation: true }), 'partial');
  client.models.generateContent = async () => response('text', 'SAFETY');
  await assert.rejects(callGemini('s', 'u'), /Gemini stopped with finishReason=SAFETY/);
});

test('preserves JSON fence stripping', () => {
  assert.equal(stripJsonFences('```json\n{"ok":true}\n```'), '{"ok":true}');
});
