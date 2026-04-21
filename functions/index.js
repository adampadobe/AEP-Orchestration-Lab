/**
 * Standalone Firebase project for AEP Decisioning lab.
 * Mirrors proxy_server.py: POST /api/aep → platform.adobe.io, GET webhook index (allowlisted).
 */
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');

const ADOBE_CLIENT_ID = defineSecret('ADOBE_CLIENT_ID');
const ADOBE_CLIENT_SECRET = defineSecret('ADOBE_CLIENT_SECRET');
const ADOBE_IMS_ORG = defineSecret('ADOBE_IMS_ORG');
const ADOBE_SCOPES = defineSecret('ADOBE_SCOPES');

const EASTER_EGG_MAILGUN_API_KEY = defineSecret('EASTER_EGG_MAILGUN_API_KEY');
const EASTER_EGG_MAILGUN_DOMAIN = defineSecret('EASTER_EGG_MAILGUN_DOMAIN');

/** Default Platform sandbox; override at deploy: `ADOBE_SANDBOX_NAME=other firebase deploy` or edit this constant. */
const DEFAULT_ADOBE_SANDBOX = 'apalmer';
const RESOLVED_ADOBE_SANDBOX = String(
  process.env.ADOBE_SANDBOX_NAME || DEFAULT_ADOBE_SANDBOX
).trim();

const BASE_PLATFORM = 'https://platform.adobe.io';
const IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v2';
/** Lazy require: defer loading heavy modules until first handler use (keeps deploy analysis under timeout). */
function lazyRequireMod(p) {
  let cache;
  return new Proxy({}, {
    get(_t, prop) {
      if (!cache) cache = require(p);
      const v = cache[prop];
      return typeof v === 'function' ? v.bind(cache) : v;
    },
  });
}

const profileTableHelpers = lazyRequireMod('./profileTableHelpers');
const profileConsentPayload = lazyRequireMod('./profileConsentPayload');
const profileAudiences = lazyRequireMod('./profileAudiences');
const profileEventsService = lazyRequireMod('./profileEventsService');
const sandboxesList = lazyRequireMod('./sandboxesList');
const joLookups = lazyRequireMod('./joLookups');
const schemaViewerService = lazyRequireMod('./schemaViewerService');
const svCache = lazyRequireMod('./schemaViewerCache');
const auditEventsService = lazyRequireMod('./auditEventsService');
const schemaRegistryService = lazyRequireMod('./schemaRegistryService');
const consentInfraService = lazyRequireMod('./consentInfraService');
const consentFlowLookup = lazyRequireMod('./consentFlowLookup');
const consentConnectionStore = lazyRequireMod('./consentConnectionStore');
const journeyNameStore = lazyRequireMod('./journeyNameStore');
const eventEdgeService = lazyRequireMod('./eventEdgeService');
const eventConfigStore = lazyRequireMod('./eventConfigStore');
const catalogConfigStore = lazyRequireMod('./catalogConfigStore');
const decisionLabConfigStore = lazyRequireMod('./decisionLabConfigStore');
const archProposalStore = lazyRequireMod('./archProposalStore');
const labUserSandboxStore = lazyRequireMod('./labUserSandboxStore');
const journeysBrowse = lazyRequireMod('./journeysBrowse');
const cjaJourneyMetrics = lazyRequireMod('./cjaJourneyMetrics');
const journeyBrowseCache = lazyRequireMod('./journeyBrowseCacheStore');
const easterEggNotify = lazyRequireMod('./easterEggNotify');
const { sandboxWebhookTool } = require('./sandboxWebhookTool');
const eventInfraService = lazyRequireMod('./eventInfraService');
const tagsReactorService = lazyRequireMod('./tagsReactorService');
const edgeLaunchRuleService = lazyRequireMod('./edgeLaunchRuleService');
const profileStreamingCore = lazyRequireMod('./profileStreamingCore');
const consentManagerLegacy = lazyRequireMod('./consentManagerLegacy');
const brandScraperService = lazyRequireMod('./brandScraperService');
const imageHostingLibrary = lazyRequireMod('./imageHostingLibrary');
const brandScrapeStore = lazyRequireMod('./brandScrapeStore');
const WEBHOOK_LISTENER_ALLOWED_HOST = 'webhooklistener-pscg5c4cja-uc.a.run.app';
const DEFAULT_WEBHOOK_LISTENER_URL = 'https://webhooklistener-pscg5c4cja-uc.a.run.app/';

const REGION = 'us-central1';

const PROFILE_FN_SECRETS = [ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, ADOBE_IMS_ORG, ADOBE_SCOPES];

/** Firestore consent store — no Adobe secrets (same project Admin SDK). */
const CONSENT_STORE_FN_OPTS = {
  region: REGION,
  invoker: 'public',
  timeoutSeconds: 30,
  memory: '256MiB',
};

function serializeConsentFirestoreRecord(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const o = { ...doc };
  if (o.updatedAt && typeof o.updatedAt.toDate === 'function') {
    o.updatedAt = o.updatedAt.toDate().toISOString();
  }
  return o;
}

/** Selected sandbox from ?sandbox= or deploy default. */
function resolveSandboxFromQuery(req) {
  const q = String(req.query.sandbox || '').trim();
  return q || String(process.env.ADOBE_SANDBOX_NAME || DEFAULT_ADOBE_SANDBOX).trim();
}

/** Sandbox for profile streaming: JSON body.sandbox overrides query (matches Profile Viewer). */
function resolveSandboxForProfileBody(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const fromBody = String(body.sandbox || '').trim();
  if (fromBody) return fromBody;
  return resolveSandboxFromQuery(req);
}

let tokenCache = { accessToken: null, expiresAtMs: 0 };

function setCors(res, methods = 'GET, POST, OPTIONS') {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', methods);
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function getAdobeAccessToken() {
  const now = Date.now();
  if (tokenCache.accessToken && now < tokenCache.expiresAtMs - 5 * 60 * 1000) {
    return tokenCache.accessToken;
  }
  const clientId = ADOBE_CLIENT_ID.value();
  const clientSecret = ADOBE_CLIENT_SECRET.value();
  const scopes = ADOBE_SCOPES.value();
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: scopes,
  });
  const r = await fetch(IMS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const detail = data.error_description || data.error || r.statusText;
    throw new Error(`IMS ${r.status}: ${detail}`);
  }
  const accessToken = data.access_token;
  const expiresIn = Number(data.expires_in) || 3600;
  tokenCache = {
    accessToken,
    expiresAtMs: now + expiresIn * 1000,
  };
  return accessToken;
}

function aepHeaders(accessToken, extra) {
  const clientId = ADOBE_CLIENT_ID.value();
  const org = ADOBE_IMS_ORG.value();
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': org,
    Accept: 'application/json',
  };
  const allowed = new Set(['x-schema-id', 'accept', 'content-type', 'if-match', 'if-none-match']);
  if (extra && typeof extra === 'object') {
    for (const [k, v] of Object.entries(extra)) {
      if (v == null || String(v).trim() === '') continue;
      if (!allowed.has(k.toLowerCase())) continue;
      if (k.toLowerCase() === 'accept') {
        delete headers.Accept;
        headers.Accept = String(v);
      } else {
        headers[k] = String(v);
      }
    }
  }
  return headers;
}

exports.aepProxy = onRequest(
  {
    region: REGION,
    secrets: [ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, ADOBE_IMS_ORG, ADOBE_SCOPES],
    environmentVariables: {
      ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX,
    },
    invoker: 'public',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    let body;
    try {
      body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.rawBody || '{}');
    } catch (e) {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }
    const method = String(body.method || 'GET').toUpperCase();
    const path = body.path || '';
    const params = body.params || {};
    const jsonBody = body.json;
    const platformHeaders = body.platform_headers;

    if (typeof path !== 'string' || !path.startsWith('/')) {
      res.status(400).json({ error: 'path must be a string starting with /' });
      return;
    }
    if (platformHeaders != null && typeof platformHeaders !== 'object') {
      res.status(400).json({ error: 'platform_headers must be an object' });
      return;
    }

    let accessToken;
    try {
      accessToken = await getAdobeAccessToken();
    } catch (e) {
      res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
      return;
    }

    const qs = new URLSearchParams();
    if (params && typeof params === 'object') {
      for (const [k, v] of Object.entries(params)) {
        if (v == null) continue;
        if (Array.isArray(v)) v.forEach((item) => qs.append(k, String(item)));
        else qs.append(k, String(v));
      }
    }
    let url = `${BASE_PLATFORM.replace(/\/$/, '')}${path}`;
    const q = qs.toString();
    if (q) url += (url.includes('?') ? '&' : '?') + q;

    const headers = aepHeaders(accessToken, platformHeaders);
    const phSandbox =
      platformHeaders && typeof platformHeaders['x-sandbox-name'] === 'string'
        ? String(platformHeaders['x-sandbox-name']).trim()
        : '';
    const envSandbox = String(process.env.ADOBE_SANDBOX_NAME || DEFAULT_ADOBE_SANDBOX).trim();
    headers['x-sandbox-name'] = phSandbox || envSandbox;
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }

    const init = { method, headers };
    if (['POST', 'PUT', 'PATCH'].includes(method) && jsonBody !== undefined && jsonBody !== null) {
      init.body = JSON.stringify(jsonBody);
    }

    let upstream;
    try {
      upstream = await fetch(url, init);
    } catch (e) {
      res.status(502).json({ error: String(e.message || e) });
      return;
    }

    const ct = upstream.headers.get('Content-Type') || '';
    let platformResponse;
    if (ct.toLowerCase().includes('json')) {
      try {
        platformResponse = await upstream.json();
      } catch {
        platformResponse = { raw: await upstream.text() };
      }
    } else {
      const text = await upstream.text();
      platformResponse = { raw: text.slice(0, 50000) };
    }

    res.status(upstream.status).json({
      status: upstream.status,
      platform_response: platformResponse,
      request_url: url,
    });
  }
);

const AJO_UNITARY_EXECUTIONS_URL = `${BASE_PLATFORM}/ajo/im/executions/unitary`;

/**
 * POST /api/ajo/live-activity — AJO in-app messaging unitary execution (Live Activity push).
 * Uses deployment IMS credentials (same as /api/aep); optional sandboxName overrides default sandbox.
 */
exports.ajoLiveActivityProxy = onRequest(
  {
    region: REGION,
    secrets: [ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, ADOBE_IMS_ORG, ADOBE_SCOPES],
    environmentVariables: {
      ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX,
    },
    invoker: 'public',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    let body;
    try {
      body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.rawBody || '{}');
    } catch (e) {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }
    const sandboxName = String(body.sandboxName || '').trim() || RESOLVED_ADOBE_SANDBOX;
    const payload = body.payload;

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      res.status(400).json({ error: 'payload must be a JSON object' });
      return;
    }

    let accessToken;
    try {
      accessToken = await getAdobeAccessToken();
    } catch (e) {
      res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
      return;
    }

    const clientId = ADOBE_CLIENT_ID.value();
    const org = ADOBE_IMS_ORG.value();
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-gw-ims-org-id': String(org).slice(0, 512),
      'x-api-key': String(clientId).slice(0, 256),
      'x-sandbox-name': sandboxName.slice(0, 120),
      Authorization: `Bearer ${accessToken}`,
    };

    let upstream;
    try {
      upstream = await fetch(AJO_UNITARY_EXECUTIONS_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
    } catch (e) {
      res.status(502).json({ error: String(e.message || e) });
      return;
    }

    const ct = upstream.headers.get('Content-Type') || '';
    let platformResponse;
    if (ct.toLowerCase().includes('json')) {
      try {
        platformResponse = await upstream.json();
      } catch {
        platformResponse = { raw: await upstream.text() };
      }
    } else {
      const text = await upstream.text();
      platformResponse = { raw: text.slice(0, 50000) };
    }

    res.status(upstream.status).json({
      ok: upstream.ok,
      status: upstream.status,
      platform_response: platformResponse,
      request_url: AJO_UNITARY_EXECUTIONS_URL,
    });
  }
);

