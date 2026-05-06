/**
 * Snowflake handlers: per-user config CRUD + connection-test.
 *
 * The actual Cloud Functions handlers live in `index.js` (so deploy-time
 * options like region, secrets, and the VPC connector for static-IP egress
 * stay grouped with the other endpoints). This module owns the small bits
 * of business logic so it can be unit-tested without spinning up the HTTPS
 * runtime.
 *
 * Static-IP egress: the handlers in index.js attach the `snowflake-egress`
 * Serverless VPC connector with `vpcConnectorEgressSettings: 'ALL_TRAFFIC'`,
 * which is what makes outbound traffic exit Cloud NAT through the reserved
 * IPv4. See docs/SNOWFLAKE_INTEGRATION.md for the one-time provisioning.
 */

'use strict';

const crypto = require('crypto');
const store = require('./snowflakeConnectionStore');

/**
 * snowflake-sdk JWT auth expects PKCS#8 PEM. Keys from OpenSSL / Snowflake
 * docs are often PKCS#1 (`BEGIN RSA PRIVATE KEY`) or encrypted PKCS#8
 * (`BEGIN ENCRYPTED PRIVATE KEY`). Node parses those and re-exports PKCS#8
 * PEM (unencrypted) for the driver — passphrase is only used for decrypting
 * the incoming PEM, not sent to Snowflake separately after normalization.
 *
 * @param {string} credentialPem
 * @param {string|undefined} passphrase
 * @returns {string}
 */
function normalizePrivateKeyForSnowflake(credentialPem, passphrase) {
  const raw = String(credentialPem || '').trim();
  if (!raw) {
    const err = new Error('Private key is empty');
    err.code = 'PRIVATE_KEY_EMPTY';
    throw err;
  }
  const pass = passphrase && String(passphrase).length ? String(passphrase) : undefined;
  let keyObject;
  try {
    keyObject = crypto.createPrivateKey(
      pass
        ? {
            key: raw,
            format: 'pem',
            passphrase: pass,
          }
        : {
            key: raw,
            format: 'pem',
          }
    );
  } catch (e) {
    const wrap = new Error(
      'Could not parse private key as PEM. Snowflake JWT auth needs a PEM private key ' +
        '(PKCS#8 or PKCS#1). If the key is encrypted, set the passphrase field. ' +
        'Detail: ' +
        ((e && e.message) || String(e))
    );
    wrap.code = 'PRIVATE_KEY_PARSE';
    wrap.cause = e;
    throw wrap;
  }
  return keyObject.export({
    type: 'pkcs8',
    format: 'pem',
  });
}

/** Public projection of a stored config — never includes the credential. */
function publicConfig(record) {
  if (!record) return null;
  return {
    sandbox: record.sandbox || '',
    labUser: record.labUser || '',
    account: record.account || '',
    user: record.user || '',
    role: record.role || '',
    warehouse: record.warehouse || '',
    database: record.database || '',
    schema: record.schema || '',
    authMethod: record.authMethod || 'password',
    hasCredential: !!record.hasCredential,
    hasPassphrase: !!record.hasPassphrase,
    credentialSetAt: record.credentialSetAt || null,
    updatedAt:
      record.updatedAt && typeof record.updatedAt.toDate === 'function'
        ? record.updatedAt.toDate().toISOString()
        : record.updatedAt || null,
    updatedBy: record.updatedBy || null,
  };
}

/**
 * Build connection options for the snowflake-sdk client from a resolved
 * connection record (cfg + credential + optional passphrase). Keeps key-pair
 * decoding at the edge so we never log the PEM body.
 *
 * @param {{ config: object, credential: string, passphrase?: string }} resolved
 */
function buildSnowflakeConnectOptions(resolved) {
  const cfg = resolved.config;
  const opts = {
    account: cfg.account,
    username: cfg.user,
    role: cfg.role || undefined,
    warehouse: cfg.warehouse || undefined,
    database: cfg.database || undefined,
    schema: cfg.schema || undefined,
    application: 'AEP_ORCHESTRATION_LAB',
  };
  switch (cfg.authMethod) {
    case 'pat':
      // PAT == programmatic access token; supplied via the password field.
      opts.password = resolved.credential;
      break;
    case 'keyPair': {
      opts.authenticator = 'SNOWFLAKE_JWT';
      const pkcs8Pem = normalizePrivateKeyForSnowflake(
        resolved.credential,
        resolved.passphrase
      );
      opts.privateKey = pkcs8Pem;
      break;
    }
    case 'password':
    default:
      opts.password = resolved.credential;
      break;
  }
  return opts;
}

