/**
 * Load Adobe Auth config from environment or vault.
 * For security compliance: use Azure Key Vault (AZURE_KEY_VAULT_NAME) so
 * client ID and client secret are never stored in .env or on disk.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const useVault = Boolean(process.env.AZURE_KEY_VAULT_NAME);

// Load .env only when NOT using vault, so secrets are never read from file in vault mode
if (!useVault) {
  dotenv.config({ path: join(__dirname, '..', '.env') });
  dotenv.config({ path: join(process.cwd(), '.env') });
}

const required = ['ADOBE_CLIENT_ID', 'ADOBE_CLIENT_SECRET', 'ADOBE_IMS_HOST', 'ADOBE_SCOPES'];
const optional = ['ADOBE_ORG_ID', 'ADOBE_SANDBOX_NAME', 'ADOBE_TECHNICAL_ACCOUNT_ID'];

/**
 * Get config from environment. When using a vault, clientId/clientSecret
 * are not read from env (they must come from getSecretsFromVault() in token.js).
 */
export function getConfig() {
  const config = {
    clientId: process.env.ADOBE_CLIENT_ID || '',
    clientSecret: process.env.ADOBE_CLIENT_SECRET || '',
    imsHost: process.env.ADOBE_IMS_HOST || 'ims-na1.adobelogin.com',
    scopes: process.env.ADOBE_SCOPES,
    orgId: process.env.ADOBE_ORG_ID,
    sandboxName: process.env.ADOBE_SANDBOX_NAME,
    technicalAccountId: process.env.ADOBE_TECHNICAL_ACCOUNT_ID,
  };

  if (!useVault) {
    const missing = required.filter((key) => {
      if (key === 'ADOBE_CLIENT_ID') return !config.clientId;
      if (key === 'ADOBE_CLIENT_SECRET') return !config.clientSecret;
      if (key === 'ADOBE_IMS_HOST') return !config.imsHost;
      if (key === 'ADOBE_SCOPES') return !config.scopes;
      return false;
    });
    if (missing.length) {
      throw new Error(
        `Missing required Adobe Auth config: ${missing.join(', ')}. ` +
          'Copy .env.example to .env and set values, or set environment variables. For production, use a vault (AZURE_KEY_VAULT_NAME) and store secrets there.'
      );
    }
  } else {
    const missingNonSecret = ['ADOBE_IMS_HOST', 'ADOBE_SCOPES'].filter((key) => {
      if (key === 'ADOBE_IMS_HOST') return !config.imsHost;
      if (key === 'ADOBE_SCOPES') return !config.scopes;
      return false;
    });
    if (missingNonSecret.length) {
      throw new Error(
        `When using vault, set non-secret config in environment: ${missingNonSecret.join(', ')}. ` +
          'Client ID and client secret are read from Azure Key Vault.'
      );
    }
  }

  return config;
}

export function getConfigSafe() {
  try {
    return getConfig();
  } catch {
    return null;
  }
}

/** Whether Azure Key Vault is configured (secrets must be loaded async from vault). */
export function isVaultConfigured() {
  return useVault;
}
