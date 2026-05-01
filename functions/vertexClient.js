/**
 * Shared Vertex AI Gemini client.
 *
 * Lifted out of brandScraperService.js so multiple Cloud Functions can call
 * Gemini through one cached VertexAI instance with consistent project/location
 * resolution. Preserves the original brand-scraper behaviour exactly:
 *   - lazy require of @google-cloud/vertexai (so cold starts of non-Gemini
 *     functions don't pull in the SDK)
 *   - GCLOUD_PROJECT / GCP_PROJECT env first, then 'aep-orchestration-lab' fallback
 *   - VERTEX_LOCATION env, default 'us-central1'
 *   - VERTEX_GEMINI_MODEL env, default 'gemini-2.5-pro'
 *   - JSON mode default on, finishReason guard, empty-content guard
 */

let vertexClientCache;

function getVertexClient() {
  if (!vertexClientCache) {
    const { VertexAI } = require('@google-cloud/vertexai');
    const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'aep-orchestration-lab';
    const location = process.env.VERTEX_LOCATION || 'us-central1';
    vertexClientCache = new VertexAI({ project, location });
  }
  return vertexClientCache;
}

// Vertex AI 429 detection.
// The SDK throws e.g. `[VertexAI.ClientError]: got status: 429 Too Many
// Requests. {"error":{"code":429,"status":"RESOURCE_EXHAUSTED",...}}` so
// the cleanest signal we can rely on across SDK versions is a regex over
// e.message — there's no exported error class with a numeric .status
// field on every release of @google-cloud/vertexai.
function isRateLimitedError(e) {
  if (!e) return false;
  const msg = String(e.message || e);
  return /\b429\b|RESOURCE_EXHAUSTED|too many requests/i.test(msg);
}

async function callGemini(systemPrompt, userPrompt, opts = {}) {
  const {
    maxOutputTokens = 16384,
    jsonMode = true,
    model: modelOverride,
    temperature = 0.4,
    responseSchema,
    // Truncated JSON is unparseable, so by default we throw when the
    // model hits the output-token cap instead of returning the partial
    // text. Callers that genuinely want streamed/partial output (e.g.
    // a UI that renders incremental markdown) can opt in with
    // `allowTruncation: true`.
    allowTruncation = false,
    // Vertex AI rate-limit auto-retry. Off by default so existing
    // callers (e.g. brand scraper) are unchanged. Long single-shot
    // callers like the client-journey generator opt in — the project
    // RPM/TPM windows roll on 60s, so one short sleep usually clears
    // the limit. After the configured number of retries the call
    // throws an Error with code='RATE_LIMITED' and a friendly,
    // user-facing message (no SDK stack-trace leakage).
    retryOn429 = false,
    retryOn429DelayMs = 30000,
    retryOn429Attempts = 1,
    // Optional tools array passed straight through to getGenerativeModel.
    // Default undefined → unchanged behaviour for every existing caller.
    // Callers that want Gemini to use Google Search grounding should
    // pass `tools: [{ googleSearch: {} }]` (Gemini 2.5+) or
    // `tools: [{ googleSearchRetrieval: {} }]` (Gemini 1.5).
    //
    // ⚠️ MUTUAL EXCLUSION (Vertex AI rule, May 2026):
    //   `tools` (e.g. googleSearch grounding) and controlled generation
    //   (`responseMimeType: 'application/json'` and/or `responseSchema`)
    //   CANNOT be combined in a single Gemini call. The Vertex API
    //   rejects with HTTP 400 INVALID_ARGUMENT:
    //     "controlled generation is not supported with Search tool".
    //   Callers MUST pick exactly one per call: either grounding tools
    //   (free-text out, jsonMode:false) OR controlled JSON (no tools).
    //   For two-step research+generate flows, see `callGeminiResearch`
    //   below, which forces text/plain + tools, and pair it with a plain
    //   `callGemini(jsonMode:true, …)` for the generation pass.
    tools,
  } = opts;
  const client = getVertexClient();
  const modelName = modelOverride || process.env.VERTEX_GEMINI_MODEL || 'gemini-2.5-pro';
  const generationConfig = { temperature, maxOutputTokens };
  if (jsonMode) generationConfig.responseMimeType = 'application/json';
  if (responseSchema) generationConfig.responseSchema = responseSchema;
  const modelInit = {
    model: modelName,
    systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
    generationConfig,
  };
  if (Array.isArray(tools) && tools.length > 0) modelInit.tools = tools;
  const model = client.getGenerativeModel(modelInit);

  let resp;
  const maxAttempts = retryOn429 ? Math.max(1, retryOn429Attempts + 1) : 1;
  for (let attempt = 1; ; attempt++) {
    try {
      resp = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      });
      break;
    } catch (e) {
      if (!isRateLimitedError(e)) throw e;
      if (attempt < maxAttempts) {
        console.warn(
          `[vertex] Gemini ${modelName} returned 429 RESOURCE_EXHAUSTED ` +
          `(attempt ${attempt}/${maxAttempts}); sleeping ${retryOn429DelayMs}ms then retrying.`
        );
        await new Promise((r) => setTimeout(r, retryOn429DelayMs));
        continue;
      }
      const err = new Error(
        `Vertex AI Gemini (${modelName}) is rate-limited (RESOURCE_EXHAUSTED / 429). ` +
        'The Google Cloud project has burned its requests-per-minute or ' +
        'tokens-per-minute quota for this model in the current 60-second window. ' +
        'Wait ~60 seconds and try again, or request a quota increase in the GCP ' +
        'console under "Vertex AI API → Generate Content requests per minute per ' +
        'region (us-central1)".'
      );
      err.code = 'RATE_LIMITED';
      err.cause = e;
      throw err;
    }
  }
  const candidates = resp && resp.response && resp.response.candidates;
  if (!candidates || !candidates.length) throw new Error('Gemini returned no candidates');
  const finish = candidates[0].finishReason;
  const parts = (candidates[0].content && candidates[0].content.parts) || [];
  const text = parts.map(p => p.text || '').join('').trim();
  const usage = (resp && resp.response && resp.response.usageMetadata) || {};
  if (!text) {
    throw new Error(
      `Gemini returned empty content (finishReason=${finish || 'unknown'}, ` +
      `promptTokens=${usage.promptTokenCount || 0}, ` +
      `outputTokens=${usage.candidatesTokenCount || 0}, ` +
      `thoughtsTokens=${usage.thoughtsTokenCount || 0}).`
    );
  }
  if (finish === 'MAX_TOKENS' && !allowTruncation) {
    const err = new Error(
      `Gemini hit the output-token cap (maxOutputTokens=${maxOutputTokens}, ` +
      `outputTokens=${usage.candidatesTokenCount || 0}, ` +
      `thoughtsTokens=${usage.thoughtsTokenCount || 0}, ` +
      `responseChars=${text.length}). The response was truncated mid-stream ` +
      `and is not valid JSON. Increase maxOutputTokens or shrink the prompt.`
    );
    err.code = 'MAX_TOKENS';
    err.partialText = text;
    err.usageMetadata = usage;
    throw err;
  }
  if (finish && finish !== 'STOP' && finish !== 'MAX_TOKENS') {
    throw new Error(`Gemini stopped with finishReason=${finish}`);
  }
  return text;
}