/** GET /api/profile/table — same JSON as local Express (Firebase Hosting rewrite). */
exports.profileTableProxy = onRequest(
  {
    region: REGION,
    secrets: PROFILE_FN_SECRETS,
    environmentVariables: {
      ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX,
    },
    invoker: 'public',
    timeoutSeconds: 90,
    memory: '512MiB',
  },
  async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const identifier = String(req.query.identifier || req.query.email || '').trim();
    const namespace = String(req.query.namespace || 'email').trim().toLowerCase();
    const sandbox = resolveSandboxFromQuery(req);
    if (!identifier) {
      res.status(400).json({ error: 'Missing identifier. Use ?identifier=…&namespace=email|ecid|crmId|loyaltyId|phone' });
      return;
    }
    let accessToken;
    try {
      accessToken = await getAdobeAccessToken();
    } catch (e) {
      res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
      return;
    }
    const clientId = ADOBE_CLIENT_ID.value();
    const orgId = ADOBE_IMS_ORG.value();
    try {
      const ups = await profileTableHelpers.fetchUpsProfileEntities(identifier, sandbox, accessToken, clientId, orgId, namespace);
      const payload = profileTableHelpers.buildProfileTablePayload(identifier, ups);
      res.status(200).json(payload);
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  }
);

const profileFnOpts = {
  region: REGION,
  secrets: PROFILE_FN_SECRETS,
  environmentVariables: { ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX },
  invoker: 'public',
  timeoutSeconds: 120,
  memory: '512MiB',
};

/**
 * Forward selected Schema Registry list query params (Adobe supports start, limit, etc.).
 * @param {Record<string, unknown>} [q]
 */
function pickSchemaListQuery(q) {
  if (!q || typeof q !== 'object') return {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const key of ['start', 'limit', 'orderBy', 'orderby', 'properties', 'property']) {
    const v = q[key];
    if (v != null && String(v).trim() !== '') out[key === 'orderby' ? 'orderBy' : key] = String(v);
  }
  return out;
}

/** GET list / GET one ?altId= / POST create → /api/provisioning/tenant-schemas */
exports.provisioningTenantSchemas = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  const sandbox = resolveSandboxFromQuery(req);
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }
  const clientId = ADOBE_CLIENT_ID.value();
  const orgId = ADOBE_IMS_ORG.value();

  if (req.method === 'GET') {
    const altId = String(req.query.altId || req.query.metaAltId || '').trim();
    try {
      if (altId) {
        const schema = await schemaRegistryService.getTenantSchema(accessToken, clientId, orgId, sandbox, altId);
        res.status(200).json({ sandbox, schema });
        return;
      }
      const query = pickSchemaListQuery(req.query);
      const result = await schemaRegistryService.listTenantSchemas(accessToken, clientId, orgId, sandbox, query);
      res.status(200).json({ sandbox, result });
    } catch (e) {
      const status = e.status && Number(e.status) >= 400 && Number(e.status) < 600 ? e.status : 500;
      res.status(status).json({
        error: String(e.message || e),
        sandbox,
        adobe: e.body || null,
      });
    }
    return;
  }

  if (req.method === 'POST') {
    const body = req.body;
    const descriptor =
      body && typeof body === 'object' && body.descriptor && typeof body.descriptor === 'object'
        ? body.descriptor
        : body;
    if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
      res.status(400).json({
        error: 'JSON body must be a schema descriptor object, or { descriptor: { ... } }',
      });
      return;
    }
    try {
      const schema = await schemaRegistryService.createTenantSchema(accessToken, clientId, orgId, sandbox, descriptor);
      res.status(201).json({ sandbox, schema });
    } catch (e) {
      const status = e.status && Number(e.status) >= 400 && Number(e.status) < 600 ? e.status : 500;
      res.status(status).json({
        error: String(e.message || e),
        sandbox,
        adobe: e.body || null,
      });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed. Use GET (list or ?altId=) or POST (create).' });
});

/** GET /api/provisioning/field-groups */
exports.provisioningFieldGroups = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const sandbox = resolveSandboxFromQuery(req);
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }
  const query = pickSchemaListQuery(req.query);
  const classUrl = String(req.query.class || '').trim();
  if (classUrl) query.class = classUrl;

  try {
    const result = await schemaRegistryService.listGlobalFieldGroups(
      accessToken,
      ADOBE_CLIENT_ID.value(),
      ADOBE_IMS_ORG.value(),
      sandbox,
      query
    );
    res.status(200).json({ sandbox, result });
  } catch (e) {
    const status = e.status && Number(e.status) >= 400 && Number(e.status) < 600 ? e.status : 500;
    res.status(status).json({
      error: String(e.message || e),
      sandbox,
      adobe: e.body || null,
    });
  }
});

/**
 * POST /api/provisioning/tenant-schema/patch
 * Body: { metaAltId, operations, ifMatch? } — operations forwarded as PATCH body to Adobe.
 */
exports.provisioningTenantSchemaPatch = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }
  const sandbox = resolveSandboxFromQuery(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const metaAltId = String(body.metaAltId || body.altId || '').trim();
  const ifMatch = body.ifMatch != null ? String(body.ifMatch) : '';
  const operations = body.operations != null ? body.operations : body.patch;
  if (!metaAltId) {
    res.status(400).json({ error: 'Missing metaAltId (or altId) in JSON body' });
    return;
  }
  if (operations === undefined || operations === null) {
    res.status(400).json({ error: 'Missing operations (JSON Patch array or Adobe patch payload) in body' });
    return;
  }
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }
  try {
    const schema = await schemaRegistryService.patchTenantSchema(
      accessToken,
      ADOBE_CLIENT_ID.value(),
      ADOBE_IMS_ORG.value(),
      sandbox,
      metaAltId,
      operations,
      ifMatch || undefined
    );
    res.status(200).json({ sandbox, schema });
  } catch (e) {
    const status = e.status && Number(e.status) >= 400 && Number(e.status) < 600 ? e.status : 500;
    res.status(status).json({
      error: String(e.message || e),
      sandbox,
      adobe: e.body || null,
    });
  }
});

/** GET /api/consent-infra/status?sandbox= */
exports.consentInfraStatus = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const sandbox = resolveSandboxFromQuery(req);
  console.log('[consentInfra.http]', JSON.stringify({ route: 'GET /api/consent-infra/status', sandbox }));
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    console.log('[consentInfra.http]', JSON.stringify({ route: 'status', sandbox, outcome: 'auth_failed' }));
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }
  try {
    const payload = await consentInfraService.runConsentInfraStatus(
      sandbox,
      accessToken,
      ADOBE_CLIENT_ID.value(),
      ADOBE_IMS_ORG.value()
    );
    console.log(
      '[consentInfra.http]',
      JSON.stringify({
        route: 'status',
        sandbox,
        httpStatus: 200,
        ok: payload.ok !== false,
        ready: payload.ready,
        error: payload.error || null,
      })
    );
    res.status(200).json(payload);
  } catch (e) {
    console.log(
      '[consentInfra.http]',
      JSON.stringify({ route: 'status', sandbox, httpStatus: 500, outcome: 'exception', error: String(e.message || e) })
    );
    res.status(500).json({ error: String(e.message || e), sandbox });
  }
});

/** POST /api/consent-infra/step — one wizard step. Body: { step: "createSchema"|"attachFieldGroups"|"createDataset"|"httpFlow" } */
exports.consentInfraStep = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const sandbox = resolveSandboxFromQuery(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const step = String(body.step || '').trim();
  console.log('[consentInfra.http]', JSON.stringify({ route: 'POST /api/consent-infra/step', sandbox, step }));
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }
  try {
    const payload = await consentInfraService.runConsentInfraStep(sandbox, accessToken, ADOBE_CLIENT_ID.value(), ADOBE_IMS_ORG.value(), step);
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), sandbox, step });
  }
});

/** POST /api/consent-infra/ensure — create schema, identity, dataset when missing (HTTP flow manual). Body: { dryRun?: boolean } */
exports.consentInfraEnsure = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const sandbox = resolveSandboxFromQuery(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const dryRun = body.dryRun === true || body.dryRun === 'true';
  console.log('[consentInfra.http]', JSON.stringify({ route: 'POST /api/consent-infra/ensure', sandbox, dryRun }));
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    console.log('[consentInfra.http]', JSON.stringify({ route: 'ensure', sandbox, outcome: 'auth_failed' }));
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }
  try {
    const payload = await consentInfraService.runConsentInfraEnsure(sandbox, accessToken, ADOBE_CLIENT_ID.value(), ADOBE_IMS_ORG.value(), {
      dryRun,
    });
    console.log(
      '[consentInfra.http]',
      JSON.stringify({
        route: 'ensure',
        sandbox,
        httpStatus: 200,
        ok: payload.ok,
        ready: payload.ready,
        dryRun: payload.dryRun,
        profileCoreMixinMissing: payload.profileCoreMixinMissing || false,
        error: payload.error || null,
        schemaCreated: payload.manifest?.schemaCreated,
        datasetCreated: payload.manifest?.datasetCreated,
      })
    );
    res.status(200).json(payload);
  } catch (e) {
    console.log(
      '[consentInfra.http]',
      JSON.stringify({ route: 'ensure', sandbox, httpStatus: 500, outcome: 'exception', error: String(e.message || e) })
    );
    res.status(500).json({ error: String(e.message || e), sandbox });
  }
});

/**
 * GET /api/consent-infra/flow-lookup?sandbox=&flowId=&flowName=
 * Resolves DCS collection URL + flow UUID from Flow Service. Prefer flowId when set; else match dataflow by exact flowName (defaults to lab name if flowName omitted).
 */
exports.consentInfraFlowLookup = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const sandbox = resolveSandboxFromQuery(req);
  const flowId = String(req.query.flowId || '').trim();
  const flowName = String(req.query.flowName || '').trim();
  console.log(
    '[consentInfra.http]',
    JSON.stringify({ route: 'GET /api/consent-infra/flow-lookup', sandbox, hasFlowId: !!flowId })
  );
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }
  try {
    const payload = await consentFlowLookup.lookupConsentHttpFlow(sandbox, accessToken, ADOBE_CLIENT_ID.value(), ADOBE_IMS_ORG.value(), {
      flowId: flowId || undefined,
      flowName: flowName || undefined,
    });
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), sandbox });
  }
});

/**
 * GET/POST /api/consent-connection?sandbox= — read or merge-save streaming + infra IDs per sandbox (Firestore).
 * POST body: { sandbox?, streaming?: { url, flowId, flowName, datasetId, schemaId, xdmKey, apiKey }, infra?: { schemaMetaAltId, schemaId, datasetId, profileCoreMixinId, datasetName, imsOrg } }
 */
