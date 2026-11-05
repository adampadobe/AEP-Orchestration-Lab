'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {createWorkspaceService} = require('../snowflakeWorkspaceService');
const P = require('../snowflakeWorkspacePolicy');

function harness(options = {}) {
  let time = 1700000000000;
  const policy = {enabled: true, account: 'org-account', user: 'USER', role: 'ROLE',
    warehouse: 'WH', database: 'DB', schema: 'SCHEMA', allowSharedCredential: false,
    read: true, write: true, grants: true, grantRoles: ['TARGET'], agents: ['DB.SCHEMA.AGENT'],
    timeoutSeconds: 30, maxRows: 10, ...options.policy};
  const resolved = {config: {...policy, credentialScope: 'user', authMethod: 'pat'},
    credential: 'offline-credential', ...options.resolved};
  const records = {jobs: new Map(), previews: new Map()};
  const copy = value => value ? structuredClone(value) : null;
  const store = {
    async getPolicy() { return copy(policy); },
    async get(kind, id) { return copy(records[kind].get(id)); },
    async create(kind, id, value) {
      if (records[kind].has(id)) return false;
      records[kind].set(id, copy(value)); return true;
    },
    async update(kind, id, patch) {
      assert(records[kind].has(id)); Object.assign(records[kind].get(id), copy(patch));
    },
    async transition(kind, id, expected, patch) {
      const value = records[kind].get(id);
      if (!value || !expected.includes(value.state)) return false;
      Object.assign(value, copy(patch)); return true;
    },
    async claimChange(previewId, jobId, job) {
      const preview = records.previews.get(previewId);
      P.assert(preview?.state === 'approved' && !records.jobs.has(jobId), 'ALREADY_CLAIMED', 'Already claimed.');
      preview.state = 'applying'; preview.job_id = jobId;
      records.jobs.set(jobId, copy(job));
    },
  };
  const calls = [];
  const provider = Object.fromEntries(['read', 'submit', 'status', 'results', 'cancel', 'mutate', 'agent'].map(method =>
    [method, async (...args) => {
      calls.push({method, args});
      if (options[method]) return options[method](...args);
      return {query_id: 'query-1', rows: [], status: 'SUCCESS', response: {thread_id: 7, citations: []}};
    }]));
  const service = createWorkspaceService({store, provider, now: () => time,
    resolveConnection: async () => resolved});
  const call = (action, args = {}, principal = {uid: 'u1', authSource: 'firebase'}, sandbox = 'sandbox') =>
    service.handleWorkspace({principal, sandbox, action, ...args});
  return {policy, resolved, records, store, calls, call, advance(ms) { time += ms; }};
}
const request = () => ({sql: 'SELECT 1', request_id: crypto.randomUUID()});
const insert = () => ({kind: 'insert', table: 'T', values: {ID: 1, TEXT: "x'); DROP TABLE T; --"}});
async function approved(h, operation = insert()) {
  const preview = await h.call('change_preview', {operation});
  assert.equal(preview.ok, true, JSON.stringify(preview));
  assert.equal((await h.call('change_approve', {preview_id: preview.preview_id})).ok, true);
  return preview;
}

