/**
 * Fetch and cache Adobe IMS access token. Refreshes automatically when expired.
 * When AZURE_KEY_VAULT_NAME is set, client ID and client secret are loaded from
 * the vault only (never from .env), for security compliance.
 */

import { getConfig, isVaultConfigured } from './config.js';
import { getSecretsFromVault } from './vault.js';

const grantType = 'client_credentials';
const expiryBufferMs = 5 * 60 * 1000; // refresh 5 min before expiry

let cached = { token: null, expiresAt: 0 };

/**
 * Resolve client credentials: from vault when configured, otherwise from config (env/.env).
 */
async function getClientCredentials() {
  const config = getConfig();
  if (isVaultConfigured()) {
    const vault = await getSecretsFromVault();
    return { ...config, clientId: vault.clientId, clientSecret: vault.clientSecret };
  }
  return config;
}

/**
 * Request a new access token from Adobe IMS.
 * @returns {Promise<{ access_token: string, expires_in: number }>}
 */
export async function fetchNewToken() {
  const { clientId, clientSecret, imsHost, scopes } = await getClientCredentials();
  if (!clientId || !clientSecret) {
    throw new Error('Missing client ID or client secret. Set in .env or store in Azure Key Vault.');
  }
  const url = `https://${imsHost}/ims/token/v2?grant_type=${encodeURIComponent(grantType)}&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&scope=${encodeURIComponent(scopes)}`;

  const res = await fetch(url, { method: 'POST' });
  const data = await res.json();

  if (!res.ok) {
    const msg = data.error_description || data.error || res.statusText;
    throw new Error(`Adobe IMS token request failed: ${res.status} ${msg}`);
  }
  if (!data.access_token) {
    throw new Error('Adobe IMS response did not include access_token');
  }

  const expiresIn = (data.expires_in || 86400) * 1000; // default 24h in ms
  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
    expiresAt: Date.now() + expiresIn,
  };
}

/**
 * Get a valid bearer token. Uses cached token if still valid; otherwise fetches a new one.
 * @returns {Promise<string>} Bearer access token
 */
export async function getAccessToken() {
  const now = Date.now();
  if (cached.token && cached.expiresAt > now + expiryBufferMs) {
    return cached.token;
  }
  const data = await fetchNewToken();
  cached = { token: data.access_token, expiresAt: data.expiresAt };
  return cached.token;
}

/**
 * Clear cached token (e.g. after logout or to force refresh).
 */
export function clearTokenCache() {
  cached = { token: null, expiresAt: 0 };
}
