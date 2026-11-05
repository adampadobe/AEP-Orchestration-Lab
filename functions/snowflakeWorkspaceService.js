'use strict';

const crypto = require('node:crypto');
const P = require('./snowflakeWorkspacePolicy');
const {MAX_BYTES} = require('./snowflakeWorkspaceTransport');
const {ACTIONS, WorkspaceError, assert, fields, integer, uuid, hash, scopeId, identifier, quote} = P;
const ARGUMENTS = {
  capabilities: [], objects_list: ['kind', 'database', 'schema', 'limit'],
  object_describe: ['database', 'schema', 'name'], query_submit: ['sql', 'bindings', 'request_id'],
  query_status: ['job_id', 'offset', 'limit'], query_results: ['job_id', 'offset', 'limit'],
  query_cancel: ['job_id', 'offset', 'limit'], data_check: ['table', 'column', 'check'],
  change_preview: ['operation'], change_approve: ['preview_id'], change_apply: ['preview_id'],
  grants_inspect: ['role'], agents_list: [], agent_run: ['agent', 'message', 'thread_id', 'parent_message_id', 'request_id'],
};
const REQUIRED = {
  objects_list: ['kind'], object_describe: ['name'], query_submit: ['sql', 'request_id'],
  query_status: ['job_id'], query_results: ['job_id'], query_cancel: ['job_id'],
  data_check: ['table', 'check'], change_preview: ['operation'], change_approve: ['preview_id'],
  change_apply: ['preview_id'], agent_run: ['agent', 'message', 'request_id'],
};
const LIMITATIONS = [
  'AEP sandbox is not a Snowflake access boundary.',
  'Arbitrary SELECTs may read across databases allowed to the pinned least-privilege role; no schema-parser isolation is claimed.',
  'User queries require Snowflake CORTEX_CLIENT_READ_ONLY support and secondary roles NONE; unsupported sessions fail closed.',
  'Cortex agents are administrator allowlisted, not verified or inferred available; their tools may have side effects.',
  'Request idempotency retention is 24 hours; never reuse request IDs. Result rows and Cortex responses are not persisted.',
];
function createWorkspaceService(deps) {
  const {store, resolveConnection, provider} = deps;
  const now = deps.now || Date.now;
  const randomUUID = deps.randomUUID || crypto.randomUUID;
  const date = ms => new Date(ms);
  const owner = a => ({uid: a.principal.uid, sandbox: a.sandbox});
  const owned = (record, a) => assert(record && record.uid === a.principal.uid && record.sandbox === a.sandbox,
    'NOT_FOUND', 'Owned workspace record was not found.');
  async function load(a) {
    const policy = P.validatePolicy(await store.getPolicy(a.principal.uid, a.sandbox));
    const resolved = await resolveConnection(a.principal.uid, a.sandbox);
    return {policy, resolved, fingerprint: P.context(policy, resolved)};
  }
  const permission = (policy, key) => assert(policy[key] === true, 'PERMISSION_DENIED', `${key} permission is disabled.`);
  function page(a, policy) {
    return {offset: integer(a.offset, 0, 0, policy.maxRows - 1),
      limit: integer(a.limit, policy.maxRows, 1, policy.maxRows), maxBytes: MAX_BYTES};
  }
  function safeFailure(err) {
    if (err instanceof WorkspaceError) {
      const error = {code: err.code, message: err.message};
      if (err.provider_code) error.provider_code = err.provider_code;
      if (err.sqlState) error.sqlState = err.sqlState;
      return error;
    }
    return {code: 'WORKSPACE_ERROR', message: 'Workspace operation failed; no automatic retry was performed.'};
  }
  async function persistFailure(jobId, err) {
    const patch = {state: err.definitive ? 'failed' : 'unknown', error: safeFailure(err),
      updatedAt: date(now())};
    if (err.query_id) patch.query_id = err.query_id;
    try { await store.update('jobs', jobId, patch); }
    catch {
      const error = new WorkspaceError('AUDIT_UNAVAILABLE', 'Provider outcome could not be durably recorded; reconciliation is required.');
      error.job_id = jobId;
      error.query_id = err.query_id;
      error.state = 'unknown';
      throw error;
    }
  }
  function jobResult(jobId, job, replayed = false) {
    const result = {ok: true, job_id: jobId, state: job.state, replayed};
    if (job.query_id) result.query_id = job.query_id;
    if (job.state === 'failed') return {...result, ok: false, error: job.error || {code: 'PROVIDER_ERROR', message: 'Provider rejected this operation.'}};
    if (['reserved', 'submitting', 'unknown'].includes(job.state)) return {...result, ok: false,
      reconciliation_required: true, error: {code: 'RECONCILIATION_REQUIRED', message: 'Submission outcome is not confirmed. This request will not be executed again.'}};
    if (job.type === 'agent') result.response_retained = false;
    return result;
  }
  async function reserve(a, ctx, type, payload) {
    const requestId = uuid(a.request_id);
    const id = hash(`${scopeId(a.principal.uid, a.sandbox)}\0${requestId}`);
    const requestHash = hash({type, payload});
    const job = {...owner(a), type, request_id: requestId, requestHash, fingerprint: ctx.fingerprint,
      state: 'reserved', createdAt: date(now()), updatedAt: date(now()), expireAt: date(now() + 86400000)};
    if (await store.create('jobs', id, job)) return {id, job, fresh: true};
    const previous = await store.get('jobs', id);
    owned(previous, a);
    assert(previous.requestHash === requestHash && previous.type === type, 'REQUEST_ID_CONFLICT', 'request_id was used for a different request.');
    assert(previous.fingerprint === ctx.fingerprint, 'STALE_CONTEXT', 'Job connection or policy has changed; reconcile the original context.');
    return {id, job: previous, fresh: false};
  }
  async function getJob(a, ctx) {
    assert(typeof a.job_id === 'string' && /^[a-f0-9]{64}$/.test(a.job_id), 'INVALID_INPUT', 'Invalid job_id.');
    const job = await store.get('jobs', a.job_id);
    owned(job, a);
    assert(job.fingerprint === ctx.fingerprint, 'STALE_CONTEXT', 'Saved job context no longer matches policy and connection.');
    return job;
  }
  async function getPreview(a, ctx) {
    uuid(a.preview_id);
    const preview = await store.get('previews', a.preview_id);
    owned(preview, a);
    const expires = typeof preview.expiresAt?.toMillis === 'function' ? preview.expiresAt.toMillis() : new Date(preview.expiresAt).getTime();
    assert(Number.isFinite(expires) && expires > now(), 'PREVIEW_EXPIRED', 'Change preview expired; create and approve a new preview.');
    assert(preview.fingerprint === ctx.fingerprint, 'STALE_CONTEXT', 'Preview connection or policy changed; create a new preview.');
    const compiled = P.compileOperation(preview.operation, ctx.policy);
    assert(hash(compiled) === preview.compiledHash, 'PREVIEW_CHANGED', 'Stored preview is inconsistent.');
    return {preview, compiled};
  }
  async function read(a, ctx, sql, bindings = []) {
    permission(ctx.policy, 'read');
    const paging = page(a, ctx.policy);
    paging.limit = Math.min(paging.limit, ctx.policy.maxRows - paging.offset);
    return {ok: true, ...await provider.read(ctx.resolved, ctx.policy, sql, bindings, paging)};
  }
  async function dispatch(a) {
    fields(a, ['principal', 'sandbox', 'action', ...(ARGUMENTS[a?.action] || [])],
      ['principal', 'sandbox', 'action', ...(REQUIRED[a?.action] || [])]);
    fields(a.principal, ['uid', 'authSource'], ['uid', 'authSource']);
    assert(typeof a.principal.uid === 'string' && a.principal.uid.length > 0 && a.principal.uid.length <= 256 &&
      !/[\0-\x1f]/.test(a.principal.uid), 'INVALID_PRINCIPAL', 'Authenticated principal uid is required.');
    assert(['firebase', 'mcp_key', 'ims'].includes(a.principal.authSource), 'INVALID_PRINCIPAL', 'Unsupported authentication source.');
    assert(typeof a.sandbox === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(a.sandbox),
      'INVALID_INPUT', 'A sandbox identifier is required.');
    assert(ACTIONS.includes(a.action), 'INVALID_ACTION', 'Unsupported workspace action.');
    if (a.action === 'change_approve') assert(a.principal.authSource === 'firebase',
      'HUMAN_APPROVAL_REQUIRED', 'Approval requires the authenticated Firebase portal, not MCP or IMS.');
    if (a.action === 'capabilities') {
      const policy = await store.getPolicy(a.principal.uid, a.sandbox);
      if (!policy || policy.enabled !== true) return {ok: true, available: false,
        reason: 'Workspace is not enabled by an administrator.', actions: [], limitations: LIMITATIONS};
    }
    const ctx = await load(a), {policy, resolved, fingerprint} = ctx;
    switch (a.action) {
      case 'capabilities':
        return {ok: true, available: true, read: policy.read, write: policy.write, grants: policy.grants,
          agents: policy.agents, maxRows: policy.maxRows, timeoutSeconds: policy.timeoutSeconds,
          actions: ACTIONS.filter(action => action !== 'change_approve' || a.principal.authSource === 'firebase'),
          limitations: LIMITATIONS};
      case 'agents_list':
        return {ok: true, agents: policy.agents.map(agent => ({agent, visible: true, verified: false})),
          warning: 'Configured allowlist only; Snowflake availability has not been probed.'};
      case 'objects_list': {
        assert(['tables', 'views', 'schemas'].includes(a.kind), 'INVALID_INPUT', 'kind must be tables, views or schemas.');
        assert(a.database === undefined || a.database === policy.database, 'SCOPE_DENIED', 'Database must equal policy database.');
        assert(a.schema === undefined || a.schema === policy.schema, 'SCOPE_DENIED', 'Schema must equal policy schema.');
        const db = quote(policy.database);
        const sql = a.kind === 'schemas' ?
          `SELECT SCHEMA_NAME FROM ${db}.INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ? LIMIT ?` :
          `SELECT TABLE_CATALOG, TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE FROM ${db}.INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = ? LIMIT ?`;
        const limit = integer(a.limit, policy.maxRows, 1, policy.maxRows);
        return read(a, ctx, sql, a.kind === 'schemas' ? [policy.schema, limit] :
          [policy.schema, a.kind === 'views' ? 'VIEW' : 'BASE TABLE', limit]);
      }
      case 'object_describe':
        assert(a.database === undefined || a.database === policy.database, 'SCOPE_DENIED', 'Database must equal policy database.');
        assert(a.schema === undefined || a.schema === policy.schema, 'SCOPE_DENIED', 'Schema must equal policy schema.');
        identifier(a.name);
        return read(a, ctx, `DESCRIBE TABLE ${P.tableName(a.name, policy)}`);
      case 'data_check': {
        const table = P.tableName(a.table, policy);
        assert(['row_count', 'null_count', 'duplicates', 'freshness'].includes(a.check), 'INVALID_INPUT', 'Unsupported data check.');
        if (a.column !== undefined) identifier(a.column);
        assert(a.check === 'row_count' || a.column, 'INVALID_INPUT', 'This check requires a column.');
        const col = a.column ? quote(a.column) : '';
        const sql = {
          row_count: `SELECT COUNT(*) AS ROW_COUNT FROM ${table}`,
          null_count: `SELECT COUNT(*) AS NULL_COUNT FROM ${table} WHERE ${col} IS NULL`,
          duplicates: `SELECT ${col}, COUNT(*) AS DUPLICATE_COUNT FROM ${table} GROUP BY ${col} HAVING COUNT(*) > 1 LIMIT ${policy.maxRows}`,
          freshness: `SELECT MAX(${col}) AS MAX_TIMESTAMP FROM ${table}`,
        }[a.check];
        return read(a, ctx, sql);
      }
      case 'grants_inspect': {
        const role = a.role === undefined ? policy.role : identifier(a.role);
        assert(role === policy.role || (policy.grants && policy.grantRoles.includes(role)), 'PERMISSION_DENIED', 'Role inspection is not allowlisted.');
        return read(a, ctx, `SHOW GRANTS TO ROLE ${quote(role)}`);
      }
      case 'query_submit': {
        permission(policy, 'read');
        P.readSql(a.sql);
        const bindings = a.bindings === undefined ? [] : a.bindings;
        assert(Array.isArray(bindings) && bindings.length <= 1000, 'INVALID_INPUT', 'bindings must be a bounded scalar array.');
        bindings.forEach(P.scalar);
        assert(Buffer.byteLength(JSON.stringify(bindings)) <= 131072, 'INVALID_INPUT', 'Bindings exceed 128 KiB.');
        const reservation = await reserve(a, ctx, 'query', {sql: a.sql, bindings});
        if (!reservation.fresh) return jobResult(reservation.id, reservation.job, true);
        const id = reservation.id;
        let queryId;
        try {
          await store.update('jobs', id, {state: 'submitting', updatedAt: date(now())});
          const result = await provider.submit(resolved, policy, a.sql, bindings, async acceptedId => {
            assert(typeof acceptedId === 'string' && acceptedId, 'PROVIDER_ERROR', 'Provider did not return a durable query ID.');
            queryId = acceptedId;
            await store.update('jobs', id, {state: 'submitted', query_id: acceptedId, updatedAt: date(now())});
          });
          queryId = result.query_id;
          assert(typeof result.query_id === 'string' && result.query_id.length > 0, 'PROVIDER_ERROR', 'Provider did not return a durable query ID.');
          await store.update('jobs', id, {state: 'submitted', query_id: result.query_id, updatedAt: date(now())});
          return {ok: true, job_id: id, state: 'submitted', query_id: result.query_id};
        } catch (err) {
          if (queryId) err.query_id = queryId;
          await persistFailure(id, err);
          return {...jobResult(id, await store.get('jobs', id)), error: safeFailure(err)};
        }
      }
      case 'query_status':
      case 'query_results':
      case 'query_cancel': {
        if (a.action !== 'query_status') permission(policy, 'read');
        const job = await getJob(a, ctx), paging = page(a, policy);
        if (a.action === 'query_status' && (job.type === 'agent' || (job.type === 'change' && (!job.query_id || !policy.read)))) {
          return jobResult(a.job_id, job);
        }
        permission(policy, 'read');
        assert(job.type === 'query' || (job.type === 'change' && a.action === 'query_status'),
          'INVALID_INPUT', 'Only SQL query jobs support results and cancellation.');
        if (!job.query_id) return jobResult(a.job_id, job);
        if (a.action === 'query_status') {
          const result = await provider.status(resolved, policy, job.query_id);
          const failed = ['FAILED_WITH_ERROR', 'FAILED_WITH_INCIDENT', 'ABORTED'].includes(result.status);
          const state = result.status === 'SUCCESS' ? 'succeeded' : failed ? 'failed' : job.state;
          const patch = {state, provider_status: String(result.status), updatedAt: date(now())};
          if (failed) patch.error = {code: 'QUERY_FAILED', message: `Snowflake query ended with ${result.status}.`};
          await store.update('jobs', a.job_id, patch);
          return {...jobResult(a.job_id, {...job, ...patch}), ...result,
            ...(['unknown', 'reserved', 'submitting'].includes(state) ? {reconciliation_required: true} : {})};
        }
        if (a.action === 'query_cancel') return {ok: true, job_id: a.job_id, ...await provider.cancel(resolved, policy, job.query_id)};
        paging.limit = Math.min(paging.limit, policy.maxRows - paging.offset);
        return {ok: true, job_id: a.job_id, ...await provider.results(resolved, policy, job.query_id, paging)};
      }
      case 'change_preview': {
        const compiled = P.compileOperation(a.operation, policy), previewId = randomUUID();
        const preview = {...owner(a), ...compiled, compiledHash: hash(compiled), fingerprint,
          state: 'previewed', createdAt: date(now()), expiresAt: date(now() + 600000), expireAt: date(now() + 600000)};
        assert(await store.create('previews', previewId, preview), 'STORE_CONFLICT', 'Could not reserve preview.');
        return {ok: true, preview_id: previewId, ...compiled, fingerprint: P.publicContext(policy), expiresAt: preview.expiresAt};
      }
      case 'change_approve': {
        const {preview} = await getPreview(a, ctx);
        assert(preview.state === 'previewed', 'ALREADY_CLAIMED', 'Preview is no longer awaiting approval.');
        assert(await store.transition('previews', a.preview_id, ['previewed'], {state: 'approved',
          approvedBy: a.principal.uid, approvedAuthSource: 'firebase', approvedAt: date(now())}),
        'ALREADY_CLAIMED', 'Preview approval state changed concurrently.');
        return {ok: true, preview_id: a.preview_id, approved: true};
      }
      case 'change_apply': {
        const {preview, compiled} = await getPreview(a, ctx);
        assert(preview.state === 'approved' && preview.approvedBy === a.principal.uid &&
          preview.approvedAuthSource === 'firebase', 'HUMAN_APPROVAL_REQUIRED', 'A recorded Firebase portal approval is required.');
        const id = hash(`${scopeId(a.principal.uid, a.sandbox)}\0change\0${a.preview_id}`);
        const job = {...owner(a), preview_id: a.preview_id, type: 'change', fingerprint,
          operation_kind: compiled.operation.kind, targets: compiled.targets, state: 'submitting',
          createdAt: date(now()), updatedAt: date(now()), expireAt: date(now() + 86400000)};
        await store.claimChange(a.preview_id, id, job);
        let result, executionStarted = false;
        try {
          // Re-resolve after the atomic durable intent, immediately before execution.
          const fresh = await load(a);
          assert(fresh.fingerprint === fingerprint, 'STALE_CONTEXT', 'Connection or policy changed before execution.');
          await getPreview(a, fresh);
          P.compileOperation(preview.operation, fresh.policy);
          executionStarted = true;
          result = await provider.mutate(fresh.resolved, fresh.policy, compiled.sql, compiled.bindings, async acceptedId => {
            assert(typeof acceptedId === 'string' && acceptedId, 'PROVIDER_ERROR', 'Provider did not return a durable query ID.');
            await store.update('jobs', id, {query_id: acceptedId, updatedAt: date(now())});
          });
          assert(typeof result.query_id === 'string' && result.query_id, 'PROVIDER_ERROR', 'Change outcome has no query ID; reconciliation is required.');
          await store.update('jobs', id, {state: 'succeeded', query_id: result.query_id,
            affected_rows: result.affected_rows ?? null, updatedAt: date(now())});
        } catch (err) {
          if (!executionStarted) err.definitive = true;
          if (result?.query_id) err.query_id = result.query_id;
          await persistFailure(id, err);
          return {...jobResult(id, await store.get('jobs', id)), preview_id: a.preview_id, error: safeFailure(err)};
        }
        let verification;
        if (policy.read) {
          try {
              const checked = await provider.read(resolved, policy, compiled.readbackSql, compiled.readbackBindings, {limit: policy.maxRows, maxBytes: MAX_BYTES});
              let verified = false;
              if (compiled.readbackKind === 'matching_rows') {
                const count = Number(checked.rows[0]?.matching_rows);
                verified = Number.isFinite(count) && (compiled.operation.kind === 'delete' ? count === 0 : count > 0);
              } else if (compiled.readbackKind === 'object_metadata') {
                const expected = compiled.operation.kind === 'add_column' ? [compiled.operation.column] : compiled.operation.columns;
                verified = expected.every(column => checked.rows.some(row => row.name === column.name));
              } else {
                verified = compiled.operation.privileges.every(privilege => {
                  const present = checked.rows.some(row => row.privilege === privilege && row.grantee_name === compiled.operation.role);
                  return compiled.operation.kind === 'grant' ? present : !present;
                });
              }
              verification = {verified: verified && !checked.truncated, kind: compiled.readbackKind, ...checked,
                warning: 'Readback is a post-change snapshot, not transaction isolation or proof of rollback.'};
          } catch (err) { verification = {verified: false, error: safeFailure(err)}; }
        } else verification = {verified: false, reason: 'Readback disabled by read policy.'};
        return {ok: true, preview_id: a.preview_id, job_id: id, state: 'succeeded', ...result, verification};
      }
      case 'agent_run': {
        P.agentParts(a.agent);
        assert(policy.agents.includes(a.agent), 'PERMISSION_DENIED', 'Agent is not administrator allowlisted.');
        assert(['pat', 'keyPair', 'oauth'].includes(resolved.config.authMethod), 'CORTEX_AUTH_UNSUPPORTED', 'Cortex REST does not support password authentication.');
        assert(typeof a.message === 'string' && a.message.trim() && Buffer.byteLength(a.message) <= 32768,
          'INVALID_INPUT', 'message must be nonempty and at most 32 KiB.');
        assert((a.thread_id === undefined) === (a.parent_message_id === undefined), 'INVALID_INPUT', 'thread_id and parent_message_id must be supplied together.');
        if (a.thread_id !== undefined) {
          integer(a.thread_id, undefined, 0, Number.MAX_SAFE_INTEGER);
          integer(a.parent_message_id, undefined, 0, Number.MAX_SAFE_INTEGER);
        }
        const payload = {agent: a.agent, message: a.message};
        if (a.thread_id !== undefined) { payload.thread_id = a.thread_id; payload.parent_message_id = a.parent_message_id; }
        const reservation = await reserve(a, ctx, 'agent', payload);
        if (!reservation.fresh) return jobResult(reservation.id, reservation.job, true);
        const id = reservation.id;
        try {
          await store.update('jobs', id, {state: 'submitting', updatedAt: date(now())});
          const result = await provider.agent(resolved, policy, payload);
          await store.update('jobs', id, {state: 'succeeded', updatedAt: date(now())});
          return {ok: true, job_id: id, state: 'succeeded', ...result};
        } catch (err) {
          await persistFailure(id, err);
          return {...jobResult(id, await store.get('jobs', id)), error: safeFailure(err)};
        }
      }
      default: throw new WorkspaceError('INVALID_ACTION', 'Unsupported workspace action.');
    }
  }
  return {async handleWorkspace(input) {
    try { return await dispatch(input); }
    catch (err) {
      const result = {ok: false, error: safeFailure(err)};
      if (err instanceof WorkspaceError && err.job_id) {
        result.job_id = err.job_id; result.state = err.state;
        result.reconciliation_required = true;
        if (err.query_id) result.query_id = err.query_id;
      }
      return result;
    }
  }};
}
let defaultService;
async function handleWorkspace(input) {
  try {
    if (!defaultService) {
      const admin = require('firebase-admin');
      const {createFirestoreStore} = require('./snowflakeWorkspaceStore');
      const {createSdkProvider} = require('./snowflakeWorkspaceTransport');
      defaultService = createWorkspaceService({store: createFirestoreStore(admin.firestore()),
        resolveConnection: require('./snowflakeConnectionStore').resolveConnection,
        provider: createSdkProvider()});
    }
    return await defaultService.handleWorkspace(input);
  } catch {
    return {ok: false, error: {code: 'WORKSPACE_UNAVAILABLE', message: 'Workspace dependencies are unavailable; inspect the server configuration before retrying.'}};
  }
}
module.exports = {handleWorkspace, createWorkspaceService, ACTIONS, LIMITATIONS};
