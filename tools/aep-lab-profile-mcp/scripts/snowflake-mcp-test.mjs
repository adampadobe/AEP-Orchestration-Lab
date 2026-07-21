#!/usr/bin/env node
/**
 * Snowflake MCP tool unit tests (offline — no live Snowflake).
 */

import { loadAuthConfig } from '../src/auth.mjs';
import { assertSandboxAllowedForAccess } from '../src/sandboxAllowlist.mjs';
import {
  checkSnowflakeGenerateRate,
  checkSnowflakeTestRate,
} from '../src/rateLimiter.mjs';
import { requireUserMcpKeyForSnowflake } from '../src/tools/snowflakeTools.mjs';
import { snowflakeAuthHeaders, STATIC_EGRESS_IP } from '../src/labApiClient.mjs';
import { requestContext } from '../src/requestContext.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

process.env.AEP_LAB_MCP_API_KEY = process.env.AEP_LAB_MCP_API_KEY || 'snowflake-test-key';
process.env.AEP_LAB_MCP_ALLOWED_SANDBOXES = 'apalmer,kirkham';

async function run() {
  loadAuthConfig();
  assert(STATIC_EGRESS_IP === '34.58.81.28', 'static egress IP');

  await requestContext.run({ keyId: 'test-key', mcpApiKey: 'user-mcp-key-abc' }, async () => {
    const headers = snowflakeAuthHeaders();
    assert(headers['X-AEP-Lab-Mcp-Key'] === 'user-mcp-key-abc', 'snowflakeAuthHeaders forwards MCP key');
  });

  await requestContext.run({ keyId: 'test-key', principalAccess: { source: 'env', allowedSandboxes: ['apalmer'], allowedSet: new Set(['apalmer']) } }, () => {
    const blocked = requireUserMcpKeyForSnowflake();
    assert(blocked.ok === false, 'ops env key blocked for Snowflake');
    assert(blocked.code === 'MCP_USER_KEY_REQUIRED', 'ops key error code');
  });

  await requestContext.run({ keyId: 'test-key', principalAccess: { source: 'firestore', allowedSandboxes: ['apalmer'], allowedSet: new Set(['apalmer']) } }, () => {
    const ok = requireUserMcpKeyForSnowflake();
    assert(ok.ok === true, 'user firestore key allowed');
  });

  const acl = assertSandboxAllowedForAccess('apalmer', {
    allowedSandboxes: ['apalmer'],
    allowedSet: new Set(['apalmer']),
  });
  assert(acl.ok === true, 'sandbox allowlist');

  const testRate = checkSnowflakeTestRate('rate-test');
  assert(testRate.ok === true, 'snowflake test rate first call');
  const genRate = checkSnowflakeGenerateRate('rate-test');
  assert(genRate.ok === true, 'snowflake generate rate first call');

  console.log(JSON.stringify({ ok: true, suite: 'snowflake-mcp-test', staticEgressIp: STATIC_EGRESS_IP }));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
