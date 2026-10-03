'use strict';

/**
 * Server-side Adobe Firefly and Firefly Foundry image generation.
 *
 * Authentication reuses the Lab's existing IMS client (`createAdobeAuth`):
 * callers inject `getToken()` (a bearer token minted with the Firefly scopes)
 * and `getApiKey()` (the same ADOBE_CLIENT_ID). No credentials live here.
 */

const DEFAULT_FIREFLY_API_BASE = 'https://firefly-api.adobe.io';
const DEFAULT_FOUNDRY_GENERATION_URL = 'https://foundry-inference.adobe.io/v1/image/generate';
const FIREFLY_JOB_HOSTS = new Set(['firefly-api.adobe.io']);
const TRUSTED_ADOBE_SUFFIXES = ['adobe.io', 'adobe.net'];
const MEDIA_HOST_SUFFIXES = [
  'amazonaws.com',
  'windows.net',
  'dropboxusercontent.com',
  'storage.googleapis.com',
  'firebasestorage.googleapis.com',
  'adobe.io',
  'adobe.net',
];
const ASPECT_RATIOS = new Set(['16:9', '4:3', '1:1', '3:4', '9:16']);
const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;
const OUTPUT_MAX_WIDTH = 1600;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

class CreativeImageError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'CreativeImageError';
    this.code = code || 'CREATIVE_IMAGE_FAILED';
    this.status = status || 502;
  }
}

function hostMatches(host, suffixes) {
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function parseHttpsUrl(raw, message, code) {
  let parsed;
  try {
    parsed = new URL(String(raw || ''));
  } catch (_error) {
    throw new CreativeImageError(message, code);
  }
  if (parsed.protocol !== 'https:') throw new CreativeImageError(message, code);
  return parsed;
}

function validateFireflyJobUrl(raw) {
  const parsed = parseHttpsUrl(raw, 'Firefly returned an invalid job URL.', 'FIREFLY_JOB_URL_INVALID');
  const host = parsed.hostname.toLowerCase();
  if (!FIREFLY_JOB_HOSTS.has(host) && !/^firefly-[a-z0-9]+\.adobe\.io$/.test(host)) {
    throw new CreativeImageError('Firefly returned an untrusted job URL.', 'FIREFLY_JOB_URL_UNTRUSTED');
  }
  return parsed.toString();
}

function validateFoundryResultUrl(raw) {
  const parsed = parseHttpsUrl(raw, 'Foundry returned an invalid result URL.', 'FOUNDRY_RESULT_URL_INVALID');
  if (!hostMatches(parsed.hostname.toLowerCase(), TRUSTED_ADOBE_SUFFIXES)) {
    throw new CreativeImageError('Foundry returned an untrusted result URL.', 'FOUNDRY_RESULT_URL_UNTRUSTED');
  }
  return parsed.toString();
}

function validateMediaUrl(raw) {
  const parsed = parseHttpsUrl(raw, 'Generated image URL is invalid.', 'CREATIVE_MEDIA_URL_INVALID');
  if (!hostMatches(parsed.hostname.toLowerCase(), MEDIA_HOST_SUFFIXES)) {
    throw new CreativeImageError('Generated image URL is not on an Adobe-supported storage host.', 'CREATIVE_MEDIA_URL_UNTRUSTED');
  }
  return parsed.toString();
}

function normaliseAspectRatio(value) {
  const aspect = String(value || '').trim();
  return ASPECT_RATIOS.has(aspect) ? aspect : '16:9';
}

async function readJsonSafe(response) {
  try {
    const body = await response.json();
    return body && typeof body === 'object' ? body : {};
  } catch (_error) {
    return {};
  }
}

function firstOutputUrl(payload) {
  const result = payload && (payload.result || payload);
  const outputs = result && Array.isArray(result.outputs) ? result.outputs : [];
  for (const output of outputs) {
    const image = output && output.image;
    const url = image && (image.url || image.presignedUrl);
    if (typeof url === 'string' && url.startsWith('https://')) return url;
  }
  return '';
}

function errorMessage(body, fallback) {
  const message = body && (body.message || body.error_message || (body.error && body.error.message));
  return typeof message === 'string' && message ? message.slice(0, 300) : fallback;
}

function retryAfterMs(response, fallbackMs) {
  const header = response && response.headers && typeof response.headers.get === 'function'
    ? response.headers.get('retry-after')
    : null;
  if (header === null || header === undefined || String(header).trim() === '') return fallbackMs;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds * 1000, 15_000) : fallbackMs;
}