exports.consentConnectionStore = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  const sandboxQ = resolveSandboxFromQuery(req);
  if (req.method === 'GET') {
    try {
      const record = await consentConnectionStore.getConsentConnection(sandboxQ);
      res.status(200).json({ ok: true, sandbox: sandboxQ, record: serializeConsentFirestoreRecord(record) });
    } catch (e) {
      console.log('[consentConnection]', JSON.stringify({ route: 'GET', sandbox: sandboxQ, error: String(e.message || e) }));
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox: sandboxQ });
    }
    return;
  }
  if (req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const sb = String(body.sandbox || sandboxQ).trim() || sandboxQ;
    try {
      const record = await consentConnectionStore.saveConsentConnection(sb, {
        streaming: body.streaming,
        infra: body.infra,
      });
      res.status(200).json({ ok: true, sandbox: sb, record: serializeConsentFirestoreRecord(record) });
    } catch (e) {
      console.log('[consentConnection]', JSON.stringify({ route: 'POST', sandbox: sb, error: String(e.message || e) }));
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox: sb });
    }
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
});

/**
 * POST /api/profile/update — streams to the consent HTTP connection (body.streaming.url + flowId, sandbox).
 * Default payload matches Profile Viewer: profileStreamingCore.buildProfileStreamPayload (identityMap + root consents/optInOut + _demoemea + demoemea mirror).
 * ECID optional: included in identityMap and identification.core when body.ecid is valid (matches EMEA presales Consent Manager). Optional streamPayloadProfile=operational for slim shape only.
 */
exports.profileUpdateProxy = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const dryRun = body.dryRun === true || body.dryRun === 'true';
  const email = String(body.email || '').trim();
  const ecid = body.ecid != null ? String(body.ecid).trim() : '';
  const updates = Array.isArray(body.updates) ? body.updates : [];
  const consentRaw = body.consent;
  const hasConsent = consentRaw != null && typeof consentRaw === 'object' && !Array.isArray(consentRaw);
  const sandbox = resolveSandboxForProfileBody(req);

  if (!email) {
    res.status(400).json({ error: 'Email is required (primary identity for consent streaming).' });
    return;
  }
  const ecidForPayload = ecid.length >= 10 ? ecid : '';
  if (hasConsent && updates.length > 0) {
    res.status(400).json({ error: 'Send either updates or consent, not both.' });
    return;
  }
  if (!hasConsent && updates.length === 0) {
    res.status(400).json({ error: 'No updates provided (updates[] or consent object).' });
    return;
  }

  const streaming = body.streaming && typeof body.streaming === 'object' ? body.streaming : {};
  const streamUrl = String(streaming.url || '').trim();
  const flowId = String(streaming.flowId || '').trim();
  const datasetId = String(streaming.datasetId || '').trim();
  const schemaId = String(streaming.schemaId || '').trim();
  const xdmKey = String(streaming.xdmKey || '_demoemea').trim();
  const isAdobeDcsCollection = streamUrl ? /dcs\.adobedc\.net/i.test(streamUrl) : false;
  const hasDatasetAndSchema = Boolean(datasetId && schemaId);
  /** DCS HTTP API inlets require { header, body }; bare JSON returns 400 "header field is mandatory". */
  let useEnvelope =
    streaming.useEnvelope === true ||
    streaming.useEnvelope === 'true' ||
    hasDatasetAndSchema ||
    profileStreamingCore.profileStreamingUseEnvelope(process.env.AEP_PROFILE_STREAMING_ENVELOPE);
  if (isAdobeDcsCollection) {
    useEnvelope = true;
  }
  if (dryRun && hasDatasetAndSchema) {
    useEnvelope = true;
  }

  if (!dryRun && (!streamUrl || !flowId)) {
    res.status(400).json({
      error: `Missing streaming.url (DCS collection URL) and streaming.flowId. In AEP, create an HTTP API streaming dataflow named "${consentInfraService.CONSENT_HTTP_DATAFLOW_NAME}" for dataset "${consentInfraService.CONSENT_DATASET_NAME}", then save URL and Flow ID on the Consent page.`,
    });
    return;
  }
  if (dryRun && !hasDatasetAndSchema) {
    res.status(400).json({
      error:
        'Preview (dryRun) requires streaming.datasetId and streaming.schemaId. Save your HTTP API connection on the Consent page first.',
    });
    return;
  }
  if (useEnvelope && (!datasetId || !schemaId)) {
    res.status(400).json({
      error: isAdobeDcsCollection
        ? 'Adobe DCS expects a header/body envelope (schemaRef, imsOrgId, datasetId). Add Dataset ID and Schema $id from your HTTP API dataflow in Sandbox & streaming connection, run Prepare if needed, click Save connection, then try again.'
        : 'Envelope mode requires streaming.datasetId and streaming.schemaId.',
    });
    return;
  }

  const clientId = ADOBE_CLIENT_ID.value();
  const orgId = ADOBE_IMS_ORG.value();
  const apiKey = String(streaming.apiKey || '').trim() || clientId;

  let accessToken;
  if (!dryRun) {
    try {
      accessToken = await getAdobeAccessToken();
    } catch (e) {
      res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
      return;
    }
  }

  let demoemea;
  let applied = 0;
  const skippedPaths = [];
  const rootExtras = {};
  let sourceLabel = 'Firebase profile update';
  let successMessage;
  /** @type {Array<{ sourcePath: string, relativePath: string, underRootMixin: boolean }> | null} */
  let appliedPathsDetail = null;

  if (hasConsent) {
    const c = consentRaw;
    const fragment = profileStreamingCore.buildConsentXdm(email, {
      marketingConsent: c.marketingConsent,
      channelOptInOut: c.channelOptInOut,
      channels: c.channels,
      dataCollection: c.dataCollection,
      dataSharing: c.dataSharing,
      contentPersonalization: c.contentPersonalization,
    });
    demoemea = {
      identification: {
        core: {
          email,
          ...(ecidForPayload ? { ecid: ecidForPayload } : {}),
        },
      },
      consents: fragment._demoemea.consents,
      optInOut: fragment._demoemea.optInOut,
    };
    applied = 1;
    sourceLabel = 'Consent Manager update';
    successMessage = 'Profile update accepted (consent). Re-query to see changes.';
  } else {
    demoemea = {
      identification: {
        core: {
          email,
          ...(ecidForPayload ? { ecid: ecidForPayload } : {}),
        },
      },
    };
    appliedPathsDetail = [];
    for (const u of updates) {
      const rawPath = u?.path != null ? String(u.path).trim() : '';
      let path = rawPath
        .replace(/^(_demoemea\.|xdm:demoss\.)/i, '')
        .replace(/^demoemea\./i, '');
      if (!path) {
        if (rawPath) skippedPaths.push(rawPath);
        continue;
      }
      const val = u.value;
      let out = val !== undefined && val !== null ? val : '';
      if (typeof out === 'string') {
        out = profileStreamingCore.normalizeProfileUpdateDateString(path, out);
      }
      const top = path.split('.')[0];
      const underRootMixin = profileStreamingCore.PROFILE_STREAM_ROOT_PATH_PREFIXES.has(top);
      const target = underRootMixin ? rootExtras : demoemea;
      if (typeof out === 'string' && out.trim() !== '' && /^\d+$/.test(out)) {
        profileStreamingCore.setByPath(target, path, parseInt(out, 10));
      } else {
        profileStreamingCore.setByPath(target, path, out);
      }
      applied++;
      appliedPathsDetail.push({ sourcePath: rawPath, relativePath: path, underRootMixin });
    }
    if (applied === 0) {
      res.status(400).json({
        error: 'No valid attribute paths after stripping tenant prefix.',
        skippedPaths,
      });
      return;
    }
    successMessage = `Profile update accepted (${applied} field(s)).`;
  }

  const normPayloadProfile = String(
    body.streamPayloadProfile || streaming.streamPayloadProfile || '',
  )
    .toLowerCase()
    .replace(/[-_\s]/g, '');
  const useOperational =
    normPayloadProfile === 'operational' ||
    normPayloadProfile === 'dcsoperational' ||
    normPayloadProfile === 'operationalprofile';

  const envelopeSourceName =
    String(streaming.flowName || streaming.sourceName || '').trim() || sourceLabel;

  /** @type {object} */
  let payload;
  let payloadFormat;
  if (useOperational && useEnvelope) {
    const xdmEntity = profileStreamingCore.buildOperationalConsentXdmEntity(demoemea, email, ecidForPayload, rootExtras);
    payload = profileStreamingCore.buildProfileStreamingEnvelope(xdmEntity, orgId, envelopeSourceName, datasetId, schemaId);
    payloadFormat = 'envelope';
  } else {
    const built = profileStreamingCore.buildProfileStreamPayload(
      demoemea,
      email,
      ecidForPayload,
      xdmKey,
      orgId,
      sourceLabel,
      rootExtras,
      { useEnvelope, datasetId, schemaId },
    );
    payload = built.payload;
    payloadFormat = built.format;
  }

  if (dryRun) {
    res.status(200).json({
      ok: true,
      dryRun: true,
      payloadFormat,
      streamPayloadProfile: useOperational ? 'operational' : 'standard',
      envelope: payload,
      imsOrgId: orgId,
      note: useOperational
        ? 'Operational payload (explicit streamPayloadProfile only).'
        : payloadFormat === 'envelope'
          ? 'Standard streaming: identityMap (Email primary; ECID when body.ecid set), root consents/optInOut from merged tenant, _demoemea + demoemea mirror, root person.* from form.'
          : undefined,
    });
    return;
  }

  const headers = profileStreamingCore.buildProfileDcsStreamingHeaders(accessToken, sandbox, flowId, apiKey);

  let streamRes;
  let rawText;
  try {
    streamRes = await fetch(streamUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    rawText = await streamRes.text();
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
    return;
  }

  const { parsed: data, streamErrors, streamWarnings } = profileStreamingCore.parseStreamingCollectionResponse(streamRes.status, rawText);

  if (!streamRes.ok || streamErrors.length > 0) {
    res.status(502).json({
      error: streamErrors.length ? streamErrors.join(' ') : 'Streaming failed',
      streamingStatus: streamRes.status,
      streamingResponse: data,
      sentToAep: payload,
      payloadFormat,
      requestHeaders: profileStreamingCore.redactedProfileDcsRequestHeaders(headers),
    });
    return;
  }

  res.status(200).json({
    ok: true,
    message: successMessage,
    sentToAep: payload,
    payloadFormat,
    streamingResponse: data,
    streamingWarning: streamWarnings.length ? streamWarnings.join(' ') : undefined,
    requestHeaders: profileStreamingCore.redactedProfileDcsRequestHeaders(headers),
    ...(appliedPathsDetail && appliedPathsDetail.length ? { appliedPathsDetail } : {}),
  });
});

/**
 * POST /api/consent/legacy-update — mirrors the old firebaseFunctions consent-manager flow exactly.
 * Client builds the full DCS payload (header + body + xdmEntity) and sends it here.
 * This function only adds auth headers and forwards the payload to DCS — no server-side XDM building.
 *
 * Body: { payload: { header, body }, collectionUrl, flowId?, sandbox?, dryRun? }
 */
