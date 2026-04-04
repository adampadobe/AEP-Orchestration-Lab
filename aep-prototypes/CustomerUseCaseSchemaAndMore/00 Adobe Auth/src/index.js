/**
 * Adobe Auth – reusable AEP/Adobe IMS bearer token and config.
 * Use from any project: get valid token and org/sandbox config.
 */

import { getConfig } from './config.js';
import { getAccessToken } from './token.js';

export { getAccessToken, fetchNewToken, clearTokenCache } from './token.js';
export { getConfig, getConfigSafe, isVaultConfigured } from './config.js';
export { getSecretsFromVault, clearVaultCache } from './vault.js';

/**
 * Get bearer token and config in one call for AEP API usage.
 * @returns {Promise<{ token: string, config: object }>}
 */
export async function getAuth() {
  const config = getConfig();
  const token = await getAccessToken();
  return {
    token,
    config: {
      orgId: config.orgId,
      sandboxName: config.sandboxName,
      technicalAccountId: config.technicalAccountId,
    },
  };
}
