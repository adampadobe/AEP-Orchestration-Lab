'use strict';

/**
 * Adobe I/O Runtime web action — list active AEP sandboxes (same behavior as
 * functions/sandboxesList.js). Deploy with your aio App Builder project.
 *
 * Env (Runtime / aio secrets):
 *   ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, ADOBE_IMS_ORG, ADOBE_SCOPES (space-separated)
 * Optional gate for Firebase proxy:
 *   SANDBOX_LIST_ACTION_KEY — if set, require header X-Sandbox-List-Key to match
 */

const SANDBOX_MANAGEMENT_BASE = 'https://platform.adobe.io/data/foundation/sandbox-management';
const IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v2';

let tokenCache = { accessToken: null, expiresAtMs: 0 };

async function getAdobeAccessToken() {
  const now = Date.now();
  if (tokenCache.accessToken && now < tokenCache.expiresAtMs - 5 * 60 * 1000) {
    return tokenCache.accessToken;
  }
  const clientId = String(process.env.ADOBE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.ADOBE_CLIENT_SECRET || '').trim();
  const scopes = String(process.env.ADOBE_SCOPES || '').trim();
  if (!clientId || !clientSecret || !scopes) {
    throw new Error('Missing ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, or ADOBE_SCOPES');
  }
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
  tokenCache = { accessToken, expiresAtMs: now + expiresIn * 1000 };
  return accessToken;
}

async function listActiveSandboxes(token, clientId, orgId) {
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
  };
  const all = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const url = `${SANDBOX_MANAGEMENT_BASE}/?limit=${limit}&offset=${offset}`;
    const apiRes = await fetch(url, { method: 'GET', headers });
    const data = await apiRes.json().catch(() => ({}));
    if (!apiRes.ok) {
      const msg = data.message || data.error_description || apiRes.statusText;
      throw new Error(msg || `Sandbox API ${apiRes.status}`);
    }
    const batch = data.sandboxes || [];
    all.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return all
    .filter((s) => s.state === 'active')
    .map((s) => ({ name: s.name, title: s.title || s.name, type: s.type || '' }));
}

function jsonResponse(statusCode, obj) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(obj),
  };
}

function headerMap(params) {
  const raw = params.__ow_headers || {};
  const lower = {};
  for (const [k, v] of Object.entries(raw)) {
    lower[String(k).toLowerCase()] = v;
  }
  return lower;
}

async function main(params) {
  const method = String(params.__ow_method || params.http?.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed', sandboxes: [] });
  }

  const expected = String(process.env.SANDBOX_LIST_ACTION_KEY || '').trim();
  if (expected) {
    const got = String(headerMap(params)['x-sandbox-list-key'] || '').trim();
    if (got !== expected) {
      return jsonResponse(401, { error: 'Unauthorized', sandboxes: [] });
    }
  }

  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    return jsonResponse(500, { error: 'Auth failed', detail: String(e.message || e), sandboxes: [] });
  }

  const clientId = String(process.env.ADOBE_CLIENT_ID || '').trim();
  const orgId = String(process.env.ADOBE_IMS_ORG || '').trim();
  if (!clientId || !orgId) {
    return jsonResponse(500, { error: 'Missing ADOBE_CLIENT_ID or ADOBE_IMS_ORG', sandboxes: [] });
  }

  try {
    const sandboxes = await listActiveSandboxes(accessToken, clientId, orgId);
    return jsonResponse(200, { sandboxes });
  } catch (e) {
    return jsonResponse(500, { error: String(e.message || e), sandboxes: [] });
  }
}

exports.main = main;