exports.consentManagerLegacyUpdate = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, success: false, error: 'Method not allowed' });
    return;
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const dryRun = body.dryRun === true || body.dryRun === 'true';
  const sandbox = resolveSandboxForProfileBody(req);

  const payload = body.payload;
  if (!payload || typeof payload !== 'object' || !payload.header || !payload.body) {
    res.status(400).json({
      ok: false,
      success: false,
      error: 'payload object with header + body is required (client-built DCS envelope).',
    });
    return;
  }

  const orgId = ADOBE_IMS_ORG.value();
  if (payload.header && (!payload.header.imsOrgId || String(payload.header.imsOrgId).trim() === '')) {
    payload.header.imsOrgId = orgId;
  }

  if (dryRun) {
    res.status(200).json({
      ok: true,
      success: true,
      dryRun: true,
      payload,
      note: 'Client-built DCS payload (same shape as old Firebase consent-manager). Ready to send.',
    });
    return;
  }

  const collectionUrl = String(body.collectionUrl || '').trim();
  if (!collectionUrl) {
    res.status(400).json({
      ok: false,
      success: false,
      error: 'collectionUrl (DCS collection URL) is required for live update.',
    });
    return;
  }

  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ ok: false, success: false, error: 'Auth failed', detail: String(e.message || e) });
    return;
  }

  const flowId = String(body.flowId || '').trim();
  const apiKey = ADOBE_CLIENT_ID.value();
  const headers = consentManagerLegacy.buildLegacyConsentDcsHeaders(accessToken, sandbox, flowId, apiKey, orgId);

  let streamRes;
  let rawText;
  try {
    streamRes = await fetch(collectionUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    rawText = await streamRes.text();
  } catch (e) {
    res.status(502).json({ ok: false, success: false, error: String(e.message || e) });
    return;
  }

  const { parsed: data, streamErrors, streamWarnings } = profileStreamingCore.parseStreamingCollectionResponse(streamRes.status, rawText);

  if (!streamRes.ok || streamErrors.length > 0) {
    res.status(502).json({
      ok: false,
      success: false,
      error: streamErrors.length ? streamErrors.join(' ') : 'Streaming failed',
      streamingStatus: streamRes.status,
      streamingResponse: data,
      sentToAep: payload,
      requestHeaders: consentManagerLegacy.redactLegacyConsentDcsHeaders(headers),
    });
    return;
  }

  res.status(200).json({
    ok: true,
    success: true,
    message: 'Consent update sent successfully.',
    sentToAep: payload,
    streamingResponse: data,
    streamingWarning: streamWarnings.length ? streamWarnings.join(' ') : undefined,
    requestHeaders: consentManagerLegacy.redactLegacyConsentDcsHeaders(headers),
  });
});

/** GET /api/sandboxes */
exports.sandboxesProxy = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed', sandboxes: [] });
    return;
  }
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e), sandboxes: [] });
    return;
  }
  try {
    const sandboxes = await sandboxesList.listActiveSandboxes(
      accessToken,
      ADOBE_CLIENT_ID.value(),
      ADOBE_IMS_ORG.value()
    );
    res.status(200).json({ sandboxes });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), sandboxes: [] });
  }
});

/** GET /api/profile/audiences */
exports.profileAudiencesProxy = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed', realized: [], exited: [] });
    return;
  }
  const identifier = String(req.query.identifier || req.query.email || '').trim();
  const namespace = String(req.query.namespace || 'email').trim().toLowerCase();
  const sandbox = resolveSandboxFromQuery(req);
  if (!identifier) {
    res.status(400).json({ error: 'Missing identifier. Use ?identifier=…&namespace=email|ecid|crmId|loyaltyId|phone', realized: [], exited: [] });
    return;
  }
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e), realized: [], exited: [] });
    return;
  }
  const clientId = ADOBE_CLIENT_ID.value();
  const orgId = ADOBE_IMS_ORG.value();
  try {
    const payload = await profileAudiences.buildAudiencesPayload(identifier, sandbox, accessToken, clientId, orgId, namespace);
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), realized: [], exited: [] });
  }
});

/** GET /api/profile/consent */
exports.profileConsentProxy = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const sandbox = resolveSandboxFromQuery(req);
  const identifier = String(req.query.identifier || req.query.email || '').trim();
  const namespace = String(req.query.namespace || 'email').trim().toLowerCase();
  if (!identifier) {
    res.status(400).json({
      error: 'Missing identifier. Use ?email=… or ?identifier=…&namespace=email|ecid|crmId|loyaltyId|phone',
    });
    return;
  }
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }
  const clientId = ADOBE_CLIENT_ID.value();
  const orgId = ADOBE_IMS_ORG.value();
  try {
    const ups = await profileTableHelpers.fetchUpsProfileEntities(identifier, sandbox, accessToken, clientId, orgId, namespace);
    const payload = profileConsentPayload.buildConsentGetPayload(identifier, ups);
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** GET /api/profile/events */
exports.profileEventsProxy = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed', events: [] });
    return;
  }
  const identifier = String(req.query.identifier || req.query.email || '').trim();
  const namespace = String(req.query.namespace || 'email').trim().toLowerCase();
  const sandbox = resolveSandboxFromQuery(req);
  if (!identifier) {
    res.status(400).json({ error: 'Missing identifier. Use ?identifier=…&namespace=email|ecid|crmId|loyaltyId|phone', events: [] });
    return;
  }
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e), events: [] });
    return;
  }
  const clientId = ADOBE_CLIENT_ID.value();
  const orgId = ADOBE_IMS_ORG.value();
  try {
    const payload = await profileEventsService.buildEventsPayload(identifier, namespace, sandbox, accessToken, clientId, orgId);
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), events: [] });
  }
});

/** GET /api/decisioning/treatment-name?id= */
exports.decisioningTreatmentNameProxy = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed', name: null });
    return;
  }
  const id = String(req.query.id || '').trim();
  const sandbox = resolveSandboxFromQuery(req);
  if (!id) {
    res.status(400).json({ error: 'Missing id. Use ?id=...', name: null });
    return;
  }
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e), name: null });
    return;
  }
  try {
    const name = await joLookups.getTreatmentNameById(
      id,
      sandbox,
      accessToken,
      ADOBE_CLIENT_ID.value(),
      ADOBE_IMS_ORG.value()
    );
    res.status(200).json({ id, name });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), name: null });
  }
});

/** GET /api/campaign-name?id= */
exports.campaignNameProxy = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed', name: null });
    return;
  }
  const id = String(req.query.id || '').trim();
  const sandbox = resolveSandboxFromQuery(req);
  if (!id) {
    res.status(400).json({ error: 'Missing id. Use ?id=...', name: null });
    return;
  }
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e), name: null });
    return;
  }
  try {
    const name = await joLookups.getCampaignNameById(
      id,
      sandbox,
      accessToken,
      ADOBE_CLIENT_ID.value(),
      ADOBE_IMS_ORG.value()
    );
    res.status(200).json({ id, name });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), name: null });
  }
});

/** GET /api/journey-name?id= */
exports.journeyNameProxy = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed', name: null });
    return;
  }
  const id = String(req.query.id || '').trim();
  const sandbox = resolveSandboxFromQuery(req);
  if (!id) {
    res.status(400).json({ error: 'Missing id. Use ?id=...', name: null });
    return;
  }
  try {
    const cached = await journeyNameStore.getCachedJourneyName(sandbox, id);
    if (cached) {
      res.status(200).json({ id, name: cached, source: 'cache' });
      return;
    }
  } catch (e) {
    console.log('[journeyNameProxy] cache read failed, falling through to API', String(e.message || e));
  }
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e), name: null });
    return;
  }
  try {
    const name = await joLookups.getJourneyNameById(
      id,
      sandbox,
      accessToken,
      ADOBE_CLIENT_ID.value(),
      ADOBE_IMS_ORG.value()
    );
    // Bulk-cache all discovered journey names from the version map
    try {
      const vmap = await joLookups.listJourneyVersionMap(
        sandbox, accessToken, ADOBE_CLIENT_ID.value(), ADOBE_IMS_ORG.value()
      );
      const writes = [];
      for (const [vid, vname] of vmap) {
        if (vname) writes.push(journeyNameStore.setCachedJourneyName(sandbox, vid, vname));
      }
      if (name && !vmap.has(id)) {
        writes.push(journeyNameStore.setCachedJourneyName(sandbox, id, name));
      }
      await Promise.allSettled(writes);
    } catch (bulkErr) {
      if (name) {
        await journeyNameStore.setCachedJourneyName(sandbox, id, name).catch(() => {});
      }
    }
    res.status(200).json({ id, name, source: 'api' });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), name: null });
  }
});

/** GET /api/webhooks/config|feed|stats, POST /api/webhooks/clear, ALL /api/webhooks/r/:sandbox/:token — per-sandbox webhook inbox (Firestore). */
exports.sandboxWebhookTool = onRequest(CONSENT_STORE_FN_OPTS, sandboxWebhookTool);

exports.webhookListenerProxy = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ ok: false, error: 'GET only' });
      return;
    }

    const raw = (process.env.WEBHOOK_LISTENER_URL || DEFAULT_WEBHOOK_LISTENER_URL).trim();
    let u;
    try {
      u = new URL(raw);
    } catch {
      res.status(500).json({ ok: false, error: 'Invalid WEBHOOK_LISTENER_URL' });
      return;
    }
    if (u.protocol !== 'https:' || u.hostname !== WEBHOOK_LISTENER_ALLOWED_HOST) {
      res.status(403).json({
        ok: false,
        error: 'Webhook listener host not allowlisted',
        allowed_host: WEBHOOK_LISTENER_ALLOWED_HOST,
      });
      return;
    }

    let upstream;
    try {
      upstream = await fetch(raw, {
        headers: { Accept: 'application/json', 'User-Agent': 'aep-decisioning-firebase-proxy' },
      });
    } catch (e) {
      res.status(502).json({ ok: false, error: String(e.message || e) });
      return;
    }

    const ct = upstream.headers.get('Content-Type') || '';
    if (!ct.toLowerCase().includes('json')) {
      const snippet = (await upstream.text()).slice(0, 500);
      res.status(502).json({
        ok: false,
        error: 'Upstream did not return JSON',
        upstream_status: upstream.status,
        snippet,
      });
      return;
    }

    let payload;
    try {
      payload = await upstream.json();
    } catch {
      res.status(502).json({
        ok: false,
        error: 'Invalid JSON from webhook listener',
        upstream_status: upstream.status,
      });
      return;
    }

    res.status(200).json({
      ok: true,
      upstream_status: upstream.status,
      listener_url: raw,
      data: payload,
    });
  }
);

// ---------------------------------------------------------------------------
// Schema Viewer / Data Viewer — serves /api/schema-viewer/** sub-paths
// ---------------------------------------------------------------------------

const schemaViewerFnOpts = {
  region: REGION,
  secrets: PROFILE_FN_SECRETS,
  environmentVariables: { ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX },
  invoker: 'public',
  timeoutSeconds: 300,
  memory: '512MiB',
};

