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
const WEBHOOK_LISTENER_ALLOWED_HOST = 'webhooklistener-pscg5c4cja-uc.a.run.app';
const DEFAULT_WEBHOOK_LISTENER_URL = 'https://webhooklistener-pscg5c4cja-uc.a.run.app/';

const REGION = 'us-central1';

const PROFILE_FN_SECRETS = [ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, ADOBE_IMS_ORG, ADOBE_SCOPES];

/** Selected sandbox from ?sandbox= or deploy default. */
function resolveSandboxFromQuery(req) {
  const q = String(req.query.sandbox || '').trim();
  return q || String(process.env.ADOBE_SANDBOX_NAME || DEFAULT_ADOBE_SANDBOX).trim();
}

let tokenCache = { accessToken: null, expiresAtMs: 0 };

function setCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
    const payload = buildConsentGetPayload(email, ups);
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
