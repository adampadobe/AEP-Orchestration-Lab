'use strict';

const crypto = require('node:crypto');
const {assert, WorkspaceError, agentParts} = require('./snowflakeWorkspacePolicy');
const MAX_BYTES = 1024 * 1024;
function providerError(err) {
  const result = new WorkspaceError('PROVIDER_ERROR', 'Snowflake rejected the operation or could not confirm its outcome.');
  // Provider messages can echo SQL, bound values, passwords or key material.
  if (/^[0-9]{3,10}$/.test(String(err?.code || '')) ||
    ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN'].includes(err?.code)) result.provider_code = String(err.code);
  if (/^[A-Z0-9]{5}$/.test(String(err?.sqlState || ''))) {
    result.sqlState = err.sqlState;
    result.definitive = true;
  }
  const queryId = err?.queryId || err?.queryID || err?.query_id;
  if (/^[A-Za-z0-9_-]{1,128}$/.test(String(queryId || ''))) result.query_id = queryId;
  return result;
}
function deadline(promise, seconds) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new WorkspaceError('PROVIDER_TIMEOUT', 'Provider outcome is unknown; reconciliation is required.')), seconds * 1000);
  })]).finally(() => clearTimeout(timer));
}
async function boundedRows(statement, {offset = 0, limit, maxBytes = MAX_BYTES}) {
  const rows = [];
  let bytes = 2, truncated = false;
  const stream = statement.streamRows({start: offset, end: offset + limit});
  try {
    for await (const row of stream) {
      if (rows.length >= limit) { truncated = true; break; }
      const size = Buffer.byteLength(JSON.stringify(row, (_, v) => typeof v === 'bigint' ? String(v) : v)) + 1;
      if (bytes + size > maxBytes) { truncated = true; break; }
      rows.push(row); bytes += size;
    }
  } finally { if (!stream.destroyed) stream.destroy(); }
  const total = statement.getNumRows?.();
  truncated ||= Number.isFinite(total) && total > offset + rows.length;
  return {rows, offset, limit, bytes, truncated,
    next_offset: truncated && rows.length ? offset + rows.length : null};
}
function createSdkProvider({sdk, buildOptions, fetchImpl = globalThis.fetch, now = Date.now} = {}) {
  sdk ||= require('snowflake-sdk');
  buildOptions ||= require('./snowflakeService').buildSnowflakeConnectOptions;
  const activeSessions = new WeakMap();
  const execute = (connection, sql, bindings = [], asyncExec = false) => new Promise((resolve, reject) => {
    if (activeSessions.get(connection) === false) {
      reject(new WorkspaceError('SESSION_CLOSED', 'Session has closed; no further statements may execute.'));
      return;
    }
    connection.execute({sqlText: sql, binds: bindings, asyncExec, streamResult: true,
      parameters: {MULTI_STATEMENT_COUNT: 1},
      complete(err, stmt) {
        if (err) {
          const safe = providerError(err);
          if (stmt?.getQueryId()) safe.query_id = stmt.getQueryId();
          reject(safe);
        } else resolve(stmt);
      }});
  });
  async function session(resolved, policy, readOnly, work) {
    const connection = sdk.createConnection({...buildOptions(resolved), streamResult: true,
      clientSessionKeepAlive: false, timeout: policy.timeoutSeconds * 1000});
    activeSessions.set(connection, true);
    let result, failure;
    try {
      await deadline(new Promise((resolve, reject) => connection.connect(err => err ? reject(providerError(err)) : resolve())), policy.timeoutSeconds);
      await deadline((async () => {
        await execute(connection, 'USE SECONDARY ROLES NONE');
        await execute(connection, `ALTER SESSION SET STATEMENT_TIMEOUT_IN_SECONDS = ${policy.timeoutSeconds}, MULTI_STATEMENT_COUNT = 1, ABORT_DETACHED_QUERY = FALSE`);
        const check = await execute(connection, 'SELECT CURRENT_USER() AS "user", CURRENT_ROLE() AS "role", CURRENT_WAREHOUSE() AS "warehouse", CURRENT_DATABASE() AS "database", CURRENT_SCHEMA() AS "schema"');
        const actual = (await boundedRows(check, {limit: 1})).rows[0];
        assert(actual && ['user', 'role', 'warehouse', 'database', 'schema'].every(k => actual[k] === policy[k]),
          'CONTEXT_MISMATCH', 'Snowflake session context differs from the administrator policy.');
        if (readOnly) {
          // Official managed-settings docs: irreversible in this session. Fail
          // closed if the account/driver cannot set it; there is no regex fallback.
          await execute(connection, 'ALTER SESSION SET CORTEX_CLIENT_READ_ONLY = TRUE');
        }
        assert(activeSessions.get(connection), 'SESSION_CLOSED', 'Session has closed.');
        result = await work(connection);
      })(), policy.timeoutSeconds);
    } catch (err) { failure = err instanceof WorkspaceError ? err : providerError(err); }
    activeSessions.set(connection, false);
    try {
      await deadline(new Promise((resolve, reject) => connection.destroy(err => err ? reject(providerError(err)) : resolve())), Math.min(policy.timeoutSeconds, 5));
    } catch (err) { failure ||= err; }
    if (failure) {
      if (result?.query_id) failure.query_id = result.query_id;
      throw failure;
    }
    return result;
  }
  return {
    read: (resolved, policy, sql, bindings, page) => session(resolved, policy, true,
      async c => {
        const stmt = await execute(c, sql, bindings);
        return {...await boundedRows(stmt, page), query_id: stmt.getQueryId()};
      }),
    submit: (resolved, policy, sql, bindings, onAccepted) => session(resolved, policy, true,
      async c => {
        const queryId = (await execute(c, sql, bindings, true)).getQueryId();
        try { if (onAccepted) await onAccepted(queryId); }
        catch (err) { err.query_id = queryId; throw err; }
        return {query_id: queryId};
      }),
    status: (resolved, policy, queryId) => session(resolved, policy, true,
      async c => ({status: await c.getQueryStatus(queryId)})),
    results: (resolved, policy, queryId, page) => session(resolved, policy, true,
      async c => {
        const stmt = await c.getResultsFromQueryId({queryId});
        return {...await boundedRows(stmt, page), query_id: queryId};
      }),
    cancel: (resolved, policy, queryId) => session(resolved, policy, true,
      async c => {
        const stmt = await execute(c, 'SELECT SYSTEM$CANCEL_QUERY(?) AS "cancellation"', [queryId]);
        return {...await boundedRows(stmt, {limit: 1}), query_id: queryId,
          warning: 'Cancellation was requested; inspect query_status for the final outcome.'};
      }),
    mutate: (resolved, policy, sql, bindings, onAccepted) => session(resolved, policy, false,
      async c => {
        const stmt = await execute(c, sql, bindings);
        try { if (onAccepted) await onAccepted(stmt.getQueryId()); }
        catch (err) { err.query_id = stmt.getQueryId(); throw err; }
        const affected = stmt.getNumUpdatedRows?.();
        return {query_id: stmt.getQueryId(), affected_rows: Number.isSafeInteger(affected) && affected >= 0 ? affected : null};
      }),
    async agent(resolved, policy, input) {
      const [database, schema, name] = agentParts(input.agent);
      const {token, type} = restToken(resolved, buildOptions, now);
      const body = {messages: [{role: 'user', content: [{type: 'text', text: input.message}]}], stream: false};
      if (input.thread_id !== undefined) {
        body.thread_id = input.thread_id; body.parent_message_id = input.parent_message_id;
      }
      const url = `https://${policy.account.toLowerCase()}.snowflakecomputing.com/api/v2/databases/${encodeURIComponent(database)}/schemas/${encodeURIComponent(schema)}/agents/${encodeURIComponent(name)}:run`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), policy.timeoutSeconds * 1000);
      try {
        const response = await fetchImpl(url, {method: 'POST', redirect: 'error', signal: controller.signal,
          headers: {'Content-Type': 'application/json', Accept: 'application/json',
            Authorization: `Bearer ${token}`, 'X-Snowflake-Authorization-Token-Type': type,
            'X-Snowflake-Role': policy.role}, body: JSON.stringify(body)});
        assert(response.status >= 200 && response.status < 300, 'CORTEX_HTTP_ERROR',
          `Cortex returned HTTP ${Number.isInteger(response.status) ? response.status : 'error'}; no automatic retry.`);
        assert(response.body, 'CORTEX_RESPONSE_ERROR', 'Cortex returned an empty response.');
        const chunks = []; let size = 0;
        for await (const chunk of response.body) {
          size += chunk.length;
          assert(size <= MAX_BYTES, 'RESULT_TOO_LARGE', 'Cortex response exceeded the one MiB limit; outcome requires reconciliation.');
          chunks.push(Buffer.from(chunk));
        }
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        assert(data && typeof data === 'object' && !Array.isArray(data), 'CORTEX_RESPONSE_ERROR', 'Expected a JSON Cortex response.');
        return {response: data, warning: 'Configured Cortex delegation can execute agent tools under its own Snowflake permissions; this is not formal A2A.'};
      } catch (err) {
        if (err instanceof WorkspaceError) throw err;
        throw new WorkspaceError('CORTEX_TRANSPORT_ERROR', 'Cortex outcome is unknown; reconciliation is required.');
      } finally { clearTimeout(timer); }
    },
  };
}
function restToken(resolved, buildOptions, now = Date.now) {
  const method = resolved.config.authMethod;
  if (method === 'pat') return {token: resolved.credential, type: 'PROGRAMMATIC_ACCESS_TOKEN'};
  if (method === 'oauth') return {token: resolved.credential, type: 'OAUTH'};
  assert(method === 'keyPair', 'CORTEX_AUTH_UNSUPPORTED', 'Cortex REST requires key-pair, PAT or OAuth authentication; password authentication is unsupported.');
  const key = crypto.createPrivateKey(buildOptions(resolved).privateKey);
  assert(key.asymmetricKeyType === 'rsa', 'CORTEX_AUTH_UNSUPPORTED', 'Snowflake JWT requires an RSA key.');
  const publicKey = crypto.createPublicKey(key).export({format: 'der', type: 'spki'});
  const fp = `SHA256:${crypto.createHash('sha256').update(publicKey).digest('base64')}`;
  // Account locators omit region/cloud suffixes; org-account identifiers retain
  // their hyphen. See SQL API key-pair authentication claim specification.
  const account = (resolved.config.account.includes('.global') ?
    resolved.config.account.replaceAll('.', '-') : resolved.config.account.split('.')[0]).toUpperCase();
  const subject = `${account}.${resolved.config.user.toUpperCase()}`;
  const issued = Math.floor(now() / 1000);
  const encode = v => Buffer.from(JSON.stringify(v)).toString('base64url');
  const content = `${encode({alg: 'RS256', typ: 'JWT'})}.${encode({iss: `${subject}.${fp}`, sub: subject, iat: issued, exp: issued + 300})}`;
  return {token: `${content}.${crypto.sign('RSA-SHA256', Buffer.from(content), key).toString('base64url')}`, type: 'KEYPAIR_JWT'};
}
module.exports = {MAX_BYTES, providerError, boundedRows, createSdkProvider, restToken};
