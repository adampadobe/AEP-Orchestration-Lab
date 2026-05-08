/**
 * IMS client_credentials token — same contract as functions/index.js getAdobeAccessToken,
 * but reads credentials from the environment (no Firebase Secrets).
 */

const IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v2';

let cache = { accessToken: null, expiresAtMs: 0 };

function requireEnv(name) {
  const v = process.env[name];
  if (v == null || String(v).trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return String(v).trim();
}

export function loadAdobeCredentials() {
  return {
    clientId: requireEnv('ADOBE_CLIENT_ID'),
    clientSecret: requireEnv('ADOBE_CLIENT_SECRET'),
    orgId: requireEnv('ADOBE_IMS_ORG'),
    scopes: requireEnv('ADOBE_SCOPES'),
    defaultSandbox: String(process.env.ADOBE_SANDBOX_NAME || 'prod').trim() || 'prod',
  };
}

export async function getAdobeAccessToken(creds) {
  const { clientId, clientSecret, scopes } = creds || loadAdobeCredentials();
  const now = Date.now();
  if (cache.accessToken && now < cache.expiresAtMs - 5 * 60 * 1000) {
    return cache.accessToken;
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
  cache = {
    accessToken,
    expiresAtMs: now + expiresIn * 1000,
  };
  return accessToken;
}
