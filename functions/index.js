/**
 * Standalone Firebase project for AEP Decisioning lab.
 * Mirrors proxy_server.py: POST /api/aep → platform.adobe.io, GET webhook index (allowlisted).
 */
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const ADOBE_CLIENT_ID = defineSecret('ADOBE_CLIENT_ID');
const ADOBE_CLIENT_SECRET = defineSecret('ADOBE_CLIENT_SECRET');
const ADOBE_IMS_ORG = defineSecret('ADOBE_IMS_ORG');
const ADOBE_SCOPES = defineSecret('ADOBE_SCOPES');

/** Default Platform sandbox; override at deploy: `ADOBE_SANDBOX_NAME=other firebase deploy` or edit this constant. */
const DEFAULT_ADOBE_SANDBOX = 'apalmer';
const RESOLVED_ADOBE_SANDBOX = String(
  process.env.ADOBE_SANDBOX_NAME || DEFAULT_ADOBE_SANDBOX
).trim();

const BASE_PLATFORM = 'https://platform.adobe.io';
const IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v2';
const { buildProfileTablePayload, fetchUpsProfileEntities } = require('./profileTableHelpers');
const { buildConsentGetPayload } = require('./profileConsentPayload');
const { buildAudiencesPayload } = require('./profileAudiences');
const { buildEventsPayload } = require('./profileEventsService');
const { listActiveSandboxes } = require('./sandboxesList');
const {
  getTreatmentNameById,
  getCampaignNameById,
  getJourneyNameById,
} = require('./joLookups');
const {
  listTenantSchemas,
  getTenantSchema,
  createTenantSchema,
  patchTenantSchema,
  listGlobalFieldGroups,
} = require('./schemaRegistryService');
const {
  runConsentInfraEnsure,
  runConsentInfraStatus,
  runConsentInfraStep,
  CONSENT_DATASET_NAME,
  CONSENT_HTTP_DATAFLOW_NAME,
} = require('./consentInfraService');
const { lookupConsentHttpFlow } = require('./consentFlowLookup');
const { getConsentConnection, saveConsentConnection } = require('./consentConnectionStore');
const {
  PROFILE_STREAM_ROOT_PATH_PREFIXES,
  setByPath,
  normalizeProfileUpdateDateString,
  buildConsentXdm,
  buildProfileStreamPayload,
  buildProfileStreamingEnvelope,
  buildOperationalConsentXdmEntity,
  profileStreamingUseEnvelope,
  buildProfileDcsStreamingHeaders,
  redactedProfileDcsRequestHeaders,
  parseStreamingCollectionResponse,
} = require('./profileStreamingCore');
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
  res.set('Access-Control-Allow-Headers', 'Content-Type');
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
      if (allowed.has(k.toLowerCase())) headers[k] = String(v);
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
    const email = String(req.query.email || '').trim();
    const sandbox = resolveSandboxFromQuery(req);
    if (!email) {
      res.status(400).json({ error: 'Missing email. Use ?email=user@example.com' });
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
      const ups = await fetchUpsProfileEntities(email, sandbox, accessToken, clientId, orgId);
      const payload = buildProfileTablePayload(email, ups);
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
        const schema = await getTenantSchema(accessToken, clientId, orgId, sandbox, altId);
        res.status(200).json({ sandbox, schema });
        return;
      }
      const query = pickSchemaListQuery(req.query);
      const result = await listTenantSchemas(accessToken, clientId, orgId, sandbox, query);
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
      const schema = await createTenantSchema(accessToken, clientId, orgId, sandbox, descriptor);
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
    const result = await listGlobalFieldGroups(
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
    const schema = await patchTenantSchema(
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
    const payload = await runConsentInfraStatus(
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
    const payload = await runConsentInfraStep(sandbox, accessToken, ADOBE_CLIENT_ID.value(), ADOBE_IMS_ORG.value(), step);
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
    const payload = await runConsentInfraEnsure(sandbox, accessToken, ADOBE_CLIENT_ID.value(), ADOBE_IMS_ORG.value(), {
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
    const payload = await lookupConsentHttpFlow(sandbox, accessToken, ADOBE_CLIENT_ID.value(), ADOBE_IMS_ORG.value(), {
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
      const record = await getConsentConnection(sandboxQ);
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
      const record = await saveConsentConnection(sb, {
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
 * Default payload matches Profile Viewer: buildProfileStreamPayload (identityMap + root consents/optInOut + _demoemea + demoemea mirror).
 * Live POST requires body.ecid (≥10 chars). Optional streamPayloadProfile=operational for the slim experimental shape only.
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
    profileStreamingUseEnvelope(process.env.AEP_PROFILE_STREAMING_ENVELOPE);
  if (isAdobeDcsCollection) {
    useEnvelope = true;
  }
  if (dryRun && hasDatasetAndSchema) {
    useEnvelope = true;
  }

  if (!dryRun && (!streamUrl || !flowId)) {
    res.status(400).json({
      error: `Missing streaming.url (DCS collection URL) and streaming.flowId. In AEP, create an HTTP API streaming dataflow named "${CONSENT_HTTP_DATAFLOW_NAME}" for dataset "${CONSENT_DATASET_NAME}", then save URL and Flow ID on the Consent page.`,
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

  /** Profile Viewer parity: live DCS POST requires ECID in identityMap (dryRun allowed without for preview). */
  if (!dryRun && ecidForPayload.length < 10) {
    res.status(400).json({
      error:
        'ECID is required for consent streaming (same as Profile Viewer). Load a profile in Step 1 that includes an ECID, or query an identity that resolves to a profile with ECID.',
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
    const fragment = buildConsentXdm(email, {
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
        out = normalizeProfileUpdateDateString(path, out);
      }
      const top = path.split('.')[0];
      const underRootMixin = PROFILE_STREAM_ROOT_PATH_PREFIXES.has(top);
      const target = underRootMixin ? rootExtras : demoemea;
      if (typeof out === 'string' && out.trim() !== '' && /^\d+$/.test(out)) {
        setByPath(target, path, parseInt(out, 10));
      } else {
        setByPath(target, path, out);
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
    const xdmEntity = buildOperationalConsentXdmEntity(demoemea, email, ecidForPayload, rootExtras);
    payload = buildProfileStreamingEnvelope(xdmEntity, orgId, envelopeSourceName, datasetId, schemaId);
    payloadFormat = 'envelope';
  } else {
    const built = buildProfileStreamPayload(
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
          ? 'Profile Viewer–compatible streaming: identityMap (Email + ECID when body.ecid set), root consents/optInOut from merged tenant, _demoemea + demoemea mirror, root person.* from form. Live POST requires ECID.'
          : undefined,
    });
    return;
  }

  const headers = buildProfileDcsStreamingHeaders(accessToken, sandbox, flowId, apiKey);

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

  const { parsed: data, streamErrors, streamWarnings } = parseStreamingCollectionResponse(streamRes.status, rawText);

  if (!streamRes.ok || streamErrors.length > 0) {
    res.status(502).json({
      error: streamErrors.length ? streamErrors.join(' ') : 'Streaming failed',
      streamingStatus: streamRes.status,
      streamingResponse: data,
      sentToAep: payload,
      payloadFormat,
      requestHeaders: redactedProfileDcsRequestHeaders(headers),
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
    requestHeaders: redactedProfileDcsRequestHeaders(headers),
    ...(appliedPathsDetail && appliedPathsDetail.length ? { appliedPathsDetail } : {}),
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
    const sandboxes = await listActiveSandboxes(
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
  const email = String(req.query.email || '').trim();
  const sandbox = resolveSandboxFromQuery(req);
  if (!email) {
    res.status(400).json({ error: 'Missing email. Use ?email=user@example.com', realized: [], exited: [] });
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
    const payload = await buildAudiencesPayload(email, sandbox, accessToken, clientId, orgId);
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
    const ups = await fetchUpsProfileEntities(identifier, sandbox, accessToken, clientId, orgId, namespace);
    const payload = buildConsentGetPayload(identifier, ups);
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
  const email = String(req.query.email || '').trim();
  const sandbox = resolveSandboxFromQuery(req);
  if (!email) {
    res.status(400).json({ error: 'Missing email. Use ?email=user@example.com', events: [] });
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
    const payload = await buildEventsPayload(email, sandbox, accessToken, clientId, orgId);
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
    const name = await getTreatmentNameById(
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
    const name = await getCampaignNameById(
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
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e), name: null });
    return;
  }
  try {
    const name = await getJourneyNameById(
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
