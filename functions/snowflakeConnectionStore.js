/**
 * Per-lab-user, per-AEP-sandbox Snowflake connection store.
 *
 * - Firestore: snowflakeConnections/{labUser__sandbox} — non-secret config:
 *     account, user, role, warehouse, database, schema, authMethod,
 *     hasCredential, credentialSetAt, updatedBy, updatedAt.
 *   The credential value itself is NEVER written to Firestore.
 *
 * - Secret Manager: stores the credential. One secret per labUser+sandbox:
 *     snowflake-cred-<labUserSlug>-<sandboxSlug>
 *   For password / pat auth → a single string.
 *   For keyPair auth → the full PEM-encoded private key
 *   (passphrase is stored in a sibling secret with `-pass` suffix).
 *
 * Access only from Cloud Functions (Admin SDK + Secret Manager IAM); the
 * Firestore client SDK is denied by security rules. The lab user identity
 * resolves from the Authorization Bearer ID token (see
 * labUserSandboxStore.verifyIdTokenFromRequest), which means each visitor
 * configures their own Snowflake target without overwriting anyone else's.
 */

'use strict';

const admin = require('firebase-admin');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const COLLECTION = 'snowflakeConnections';
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'aep-orchestration-lab';
const SECRET_PREFIX = 'snowflake-cred';

const ALLOWED_AUTH_METHODS = new Set(['password', 'pat', 'keyPair']);

const MAX = {
  account: 256,
  user: 128,
  role: 128,
  warehouse: 128,
  database: 128,
  schema: 128,
  credential: 16384,
  passphrase: 256,
};

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

function safeSlug(value, fallback) {
  const v = String(value == null ? '' : value).toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 60);
  return v || fallback;
}

function docId(labUser, sandbox) {
  const u = safeSlug(labUser, 'anon');
  const s = safeSlug(sandbox, 'default');
  return `${u}__${s}`.slice(0, 700);
}

function secretId(labUser, sandbox, suffix) {
  const tail = suffix ? `-${suffix}` : '';
  return `${SECRET_PREFIX}-${safeSlug(labUser, 'anon')}-${safeSlug(sandbox, 'default')}${tail}`;
}

function secretResourceName(labUser, sandbox, suffix) {
  return `projects/${PROJECT_ID}/secrets/${secretId(labUser, sandbox, suffix)}`;
}

function trimField(val, max) {
  if (val == null) return '';
  return String(val).trim().slice(0, max);
}

function pickAuthMethod(value, fallback) {
  return ALLOWED_AUTH_METHODS.has(value) ? value : fallback;
}

async function secretExists(labUser, sandbox, suffix) {
  try {
    await getSecretClient().getSecret({ name: secretResourceName(labUser, sandbox, suffix) });
    return true;
  } catch (e) {
    if (e && (e.code === 5 || /NOT_FOUND/i.test(String(e.message)))) return false;
    throw e;
  }
}

async function readSecret(labUser, sandbox, suffix) {
  const name = `${secretResourceName(labUser, sandbox, suffix)}/versions/latest`;
  try {
    const [version] = await getSecretClient().accessSecretVersion({ name });
    const data = version && version.payload && version.payload.data;
    return data ? Buffer.from(data).toString('utf8') : '';
  } catch (e) {
    if (e && (e.code === 5 || /NOT_FOUND/i.test(String(e.message)))) return '';
    throw e;
  }
}

async function writeSecret(labUser, sandbox, value, suffix) {
  const client = getSecretClient();
  const parent = `projects/${PROJECT_ID}`;
  const id = secretId(labUser, sandbox, suffix);
  try {
    await client.getSecret({ name: secretResourceName(labUser, sandbox, suffix) });
  } catch (e) {
    if (e && (e.code === 5 || /NOT_FOUND/i.test(String(e.message)))) {
      await client.createSecret({
        parent,
        secretId: id,
        secret: {
          replication: { automatic: {} },
          labels: {
            app: 'snowflake-cred',
            lab_user: safeSlug(labUser, 'anon'),
            sandbox: safeSlug(sandbox, 'default'),
            suffix: suffix ? safeSlug(suffix, 'main') : 'main',
          },
        },
      });
    } else {
      throw e;
    }
  }
  const [version] = await client.addSecretVersion({
    parent: secretResourceName(labUser, sandbox, suffix),
    payload: { data: Buffer.from(value, 'utf8') },
  });
  return version && version.name;
}

async function deleteSecretIfExists(labUser, sandbox, suffix) {
  try {
    await getSecretClient().deleteSecret({ name: secretResourceName(labUser, sandbox, suffix) });
    return true;
  } catch (e) {
    if (e && (e.code === 5 || /NOT_FOUND/i.test(String(e.message)))) return false;
    throw e;
  }
}

/**
 * Read the public (non-secret) config for a given lab user + sandbox.
 * Always also reports whether a credential is currently stored, by checking
 * Secret Manager directly (handles manual secret deletions).
 *
 * @param {string} labUser
 * @param {string} sandbox
 */