function createCreativeImageClient(options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now || (() => Date.now());
  const env = options.env || process.env;
  const fireflyApiBase = String(env.FIREFLY_API_BASE_URL || DEFAULT_FIREFLY_API_BASE).replace(/\/$/, '');
  const foundryModelId = String(env.FOUNDRY_MODEL_ID || '').trim();
  const foundryUrl = String(env.FOUNDRY_GENERATION_URL || DEFAULT_FOUNDRY_GENERATION_URL).trim();

  if (typeof options.getToken !== 'function' || typeof options.getApiKey !== 'function') {
    throw new Error('createCreativeImageClient requires getToken and getApiKey');
  }

  async function authHeaders(extra) {
    const token = await options.getToken();
    const apiKey = await options.getApiKey();
    if (!token || !apiKey) {
      throw new CreativeImageError('Adobe creative credentials are not configured.', 'CREATIVE_AUTH_UNAVAILABLE', 503);
    }
    return { Authorization: `Bearer ${token}`, 'x-api-key': apiKey, ...extra };
  }

  async function pollWithRetry(url, headers) {
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetchImpl(url, { method: 'GET', headers });
      if (!RETRYABLE_STATUS.has(response.status) || attempt >= 2) return response;
      await sleep(retryAfterMs(response, 1000 * (attempt + 1)));
    }
  }

  async function generateFirefly({ prompt, aspectRatio, deadlineMs = 90_000 }) {
    const aspect = normaliseAspectRatio(aspectRatio);
    const headers = await authHeaders({ 'content-type': 'application/json', 'x-model-version': 'image5' });
    const submit = await fetchImpl(`${fireflyApiBase}/v4/images/generate-async`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt,
        aspectRatio: aspect,
        resolutionLevel: '2.4MP',
        modelId: 'firefly_image',
        numVariations: 1,
        referenceBlobs: [],
      }),
    });
    const submitBody = await readJsonSafe(submit);
    if (submit.status === 451) {
      throw new CreativeImageError('Firefly blocked the prompt by content policy.', 'FIREFLY_CONTENT_FILTERED', 451);
    }
    if (!submit.ok) {
      throw new CreativeImageError(
        errorMessage(submitBody, `Firefly submit failed (HTTP ${submit.status}).`),
        'FIREFLY_SUBMIT_FAILED',
        submit.status,
      );
    }
    const statusUrl = validateFireflyJobUrl(
      submitBody.statusUrl || (submitBody.links && submitBody.links.result && submitBody.links.result.href),
    );
    const pollHeaders = { Authorization: headers.Authorization, 'x-api-key': headers['x-api-key'] };
    const deadline = now() + deadlineMs;
    for (;;) {
      const response = await pollWithRetry(statusUrl, pollHeaders);
      const body = await readJsonSafe(response);
      if (!response.ok) {
        throw new CreativeImageError(
          errorMessage(body, `Firefly status failed (HTTP ${response.status}).`),
          'FIREFLY_STATUS_FAILED',
          response.status,
        );
      }
      const status = String(body.status || '').toLowerCase();
      if (status === 'succeeded') {
        const url = firstOutputUrl(body);
        if (!url) throw new CreativeImageError('Firefly returned no image output.', 'FIREFLY_NO_OUTPUT');
        return { provider: 'firefly', model: 'image5', sourceUrl: validateMediaUrl(url) };
      }
      if (status === 'failed' || status === 'cancelled' || status === 'canceled') {
        throw new CreativeImageError(errorMessage(body, 'Firefly job failed.'), 'FIREFLY_JOB_FAILED');
      }
      if (now() >= deadline) throw new CreativeImageError('Firefly job timed out.', 'FIREFLY_TIMEOUT', 504);
      await sleep(retryAfterMs(response, 2500));
    }
  }

  async function foundryAttempt({ prompt, aspect, negativePrompt, deadline }) {
    const headers = await authHeaders({ 'content-type': 'application/json', 'x-foundry-model-id': foundryModelId });
    const submit = await fetchImpl(foundryUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt, resolution: '2k', aspectRatio: aspect, n: 1, negativePrompt }),
    });
    const submitBody = await readJsonSafe(submit);
    if (submit.status === 451) {
      throw new CreativeImageError('Foundry blocked the prompt by content policy.', 'FOUNDRY_CONTENT_FILTERED', 451);
    }
    if (submit.status !== 202) {
      throw new CreativeImageError(
        errorMessage(submitBody, `Foundry submit failed (HTTP ${submit.status}).`),
        'FOUNDRY_SUBMIT_FAILED',
        submit.status,
      );
    }
    const resultUrl = validateFoundryResultUrl(submitBody.links && submitBody.links.result && submitBody.links.result.href);
    const pollHeaders = { Authorization: headers.Authorization };
    for (;;) {
      const response = await pollWithRetry(resultUrl, pollHeaders);
      const body = await readJsonSafe(response);
      if (response.status === 200) {
        if (body.status === 'IN_PROGRESS') {
          if (now() >= deadline) throw new CreativeImageError('Foundry job timed out.', 'FOUNDRY_TIMEOUT', 504);
          await sleep(retryAfterMs(response, 5000));
          continue;
        }
        const url = firstOutputUrl(body);
        if (!url) throw new CreativeImageError('Foundry returned no image output.', 'FOUNDRY_NO_OUTPUT');
        return validateMediaUrl(url);
      }
      if (response.status === 451) {
        throw new CreativeImageError('Foundry blocked the output by content policy.', 'FOUNDRY_CONTENT_FILTERED', 451);
      }
      const error = new CreativeImageError(
        errorMessage(body, `Foundry job failed (HTTP ${response.status}).`),
        'FOUNDRY_JOB_FAILED',
        response.status,
      );
      error.retryable = response.status === 500;
      throw error;
    }
  }

  async function generateFoundry({ prompt, aspectRatio, negativePrompt = '', deadlineMs = 200_000 }) {
    if (!foundryModelId) {
      throw new CreativeImageError('Firefly Foundry is not configured (FOUNDRY_MODEL_ID).', 'FOUNDRY_NOT_CONFIGURED', 503);
    }
    const aspect = normaliseAspectRatio(aspectRatio);
    const deadline = now() + deadlineMs;
    for (let attempt = 0; ; attempt += 1) {
      try {
        const sourceUrl = await foundryAttempt({ prompt, aspect, negativePrompt, deadline });
        return { provider: 'foundry', model: foundryModelId, sourceUrl };
      } catch (error) {
        if (!error.retryable || attempt >= 1 || now() >= deadline) throw error;
      }
    }
  }

  async function downloadImage(url) {
    const safeUrl = validateMediaUrl(url);
    const response = await fetchImpl(safeUrl, { method: 'GET', redirect: 'error' });
    if (!response.ok) {
      throw new CreativeImageError(`Generated image download failed (HTTP ${response.status}).`, 'CREATIVE_DOWNLOAD_FAILED');
    }
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.startsWith('image/') && !contentType.startsWith('application/octet-stream')) {
      throw new CreativeImageError('Generated output is not an image.', 'CREATIVE_DOWNLOAD_NOT_IMAGE');
    }
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_DOWNLOAD_BYTES) {
      throw new CreativeImageError('Generated image is too large.', 'CREATIVE_DOWNLOAD_TOO_LARGE');
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_DOWNLOAD_BYTES) {
      throw new CreativeImageError('Generated image is too large.', 'CREATIVE_DOWNLOAD_TOO_LARGE');
    }
    return buffer;
  }

  return {
    foundryConfigured: Boolean(foundryModelId),
    foundryModelId,
    providers() {
      return { firefly: true, foundry: Boolean(foundryModelId) };
    },
    generateFirefly,
    generateFoundry,
    downloadImage,
  };
}

async function toPdfJpeg(buffer, sharpImpl) {
  const sharp = sharpImpl || require('sharp');
  return sharp(buffer)
    .rotate()
    .resize({ width: OUTPUT_MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

module.exports = {
  CreativeImageError,
  createCreativeImageClient,
  normaliseAspectRatio,
  toPdfJpeg,
  validateFireflyJobUrl,
  validateFoundryResultUrl,
  validateMediaUrl,
};
