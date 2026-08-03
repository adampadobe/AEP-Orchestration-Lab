'use strict';

const IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v2';
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/** Platform header overrides allowed through aepProxy / aepHeaders. */
const ALLOWED_PLATFORM_HEADER_KEYS = new Set([
  'x-schema-id',
  'x-api-version',
  'accept',
  'content-type',
  'if-match',
  'if-none-match',
]);

/**
 * Factory for IMS client-credentials auth + standard platform.adobe.io headers.
 * Secrets stay in index.js via defineSecret(); this module stays free of Firebase params.
 *
 * @param {object} cfg
 * @param {() => string} cfg.getClientId
 * @param {() => string} cfg.getClientSecret
 * @param {() => string} cfg.getScopes
 * @param {() => string} cfg.getImsOrg
 */
function createAdobeAuth(cfg) {
  if (!cfg || typeof cfg.getClientId !== 'function' || typeof cfg.getClientSecret !== 'function'
    || typeof cfg.getScopes !== 'function' || typeof cfg.getImsOrg !== 'function') {
    throw new Error('createAdobeAuth: getClientId, getClientSecret, getScopes, getImsOrg required');
  }

  let tokenCache = { accessToken: null, expiresAtMs: 0 };

  async function getAdobeAccessToken() {
    const now = Date.now();
    if (tokenCache.accessToken && now < tokenCache.expiresAtMs - TOKEN_REFRESH_BUFFER_MS) {
      return tokenCache.accessToken;
    }
    const clientId = cfg.getClientId();
    const clientSecret = cfg.getClientSecret();
    const scopes = cfg.getScopes();
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
    const clientId = cfg.getClientId();
    const org = cfg.getImsOrg();
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'x-api-key': clientId,
      'x-gw-ims-org-id': org,
      Accept: 'application/json',
    };
    if (extra && typeof extra === 'object') {
      for (const [k, v] of Object.entries(extra)) {
        if (v == null || String(v).trim() === '') continue;
        if (!ALLOWED_PLATFORM_HEADER_KEYS.has(k.toLowerCase())) continue;
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

  return { getAdobeAccessToken, aepHeaders };
}

module.exports = {
  IMS_TOKEN_URL,
  TOKEN_REFRESH_BUFFER_MS,
  ALLOWED_PLATFORM_HEADER_KEYS,
  createAdobeAuth,
};
