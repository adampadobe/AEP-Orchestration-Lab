/**
 * Per-sandbox LLM provider config for the brand scraper.
 * - Firestore: brandScraperSandboxConfig/{sandbox} — stores which provider
 *   is preferred and a pointer (secret name) per provider. Never stores
 *   the key value.
 * - Secret Manager: stores the actual API keys. Secret id pattern:
 *     brand-scraper-<provider>-<sandbox-slug>
 */

'use strict';

const admin = require('firebase-admin');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const COLLECTION = 'brandScraperSandboxConfig';
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'aep-orchestration-lab';
const SECRET_PREFIX = 'brand-scraper';
const ALLOWED_PROVIDERS = new Set(['default', 'anthropic', 'openai']);
const SUPPORTED_KEY_PROVIDERS = ['anthropic', 'openai'];

let db;
function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

let secretClient;
function getSecretClient() {
  if (!secretClient) secretClient = new SecretManagerServiceClient();
  return secretClient;
}

function safeSandboxSlug(sandbox) {
  return String(sandbox || 'default').toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 60);
}

function secretId(provider, sandbox) {
  return `${SECRET_PREFIX}-${provider}-${safeSandboxSlug(sandbox)}`;
}

function secretName(provider, sandbox) {
  return `projects/${PROJECT_ID}/secrets/${secretId(provider, sandbox)}`;
}

async function secretExists(provider, sandbox) {
  try {
    await getSecretClient().getSecret({ name: secretName(provider, sandbox) });
    return true;
  } catch (e) {
    if (e && (e.code === 5 || /NOT_FOUND/i.test(String(e.message)))) return false;
    throw e;
  }
}

async function readSecret(provider, sandbox) {
  const name = `${secretName(provider, sandbox)}/versions/latest`;
  try {
    const [version] = await getSecretClient().accessSecretVersion({ name });
    const data = version && version.payload && version.payload.data;
    return data ? Buffer.from(data).toString('utf8') : '';
  } catch (e) {
    if (e && (e.code === 5 || /NOT_FOUND/i.test(String(e.message)))) return '';
    throw e;
  }
}

async function writeSecret(provider, sandbox, value) {
  const client = getSecretClient();
  const parent = `projects/${PROJECT_ID}`;
  const id = secretId(provider, sandbox);
  // Create if missing, then add a new version.
  try {
    await client.getSecret({ name: secretName(provider, sandbox) });
  } catch (e) {
    if (e && (e.code === 5 || /NOT_FOUND/i.test(String(e.message)))) {
      await client.createSecret({
        parent,
        secretId: id,
        secret: {
          replication: { automatic: {} },
          labels: { app: 'brand-scraper', provider, sandbox: safeSandboxSlug(sandbox) },
        },
      });
    } else {
      throw e;
    }
  }
  const [version] = await client.addSecretVersion({
    parent: secretName(provider, sandbox),
    payload: { data: Buffer.from(value, 'utf8') },
  });
  return version && version.name;
}

async function deleteSecret(provider, sandbox) {
  try {
    await getSecretClient().deleteSecret({ name: secretName(provider, sandbox) });
    return true;
  } catch (e) {
    if (e && (e.code === 5 || /NOT_FOUND/i.test(String(e.message)))) return false;
    throw e;
  }
}

async function getConfig(sandbox) {
  const name = String(sandbox || '').trim();
  if (!name) throw new Error('sandbox is required');
  const ref = getDb().collection(COLLECTION).doc(name);
  const snap = await ref.get();
  const data = (snap.exists ? snap.data() : null) || {};
  const preferredProvider = ALLOWED_PROVIDERS.has(data.preferredProvider) ? data.preferredProvider : 'default';
  // Existence check in Secret Manager is source of truth (covers manual deletions).
  const [hasAnthropicKey, hasOpenAIKey] = await Promise.all([
    secretExists('anthropic', name),
    secretExists('openai', name),
  ]);
  return {
    sandbox: name,
    preferredProvider,
    hasAnthropicKey,
    hasOpenAIKey,
    anthropicSetAt: (data.anthropic && data.anthropic.setAt) || null,
    openaiSetAt: (data.openai && data.openai.setAt) || null,
    updatedAt: data.updatedAt || null,
  };
}

/**
 * Apply a mutation to sandbox config.
 * payload may include:
 *   - preferredProvider: "default" | "anthropic" | "openai"
 *   - anthropicKey / openaiKey: string to store as a new secret version
 *   - clearAnthropicKey / clearOpenAIKey: true to delete the secret
 */
async function updateConfig(sandbox, payload) {
  const name = String(sandbox || '').trim();
  if (!name) throw new Error('sandbox is required');
  const pref = payload && payload.preferredProvider;
  if (pref && !ALLOWED_PROVIDERS.has(pref)) throw new Error(`preferredProvider must be one of ${[...ALLOWED_PROVIDERS].join(', ')}`);

  const ref = getDb().collection(COLLECTION).doc(name);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const set = {};
  if (pref) set.preferredProvider = pref;

  for (const provider of SUPPORTED_KEY_PROVIDERS) {
    const keyField = provider + 'Key';
    const clearField = 'clear' + provider[0].toUpperCase() + provider.slice(1) + 'Key';
    const keyValue = payload && payload[keyField];
    const shouldClear = !!(payload && payload[clearField]);

    if (typeof keyValue === 'string' && keyValue.trim().length > 0) {
      const versionName = await writeSecret(provider, name, keyValue.trim());
      set[provider] = { secretName: secretName(provider, name), setAt: new Date().toISOString(), versionName };
    } else if (shouldClear) {
      await deleteSecret(provider, name);
      set[provider] = admin.firestore.FieldValue.delete();
    }
  }

  await ref.set({ sandbox: name, updatedAt: now, ...set }, { merge: true });
  return getConfig(name);
}

/**
 * Resolve which provider + key to use for this sandbox. Returns:
 *   { provider: 'gemini' | 'anthropic' | 'openai', apiKey?: string, reason?: string }
 * - If the sandbox prefers anthropic/openai AND the secret exists → use it.
 * - Otherwise → default gemini path.
 */
async function resolveProviderForSandbox(sandbox) {
  const name = String(sandbox || '').trim();
  if (!name) return { provider: 'gemini', reason: 'no sandbox' };
  const ref = getDb().collection(COLLECTION).doc(name);
  const snap = await ref.get();
  const data = (snap.exists ? snap.data() : null) || {};
  const pref = ALLOWED_PROVIDERS.has(data.preferredProvider) ? data.preferredProvider : 'default';
  if (pref === 'default') return { provider: 'gemini', reason: 'sandbox uses default' };
  try {
    const apiKey = await readSecret(pref, name);
    if (!apiKey) return { provider: 'gemini', reason: `${pref} selected but key not stored — falling back to default` };
    return { provider: pref, apiKey };
  } catch (e) {
    return { provider: 'gemini', reason: `failed to read ${pref} secret: ${String(e && e.message || e)}` };
  }
}

module.exports = {
  getConfig,
  updateConfig,
  resolveProviderForSandbox,
  deleteSecret,
  ALLOWED_PROVIDERS,
  SUPPORTED_KEY_PROVIDERS,
};