function describeConnectError(err) {
  const msg = (err && err.message) ? String(err.message) : String(err || 'unknown error');
  const hints = [];
  if (/network policy|IP|access is restricted|allowlist/i.test(msg)) {
    hints.push(
      'Snowflake rejected the inbound IP. Add the lab\'s static egress address ' +
      '(see docs/SNOWFLAKE_INTEGRATION.md) to your Snowflake NETWORK POLICY.'
    );
  }
  if (/JWT|private key|passphrase|pkcs8|pem format/i.test(msg)) {
    hints.push(
      'Key-pair auth: paste or upload a PEM private key. PKCS#1 (RSA PRIVATE KEY) and ' +
        'encrypted PKCS#8 are converted to PKCS#8 automatically — ensure the passphrase matches if the key is encrypted.'
    );
  }
  if (/incorrect username or password|authentication/i.test(msg)) {
    hints.push('Verify the username/password, or that the PAT has not expired.');
  }
  return {
    message: msg,
    code: (err && (err.code || err.errno)) || null,
    sqlState: (err && err.sqlState) || null,
    hints,
  };
}

/**
 * Open a Snowflake connection, run a single SELECT to confirm round-trip,
 * and tear down. Returns a structured success or a structured error.
 *
 * @param {{ config: object, credential: string, passphrase?: string }} resolved
 * @returns {Promise<{ ok: true, version: string, account: string, warehouse: string|null, database: string|null, schema: string|null } | { ok: false, error: object }>}
 */
async function runConnectionTest(resolved) {
  let snowflake;
  try {
    snowflake = require('snowflake-sdk');
  } catch (e) {
    return {
      ok: false,
      error: {
        message:
          'snowflake-sdk is not installed in the Cloud Functions package. Add it to functions/package.json and redeploy.',
        code: 'SDK_MISSING',
        sqlState: null,
        hints: [],
      },
    };
  }

  let options;
  try {
    options = buildSnowflakeConnectOptions(resolved);
  } catch (e) {
    return Promise.resolve({ ok: false, error: describeConnectError(e) });
  }
  return new Promise((resolve) => {
    const conn = snowflake.createConnection(options);
    conn.connect((err) => {
      if (err) {
        resolve({ ok: false, error: describeConnectError(err) });
        return;
      }
      conn.execute({
        sqlText:
          'SELECT CURRENT_VERSION() AS VERSION, CURRENT_ACCOUNT() AS ACCOUNT, CURRENT_WAREHOUSE() AS WAREHOUSE, CURRENT_DATABASE() AS DATABASE, CURRENT_SCHEMA() AS SCHEMA',
        complete(execErr, _stmt, rows) {
          try {
            if (execErr) {
              resolve({ ok: false, error: describeConnectError(execErr) });
              return;
            }
            const row = (rows && rows[0]) || {};
            resolve({
              ok: true,
              version: String(row.VERSION || ''),
              account: String(row.ACCOUNT || ''),
              warehouse: row.WAREHOUSE != null ? String(row.WAREHOUSE) : null,
              database: row.DATABASE != null ? String(row.DATABASE) : null,
              schema: row.SCHEMA != null ? String(row.SCHEMA) : null,
            });
          } finally {
            try { conn.destroy(() => {}); } catch (_) { /* noop */ }
          }
        },
      });
    });
  });
}

/** GET /api/snowflake/config?sandbox=… → public config for current lab user */
async function handleConfigGet({ labUser, sandbox }) {
  const record = await store.getConfig(labUser, sandbox);
  return publicConfig(record);
}

/**
 * POST /api/snowflake/config — body: { sandbox, account, user, role, warehouse, database, schema, authMethod, credential?, keyPassphrase?, clearCredential?, clearKeyPassphrase? }
 *
 * Returns the public projection of the post-write record (never the secret).
 */
async function handleConfigPut({ labUser, sandbox, payload }) {
  const record = await store.updateConfig(labUser, sandbox, payload);
  return publicConfig(record);
}

/** POST /api/snowflake/connection-test — opens a connection using the saved record. */
async function handleConnectionTest({ labUser, sandbox }) {
  const resolved = await store.resolveConnection(labUser, sandbox);
  if (!resolved) {
    return {
      ok: false,
      error: {
        message:
          'No Snowflake credential saved for this user/sandbox yet. Save the connection first, then test.',
        code: 'NO_CREDENTIAL',
        sqlState: null,
        hints: [],
      },
    };
  }
  const result = await runConnectionTest(resolved);
  if (result.ok) {
    return {
      ok: true,
      version: result.version,
      account: result.account,
      warehouse: result.warehouse,
      database: result.database,
      schema: result.schema,
      authMethod: resolved.config.authMethod,
    };
  }
  return result;
}

module.exports = {
  publicConfig,
  buildSnowflakeConnectOptions,
  normalizePrivateKeyForSnowflake,
  describeConnectError,
  runConnectionTest,
  handleConfigGet,
  handleConfigPut,
  handleConnectionTest,
};
