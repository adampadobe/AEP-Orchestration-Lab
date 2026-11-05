'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {Readable} = require('node:stream');
const {createSdkProvider, boundedRows, restToken, providerError} = require('../snowflakeWorkspaceTransport');
const {createFirestoreStore, COLLECTIONS} = require('../snowflakeWorkspaceStore');
const {WorkspaceError, scopeId} = require('../snowflakeWorkspacePolicy');

const policy = {account: 'org-account', user: 'USER', role: 'ROLE', warehouse: 'WH', database: 'DB', schema: 'SCHEMA', timeoutSeconds: 2};
const resolved = {config: {...policy, authMethod: 'pat'}, credential: 'offline-token'};
function statement(rows = [], queryId = 'qid') {
  const result = {
    getQueryId: () => queryId, getNumRows: () => rows.length, getNumUpdatedRows: () => 1,
    streamRows: options => {
      result.page = options;
      result.stream = Readable.from(rows.slice(options.start, options.end + 1));
      return result.stream;
    },
  };
  return result;
}
function sdkHarness(options = {}) {
  const calls = [], result = statement(options.rows || [{X: 1}, {X: 2}, {X: 3}]);
  const connection = {
    connect: cb => cb(options.connectError || null),
    destroy: cb => { calls.push({destroy: true}); cb(options.destroyError || null); },
    execute: input => {
      calls.push(input);
      if (options.executeError?.(input.sqlText)) return input.complete(options.executeError(input.sqlText), result);
      const stmt = input.sqlText.startsWith('SELECT CURRENT_USER') ?
        statement([options.actual || Object.fromEntries(['user', 'role', 'warehouse', 'database', 'schema'].map(k => [k, policy[k]]))]) : result;
      input.complete(null, stmt);
      return stmt;
    },
    getQueryStatus: async id => { calls.push({getQueryStatus: id}); return 'SUCCESS'; },
    getResultsFromQueryId: async input => { calls.push({getResultsFromQueryId: input}); return result; },
  };
  const sdk = {createConnection: input => { calls.push({connectionOptions: input}); return connection; }};
  const provider = createSdkProvider({sdk, buildOptions: () => ({account: policy.account, privateKey: 'not-logged'}), ...options.dependencies});
  return {provider, calls, result};
}
test('SDK reads disable secondary roles, enforce exact context and irreversible read-only before SQL; streams bounded rows', async () => {
  const h = sdkHarness();
  const result = await h.provider.read(resolved, policy, 'SELECT * FROM T', [], {offset: 1, limit: 1});
  assert.deepEqual(result.rows, [{X: 2}]);
  const sql = h.calls.filter(c => c.sqlText).map(c => c.sqlText);
  assert.equal(sql[0], 'USE SECONDARY ROLES NONE');
  assert.match(sql[1], /STATEMENT_TIMEOUT_IN_SECONDS = 2/);
  assert.match(sql[1], /ABORT_DETACHED_QUERY = FALSE/);
  assert.equal(sql.at(-2), 'ALTER SESSION SET CORTEX_CLIENT_READ_ONLY = TRUE');
  assert.equal(sql.at(-1), 'SELECT * FROM T');
  for (const call of h.calls.filter(c => c.sqlText)) {
    assert.equal(call.streamResult, true);
    assert.equal(call.parameters.MULTI_STATEMENT_COUNT, 1);
  }
  assert.equal(h.calls[0].connectionOptions.streamResult, true);
  assert.deepEqual(h.result.page, {start: 1, end: 1});
  assert.equal(h.calls.at(-1).destroy, true);
});
test('unsupported server read-only parameter and changed actual role fail closed before user SQL', async () => {
  const blocked = sdkHarness({executeError: sql => sql.includes('CORTEX_CLIENT_READ_ONLY') ?
    Object.assign(Error('unknown parameter SECRET'), {code: '000001', sqlState: '42000'}) : null});
  await assert.rejects(blocked.provider.read(resolved, policy, 'SELECT * FROM T', [], {limit: 5}),
    {code: 'PROVIDER_ERROR', provider_code: '000001', sqlState: '42000'});
  assert.equal(blocked.calls.some(c => c.sqlText === 'SELECT * FROM T'), false);
  assert.equal(blocked.calls.at(-1).destroy, true);
  const drift = sdkHarness({actual: {...policy, role: 'ADMIN'}});
  await assert.rejects(drift.provider.submit(resolved, policy, 'SELECT 1', []), {code: 'CONTEXT_MISMATCH'});
  assert.equal(drift.calls.some(c => c.sqlText === 'SELECT 1'), false);
  assert.equal(drift.calls.at(-1).destroy, true);
});
test('async SDK submission, documented query status/results and cancellation retain query ID', async () => {
  const h = sdkHarness();
  assert.equal((await h.provider.submit(resolved, policy, 'SELECT ?', [1])).query_id, 'qid');
  const submit = h.calls.find(c => c.sqlText === 'SELECT ?');
  assert.equal(submit.asyncExec, true); assert.deepEqual(submit.binds, [1]);
  assert.equal((await h.provider.status(resolved, policy, 'qid')).status, 'SUCCESS');
  assert.deepEqual((await h.provider.results(resolved, policy, 'qid', {limit: 2})).rows, [{X: 1}, {X: 2}]);
  assert.deepEqual(h.calls.find(c => c.getResultsFromQueryId).getResultsFromQueryId, {queryId: 'qid'});
  await h.provider.cancel(resolved, policy, "qid'unsafe");
  assert.deepEqual(h.calls.find(c => c.sqlText?.includes('SYSTEM$CANCEL_QUERY')).binds, ["qid'unsafe"]);
});
test('mutations do not set read-only, stream instead of eager arrays, and clean up on provider error', async () => {
  const h = sdkHarness({executeError: sql => sql.startsWith('ALTER TABLE') ?
    Object.assign(Error('SECRET bound value'), {code: '002023', sqlState: '22000'}) : null});
  await assert.rejects(h.provider.mutate(resolved, policy, 'ALTER TABLE T ADD COLUMN X INT NOT NULL', []),
    {code: 'PROVIDER_ERROR', provider_code: '002023', query_id: 'qid'});
  assert.equal(h.calls.some(c => c.sqlText?.includes('CORTEX_CLIENT_READ_ONLY')), false);
  assert.equal(h.calls.at(-1).destroy, true);
});
test('cleanup errors after acknowledged provider call preserve query ID for durable reconciliation', async () => {
  const h = sdkHarness({destroyError: Error('SECRET cleanup detail')});
  await assert.rejects(h.provider.submit(resolved, policy, 'SELECT 1', []), err =>
    err.query_id === 'qid' && !err.message.includes('SECRET'));
});
test('row and byte limits destroy streams; large first row and streaming errors are explicit', async () => {
  const s = statement([{X: 'a'.repeat(100)}, {X: 'b'}]);
  const result = await boundedRows(s, {limit: 2, maxBytes: 40});
  assert.equal(result.rows.length, 0); assert.equal(result.truncated, true); assert.equal(s.stream.destroyed, true);
  const many = statement(Array.from({length: 100}, (_, X) => ({X})));
  assert.equal((await boundedRows(many, {offset: 3, limit: 2})).rows.length, 2);
  assert.deepEqual(many.page, {start: 3, end: 4});
  const failed = {streamRows: () => Readable.from((async function* () { yield {X: 1}; throw Error('stream failed'); })())};
  await assert.rejects(boundedRows(failed, {limit: 2}), /stream failed/);
});
test('safe errors never expose provider messages/credentials and retain allowlisted diagnostics', () => {
  const error = providerError({message: 'password SECRET SQL text', code: '390100', sqlState: '28000', queryId: 'qid'});
  assert.doesNotMatch(error.message, /SECRET|password/);
  assert.equal(error.provider_code, '390100'); assert.equal(error.definitive, true); assert.equal(error.query_id, 'qid');
  assert.equal(providerError({code: 'Bearer SECRET'}).provider_code, undefined);
});
test('JWT uses official RSA SPKI SHA256 fingerprint issuer, uppercase subject and short expiry', () => {
  const {privateKey, publicKey} = crypto.generateKeyPairSync('rsa', {modulusLength: 2048});
  const material = {config: {...policy, authMethod: 'keyPair'}, credential: 'not-used'};
  const token = restToken(material, () => ({privateKey: privateKey.export({format: 'pem', type: 'pkcs8'})}), () => 1700000000000);
  const [header, payload, signature] = token.token.split('.');
  assert.equal(JSON.parse(Buffer.from(header, 'base64url')).alg, 'RS256');
  const claims = JSON.parse(Buffer.from(payload, 'base64url'));
  const fingerprint = crypto.createHash('sha256').update(publicKey.export({type: 'spki', format: 'der'})).digest('base64');
  assert.equal(claims.sub, 'ORG-ACCOUNT.USER');
  assert.equal(claims.iss, `ORG-ACCOUNT.USER.SHA256:${fingerprint}`);
  assert.equal(claims.exp - claims.iat, 300);
  assert.equal(crypto.verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, 'base64url')), true);
  assert.throws(() => restToken({...resolved, config: {...policy, authMethod: 'password'}}, () => ({})),
    {code: 'CORTEX_AUTH_UNSUPPORTED'});
});
test('Cortex REST builds documented endpoint/body, role/token headers, no redirects and preserves JSON', async () => {
  let observed;
  const h = sdkHarness({dependencies: {fetchImpl: async (url, input) => {
    observed = {url, input};
    return {status: 200, body: Readable.from([Buffer.from(JSON.stringify({thread_id: 8, citations: [{id: 'c'}], warnings: ['w']}))])};
  }}});
  const response = await h.provider.agent(resolved, policy, {agent: 'DB.SCHEMA.AGENT', message: 'Q', thread_id: 4, parent_message_id: 0});
  assert.equal(observed.url, 'https://org-account.snowflakecomputing.com/api/v2/databases/DB/schemas/SCHEMA/agents/AGENT:run');
  assert.equal(observed.input.redirect, 'error');
  assert.equal(observed.input.headers['X-Snowflake-Role'], 'ROLE');
  assert.equal(observed.input.headers['X-Snowflake-Authorization-Token-Type'], 'PROGRAMMATIC_ACCESS_TOKEN');
  assert.deepEqual(JSON.parse(observed.input.body), {messages: [{role: 'user', content: [{type: 'text', text: 'Q'}]}],
    stream: false, thread_id: 4, parent_message_id: 0});
  assert.equal(response.response.thread_id, 8); assert.equal(response.response.citations.length, 1);
  assert.equal(h.calls.length, 0);
});
test('Cortex network, HTTP, invalid JSON and body bounds fail explicitly and redact provider details', async () => {
  const cases = [
    {fetchImpl: async () => { throw Error('Bearer SECRET'); }, code: 'CORTEX_TRANSPORT_ERROR'},
    {fetchImpl: async () => ({status: 403, body: Readable.from(['SECRET'])}), code: 'CORTEX_HTTP_ERROR'},
    {fetchImpl: async () => ({status: 200, body: Readable.from([Buffer.from('bad SECRET JSON')])}), code: 'CORTEX_TRANSPORT_ERROR'},
    {fetchImpl: async () => ({status: 200, body: Readable.from([Buffer.alloc(1024 * 1024 + 1)])}), code: 'RESULT_TOO_LARGE'},
  ];
  for (const item of cases) {
    const h = sdkHarness({dependencies: item});
    await assert.rejects(h.provider.agent(resolved, policy, {agent: 'DB.SCHEMA.AGENT', message: 'Q'}), err =>
      err.code === item.code && !err.message.includes('SECRET'));
  }
});