async function getConfig(labUser, sandbox) {
  const u = String(labUser || '').trim();
  const s = String(sandbox || '').trim();
  if (!s) throw new Error('sandbox is required');
  const ref = getDb().collection(COLLECTION).doc(docId(u, s));
  const snap = await ref.get();
  const data = (snap.exists ? snap.data() : null) || {};
  const authMethod = pickAuthMethod(data.authMethod, 'password');
  const [hasCredential, hasPassphrase] = await Promise.all([
    secretExists(u, s, ''),
    authMethod === 'keyPair' ? secretExists(u, s, 'pass') : Promise.resolve(false),
  ]);
  return {
    sandbox: s,
    labUser: u,
    account: data.account || '',
    user: data.user || '',
    role: data.role || '',
    warehouse: data.warehouse || '',
    database: data.database || '',
    schema: data.schema || '',
    authMethod,
    hasCredential,
    hasPassphrase,
    credentialSetAt: data.credentialSetAt || null,
    updatedAt: data.updatedAt || null,
    updatedBy: data.updatedBy || null,
  };
}

/**
 * Apply a mutation to a lab user's Snowflake config in a sandbox.
 * payload may include:
 *   - account, user, role, warehouse, database, schema (strings)
 *   - authMethod: "password" | "pat" | "keyPair"
 *   - credential: string → stored as a new secret version
 *   - keyPassphrase: string → stored only when authMethod === 'keyPair'
 *   - clearCredential: true → delete both credential + passphrase secrets
 *
 * @param {string} labUser
 * @param {string} sandbox
 * @param {object} payload
 */
async function updateConfig(labUser, sandbox, payload) {
  const u = String(labUser || '').trim();
  const s = String(sandbox || '').trim();
  if (!s) throw new Error('sandbox is required');
  const p = payload && typeof payload === 'object' ? payload : {};

  const ref = getDb().collection(COLLECTION).doc(docId(u, s));
  const now = admin.firestore.FieldValue.serverTimestamp();

  const set = { sandbox: s, labUser: u, updatedAt: now, updatedBy: u || 'anon' };

  if (p.account !== undefined) set.account = trimField(p.account, MAX.account);
  if (p.user !== undefined) set.user = trimField(p.user, MAX.user);
  if (p.role !== undefined) set.role = trimField(p.role, MAX.role);
  if (p.warehouse !== undefined) set.warehouse = trimField(p.warehouse, MAX.warehouse);
  if (p.database !== undefined) set.database = trimField(p.database, MAX.database);
  if (p.schema !== undefined) set.schema = trimField(p.schema, MAX.schema);

  let nextAuthMethod;
  if (p.authMethod !== undefined) {
    if (!ALLOWED_AUTH_METHODS.has(p.authMethod)) {
      throw new Error(`authMethod must be one of ${[...ALLOWED_AUTH_METHODS].join(', ')}`);
    }
    nextAuthMethod = p.authMethod;
    set.authMethod = nextAuthMethod;
  } else {
    const snap = await ref.get();
    nextAuthMethod = pickAuthMethod((snap.exists && snap.data() && snap.data().authMethod) || '', 'password');
  }

  if (p.clearCredential) {
    await deleteSecretIfExists(u, s, '');
    await deleteSecretIfExists(u, s, 'pass');
    set.credentialSetAt = null;
  } else if (typeof p.credential === 'string' && p.credential.trim().length > 0) {
    await writeSecret(u, s, p.credential.slice(0, MAX.credential), '');
    set.credentialSetAt = new Date().toISOString();
    if (nextAuthMethod === 'keyPair') {
      if (typeof p.keyPassphrase === 'string' && p.keyPassphrase.length > 0) {
        await writeSecret(u, s, p.keyPassphrase.slice(0, MAX.passphrase), 'pass');
      } else if (p.clearKeyPassphrase) {
        await deleteSecretIfExists(u, s, 'pass');
      }
    } else {
      await deleteSecretIfExists(u, s, 'pass');
    }
  } else if (typeof p.keyPassphrase === 'string' && p.keyPassphrase.length > 0 && nextAuthMethod === 'keyPair') {
    await writeSecret(u, s, p.keyPassphrase.slice(0, MAX.passphrase), 'pass');
  } else if (p.clearKeyPassphrase) {
    await deleteSecretIfExists(u, s, 'pass');
  }

  await ref.set(set, { merge: true });
  return getConfig(u, s);
}

/**
 * Resolve the connection material for a given lab user + sandbox so the
 * caller can open a Snowflake connection. Returns null if no credential
 * has been stored yet.
 *
 * @param {string} labUser
 * @param {string} sandbox
 */
async function resolveConnection(labUser, sandbox) {
  const cfg = await getConfig(labUser, sandbox);
  if (!cfg.hasCredential) return null;
  const credential = await readSecret(labUser, sandbox, '');
  if (!credential) return null;
  let passphrase = '';
  if (cfg.authMethod === 'keyPair' && cfg.hasPassphrase) {
    passphrase = await readSecret(labUser, sandbox, 'pass');
  }
  return {
    config: cfg,
    credential,
    passphrase,
  };
}

module.exports = {
  COLLECTION,
  ALLOWED_AUTH_METHODS,
  docId,
  getConfig,
  updateConfig,
  resolveConnection,
};