exports.schemaViewerProxy = onRequest(schemaViewerFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const subPath = (req.path || req.url || '').replace(/^\/api\/schema-viewer\/?/, '').split('?')[0].replace(/\/$/, '');
  const sandbox = (req.query.sandbox || '').trim() || RESOLVED_ADOBE_SANDBOX;
  const forceRefresh = req.query.refresh === 'true';
  const CDN_TTL = 600; // 10 minutes
  const CACHEABLE = ['overview-stats', 'tenant-schemas', 'datasets', 'audiences'];

  let accessToken;
  try { accessToken = await getAdobeAccessToken(); } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }
  const clientId = ADOBE_CLIENT_ID.value();
  const orgId = ADOBE_IMS_ORG.value();

  try {
    let result;
    switch (subPath) {
      case 'overview-stats': {
        const [composed, dsResult] = await Promise.all([
          (async () => {
            let catInfo = null;
            try { catInfo = await schemaViewerService.fetchCatalogDatasetSchemaInfo(accessToken, clientId, orgId, sandbox); } catch { catInfo = null; }
            return schemaViewerService.fetchComposedSchemasListForSandbox(accessToken, clientId, orgId, sandbox, catInfo);
          })(),
          schemaViewerService.fetchCatalogDatasetsList(accessToken, clientId, orgId, sandbox),
        ]);
        const { sandboxName, schemas: rawList, schemaListSource } = composed;
        let profileCount = 0, eventCount = 0, otherCount = 0;
        for (const s of rawList) {
          const id = schemaViewerService.schemaSummaryKey(s);
          if (!id) continue;
          const kind = schemaViewerService.classifySchemaOverviewKind(s && s['meta:class']);
          if (kind === 'profile') profileCount++; else if (kind === 'event') eventCount++; else otherCount++;
        }
        result = { sandbox: sandboxName, schemaCount: profileCount + eventCount + otherCount, profileSchemaCount: profileCount, eventSchemaCount: eventCount, otherSchemaCount: otherCount, datasetCount: dsResult.datasets.length, schemaListSource: schemaListSource || 'registry' };
        break;
      }

      case 'tenant-schemas': {
        let catInfo = null;
        try { catInfo = await schemaViewerService.fetchCatalogDatasetSchemaInfo(accessToken, clientId, orgId, sandbox); } catch { catInfo = null; }
        const { sandboxName, schemas: rawList, schemaListSource, catalogLightGetMisses = 0 } =
          await schemaViewerService.fetchComposedSchemasListForSandbox(accessToken, clientId, orgId, sandbox, catInfo);
        const datasetCounts = catInfo?.counts ?? null;
        const mapped = rawList.map((s) => schemaViewerService.mapSchemaToRow(s, datasetCounts)).filter((x) => x.id);
        result = { sandbox: sandboxName, count: mapped.length, schemas: mapped, datasetCountsFromCatalog: datasetCounts != null, schemaListSource: schemaListSource || 'registry', catalogLightGetMisses, omittedByTitleNoiseFilter: 0 };
        break;
      }

      case 'registry': {
        const schemaId = (req.query.schemaId || req.query.schema_id || '').trim();
        if (!schemaId) { res.status(400).json({ error: 'Missing schemaId (full schema URI).' }); return; }
        const schema = await schemaViewerService.fetchSchemaById(accessToken, clientId, orgId, sandbox, schemaId);
        res.json({ schemaId, schema });
        return;
      }

      case 'datasets': {
        const { sandboxName, datasets } = await schemaViewerService.fetchCatalogDatasetsList(accessToken, clientId, orgId, sandbox);
        let enriched = datasets;
        try { enriched = await schemaViewerService.enrichDatasetsWithSchemaTitles(accessToken, clientId, orgId, sandboxName, datasets); } catch { enriched = datasets.map((d) => ({ ...d, schemaTitle: '' })); }
        const sorted = [...enriched].sort((a, b) => String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''), undefined, { sensitivity: 'base' }));
        result = { sandbox: sandboxName, count: sorted.length, datasets: sorted };
        break;
      }

      case 'audiences': {
        const { sandboxName, audiences } = await schemaViewerService.fetchAudiencesList(accessToken, clientId, orgId, sandbox);
        const sorted = [...audiences].sort((a, b) => String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''), undefined, { sensitivity: 'base' }));
        result = { sandbox: sandboxName, count: sorted.length, audiences: sorted };
        break;
      }

      case 'audience-members': {
        const audienceId = (req.query.audienceId || '').trim();
        if (!audienceId) { res.status(400).json({ error: 'Missing audienceId query parameter.', members: [] }); return; }
        const payload = await schemaViewerService.runAudiencePreviewSample(accessToken, clientId, orgId, sandbox, audienceId);
        res.json(payload);
        return;
      }

      case 'operational-sample': {
        try {
          const { readFileSync, existsSync } = require('fs');
          const { join } = require('path');
          const samplePath = join(__dirname, 'operational-profile-schema-sample.json');
          if (!existsSync(samplePath)) { res.status(404).json({ error: 'operational-profile-schema-sample.json not found' }); return; }
          const raw = readFileSync(samplePath, 'utf8');
          res.type('json').send(raw);
        } catch (e) { res.status(500).json({ error: e.message || 'Failed to read sample' }); }
        return;
      }

      default:
        res.status(404).json({ error: `Unknown schema-viewer sub-path: ${subPath}` });
        return;
    }

    if (result && CACHEABLE.includes(subPath)) {
      if (!forceRefresh) {
        res.set('Cache-Control', `public, s-maxage=${CDN_TTL}, stale-while-revalidate=${CDN_TTL}`);
      } else {
        res.set('Cache-Control', 'no-store');
      }
      svCache.touchSandbox(sandbox).catch(() => {});
      res.json({ ...result, _cache: forceRefresh ? 'refreshed' : 'miss' });
    } else {
      res.json(result);
    }
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---------------------------------------------------------------------------
// Audit Events — paginated fetch with Firestore cache
// ---------------------------------------------------------------------------

exports.auditEventsProxy = onRequest(
  {
    region: REGION,
    secrets: PROFILE_FN_SECRETS,
    environmentVariables: { ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX },
    invoker: 'public',
    timeoutSeconds: 300,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

    let body;
    try {
      body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.rawBody || '{}');
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }

    const sandbox = String(body.sandbox || '').trim() ||
      String(process.env.ADOBE_SANDBOX_NAME || DEFAULT_ADOBE_SANDBOX).trim();
    const startISO = body.startDate || '';
    const endISO = body.endDate || '';
    const action = body.action || '';
    const skipCache = !!body.skipCache;

    if (!startISO || !endISO) {
      res.status(400).json({ error: 'startDate and endDate are required (ISO strings)' });
      return;
    }

    let accessToken;
    try {
      accessToken = await getAdobeAccessToken();
    } catch (e) {
      res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
      return;
    }

    try {
      const result = await auditEventsService.getAuditEvents({
        token: accessToken,
        clientId: ADOBE_CLIENT_ID.value(),
        orgId: ADOBE_IMS_ORG.value(),
        sandbox,
        startISO,
        endISO,
        action,
        skipCache,
      });
      res.status(200).json({ success: true, ...result });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  },
);

// ---------------------------------------------------------------------------
// Edge Event Tool — send events via Edge Network interact, config per sandbox
// ---------------------------------------------------------------------------

function serializeEventConfigRecord(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const o = { ...doc };
  if (o.updatedAt && typeof o.updatedAt.toDate === 'function') {
    o.updatedAt = o.updatedAt.toDate().toISOString();
  }
  return o;
}

function serializeDecisionLabRecord(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const o = { ...doc };
  if (o.updatedAt && typeof o.updatedAt.toDate === 'function') {
    o.updatedAt = o.updatedAt.toDate().toISOString();
  }
  return o;
}

/** POST /api/events/edge — build XDM, send to Edge Network */
exports.eventEdgeProxy = onRequest(
  {
    region: REGION,
    secrets: PROFILE_FN_SECRETS,
    environmentVariables: { ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX },
    invoker: 'public',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

    let body;
    try {
      body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.rawBody || '{}');
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' }); return;
    }

    const datastreamId = String(body.datastreamId || '').trim();
    if (!datastreamId) {
      res.status(400).json({ error: 'datastreamId is required' }); return;
    }

    let accessToken;
    try { accessToken = await getAdobeAccessToken(); }
    catch (e) { res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) }); return; }

    const clientId = ADOBE_CLIENT_ID.value();
    const orgId = ADOBE_IMS_ORG.value();

    try {
      let payload;
      if (body.triggerTemplate && typeof body.triggerTemplate === 'object') {
        payload = eventEdgeService.buildTriggerPayload(
          body.triggerTemplate,
          body.ecid || '',
          body.email || '',
          body.eventType || body.triggerTemplate.event?.xdm?.eventType || ''
        );
      } else {
        const xdm = eventEdgeService.buildXdm(body);
        payload = { event: { xdm } };
      }

      const result = await eventEdgeService.sendEdgeEvent(accessToken, clientId, orgId, datastreamId, payload);
      res.status(200).json({ ok: true, ...result, sentPayload: payload });
    } catch (e) {
      res.status(502).json({ error: String(e.message || e) });
    }
  },
);

