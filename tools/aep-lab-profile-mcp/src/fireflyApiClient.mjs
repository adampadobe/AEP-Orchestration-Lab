/** Server-side Adobe Firefly Image API client. Credentials never leave Cloud Run. */

const DEFAULT_IMS_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';
const DEFAULT_API_BASE = 'https://firefly-api.adobe.io';
const TOKEN_EXPIRY_BUFFER_MS = 30_000;

export class FireflyApiError extends Error {}

function loadConfig(env) {
  const clientId = String(env.FIREFLY_CLIENT_ID || '').trim();
  const clientSecret = String(env.FIREFLY_CLIENT_SECRET || '').trim();
  const scopes = String(env.FIREFLY_SCOPES || '').trim();
  if (!clientId || !clientSecret || !scopes) {
    throw new FireflyApiError('Adobe Firefly server credentials are not configured');
  }
  return {
    clientId,
    clientSecret,
    scopes,
    imsUrl: String(env.FIREFLY_IMS_URL || DEFAULT_IMS_URL).replace(/\/$/, ''),
    apiBase: String(env.FIREFLY_API_BASE_URL || DEFAULT_API_BASE).replace(/\/$/, ''),
  };
}

function validateAdobeJobUrl(rawUrl) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new FireflyApiError('invalid Adobe job URL'); }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:' || !(host === 'adobe.io' || host.endsWith('.adobe.io'))) {
    throw new FireflyApiError('untrusted Adobe job URL');
  }
  return parsed.toString();
}

function jobIdFrom(data, statusUrl) {
  const explicit = data?.jobId || data?.id;
  if (typeof explicit === 'string' && explicit) return explicit;
  const segment = new URL(statusUrl).pathname.split('/').filter(Boolean).at(-1);
  if (!segment) throw new FireflyApiError('Adobe operation response did not contain a job identifier');
  return decodeURIComponent(segment);
}

function linkHref(data, relation) {
  const value = data?.links?.[relation]?.href;
  return typeof value === 'string' ? value : undefined;
}

function collectHttpsUrls(value, urls) {
  if (typeof value === 'string') {
    if (value.startsWith('https://') && !urls.includes(value)) urls.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const nested of value) collectHttpsUrls(nested, urls);
    return;
  }
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) collectHttpsUrls(nested, urls);
  }
}

function extractOutputUrls(payload) {
  const result = payload?.result ?? payload;
  const containers = [];
  if (result && typeof result === 'object') {
    for (const key of ['outputs', 'images', 'data']) {
      if (Array.isArray(result[key])) containers.push(...result[key]);
    }
  }
  const urls = [];
  collectHttpsUrls(containers, urls);
  return urls;
}

async function readJson(response, label) {
  let body;
  try { body = await response.json(); } catch { throw new FireflyApiError(`${label} was not valid JSON`); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new FireflyApiError(`${label} was not a JSON object`);
  }
  return body;
}

/** Build an injectable client for production and unit tests. */
export function createFireflyApiClient({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  let cachedToken;
  let expiresAt = 0;
  let refreshPromise;

  async function exchangeToken() {
    const config = loadConfig(env);
    const response = await fetchImpl(config.imsUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: config.scopes,
      }).toString(),
    });
    if (!response.ok) throw new FireflyApiError(`Adobe IMS authentication failed (HTTP ${response.status})`);
    const body = await readJson(response, 'Adobe IMS response');
    if (typeof body.access_token !== 'string' || !body.access_token) {
      throw new FireflyApiError('Adobe IMS response did not contain an access token');
    }
    const expiresInMs = Math.max(60, Number(body.expires_in) || 3600) * 1000;
    cachedToken = body.access_token;
    expiresAt = now() + expiresInMs - TOKEN_EXPIRY_BUFFER_MS;
    return cachedToken;
  }

  async function getToken() {
    if (cachedToken && now() < expiresAt) return cachedToken;
    if (!refreshPromise) refreshPromise = exchangeToken().finally(() => { refreshPromise = undefined; });
    return refreshPromise;
  }

  async function adobeRequest(url, { method = 'GET', body, headers = {} } = {}) {
    const config = loadConfig(env);
    const token = await getToken();
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'x-api-key': config.clientId,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new FireflyApiError('Adobe Firefly API request failed');
    }
    if (!response.ok) throw new FireflyApiError(`Adobe Firefly API request failed (HTTP ${response.status})`);
    return response;
  }

  return {
    capabilities() {
      return {
        configured: Boolean(env.FIREFLY_CLIENT_ID && env.FIREFLY_CLIENT_SECRET && env.FIREFLY_SCOPES),
        provider: 'Adobe Firefly Services',
        operation: 'Firefly Image 5 text-to-image',
        model_id: 'firefly_image',
        asynchronous: true,
        aspect_ratios: ['auto', '1:1', '4:3', '3:4', '16:9', '9:16'],
        max_prompt_characters: 1024,
        notes: ['Generation consumes Firefly API entitlement/credits.', 'Submit calls are never retried automatically.'],
      };
    },

    async submitGenerate({ prompt, aspect_ratio = 'auto' }) {
      const config = loadConfig(env);
      const response = await adobeRequest(`${config.apiBase}/v4/images/generate-async`, {
        method: 'POST',
        headers: { 'x-model-version': 'image5' },
        body: {
          prompt,
          aspectRatio: aspect_ratio,
          resolutionLevel: '2.4MP',
          modelId: 'firefly_image',
          numVariations: 1,
          referenceBlobs: [],
        },
      });
      const data = await readJson(response, 'Adobe Firefly operation response');
      const statusUrl = data.statusUrl || linkHref(data, 'result');
      if (typeof statusUrl !== 'string') throw new FireflyApiError('Adobe Firefly response did not contain a job handle');
      const trustedStatusUrl = validateAdobeJobUrl(statusUrl);
      const cancelUrl = data.cancelUrl || linkHref(data, 'cancel');
      return {
        job_id: jobIdFrom(data, trustedStatusUrl),
        status_url: trustedStatusUrl,
        cancel_url: typeof cancelUrl === 'string' ? validateAdobeJobUrl(cancelUrl) : null,
      };
    },

    async getJobStatus(statusUrl) {
      const trustedUrl = validateAdobeJobUrl(statusUrl);
      const response = await adobeRequest(trustedUrl);
      const data = await readJson(response, 'Adobe Firefly status response');
      return {
        job_id: jobIdFrom(data, trustedUrl),
        status: String(data.status || 'unknown').toLowerCase(),
        output_urls: extractOutputUrls(data),
        adobe: data,
      };
    },

    async cancelJob(cancelUrl) {
      const trustedUrl = validateAdobeJobUrl(cancelUrl);
      await adobeRequest(trustedUrl, { method: 'PUT' });
      return { cancelled: true, job_id: jobIdFrom({}, trustedUrl) };
    },
  };
}