test('disabled capabilities are explanatory and never resolve credentials or call provider', async () => {
  let resolved = false;
  const service = createWorkspaceService({store: {getPolicy: async () => null},
    resolveConnection: async () => { resolved = true; throw Error('must not resolve'); }});
  const result = await service.handleWorkspace({principal: {uid: 'u', authSource: 'firebase'}, sandbox: 's', action: 'capabilities'});
  assert.equal(result.available, false); assert.equal(resolved, false);
  const h = harness({policy: {enabled: false}});
  assert.equal((await h.call('query_submit', request())).error.code, 'POLICY_DISABLED');
  assert.equal(h.calls.length, 0);
});
test('principal, action, unknown fields, limits and policy fields fail closed', async () => {
  const h = harness();
  for (const [action, args] of [
    ['surprise', {}], ['capabilities', {approved: true}], ['objects_list', {kind: 'tables', limit: 11}],
    ['objects_list', {kind: 'users'}], ['object_describe', {name: 'T";DROP'}],
    ['data_check', {table: 'T', check: 'freshness'}], ['query_submit', {...request(), bindings: [{}]}],
    ['query_submit', {sql: 'SELECT 1', request_id: 'not-uuid'}],
  ]) assert.equal((await h.call(action, args)).ok, false);
  assert.equal((await h.call('capabilities', {}, {uid: '', authSource: 'firebase'})).ok, false);
  assert.equal((await h.call('capabilities', {}, {uid: 'u', authSource: 'unknown'})).ok, false);
  for (const key of ['role', 'database', 'schema', 'user', 'account', 'warehouse']) {
    const broken = harness({policy: {[key]: ''}});
    assert.equal((await broken.call('query_submit', request())).ok, false, key);
  }
  assert.equal(h.calls.length, 0);
});
test('all pinned config fields and credential scope are enforced exactly', async () => {
  for (const key of ['account', 'user', 'role', 'warehouse', 'database', 'schema']) {
    const h = harness(); h.resolved.config[key] = 'OTHER';
    assert.equal((await h.call('query_submit', request())).error.code, 'CONTEXT_MISMATCH', key);
  }
  const h = harness(); h.resolved.config.credentialScope = 'sandbox_shared';
  assert.equal((await h.call('query_submit', request())).error.code, 'SHARED_CREDENTIAL_DENIED');
  h.policy.allowSharedCredential = true;
  assert.equal((await h.call('query_submit', request())).ok, true);
  h.resolved.config.credentialScope = undefined;
  assert.equal((await h.call('query_submit', request())).error.code, 'CONNECTION_SCOPE');
});
test('SQL lexer accepts only bounded single SELECT/WITH and rejects context changes and unsafe tokens', () => {
  for (const sql of ['SELECT 1', "SELECT 'DELETE; DROP --' AS X", 'WITH t AS (SELECT 1) SELECT * FROM t',
    'SELECT * FROM OTHER_DB.PUBLIC.T']) assert.equal(P.readSql(sql), sql);
  for (const sql of ['SELECT 1; SELECT 2', 'SELECT 1;', '-- hi\nSELECT 1', 'SELECT /* hi */ 1',
    'CALL X()', 'USE ROLE ADMIN', 'WITH x AS (DELETE FROM T) SELECT 1', 'SELECT SYSTEM$CANCEL_QUERY(?)',
    'SELECT 1 INTO X', 'ALTER SESSION SET X=1', "SELECT 'unterminated", 'SELECT $$x$$', 'SELECT 1\0',
    'SELECT 1 UNION SELECT 2; GRANT SELECT ON TABLE T TO ROLE X']) {
    assert.throws(() => P.readSql(sql), {code: 'INVALID_SQL'}, sql);
  }
});
test('read permission covers every SQL read including status/results/cancel and grant inspection', async () => {
  const h = harness({policy: {read: false}});
  for (const [action, args] of [['query_submit', request()], ['objects_list', {kind: 'tables'}],
    ['object_describe', {name: 'T'}], ['data_check', {table: 'T', check: 'row_count'}],
    ['grants_inspect', {}], ...['query_status', 'query_results', 'query_cancel'].map(a => [a, {job_id: 'a'.repeat(64)}])]) {
    assert.equal((await h.call(action, args)).error.code, action === 'query_status' ? 'NOT_FOUND' : 'PERMISSION_DENIED', action);
  }
  assert.equal(h.calls.length, 0);
});
test('metadata and check SQL are fully qualified, values bound, freshness is MAX only', async () => {
  const h = harness();
  await h.call('objects_list', {kind: 'tables', limit: 3});
  assert.match(h.calls.at(-1).args[2], /"DB"\.INFORMATION_SCHEMA\.TABLES/);
  assert.deepEqual(h.calls.at(-1).args[3], ['SCHEMA', 'BASE TABLE', 3]);
  assert.equal((await h.call('objects_list', {kind: 'tables', database: 'OTHER'})).error.code, 'SCOPE_DENIED');
  await h.call('data_check', {table: 'T', column: 'TIME', check: 'freshness'});
  assert.equal(h.calls.at(-1).args[2], 'SELECT MAX("TIME") AS MAX_TIMESTAMP FROM "DB"."SCHEMA"."T"');
  assert.equal((await h.call('grants_inspect', {role: 'ADMIN'})).error.code, 'PERMISSION_DENIED');
});
test('query reserves before provider, durable replay never resubmits; content conflict rejected', async () => {
  const h = harness({submit: async () => {
    const record = [...h.records.jobs.values()][0];
    assert.equal(record.state, 'submitting');
    assert.equal(record.sql, undefined); assert.equal(record.bindings, undefined);
    return {query_id: 'query-1'};
  }});
  const args = request();
  const [a, b] = await Promise.all([h.call('query_submit', args), h.call('query_submit', args)]);
  assert.equal(h.calls.filter(c => c.method === 'submit').length, 1);
  const replay = await h.call('query_submit', args);
  assert.equal(replay.job_id, a.job_id || b.job_id);
  assert.equal(replay.replayed, true);
  assert.equal((await h.call('query_submit', {...args, sql: 'SELECT 2'})).error.code, 'REQUEST_ID_CONFLICT');
});
test('owned jobs cannot be used across uid/sandbox and changed credential/policy context is rejected', async () => {
  const h = harness();
  const result = await h.call('query_submit', request());
  for (const action of ['query_status', 'query_results', 'query_cancel']) {
    assert.equal((await h.call(action, {job_id: result.job_id}, {uid: 'u2', authSource: 'firebase'})).error.code, 'NOT_FOUND');
    assert.equal((await h.call(action, {job_id: result.job_id}, undefined, 'other')).error.code, 'NOT_FOUND');
  }
  assert.equal((await h.call('query_results', {job_id: result.job_id, limit: 2, offset: 9})).ok, true);
  assert.equal(h.calls.at(-1).args[3].limit, 1);
  h.resolved.credential = 'rotated';
  assert.equal((await h.call('query_status', {job_id: result.job_id})).error.code, 'STALE_CONTEXT');
});
test('ambiguous errors and reserved jobs require reconciliation and never reexecute', async () => {
  const h = harness({submit: async () => { throw Error('SECRET provider password'); }});
  const args = request(), first = await h.call('query_submit', args);
  assert.equal(first.ok, false); assert.equal(first.state, 'unknown');
  assert.equal(first.reconciliation_required, true); assert.doesNotMatch(JSON.stringify(first), /SECRET/);
  const replay = await h.call('query_submit', args);
  assert.equal(replay.error.code, 'RECONCILIATION_REQUIRED');
  h.records.jobs.get(first.job_id).state = 'reserved';
  assert.equal((await h.call('query_submit', args)).error.code, 'RECONCILIATION_REQUIRED');
  assert.equal(h.calls.length, 1);
});
test('typed operations enforce exact fields, simple identifiers, binds, scope and distinct permissions', () => {
  const h = harness();
  const compiled = P.compileOperation(insert(), h.policy);
  assert.doesNotMatch(compiled.sql, /DROP/);
  assert.deepEqual(compiled.bindings, [1, "x'); DROP TABLE T; --"]);
  const update = P.compileOperation({kind: 'update', table: 'T', values: {X: 2}, where: {ID: 1, N: null}}, h.policy);
  assert.match(update.sql, /"N" IS NULL/); assert.deepEqual(update.bindings, [2, 1]);
  for (const operation of [
    {kind: 'drop', table: 'T'}, {kind: 'delete', table: 'T', where: {}},
    {kind: 'insert', table: 'X.PUBLIC.T', values: {X: 1}},
    {kind: 'insert', table: 'T', values: {X: [1]}},
    {kind: 'create_table', table: 'T', columns: [{name: 'X', type: 'INT);DROP TABLE T'}]},
    {kind: 'create_table', table: 'T', columns: [{name: 'x', type: 'INT'}, {name: 'X', type: 'INT'}]},
    {kind: 'grant', table: 'T', role: 'ADMIN', privileges: ['SELECT']},
    {kind: 'grant', table: 'T', role: 'TARGET', privileges: ['OWNERSHIP']},
    {kind: 'grant', table: 'T', role: 'TARGET', privileges: ['SELECT'], grantOption: true},
  ]) assert.throws(() => P.compileOperation(operation, h.policy));
  assert.throws(() => P.compileOperation(insert(), {...h.policy, write: false}), {code: 'PERMISSION_DENIED'});
  assert.throws(() => P.compileOperation({kind: 'grant', table: 'T', role: 'TARGET', privileges: ['SELECT']},
    {...h.policy, grants: false}), {code: 'PERMISSION_DENIED'});
  assert.match(P.compileOperation({kind: 'add_column', table: 'T', column: {name: 'X', type: 'INT', nullable: false}}, h.policy).sql, /NOT NULL/);
});
test('approval is Firebase only, supplied booleans rejected, single-use apply is atomic under concurrency', async () => {
  const h = harness(), p = await h.call('change_preview', {operation: insert()});
  assert.equal((await h.call('change_apply', {preview_id: p.preview_id})).error.code, 'HUMAN_APPROVAL_REQUIRED');
  assert.equal((await h.call('change_approve', {preview_id: p.preview_id}, {uid: 'u1', authSource: 'mcp_key'})).error.code, 'HUMAN_APPROVAL_REQUIRED');
  assert.equal((await h.call('change_approve', {preview_id: p.preview_id}, {uid: 'u1', authSource: 'ims'})).error.code, 'HUMAN_APPROVAL_REQUIRED');
  assert.equal((await h.call('change_apply', {preview_id: p.preview_id, approved: true})).ok, false);
  await h.call('change_approve', {preview_id: p.preview_id});
  const results = await Promise.all([h.call('change_apply', {preview_id: p.preview_id}), h.call('change_apply', {preview_id: p.preview_id})]);
  assert.equal(results.filter(r => r.ok).length, 1);
  assert.equal(h.calls.filter(c => c.method === 'mutate').length, 1);
  assert.equal((await h.call('change_apply', {preview_id: p.preview_id})).ok, false);
});
test('preview ownership, expiry, tamper, config drift and revocation are checked before mutations', async () => {
  for (const change of ['expiry', 'credential', 'policy', 'tamper', 'owner']) {
    const h = harness(), p = await approved(h);
    if (change === 'expiry') h.advance(600001);
    if (change === 'credential') h.resolved.credential = 'changed';
    if (change === 'policy') h.policy.write = false;
    if (change === 'tamper') h.records.previews.get(p.preview_id).operation.values.ID = 9;
    const response = await h.call('change_apply', {preview_id: p.preview_id},
      change === 'owner' ? {uid: 'u2', authSource: 'firebase'} : undefined);
    assert.equal(response.ok, false, change);
    assert.equal(h.calls.filter(c => c.method === 'mutate').length, 0, change);
  }
});
test('durable mutation intent failure blocks execution; definitive and ambiguous outcomes are distinct', async () => {
  const h = harness(), p = await approved(h);
  h.store.claimChange = async () => { throw Error('offline'); };
  assert.equal((await h.call('change_apply', {preview_id: p.preview_id})).ok, false);
  assert.equal(h.calls.length, 0);
  for (const definitive of [true, false]) {
    const broken = harness({mutate: async () => {
      const e = new P.WorkspaceError('PROVIDER_ERROR', 'Provider rejected typed operation.');
      e.definitive = definitive; e.query_id = 'known-id'; throw e;
    }});
    const preview = await approved(broken), result = await broken.call('change_apply', {preview_id: preview.preview_id});
    assert.equal(result.state, definitive ? 'failed' : 'unknown');
    assert.equal(result.query_id, 'known-id');
    assert.equal((await broken.call('change_apply', {preview_id: preview.preview_id})).ok, false);
  }
});
test('grant/revoke previews have bounded privileges and SHOW GRANTS readback', async () => {
  for (const kind of ['grant', 'revoke']) {
    const h = harness(), p = await approved(h, {kind, table: 'DB.SCHEMA.T', role: 'TARGET', privileges: ['SELECT', 'INSERT']});
    const result = await h.call('change_apply', {preview_id: p.preview_id});
    assert.equal(result.state, 'succeeded');
    assert.equal(h.calls.at(-1).args[2], 'SHOW GRANTS ON TABLE "DB"."SCHEMA"."T"');
  }
});
test('readback failure is explicit without resubmitting successful mutation', async () => {
  const h = harness({read: async () => { throw Error('provider readback failed'); }});
  const p = await approved(h), result = await h.call('change_apply', {preview_id: p.preview_id});
  assert.equal(result.state, 'succeeded'); assert.equal(result.verification.verified, false);
  assert.equal(h.calls.filter(c => c.method === 'mutate').length, 1);
});
test('Cortex allowlist, paired thread validation, password unsupported, replay and response preservation', async () => {
  const h = harness({agent: async () => ({response: {thread_id: 42, message_id: 9,
    citations: [{source: 'test'}], warnings: ['warning']}})});
  const args = {agent: 'DB.SCHEMA.AGENT', message: 'Question', request_id: crypto.randomUUID(), thread_id: 1, parent_message_id: 0};
  assert.equal((await h.call('agents_list')).agents[0].verified, false);
  assert.equal((await h.call('agent_run', {...args, agent: 'DB.SCHEMA.OTHER'})).error.code, 'PERMISSION_DENIED');
  assert.equal((await h.call('agent_run', {...args, parent_message_id: undefined})).ok, false);
  assert.equal((await h.call('agent_run', {...args, thread_id: -1})).ok, false);
  const result = await h.call('agent_run', args);
  assert.equal(result.response.thread_id, 42); assert.equal(result.response.citations.length, 1);
  assert.equal((await h.call('agent_run', args)).replayed, true);
  assert.equal(h.calls.filter(c => c.method === 'agent').length, 1);
  const record = h.records.jobs.get(result.job_id);
  assert.equal(record.message, undefined); assert.equal(record.response, undefined);
  h.resolved.config.authMethod = 'password';
  assert.equal((await h.call('agent_run', {...args, request_id: crypto.randomUUID()})).error.code, 'CORTEX_AUTH_UNSUPPORTED');
});
test('Cortex ambiguous failure is durable and never retried', async () => {
  const h = harness({agent: async () => { throw Error('timeout'); }});
  const args = {agent: 'DB.SCHEMA.AGENT', message: 'Q', request_id: crypto.randomUUID()};
  const result = await h.call('agent_run', args);
  assert.equal(result.state, 'unknown');
  await h.call('agent_run', args);
  assert.equal(h.calls.length, 1);
});
test('policy malformed allowlists, booleans, host URLs and resource caps are rejected without provider calls', async () => {
  for (const patch of [{account: 'https://evil.example'}, {account: 'account/extra'}, {read: 'true'},
    {grantRoles: ['ADMIN; --']}, {agents: ['not-qualified']}, {maxRows: 100000}, {timeoutSeconds: 0}]) {
    const h = harness({policy: patch});
    assert.equal((await h.call('capabilities')).ok, false);
    assert.equal(h.calls.length, 0);
  }
});
test('status/results/cancel work for owned jobs and SUCCESS durably reconciles an unknown outcome', async () => {
  const h = harness(), query = await h.call('query_submit', request());
  h.records.jobs.get(query.job_id).state = 'unknown';
  const status = await h.call('query_status', {job_id: query.job_id});
  assert.equal(status.state, 'succeeded');
  assert.equal(h.records.jobs.get(query.job_id).state, 'succeeded');
  for (const action of ['query_results', 'query_cancel']) {
    const result = await h.call(action, {job_id: query.job_id});
    assert.equal(result.ok, true);
    assert.equal(h.calls.at(-1).args[2], query.query_id);
  }
  assert.equal((await h.call('query_results', {job_id: query.job_id, offset: 10})).error.code, 'INVALID_INPUT');
});
test('query submission acknowledgments are recorded before the provider closes its session', async () => {
  const h = harness({submit: async (_r, _p, _s, _b, accepted) => {
    await accepted('durable-query-id');
    const record = [...h.records.jobs.values()][0];
    assert.equal(record.query_id, 'durable-query-id'); assert.equal(record.state, 'submitted');
    return {query_id: 'durable-query-id'};
  }});
  assert.equal((await h.call('query_submit', request())).query_id, 'durable-query-id');
});
test('failed acknowledgment persistence retains provider query ID and never resubmits', async () => {
  const h = harness();
  const update = h.store.update;
  let failed = false;
  h.store.update = async (kind, id, patch) => {
    if (patch.state === 'submitted' && !failed) { failed = true; throw Error('ack storage failed'); }
    return update(kind, id, patch);
  };
  const args = request(), result = await h.call('query_submit', args);
  assert.equal(result.state, 'unknown'); assert.equal(result.query_id, 'query-1');
  await h.call('query_submit', args);
  assert.equal(h.calls.filter(c => c.method === 'submit').length, 1);
});
test('audit outage returns owned job ID, reconciliation flag and known provider query ID', async () => {
  const h = harness({submit: async () => {
    const err = new P.WorkspaceError('PROVIDER_ERROR', 'Unknown outcome.');
    err.query_id = 'known-id'; throw err;
  }});
  const update = h.store.update;
  h.store.update = (kind, id, patch) => patch.state === 'unknown' ? Promise.reject(Error('offline')) : update(kind, id, patch);
  const result = await h.call('query_submit', request());
  assert.equal(result.error.code, 'AUDIT_UNAVAILABLE');
  assert.match(result.job_id, /^[a-f0-9]{64}$/); assert.equal(result.query_id, 'known-id');
  assert.equal(result.reconciliation_required, true);
});
test('post-intent revalidation prevents mutations when connection rotates or approval expires during claim', async () => {
  for (const cause of ['credential', 'expiry']) {
    const h = harness(), p = await approved(h), claim = h.store.claimChange;
    h.store.claimChange = async (...args) => {
      await claim(...args);
      if (cause === 'credential') h.resolved.credential = 'rotated';
      else h.advance(600001);
    };
    const result = await h.call('change_apply', {preview_id: p.preview_id});
    assert.equal(result.state, 'failed');
    assert.equal(h.calls.filter(c => c.method === 'mutate').length, 0);
  }
});
test('DML exact-predicate, DDL column and grants readbacks distinguish verified from unverified', async () => {
  const operations = [
    {op: insert(), rows: [{matching_rows: 1}], verified: true},
    {op: {kind: 'delete', table: 'T', where: {ID: 1}}, rows: [{matching_rows: 0}], verified: true},
    {op: {kind: 'delete', table: 'T', where: {ID: 1}}, rows: [{matching_rows: 1}], verified: false},
    {op: {kind: 'add_column', table: 'T', column: {name: 'X', type: 'INT'}}, rows: [{name: 'X'}], verified: true},
    {op: {kind: 'create_table', table: 'T', columns: [{name: 'X', type: 'INT'}]}, rows: [{name: 'OTHER'}], verified: false},
    {op: {kind: 'grant', table: 'T', role: 'TARGET', privileges: ['SELECT']}, rows: [{privilege: 'SELECT', grantee_name: 'TARGET'}], verified: true},
    {op: {kind: 'revoke', table: 'T', role: 'TARGET', privileges: ['SELECT']}, rows: [{privilege: 'SELECT', grantee_name: 'TARGET'}], verified: false},
  ];
  for (const item of operations) {
    const h = harness({read: async () => ({rows: item.rows})}), p = await approved(h, item.op);
    const result = await h.call('change_apply', {preview_id: p.preview_id});
    assert.equal(result.verification.verified, item.verified, item.op.kind);
  }
});
test('Cortex documented zero thread ID is accepted with parent zero', async () => {
  const h = harness();
  const result = await h.call('agent_run', {agent: 'DB.SCHEMA.AGENT', message: 'Q',
    request_id: crypto.randomUUID(), thread_id: 0, parent_message_id: 0});
  assert.equal(result.ok, true);
});
test('job status exposes durable Cortex audit without read SQL; mutation query IDs support reconciliation', async () => {
  const h = harness({policy: {read: false}});
  const agent = await h.call('agent_run', {agent: 'DB.SCHEMA.AGENT', message: 'Q', request_id: crypto.randomUUID()});
  const result = await h.call('query_status', {job_id: agent.job_id});
  assert.equal(result.state, 'succeeded'); assert.equal(result.response_retained, false);
  assert.equal(h.calls.filter(c => c.method === 'status').length, 0);
  const m = harness({mutate: async () => {
    const err = new P.WorkspaceError('PROVIDER_TIMEOUT', 'Unknown.');
    err.query_id = 'mutation-id'; throw err;
  }});
  const p = await approved(m), changed = await m.call('change_apply', {preview_id: p.preview_id});
  assert.equal(changed.state, 'unknown');
  assert.equal((await m.call('query_status', {job_id: changed.job_id})).state, 'succeeded');
  assert.equal((await m.call('query_cancel', {job_id: changed.job_id})).error.code, 'INVALID_INPUT');
});
test('documented failed terminal query statuses are durably failed rather than reported as success', async () => {
  const h = harness({status: async () => ({status: 'FAILED_WITH_ERROR'})});
  const q = await h.call('query_submit', request());
  const result = await h.call('query_status', {job_id: q.job_id});
  assert.equal(result.ok, false); assert.equal(result.state, 'failed');
  assert.equal(h.records.jobs.get(q.job_id).state, 'failed');
});
test('public preview fingerprints are not credential-derived password guessing oracles', async () => {
  const h = harness(), first = await h.call('change_preview', {operation: insert()});
  h.resolved.credential = 'rotated';
  const second = await h.call('change_preview', {operation: insert()});
  assert.equal(first.fingerprint, second.fingerprint);
  assert.notEqual(h.records.previews.get(first.preview_id).fingerprint, h.records.previews.get(second.preview_id).fingerprint);
});