/** GET/POST /api/events/config — per-sandbox Edge config (Firestore) */
exports.eventConfigStore = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  const sandbox = (req.method === 'POST' && req.body?.sandbox)
    ? String(req.body.sandbox).trim()
    : resolveSandboxFromQuery(req);

  const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);

  if (req.method === 'GET') {
    try {
      const record = await eventConfigStore.getEffectiveEventConfig(sandbox, uid);
      res.status(200).json({
        ok: true,
        sandbox,
        record: serializeEventConfigRecord(record),
        storage: uid ? 'user' : 'shared',
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
    }
    return;
  }
  if (req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    try {
      if (!uid) {
        res.status(401).json({
          ok: false,
          error: 'Sign in required to save Edge config (anonymous sign-in is enough).',
          sandbox,
        });
        return;
      }
      const record = await eventConfigStore.saveEffectiveEventConfig(sandbox, uid, {
        datastreamId: body.datastreamId,
        datastreamTitle: body.datastreamTitle,
        schemaTitle: body.schemaTitle,
        datasetName: body.datasetName,
        customTriggers: body.customTriggers,
        quickMenuTriggers: body.quickMenuTriggers,
      });
      res.status(200).json({
        ok: true,
        sandbox,
        record: serializeEventConfigRecord(record),
        storage: 'user',
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
    }
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
});

/** GET/POST /api/catalog/config — per-sandbox catalog schema ID (Firestore) */
exports.catalogConfigStore = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  const sandbox = (req.method === 'POST' && req.body?.sandbox)
    ? String(req.body.sandbox).trim()
    : resolveSandboxFromQuery(req);

  const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);

  if (req.method === 'GET') {
    try {
      const record = await catalogConfigStore.getEffectiveCatalogConfig(sandbox, uid);
      res.status(200).json({ ok: true, sandbox, record, storage: uid ? 'user' : 'shared' });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
    }
    return;
  }
  if (req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    try {
      if (!uid) {
        res.status(401).json({
          ok: false,
          error: 'Sign in required to save catalog config (anonymous sign-in is enough).',
          sandbox,
        });
        return;
      }
      const record = await catalogConfigStore.saveEffectiveCatalogConfig(sandbox, uid, {
        schemaId: body.schemaId,
      });
      res.status(200).json({ ok: true, sandbox, record, storage: 'user' });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
    }
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
});

/** GET/POST /api/decision-lab/config — per-sandbox Decisioning lab Edge setup (Firestore) */
exports.decisionLabConfigStore = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const sandbox = req.method === 'POST' && req.body?.sandbox
    ? String(req.body.sandbox).trim()
    : resolveSandboxFromQuery(req);

  const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);

  if (req.method === 'GET') {
    try {
      const record = await decisionLabConfigStore.getEffectiveDecisionLabConfig(sandbox, uid);
      res.status(200).json({
        ok: true,
        sandbox,
        record: serializeDecisionLabRecord(record),
        storage: uid ? 'user' : 'shared',
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
    }
    return;
  }
  if (req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    try {
      if (!uid) {
        res.status(401).json({
          ok: false,
          error: 'Sign in required to save Decision lab config (anonymous sign-in is enough).',
          sandbox,
        });
        return;
      }
      const record = await decisionLabConfigStore.saveEffectiveDecisionLabConfig(sandbox, uid, {
        launchScriptUrl: body.launchScriptUrl,
        datastreamId: body.datastreamId,
        schemaTitle: body.schemaTitle,
        datasetName: body.datasetName,
        edgePersonalizationMode: body.edgePersonalizationMode,
        tagsPropertyRef: body.tagsPropertyRef,
        targetPageUrl: body.targetPageUrl,
        placements: body.placements,
        surfaceOverrides: body.surfaceOverrides,
        surfaceStyles: body.surfaceStyles,
      });
      res.status(200).json({
        ok: true,
        sandbox,
        record: serializeDecisionLabRecord(record),
        storage: 'user',
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
    }
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
});

/** GET/POST /api/lab/sandbox-state — per-user per-sandbox localStorage mirror (Firestore) */
exports.labUserSandboxState = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);
  if (!uid) {
    res.status(401).json({ ok: false, error: 'Firebase Auth required (anonymous sign-in is enough).' });
    return;
  }

  const sandbox = (req.method === 'POST' && req.body?.sandbox)
    ? String(req.body.sandbox).trim()
    : resolveSandboxFromQuery(req);

  if (!sandbox) {
    res.status(400).json({ ok: false, error: 'sandbox is required' });
    return;
  }

  if (req.method === 'GET') {
    try {
      const keys = await labUserSandboxStore.getLabKeys(uid, sandbox);
      res.status(200).json({ ok: true, sandbox, keys });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
    }
    return;
  }

  if (req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const patch = body.keys && typeof body.keys === 'object' ? body.keys : {};
    const replace = !!body.replace;
    try {
      const keys = await labUserSandboxStore.mergeLabKeys(uid, sandbox, patch, { replace });
      res.status(200).json({ ok: true, sandbox, keys });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});

/** GET /api/tags/reactor — Reactor JSON:API: companies, properties, allProperties, property-scoped lists, ruleComponents&ruleId= */
exports.tagsReactorProxy = onRequest(
  {
    region: REGION,
    secrets: PROFILE_FN_SECRETS,
    environmentVariables: { ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX },
    invoker: 'public',
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async (req, res) => {
    setCors(res, 'GET, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'GET') { res.status(405).json({ error: 'GET only' }); return; }

    const sandbox = resolveSandboxFromQuery(req);
    const resource = String(req.query.resource || 'companies').trim().toLowerCase();
    const companyId = String(req.query.companyId || '').trim();
    const propertyId = String(req.query.propertyId || '').trim();
    const ruleId = String(req.query.ruleId || '').trim();

    let accessToken;
    try { accessToken = await getAdobeAccessToken(); }
    catch (e) { res.status(500).json({ ok: false, error: 'Auth failed', detail: String(e.message || e) }); return; }

    const clientId = ADOBE_CLIENT_ID.value();
    const orgId = ADOBE_IMS_ORG.value();

    try {
      if (resource === 'companies') {
        const r = await tagsReactorService.listCompanies(accessToken, clientId, orgId);
        res.status(200).json({ ok: r.ok, sandbox, resource: 'companies', ...r });
        return;
      }
      if (resource === 'properties') {
        if (!companyId) {
          res.status(400).json({ ok: false, error: 'companyId query param is required for resource=properties', sandbox });
          return;
        }
        const r = await tagsReactorService.listProperties(accessToken, clientId, orgId, companyId);
        res.status(200).json({ ok: r.ok, sandbox, resource: 'properties', companyId, ...r });
        return;
      }
      if (resource === 'allproperties') {
        const r = await tagsReactorService.listAllPropertiesAcrossCompanies(accessToken, clientId, orgId);
        res.status(200).json({ ok: r.ok, sandbox, resource: 'allProperties', ...r });
        return;
      }
      if (resource === 'dataelements') {
        if (!propertyId) {
          res.status(400).json({
            ok: false,
            error: 'propertyId query param is required for resource=dataElements',
            sandbox,
          });
          return;
        }
        const r = await tagsReactorService.listDataElements(accessToken, clientId, orgId, propertyId);
        res.status(200).json({
          ok: r.ok,
          sandbox,
          resource: 'dataElements',
          propertyId,
          items: r.items,
          pagesFetched: r.pagesFetched,
          meta: r.meta,
          httpStatus: r.httpStatus,
          error: r.error,
        });
        return;
      }
      const propertyScoped = [
        ['extensions', () => tagsReactorService.listExtensions(accessToken, clientId, orgId, propertyId)],
        ['rules', () => tagsReactorService.listRules(accessToken, clientId, orgId, propertyId)],
        ['hosts', () => tagsReactorService.listHosts(accessToken, clientId, orgId, propertyId)],
        ['environments', () => tagsReactorService.listEnvironments(accessToken, clientId, orgId, propertyId)],
        ['libraries', () => tagsReactorService.listLibraries(accessToken, clientId, orgId, propertyId)],
      ];
      for (const [resName, fn] of propertyScoped) {
        if (resource === resName) {
          if (!propertyId) {
            res.status(400).json({
              ok: false,
              error: `propertyId query param is required for resource=${resName}`,
              sandbox,
            });
            return;
          }
          const r = await fn();
          res.status(200).json({
            ok: r.ok,
            sandbox,
            resource: resName,
            propertyId,
            items: r.items,
            pagesFetched: r.pagesFetched,
            meta: r.meta,
            httpStatus: r.httpStatus,
            error: r.error,
          });
          return;
        }
      }
      if (resource === 'rulecomponents') {
        if (!ruleId) {
          res.status(400).json({
            ok: false,
            error: 'ruleId query param is required for resource=ruleComponents',
            sandbox,
          });
          return;
        }
        const r = await tagsReactorService.listRuleComponents(accessToken, clientId, orgId, ruleId);
        res.status(200).json({
          ok: r.ok,
          sandbox,
          resource: 'ruleComponents',
          ruleId,
          items: r.items,
          pagesFetched: r.pagesFetched,
          meta: r.meta,
          httpStatus: r.httpStatus,
          error: r.error,
        });
        return;
      }
      res.status(400).json({
        ok: false,
        error:
          'Invalid resource. Use companies, properties (companyId), allProperties, dataElements|extensions|rules|hosts|environments|libraries (propertyId), or ruleComponents (ruleId).',
        sandbox,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
    }
  },
);

/**
 * POST /api/edge-decisioning/preview-launch-rule
 * Read-only: resolves a Tags property + rule + Send-Event action, computes
 * the proposed merge of surfaces / decisionScopes based on placements +
 * target page URL, and returns a diff. No writes to Reactor.
 */
exports.edgeLaunchRulePreview = onRequest(
  {
    region: REGION,
    secrets: PROFILE_FN_SECRETS,
    environmentVariables: { ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX },
    invoker: 'public',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    if (!body.propertyRef) { res.status(400).json({ ok: false, error: 'propertyRef required (name or PR… id)' }); return; }
    if (!body.targetPageUrl) { res.status(400).json({ ok: false, error: 'targetPageUrl required' }); return; }

    let accessToken;
    try { accessToken = await getAdobeAccessToken(); }
    catch (e) { res.status(500).json({ ok: false, error: 'Auth failed', detail: String(e.message || e) }); return; }

    const clientId = ADOBE_CLIENT_ID.value();
    const orgId = ADOBE_IMS_ORG.value();
    try {
      const result = await edgeLaunchRuleService.previewLaunchRuleUpdate({
        accessToken, clientId, orgId,
        propertyRef: body.propertyRef,
        ruleName: body.ruleName || 'Page View',
        targetPageUrl: body.targetPageUrl,
        placements: Array.isArray(body.placements) ? body.placements : [],
        edgePersonalizationMode: body.edgePersonalizationMode || null,
      });
      res.status(result.ok ? 200 : 400).json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e && e.message || e) });
    }
  },
);

/**
 * POST /api/edge-decisioning/apply-launch-rule
 * Writes: PATCH the Send-Event action's settings with the merged surfaces +
 * decisionScopes. Returns before/after. Does NOT build/publish — a Launch
 * library + build + publish still needs to run before the change is live.
 */
exports.edgeLaunchRuleApply = onRequest(
  {
    region: REGION,
    secrets: PROFILE_FN_SECRETS,
    environmentVariables: { ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX },
    invoker: 'public',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    if (!body.propertyRef) { res.status(400).json({ ok: false, error: 'propertyRef required' }); return; }
    if (!body.targetPageUrl) { res.status(400).json({ ok: false, error: 'targetPageUrl required' }); return; }

    let accessToken;
    try { accessToken = await getAdobeAccessToken(); }
    catch (e) { res.status(500).json({ ok: false, error: 'Auth failed', detail: String(e.message || e) }); return; }

    const clientId = ADOBE_CLIENT_ID.value();
    const orgId = ADOBE_IMS_ORG.value();
    try {
      const result = await edgeLaunchRuleService.applyLaunchRuleUpdate({
        accessToken, clientId, orgId,
        propertyRef: body.propertyRef,
        ruleName: body.ruleName || 'Page View',
        targetPageUrl: body.targetPageUrl,
        placements: Array.isArray(body.placements) ? body.placements : [],
        edgePersonalizationMode: body.edgePersonalizationMode || null,
      });
      res.status(result.ok ? 200 : 400).json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e && e.message || e) });
    }
  },
);

/**
 * POST /api/edge-decisioning/publish-launch-rule
 * Full happy path: PATCH rule_component settings → create a fresh library
 * bound to the Development environment → add the parent rule as a resource
 * → trigger a build → poll until terminal. On success the edit is live on
 * the page without leaving this tool.
 */
exports.edgeLaunchRulePublish = onRequest(
  {
    region: REGION,
    secrets: PROFILE_FN_SECRETS,
    environmentVariables: { ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX },
    invoker: 'public',
    timeoutSeconds: 240,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    if (!body.propertyRef) { res.status(400).json({ ok: false, error: 'propertyRef required' }); return; }
    if (!body.targetPageUrl) { res.status(400).json({ ok: false, error: 'targetPageUrl required' }); return; }

    let accessToken;
    try { accessToken = await getAdobeAccessToken(); }
    catch (e) { res.status(500).json({ ok: false, error: 'Auth failed', detail: String(e.message || e) }); return; }

    const clientId = ADOBE_CLIENT_ID.value();
    const orgId = ADOBE_IMS_ORG.value();
    try {
      const result = await edgeLaunchRuleService.applyAndPublishLaunchRule({
        accessToken, clientId, orgId,
        propertyRef: body.propertyRef,
        ruleName: body.ruleName || 'Page View',
        targetPageUrl: body.targetPageUrl,
        placements: Array.isArray(body.placements) ? body.placements : [],
        edgePersonalizationMode: body.edgePersonalizationMode || null,
      });
      res.status(result.ok ? 200 : 400).json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e && e.message || e) });
    }
  },
);

/**
 * POST /api/edge-decisioning/cleanup-orphan-libraries
 * Remove unbound libraries named 'AEP Lab ...' that got created by
 * failed publish attempts. Dry-run supported via body.dryRun = true.
 */
