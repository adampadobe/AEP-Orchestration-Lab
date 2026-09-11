/** Fixed-surface clients for Adobe creative production APIs. */

const IMS_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';
const TOKEN_BUFFER_MS = 30_000;
const BASES = Object.freeze({
  photoshop: 'https://photoshop-api.adobe.io',
  indesign: 'https://indesign.adobe.io',
  substance: 'https://s3d.adobe.io',
  express: 'https://express-api.adobe.io',
  illustrator: 'https://illustrator-api.adobe.io',
});
const SCOPES = Object.freeze({
  photoshop: 'openid,AdobeID,read_organizations',
  indesign: 'openid,AdobeID,creative_sdk,firefly_api,ff_apis',
  substance: 'openid,AdobeID,read_organizations,email,firefly_api,firefly_enterprise,profile,substance3d_api.spaces.create,substance3d_api.jobs.create',
  express: 'openid,AdobeID,ee.express_api',
  illustrator: 'openid,AdobeID,creative_sdk,firefly_api,ff_apis',
});

export class CreativityApiError extends Error {}

function profileScopes(env, profile) {
  const key = `CREATIVITY_${profile.toUpperCase()}_SCOPES`;
  return String(env[key] || SCOPES[profile]).trim();
}

function config(env) {
  const clientId = String(env.CREATIVITY_CLIENT_ID || env.FIREFLY_CLIENT_ID || '').trim();
  const clientSecret = String(env.CREATIVITY_CLIENT_SECRET || env.FIREFLY_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) throw new CreativityApiError('Adobe creative API server credentials are not configured');
  return { clientId, clientSecret, imsUrl: String(env.CREATIVITY_IMS_URL || IMS_URL).replace(/\/$/, '') };
}

async function json(response, label) {
  let value;
  try { value = await response.json(); } catch { throw new CreativityApiError(`${label} was not valid JSON`); }
  if (!value || typeof value !== 'object') throw new CreativityApiError(`${label} was not a JSON object`);
  return value;
}

function trustedJobUrl(rawUrl, expectedProfile) {
  let parsed;
  try { parsed = new URL(rawUrl); } catch { throw new CreativityApiError('invalid Adobe creative job URL'); }
  if (parsed.protocol !== 'https:' || !Object.values(BASES).includes(parsed.origin)) {
    throw new CreativityApiError('untrusted Adobe creative job URL');
  }
  if (expectedProfile && parsed.origin !== BASES[expectedProfile]) {
    throw new CreativityApiError('Adobe creative job URL does not match the selected product');
  }
  return parsed.toString();
}

function normalizeJob(data, profile) {
  const statusUrl = data.statusUrl || data.status_url || data.url || data?._links?.self?.href;
  if (typeof statusUrl !== 'string') throw new CreativityApiError('Adobe creative response did not contain a job status URL');
  const safeUrl = trustedJobUrl(statusUrl, profile);
  return {
    job_id: String(data.jobId || data.id || new URL(safeUrl).pathname.split('/').filter(Boolean).at(-1)),
    status_url: safeUrl,
    status: data.status || 'submitted',
  };
}

export function createCreativityApiClient({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const tokens = new Map();

  async function token(profile) {
    const cached = tokens.get(profile);
    if (cached && now() < cached.expiresAt) return cached.value;
    const cfg = config(env);
    const response = await fetchImpl(cfg.imsUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials', client_id: cfg.clientId,
        client_secret: cfg.clientSecret, scope: profileScopes(env, profile),
      }).toString(),
    });
    if (!response.ok) throw new CreativityApiError(`Adobe IMS authentication failed for ${profile} (HTTP ${response.status})`);
    const data = await json(response, 'Adobe IMS response');
    if (typeof data.access_token !== 'string' || !data.access_token) throw new CreativityApiError('Adobe IMS response did not contain an access token');
    tokens.set(profile, { value: data.access_token, expiresAt: now() + Math.max(60, Number(data.expires_in) || 3600) * 1000 - TOKEN_BUFFER_MS });
    return data.access_token;
  }

  async function request(profile, pathOrUrl, { method = 'GET', body } = {}) {
    const cfg = config(env);
    const url = pathOrUrl.startsWith('https://') ? trustedJobUrl(pathOrUrl, profile) : `${BASES[profile]}${pathOrUrl}`;
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${await token(profile)}`,
          'x-api-key': cfg.clientId,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch { throw new CreativityApiError(`Adobe ${profile} API request failed`); }
    if (!response.ok) throw new CreativityApiError(`Adobe ${profile} API request failed (HTTP ${response.status})`);
    return json(response, `Adobe ${profile} response`);
  }

  return {
    capabilities() {
      return {
        configured: Boolean((env.CREATIVITY_CLIENT_ID || env.FIREFLY_CLIENT_ID) && (env.CREATIVITY_CLIENT_SECRET || env.FIREFLY_CLIENT_SECRET)),
        operations: {
          photoshop_v2: ['combined Lightroom-style edits: auto tone, auto straighten, light and colour adjustments'],
          indesign_v3: ['CSV data merge into INDD templates'],
          substance_3d_v1: ['basic cloud render of a 3D model'],
          express_beta: ['list and inspect owned tagged documents', 'create tagged-template variations'],
          illustrator_v1: ['raster PNG/JPEG to SVG image trace'],
        },
        documented_extensions_not_implemented: {
          photoshop_v2: ['create composites and layered documents', 'execute published Photoshop Actions', 'generate document manifests and perform smart-object operations'],
          indesign_v3: ['renditions', 'document information', 'PDF to editable InDesign conversion', 'allowlisted custom scripts'],
          substance_3d_v1: ['scene assembly, conversion, and description', 'AI-background compositing', 'temporary asset spaces'],
          express_beta: ['multi-output and page-override expansion', 'completion webhooks'],
          illustrator_v1: ['rendition and preview', 'data merge', 'recolor and manifests', 'allowlisted custom scripts'],
        },
        exclusions: {
          firefly: 'Image, video, and audio generation remain in aep-lab-firefly.',
          pdf: 'PDF document conversion remains in aep-lab-pdf-prep.',
          express_review: 'Connected in Developer Console, but no verified public operation contract is implemented.',
        },
      };
    },
    async probeToken(profile) {
      await token(profile);
      return { profile, token_issued: true, operation_access_verified: false };
    },
    async submitPhotoshopEdit(body) { return normalizeJob(await request('photoshop', '/v2/edit', { method: 'POST', body }), 'photoshop'); },
    async submitInDesignMerge(body) { return normalizeJob(await request('indesign', '/v3/merge-data', { method: 'POST', body }), 'indesign'); },
    async submitSubstanceRender(body) { return normalizeJob(await request('substance', '/v1/scenes/render-basic', { method: 'POST', body }), 'substance'); },
    async listExpressDocuments({ start = 0, limit = 10 } = {}) { return request('express', `/beta/tagged-documents?start=${start}&limit=${limit}&sortBy=name`); },
    async getExpressDocument(id) { return request('express', `/beta/tagged-documents/${encodeURIComponent(id)}`); },
    async submitExpressVariation(body) { return normalizeJob(await request('express', '/beta/create-variation', { method: 'POST', body }), 'express'); },
    async submitIllustratorTrace(body) { return normalizeJob(await request('illustrator', '/v1/trace-image', { method: 'POST', body }), 'illustrator'); },
    async getJobStatus(profile, statusUrl) { return request(profile, trustedJobUrl(statusUrl, profile)); },
  };
}