function fakeFirestore() {
  const docs = new Map(), writes = [];
  let sequence = Promise.resolve();
  const ref = (collection, id) => ({
    path: `${collection}/${id}`,
    async get() { return snapshot(this); },
    async update(patch) {
      assert(docs.has(this.path)); docs.set(this.path, {...docs.get(this.path), ...structuredClone(patch)});
    },
  });
  const snapshot = r => ({exists: docs.has(r.path), data: () => structuredClone(docs.get(r.path))});
  const db = {
    collection: collection => ({doc: id => ref(collection, id)}),
    runTransaction(work) {
      const result = sequence.then(async () => {
        const pending = [];
        const value = await work({
          get: async r => snapshot(r),
          create: (r, data) => pending.push(() => { assert(!docs.has(r.path)); docs.set(r.path, structuredClone(data)); writes.push(r.path); }),
          update: (r, patch) => pending.push(() => { assert(docs.has(r.path)); docs.set(r.path, {...docs.get(r.path), ...structuredClone(patch)}); }),
        });
        pending.forEach(write => write()); return value;
      });
      sequence = result.catch(() => {}); return result;
    },
  };
  return {db, docs, writes};
}
test('Firestore policy key is SHA256 uid-NUL-sandbox; request reservation and approval CAS are atomic', async () => {
  const fake = fakeFirestore(), store = createFirestoreStore(fake.db);
  fake.docs.set(`${COLLECTIONS.policies}/${scopeId('u', 's')}`, {enabled: true});
  assert.equal((await store.getPolicy('u', 's')).enabled, true);
  assert.equal(await store.getPolicy('u', 'other'), null);
  const reservations = await Promise.all(Array.from({length: 20}, () => store.create('jobs', 'job', {state: 'reserved'})));
  assert.equal(reservations.filter(Boolean).length, 1);
  await store.create('previews', 'p', {state: 'previewed'});
  const approvals = await Promise.all(Array.from({length: 20}, () =>
    store.transition('previews', 'p', ['previewed'], {state: 'approved'})));
  assert.equal(approvals.filter(Boolean).length, 1);
  const claims = await Promise.allSettled(Array.from({length: 20}, () => store.claimChange('p', 'change', {state: 'submitting'})));
  assert.equal(claims.filter(c => c.status === 'fulfilled').length, 1);
  assert.equal((await store.get('previews', 'p')).job_id, 'change');
  assert.equal((await store.get('jobs', 'change')).state, 'submitting');
});
test('Firestore failed claim creates no mutation audit/job', async () => {
  const fake = fakeFirestore(), store = createFirestoreStore(fake.db);
  await store.create('previews', 'p', {state: 'previewed'});
  await assert.rejects(store.claimChange('p', 'change', {state: 'submitting'}), {code: 'ALREADY_CLAIMED'});
  assert.equal(await store.get('jobs', 'change'), null);
});
test('SDK query acknowledgment callback runs before connection destroy and retains ID on storage failure', async () => {
  const h = sdkHarness();
  let acknowledged = false;
  await h.provider.submit(resolved, policy, 'SELECT 1', [], async queryId => {
    acknowledged = true;
    assert.equal(queryId, 'qid');
    assert.equal(h.calls.some(c => c.destroy), false);
  });
  assert.equal(acknowledged, true);
  const broken = sdkHarness();
  await assert.rejects(broken.provider.mutate(resolved, policy, 'INSERT INTO T VALUES (?)', [1],
    async () => { throw Error('store SECRET'); }), err => err.query_id === 'qid' && !err.message.includes('SECRET'));
  assert.equal(broken.calls.at(-1).destroy, true);
});
test('timed-out SDK initialization cannot execute user SQL when a delayed callback finally arrives', async () => {
  const calls = [];
  let delayed;
  const c = {
    connect: cb => cb(null), destroy: cb => { calls.push('destroy'); cb(null); },
    execute: input => {
      calls.push(input.sqlText);
      if (input.sqlText === 'USE SECONDARY ROLES NONE') delayed = () => input.complete(null, statement());
      else input.complete(null, statement());
    },
  };
  const provider = createSdkProvider({sdk: {createConnection: () => c}, buildOptions: () => ({})});
  await assert.rejects(provider.submit(resolved, {...policy, timeoutSeconds: 0.01}, 'SELECT USER_SQL', []),
    {code: 'PROVIDER_TIMEOUT'});
  delayed();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.includes('SELECT USER_SQL'), false);
  assert.equal(calls.filter(s => s === 'destroy').length, 1);
});
test('Cortex timeout uses an abort signal and never leaks transport errors', async () => {
  const h = sdkHarness({dependencies: {fetchImpl: (_url, input) => new Promise((_resolve, reject) =>
    input.signal.addEventListener('abort', () => reject(Error('SECRET abort detail')), {once: true}))}});
  await assert.rejects(h.provider.agent(resolved, {...policy, timeoutSeconds: 0.01},
    {agent: 'DB.SCHEMA.AGENT', message: 'Q'}), {code: 'CORTEX_TRANSPORT_ERROR'});
});