exports.edgeLaunchRuleCleanup = onRequest(
  {
    region: REGION,
    secrets: PROFILE_FN_SECRETS,
    environmentVariables: { ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX },
    invoker: 'public',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    if (!body.propertyRef) { res.status(400).json({ ok: false, error: 'propertyRef required' }); return; }

    let accessToken;
    try { accessToken = await getAdobeAccessToken(); }
    catch (e) { res.status(500).json({ ok: false, error: 'Auth failed', detail: String(e.message || e) }); return; }

    const clientId = ADOBE_CLIENT_ID.value();
    const orgId = ADOBE_IMS_ORG.value();
    try {
      const result = await edgeLaunchRuleService.cleanupOrphanAutoPublishLibraries({
        accessToken, clientId, orgId,
        propertyRef: body.propertyRef,
        dryRun: body.dryRun === true,
        namePrefix: body.namePrefix || 'AEP Lab',
      });
      res.status(result.ok ? 200 : 400).json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e && e.message || e) });
    }
  },
);

/** GET /api/events/datastreams — list datastreams from Edge API */
exports.eventDatastreamsProxy = onRequest(
  {
    region: REGION,
    secrets: PROFILE_FN_SECRETS,
    environmentVariables: { ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX },
    invoker: 'public',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'GET') { res.status(405).json({ error: 'GET only' }); return; }

    let accessToken;
    try { accessToken = await getAdobeAccessToken(); }
    catch (e) { res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) }); return; }

    try {
      const result = await eventEdgeService.listDatastreams(accessToken, ADOBE_CLIENT_ID.value(), ADOBE_IMS_ORG.value());
      if (result && result.errors) {
        res.status(200).json({ ok: false, datastreams: [], discoveryErrors: result.errors, note: 'Auto-discovery failed. Use manual datastream ID input.' });
      } else {
        res.status(200).json({ ok: true, datastreams: Array.isArray(result) ? result : [] });
      }
    } catch (e) {
      res.status(500).json({ error: String(e.message || e), datastreams: [] });
    }
  },
);

// ---------------------------------------------------------------------------
// Event Infrastructure — create ExperienceEvent schema + dataset per sandbox
// ---------------------------------------------------------------------------

/** GET /api/events/infra/status?sandbox=&schemaTitle=&datasetName= */
exports.eventInfraStatus = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'GET only' }); return; }
  const sandbox = resolveSandboxFromQuery(req);
  const schemaTitle = String(req.query.schemaTitle || '').trim();
  const datasetName = String(req.query.datasetName || '').trim();
  if (!schemaTitle) { res.status(400).json({ error: 'schemaTitle query param is required' }); return; }
  let accessToken;
  try { accessToken = await getAdobeAccessToken(); }
  catch (e) { res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) }); return; }
  try {
    const result = await eventInfraService.runEventInfraStatus(sandbox, accessToken, ADOBE_CLIENT_ID.value(), ADOBE_IMS_ORG.value(), schemaTitle, datasetName);
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), sandbox });
  }
});

/** POST /api/events/infra/step — createSchema | createDataset | createDatastream | probeTagsApi */
exports.eventInfraStep = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const sandbox = resolveSandboxFromQuery(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const step = String(body.step || '').trim();
  let accessToken;
  try { accessToken = await getAdobeAccessToken(); }
  catch (e) { res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) }); return; }
  try {
    const result = await eventInfraService.runEventInfraStep(sandbox, accessToken, ADOBE_CLIENT_ID.value(), ADOBE_IMS_ORG.value(), step, {
      schemaTitle: body.schemaTitle,
      datasetName: body.datasetName,
      datastreamName: body.datastreamName,
    });
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), sandbox, step });
  }
});

/** GET /api/events/infra/event-types?sandbox=&schemaTitle= — extract eventType enum from schema */
exports.eventInfraEventTypes = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'GET only' }); return; }
  const sandbox = resolveSandboxFromQuery(req);
  const schemaTitle = String(req.query.schemaTitle || '').trim();
  if (!schemaTitle) { res.status(400).json({ error: 'schemaTitle query param required', eventTypes: [] }); return; }
  let accessToken;
  try { accessToken = await getAdobeAccessToken(); }
  catch (e) { res.status(500).json({ error: 'Auth failed', detail: String(e.message || e), eventTypes: [] }); return; }
  try {
    const result = await eventInfraService.fetchSchemaEventTypes(sandbox, accessToken, ADOBE_CLIENT_ID.value(), ADOBE_IMS_ORG.value(), schemaTitle);
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), eventTypes: [] });
  }
});

// ---------------------------------------------------------------------------
// Journey browse — list AJO journeys for the browse table
// ---------------------------------------------------------------------------

exports.journeysBrowse = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const sandbox = resolveSandboxFromQuery(req);
  const cjaDataViewId = String(req.query.cjaDataViewId || '').trim();
  const cjaDateRangeRaw = String(req.query.cjaDateRangeId || req.query.cjaDateRange || '').trim();
  const cjaDateRangeForCja = cjaDateRangeRaw ? cjaJourneyMetrics.normalizeCjaDateRangeId(cjaDateRangeRaw) : cjaJourneyMetrics.normalizeCjaDateRangeId();
  const start = Math.max(0, parseInt(req.query.start, 10) || 0);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));
  const forceRefresh =
    req.query.refresh === '1'
    || String(req.query.force || '').toLowerCase() === '1'
    || String(req.query.force || '').toLowerCase() === 'true';

  if (!forceRefresh) {
    try {
      const cached = await journeyBrowseCache.getCachedDoc(sandbox);
      if (cached && journeyBrowseCache.isFresh(cached)) {
        const base = journeyBrowseCache.toApiPayload(cached);
        const ageMs = Date.now() - (cached.cachedAt && cached.cachedAt.toDate
          ? cached.cachedAt.toDate().getTime()
          : 0);
        let journeysOut = Array.isArray(base.journeys) ? base.journeys.map((r) => ({ ...r })) : [];
        let cjaMeta = { applied: false };
        const cjaDisabled = process.env.CJA_ENABLE_METRICS === '0' || process.env.CJA_ENABLE_METRICS === 'false';
        if (!cjaDisabled && journeysOut.length > 0) {
          try {
            const cjaToken = await getAdobeAccessToken();
            const cjaOptsCached = { dateRangeId: cjaDateRangeForCja };
            if (cjaDataViewId) cjaOptsCached.dataViewId = cjaDataViewId;
            cjaMeta = await cjaJourneyMetrics.enrichJourneyRowsWithCja(
              journeysOut,
              cjaToken,
              { clientId: ADOBE_CLIENT_ID.value() },
              { orgId: ADOBE_IMS_ORG.value() },
              cjaOptsCached,
            );
          } catch (cjaErr) {
            cjaMeta = { applied: false, message: cjaErr?.message || String(cjaErr) };
          }
        } else if (cjaDisabled) {
          cjaMeta = { applied: false, message: 'CJA metrics disabled (CJA_ENABLE_METRICS).' };
        }
        res.status(200).json({
          ...base,
          journeys: journeysOut,
          cja: cjaMeta,
          fromCache: true,
          cacheAgeMs: Math.max(0, Math.round(ageMs)),
          cachedAt: cached.cachedAt && cached.cachedAt.toDate
            ? cached.cachedAt.toDate().toISOString()
            : null,
          cacheTtlMs: journeyBrowseCache.cacheTtlMs(),
        });
        return;
      }
    } catch (e) {
      /* fall through to live fetch */
    }
  }

  let accessToken;
  try { accessToken = await getAdobeAccessToken(); } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) }); return;
  }
  const clientId = ADOBE_CLIENT_ID.value();
  const orgId = ADOBE_IMS_ORG.value();
  try {
    const payload = await journeysBrowse.buildBrowseResponse(
      sandbox,
      accessToken,
      clientId,
      orgId,
      start,
      limit,
      cjaDataViewId,
      cjaDateRangeRaw ? cjaDateRangeForCja : undefined,
    );
    if (payload.ok) {
      try {
        await journeyBrowseCache.saveJourneyBrowseCache(sandbox, payload);
      } catch (e) {
        /* cache write failure should not fail the request */
      }
    }
    res.status(payload.ok ? 200 : 502).json({
      ...payload,
      fromCache: false,
      cacheTtlMs: journeyBrowseCache.cacheTtlMs(),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), journeys: [] });
  }
});

/** GET /api/journeys/cja-dataviews — list all CJA data views; names containing "AJO" first (Journeys UI picker). */
exports.journeysCjaDataviews = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'GET only' }); return; }
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Auth failed', detail: String(e.message || e), dataViews: [] });
    return;
  }
  const clientId = ADOBE_CLIENT_ID.value();
  const orgId = ADOBE_IMS_ORG.value();
  try {
    const result = await cjaJourneyMetrics.listCjaDataViewsAjoEnabled(accessToken, { clientId }, { orgId });
    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      dataViews: result.dataViews || [],
      error: result.error,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e), dataViews: [] });
  }
});

/** POST /api/easter-egg-found — Marauder's Map register (Firestore + optional Mailgun to lab owners). */
exports.easterEggNotify = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 30,
    memory: '256MiB',
    secrets: [EASTER_EGG_MAILGUN_API_KEY, EASTER_EGG_MAILGUN_DOMAIN],
    /** MAIL_FROM on your Mailgun domain; MAILGUN_REGION '' = US, 'eu' = EU API host. */
    environmentVariables: {
      EASTER_EGG_MAIL_FROM: 'postmaster@mail.apalmer-consulting.com',
      EASTER_EGG_MAILGUN_REGION: '',
    },
  },
  async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method === 'GET') {
      return easterEggNotify.handleEasterEggList(req, res);
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const mailgunKey = EASTER_EGG_MAILGUN_API_KEY.value();
    const mailgunDomain = EASTER_EGG_MAILGUN_DOMAIN.value();
    /** Cloud Run sometimes omits onRequest.environmentVariables; keep Postmaster default in sync with Mailgun domain. */
    const mailFrom =
      process.env.EASTER_EGG_MAIL_FROM || 'postmaster@mail.apalmer-consulting.com';
    const mailgunRegion = process.env.EASTER_EGG_MAILGUN_REGION || '';
    return easterEggNotify.handleEasterEggNotify(req, res, {
      mailgunKey,
      mailgunDomain,
      mailFrom,
      mailgunRegion,
    });
  },
);