function stripJsonFences(text) {
  if (!text) return '';
  const s = String(text);
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fenced) return fenced[1].trim();
  const opening = /```(?:json)?\s*([\s\S]*)$/i.exec(s);
  if (opening) return opening[1].trim();
  return s.trim();
}

/**
 * Thin wrapper around `callGemini` for the "research pass" of a two-call
 * flow that combines Google Search grounding with controlled-JSON output.
 *
 * Why this exists: Vertex AI rejects `tools` + `responseSchema` /
 * `responseMimeType:'application/json'` in a single call (see the long
 * comment on `callGemini`'s `tools` opt). The recommended pattern is two
 * sequential calls: (1) research with grounding, free-text out;
 * (2) generate with controlled JSON, no tools. This helper enforces the
 * shape of call (1) so callers can't accidentally re-introduce the bad
 * combination.
 *
 * Differences vs `callGemini`:
 *   - Forces `jsonMode: false` and `responseMimeType: 'text/plain'`.
 *   - Strips any `responseSchema` the caller passes, with a warn log.
 *   - Defaults `tools: [{ googleSearch: {} }]` (Gemini 2.5+) when no
 *     tools are supplied. Pass an explicit `tools: []` to disable.
 *   - Defaults `temperature: 0.4` and `maxOutputTokens: 2048` — research
 *     is a short summary, not the full deliverable.
 *   - `allowTruncation: true` by default — a research pass that hits
 *     the cap should still return what it has rather than throw.
 *
 * Returns the raw text body from Gemini (the caller is expected to
 * parse the markdown / bullets, not JSON).
 */
async function callGeminiResearch(systemPrompt, userPrompt, opts = {}) {
  const safeOpts = { ...opts };
  if (Object.prototype.hasOwnProperty.call(safeOpts, 'responseSchema')) {
    console.warn(
      '[vertex] callGeminiResearch ignored responseSchema — research ' +
      'pass forces text/plain output to allow Google Search grounding. ' +
      'Move controlled JSON to the separate generation pass.'
    );
    delete safeOpts.responseSchema;
  }
  if (safeOpts.jsonMode === true) {
    console.warn(
      '[vertex] callGeminiResearch ignored jsonMode:true — research ' +
      'pass forces text/plain output (controlled generation is mutually ' +
      'exclusive with tool grounding on Vertex AI).'
    );
  }
  safeOpts.jsonMode = false;
  if (typeof safeOpts.temperature !== 'number') safeOpts.temperature = 0.4;
  if (typeof safeOpts.maxOutputTokens !== 'number') safeOpts.maxOutputTokens = 2048;
  if (typeof safeOpts.allowTruncation !== 'boolean') safeOpts.allowTruncation = true;
  if (!Array.isArray(safeOpts.tools)) safeOpts.tools = [{ googleSearch: {} }];
  return callGemini(systemPrompt, userPrompt, safeOpts);
}

module.exports = { getVertexClient, callGemini, callGeminiResearch, stripJsonFences };
