/**
 * IMS client_credentials token — same contract as functions/index.js getAdobeAccessToken,
 * but reads credentials from the environment (no Firebase Secrets).
 */

const IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v2';

const tokenCache = new Map();

function cacheKey({ clientId, scopes }) {
  const normalizedScopes = String(scopes || '')
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean)
    .sort()
    .join(',');
  return `${clientId}:${normalizedScopes}`;
}

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
  const key = cacheKey({ clientId, scopes });
  const cached = tokenCache.get(key);
  if (cached?.accessToken && now < cached.expiresAtMs - 5 * 60 * 1000) {
    return cached.accessToken;
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
  tokenCache.set(key, {
    accessToken,
    expiresAtMs: now + expiresIn * 1000,
  });
  return accessToken;
}
