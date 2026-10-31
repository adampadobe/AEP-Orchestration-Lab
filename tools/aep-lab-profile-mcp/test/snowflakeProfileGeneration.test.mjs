import test from 'node:test';
import assert from 'node:assert/strict';
import { requestContext } from '../src/requestContext.mjs';
import { registerGenerateProfileTool } from '../src/tools/generateProfile.mjs';
import { registerGenerateProfilesBatchTool } from '../src/tools/generateProfilesBatch.mjs';
import { registerPreflightProfileGenerateTool } from '../src/tools/preflightProfileGenerate.mjs';
import { getExecutionFramework } from '../src/framework/labFramework.mjs';

process.env.AEP_LAB_MCP_FIRESTORE = 'off';
const tools = new Map();
const server = { registerTool: (name, config, callback) => tools.set(name, { config, callback }) };
registerGenerateProfileTool(server);
registerGenerateProfilesBatchTool(server);
registerPreflightProfileGenerateTool(server);
const decoded = result => JSON.parse(result.content[0].text);
let key = 0;

async function invoke(name, params, respond, source = 'firestore', allowedSandboxes = ['apalmer']) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ path: new URL(url).pathname, body: init.body ? JSON.parse(init.body) : null, headers: init.headers });
    return {
      ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => respond(calls.at(-1)),
    };
  };
  try {
    const result = await requestContext.run({
      keyId: `snowflake-routing-${++key}`, mcpApiKey: 'test-user-key',
      principalAccess: { source, allowedSandboxes },
    }, () => tools.get(name).callback(params));
    return { result, body: decoded(result), calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const profile = { email: 'demo+15102026-1@example.com', ecid: '12345678901234567890', crmId: 'CRM1000', recipientId: 'R-test' };
const success = {
  ok: true, result: {
    ok: true, rowcount: 1, recipientRowcount: 1, recipientTable: 'DB.AEP_SCHEMA.AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE',
    tableRowcounts: { 'DB.REL.REL_TRAVEL_RESERVATION': 1 }, relationalRefresh: 'immediate', profiles: [profile],
  },
};

test('single-profile default seeds recipients and industry data without any AEP request', async () => {
  const { body, calls } = await invoke('lab_generate_profile', { sandbox: 'apalmer', industry: 'travel' }, () => success);
  assert.deepEqual(calls.map(call => call.path), ['/snowflakeGenerateIndustryProfiles']);
  assert.deepEqual(calls[0].body, { sandbox: 'apalmer', industry: 'travel', count: 1 });
  assert.equal(body.target, 'snowflake');
  assert.equal(body.aep_streamed, false);
  assert.equal(body.recipientId, profile.recipientId);
  assert.equal(body.recipientRowcount, 1);
  assert.deepEqual(body.tableRowcounts, success.result.tableRowcounts);
  assert.match(body.note, /parent is written before linked industry/);
});

test('batch default uses the same seed endpoint synchronously and preserves recipient metadata', async () => {
  const { body, calls } = await invoke('lab_generate_profiles_batch', {
    sandbox: 'apalmer', industry: 'telco', count: 12, use_stored_prefs: true,
  }, () => ({ ...success, result: {
    ...success.result, rowcount: 12, recipientRowcount: 12,
    profiles: Array.from({ length: 12 }, () => profile), relationalRefresh: 'async',
  } }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.industry, 'telecom');
  assert.equal(calls[0].body.count, 12);
  assert.equal(body.rowcount, 12);
  assert.equal(body.relationalRefresh, 'async');
  assert.equal(body.job_id, undefined);
  assert.equal(body.pollTool, undefined);
});

test('Snowflake validation rejects missing industry, AEP-only options and invalid count before any call', async () => {
  for (const params of [
    {}, { industry: 'generic' }, { industry: 'unknown' }, { email: profile.email },
    { attributes: { 'person.name.firstName': 'Ada' } }, { segment_hint: 'active_flyer' },
    { dual_load_snowflake: true }, { randomize: false }, { test_profile: false },
    { use_stored_prefs: false }, { count: 0 }, { count: 101 },
  ]) {
    const input = { sandbox: 'apalmer', industry: 'travel', ...params };
    if (!Object.keys(params).length) delete input.industry;
    const { result, calls } = await invoke('lab_generate_profiles_batch', input, () => success);
    assert.equal(result.isError, true, JSON.stringify(input));
    assert.equal(calls.length, 0, 'must not reserve email or generate');
  }
});

test('Snowflake routing retains principal and sandbox access gates', async () => {
  for (const [source, sandboxes] of [['env', ['apalmer']], ['firestore', ['different']]]) {
    const { result, calls } = await invoke('lab_generate_profile', {
      sandbox: 'apalmer', industry: 'travel',
    }, () => success, source, sandboxes);
    assert.equal(result.isError, true);
    assert.equal(calls.length, 0);
  }
});

test('backend failure or incomplete recipient confirmation is surfaced and never retried', async () => {
  for (const response of [
    { ok: false, result: { ok: false, error: { message: 'Insufficient privileges' } } },
    { ok: true },
    { ok: true, result: { ...success.result, profiles: [{}] } },
    { ok: true, result: { ...success.result, recipientRowcount: 0 } },
  ]) {
    const { result, body, calls } = await invoke('lab_generate_profile', {
      sandbox: 'apalmer', industry: 'retail',
    }, () => response);
    assert.equal(result.isError, true);
    assert.equal(body.ok, false);
    assert.equal(calls.length, 1);
    assert.match(body.detail.note, /Do not automatically retry/);
  }
});

test('all six industries use the governed seed route with user-scoped authentication', async () => {
  for (const industry of ['travel', 'fsi', 'retail', 'telecom', 'media', 'sports']) {
    const { body, calls } = await invoke('lab_generate_profile', {
      sandbox: 'apalmer', industry, target: 'snowflake',
    }, () => success);
    assert.equal(body.ok, true, industry);
    assert.equal(calls[0].path, '/snowflakeGenerateIndustryProfiles');
    assert.equal(calls[0].body.industry, industry);
    assert.equal(calls[0].headers['X-AEP-Lab-Mcp-Key'], 'test-user-key');
  }
});

test('preflight reports missing connection and preference fields rather than readiness', async () => {
  const { body } = await invoke('lab_preflight_profile_generate', {
    sandbox: 'apalmer', industry: 'retail',
  }, () => ({ ok: true }));
  assert.equal(body.ready, false);
  assert.ok(body.missingFields.includes('credential'));
  assert.ok(body.missingFields.includes('baseEmail'));
});

test('Snowflake preflight only reads saved config and preferences, without reserving an email', async () => {
  const { body, calls } = await invoke('lab_preflight_profile_generate', {
    sandbox: 'apalmer', industry: 'travel',
  }, ({ path }) => path === '/snowflakeConfig'
    ? { ok: true, record: { hasCredential: true, account: 'account', user: 'user', database: 'DB', schema: 'LAB', warehouse: 'WH' } }
    : { ok: true, prefs: { baseEmail: 'demo@example.com', nextScaledEmail: profile.email } });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ path }) => !path.includes('generate') && !path.includes('next-email')));
  assert.equal(body.ready, true);
  assert.equal(body.target, 'snowflake');
  assert.equal(body.nextScaledEmail, profile.email);
  assert.match(body.recipientTable, /^DB.LAB\./);
});

test('explicit AEP target retains streaming and never invokes the Snowflake seed endpoint', async () => {
  const { body, calls } = await invoke('lab_generate_profile', {
    sandbox: 'apalmer', industry: 'generic', target: 'aep',
    email: profile.email, use_stored_prefs: false, randomize: false,
  }, () => ({ ok: true, ecid: profile.ecid }));
  assert.equal(body.ok, true);
  assert.ok(calls.some(({ path }) => path === '/api/profile/generate'));
  assert.ok(calls.every(({ path }) => path !== '/snowflakeGenerateIndustryProfiles'));
});

test('all three tool schemas expose an explicit AEP opt-in and framework describes Snowflake default', () => {
  for (const { config } of tools.values()) {
    assert.equal(config.inputSchema.target.parse(undefined), undefined);
    assert.equal(config.inputSchema.target.parse('aep'), 'aep');
    assert.throws(() => config.inputSchema.target.parse('unknown'));
    assert.match(config.description, /[Dd]efault target snowflake/);
  }
  assert.equal(getExecutionFramework().workflows.generate_profile.default_target, 'snowflake');
});