/** Hourly refresh of Firestore journey browse cache for sandboxes that were loaded at least once. */
exports.journeyBrowseCacheRefresh = onSchedule(
  {
    schedule: 'every 60 minutes',
    region: REGION,
    secrets: PROFILE_FN_SECRETS,
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    let sandboxes;
    try {
      sandboxes = await journeyBrowseCache.listCachedSandboxNames();
    } catch (e) {
      console.error('[journeyBrowseCacheRefresh] list failed', e);
      return;
    }
    if (sandboxes.length === 0) {
      console.log('[journeyBrowseCacheRefresh] no sandboxes in cache yet');
      return;
    }
    let accessToken;
    try {
      accessToken = await getAdobeAccessToken();
    } catch (e) {
      console.error('[journeyBrowseCacheRefresh] auth failed', e);
      return;
    }
    const clientId = ADOBE_CLIENT_ID.value();
    const orgId = ADOBE_IMS_ORG.value();
    const refreshLimit = 500;
    for (let i = 0; i < sandboxes.length; i++) {
      const sb = sandboxes[i];
      try {
        const payload = await journeysBrowse.buildBrowseResponse(
          sb,
          accessToken,
          clientId,
          orgId,
          0,
          refreshLimit,
          '',
        );
        if (payload.ok) {
          await journeyBrowseCache.saveJourneyBrowseCache(sb, payload);
        }
      } catch (e) {
        console.error('[journeyBrowseCacheRefresh] sandbox', sb, e.message || e);
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    console.log('[journeyBrowseCacheRefresh] refreshed', sandboxes.length, 'sandbox(es)');
  },
);

// ---------------------------------------------------------------------------
// Scheduled CDN pre-warm — hits Data Viewer endpoints to populate CDN cache
// for recently-accessed sandboxes.
// ---------------------------------------------------------------------------

const HOSTING_ORIGIN = 'https://aep-orchestration-lab.web.app';
const WARM_ENDPOINTS = ['overview-stats', 'tenant-schemas', 'datasets', 'audiences'];

exports.schemaViewerCacheWarm = onSchedule(
  {
    schedule: 'every 10 minutes',
    region: REGION,
    timeoutSeconds: 300,
    memory: '256MiB',
  },
  async () => {
    const sandboxes = await svCache.getRecentSandboxes();
    if (sandboxes.length === 0) return;

    for (const sandbox of sandboxes) {
      const urls = WARM_ENDPOINTS.map(
        (ep) => `${HOSTING_ORIGIN}/api/schema-viewer/${ep}?sandbox=${encodeURIComponent(sandbox)}`,
      );
      await Promise.allSettled(
        urls.map((url) => fetch(url).catch(() => {})),
      );
    }
  },
);

/** GET/POST/DELETE /api/arch-proposals — per-sandbox Architecture diagram snapshots (Firestore) */
exports.archProposals = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
  setCors(res, 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  const sandbox =
    req.method === 'POST' && req.body?.sandbox
      ? String(req.body.sandbox).trim()
      : resolveSandboxFromQuery(req);

  try {
    if (req.method === 'GET') {
      const id = String(req.query.id || '').trim();
      if (id) {
        const record = await archProposalStore.getProposal(sandbox, id);
        res.status(200).json({ ok: true, sandbox, record });
        return;
      }
      const items = await archProposalStore.listProposals(sandbox);
      res.status(200).json({ ok: true, sandbox, items });
      return;
    }
    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const record = await archProposalStore.saveProposal(sandbox, {
        id: body.id,
        name: body.name,
        snapshot: body.snapshot,
      });
      res.status(200).json({ ok: true, sandbox, record });
      return;
    }
    if (req.method === 'DELETE') {
      const id = String(req.query.id || (req.body && req.body.id) || '').trim();
      const ok = await archProposalStore.deleteProposal(sandbox, id);
      res.status(200).json({ ok, sandbox, id });
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
  }
});

/** GET/POST /api/arch-master — shared baseline architecture snapshot (sandbox-gated write) */
exports.archMaster = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  try {
    if (req.method === 'GET') {
      const record = await archProposalStore.getMaster();
      res.status(200).json({ ok: true, record });
      return;
    }
    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const sandbox = String(body.sandbox || '').trim();
      const record = await archProposalStore.saveMaster(sandbox, {
        snapshot: body.snapshot,
      });
      res.status(200).json({ ok: true, record });
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    const code = e.code === 'master-forbidden' ? 403 : 500;
    res.status(code).json({ ok: false, error: String(e.message || e) });
  }
});

/** POST /api/brand-scraper/analyze — crawl a brand URL and optionally run LLM brand analysis. */
exports.brandScraperAnalyze = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    try {
      const anthropicKey = (process.env.ANTHROPIC_API_KEY || '').trim();
      await brandScraperService.handleAnalyse(req, res, { anthropicKey });
    } catch (e) {
      res.status(500).json({ error: String(e && e.message || e) });
    }
  }
);

/** GET /api/brand-scraper/scrapes?sandbox=… — list, one by id, or DELETE by id. */
exports.brandScraperScrapes = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res, 'GET, DELETE, OPTIONS');
    await brandScraperService.handleScrapes(req, res);
  }
);

/** POST /api/brand-scraper/scrapes/classify?sandbox=… — V2: download + Gemini-vision classify. */
exports.brandScraperClassify = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 300,
    memory: '1GiB',
  },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    await brandScraperService.handleClassifyAssets(req, res);
  }
);

/** GET/PUT /api/brand-scraper/model-config?sandbox=… — per-sandbox LLM provider + Secret Manager keys. */
exports.brandScraperModelConfig = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res, 'GET, PUT, POST, OPTIONS');
    await brandScraperService.handleModelConfig(req, res);
  }
);

/** POST /api/brand-scraper/scrapes/export?sandbox=… — build ZIP + return signed URL. */
exports.brandScraperExport = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 180,
    memory: '1GiB',
  },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    await brandScraperService.handleExport(req, res);
  }
);

/**
 * Image hosting library API — per-sandbox curated assets promoted from
 * brand-scraper classifications.
 *   GET    /api/image-hosting/library?sandbox=X       list current library
 *   POST   /api/image-hosting/library/publish         { sandbox, scrapeId, imageIndex, overrideFolder?, overrideFile? }
 *   DELETE /api/image-hosting/library?sandbox=X&relPath=...
 *   POST   /api/image-hosting/library/rename          { sandbox, relPath, newRelPath }
 */
exports.imageHostingLibrary = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 60,
    memory: '512MiB',
  },
  async (req, res) => {
    setCors(res, 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    try {
      const path = String(req.path || '').replace(/\/+$/, '');
      const sandbox = String((req.query && req.query.sandbox) || (req.body && req.body.sandbox) || '').trim();
      if (!sandbox) { res.status(400).json({ error: 'sandbox is required' }); return; }

      if (req.method === 'GET') {
        const items = await imageHostingLibrary.listLibrary(sandbox);
        res.status(200).json({ sandbox, items });
        return;
      }

      if (req.method === 'POST' && /\/publish$/.test(path)) {
        const body = (req.body && typeof req.body === 'object') ? req.body : {};
        // scrapeId is optional — callers may publish directly from an
        // uploaded file or a URL with no backing scrape ('_manual'
        // sentinel from the UI, or just omitted entirely).
        const scrapeId = String(body.scrapeId || '').trim();
        const imageIndex = Number.isInteger(body.imageIndex) ? body.imageIndex : -1;

        // Optional: client-supplied bytes (base64). When the origin CDN
        // blocks our server's User-Agent (Flynas, etc.) the browser has
        // already fetched the image successfully for rendering — posting
        // those bytes through is the most reliable publish path.
        let clientBytes = null;
        let clientContentType = '';
        if (body.imageBase64 && typeof body.imageBase64 === 'string') {
          try { clientBytes = Buffer.from(body.imageBase64, 'base64'); }
          catch (_e) { clientBytes = null; }
          clientContentType = String(body.imageContentType || '');
        }

        let img = null;
        if (imageIndex >= 0 && scrapeId && scrapeId !== '_manual') {
          const record = await brandScrapeStore.getScrape(sandbox, scrapeId);
          if (record) {
            const imgs = (record.crawlSummary && record.crawlSummary.assets && record.crawlSummary.assets.imagesV2) || [];
            img = imgs[imageIndex] || null;
          }
        }

        // If we have neither server bytes nor client bytes, we can't publish.
        const haveServerBytes = !!(img && img.storagePath);
        const haveClientBytes = !!(clientBytes && clientBytes.length);
        const haveDirectUrl = !!(body.imageUrl || (img && img.src));
        if (!haveServerBytes && !haveClientBytes && !haveDirectUrl) {
          res.status(400).json({ error: 'no image bytes available — classify, send imageBase64, or imageUrl' });
          return;
        }

        const published = await imageHostingLibrary.publishScrapeImage(sandbox, {
          scrapeStoragePath: haveServerBytes ? img.storagePath : '',
          imageUrl: body.imageUrl || (img && img.src) || '',
          clientBytes,
          clientContentType,
          classification: (img && img.classification) || body.classification || {},
          srcName: (img && img.classification && img.classification.subject)
            || (img && img.alt)
            || body.srcName
            || '',
          overrideFolder: body.overrideFolder,
          overrideFile: body.overrideFile,
        });
        res.status(200).json({ sandbox, published });
        return;
      }

      if (req.method === 'GET' && /\/download$/.test(path)) {
        const customer = String((req.query && req.query.customer) || 'library').trim();
        const safe = customer.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'library';
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="logo_${safe}.zip"`);
        await imageHostingLibrary.streamLibraryZip(sandbox, res);
        return;
      }

      if (req.method === 'POST' && /\/restore$/.test(path)) {
        const body = (req.body && typeof req.body === 'object') ? req.body : {};
        if (!body.zipBase64 || typeof body.zipBase64 !== 'string') {
          res.status(400).json({ error: 'zipBase64 is required' });
          return;
        }
        let zipBytes;
        try { zipBytes = Buffer.from(body.zipBase64, 'base64'); }
        catch (_e) { res.status(400).json({ error: 'invalid base64' }); return; }
        const replace = body.replace !== false; // default to replacing
        const out = await imageHostingLibrary.restoreLibraryFromZip(sandbox, zipBytes, { replace });
        res.status(200).json({ sandbox, restored: out.length, items: out, replace });
        return;
      }

      if (req.method === 'POST' && /\/rename$/.test(path)) {
        const body = (req.body && typeof req.body === 'object') ? req.body : {};
        if (!body.relPath || !body.newRelPath) {
          res.status(400).json({ error: 'relPath + newRelPath required' });
          return;
        }
        const out = await imageHostingLibrary.renameLibraryObject(sandbox, body.relPath, body.newRelPath);
        res.status(200).json({ sandbox, ...out });
        return;
      }

      if (req.method === 'DELETE') {
        const relPath = String((req.query && req.query.relPath) || '').trim();
        if (!relPath) { res.status(400).json({ error: 'relPath is required' }); return; }
        const out = await imageHostingLibrary.deleteLibraryObject(sandbox, relPath);
        res.status(200).json({ sandbox, ...out });
        return;
      }

      res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
      console.error('[imageHostingLibrary]', String(e && e.message || e));
      res.status(500).json({ error: String((e && e.message) || e) });
    }
  }
);

/**
 * Public CDN proxy — streams bytes from the library bucket at
 * gs://<bucket>/<sandbox>/library/<relPath>. Publicly readable; the
 * bucket stores only curated images promoted from brand scrapes.
 */
exports.imageHostingAsset = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res, 'GET, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(405).send('GET only'); return;
    }
    try {
      // Hosting rewrites /cdn/** to this function, so req.path is the
      // full /cdn/<sandbox>/<relPath...> the client requested.
      const p = String(req.path || '').replace(/^\/cdn\//, '');
      const parts = p.split('/').filter(Boolean);
      if (parts.length < 2) { res.status(400).send('bad path'); return; }
      const sandbox = parts.shift();
      const relPath = parts.join('/');
      if (!sandbox || !relPath) { res.status(400).send('bad path'); return; }
      const { file } = imageHostingLibrary.resolveAsset(sandbox, relPath);
      const [exists] = await file.exists();
      if (!exists) { res.status(404).send('not found'); return; }
      const [md] = await file.getMetadata().catch(() => [null]);
      const ct = (md && md.contentType) || 'application/octet-stream';
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      if (md && md.size) res.setHeader('Content-Length', String(md.size));
      if (md && md.etag) res.setHeader('ETag', md.etag);
      if (req.method === 'HEAD') { res.status(200).end(); return; }
      file.createReadStream().on('error', (e) => {
        console.error('[imageHostingAsset] stream', String(e && e.message || e));
        if (!res.headersSent) res.status(500).send('read error');
      }).pipe(res);
    } catch (e) {
      console.error('[imageHostingAsset]', String(e && e.message || e));
      if (!res.headersSent) res.status(500).send('internal error');
    }
  }
);
