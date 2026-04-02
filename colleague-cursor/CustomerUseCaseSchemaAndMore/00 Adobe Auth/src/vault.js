/**
 * Load Adobe client credentials from Azure Key Vault.
 * Used when AZURE_KEY_VAULT_NAME is set so secrets are never on disk.
 * Requires: npm install @azure/keyvault-secrets @azure/identity
 */

const VAULT_SECRET_NAMES = {
  clientId: process.env.AZURE_VAULT_SECRET_NAME_CLIENT_ID || 'ADOBE-CLIENT-ID',
  clientSecret: process.env.AZURE_VAULT_SECRET_NAME_CLIENT_SECRET || 'ADOBE-CLIENT-SECRET',
};

let cachedSecrets = null;

/**
 * Fetch client ID and client secret from Azure Key Vault.
 * @returns {Promise<{ clientId: string, clientSecret: string }>}
 */
export async function getSecretsFromVault() {
  if (cachedSecrets) return cachedSecrets;

  const vaultName = process.env.AZURE_KEY_VAULT_NAME;
  if (!vaultName) return null;

  try {
    const { DefaultAzureCredential } = await import('@azure/identity');
    const { SecretClient } = await import('@azure/keyvault-secrets');
    const credential = new DefaultAzureCredential();
    const url = `https://${vaultName}.vault.azure.net`;
    const client = new SecretClient(url, credential);

    const [clientIdSecret, clientSecretSecret] = await Promise.all([
      client.getSecret(VAULT_SECRET_NAMES.clientId),
      client.getSecret(VAULT_SECRET_NAMES.clientSecret),
    ]);

    const clientId = clientIdSecret?.value;
    const clientSecret = clientSecretSecret?.value;
    if (!clientId || !clientSecret) {
      throw new Error(
        'Azure Key Vault: one or both secrets missing. Ensure ADOBE-CLIENT-ID and ADOBE-CLIENT-SECRET exist in the vault.'
      );
    }

    cachedSecrets = { clientId, clientSecret };
    return cachedSecrets;
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        'Azure Key Vault is configured (AZURE_KEY_VAULT_NAME) but @azure/keyvault-secrets or @azure/identity is not installed. Run: npm install @azure/keyvault-secrets @azure/identity'
      );
    }
    throw err;
  }
}

/**
 * Clear cached vault secrets (e.g. for tests or rotation).
 */
export function clearVaultCache() {
  cachedSecrets = null;
}
