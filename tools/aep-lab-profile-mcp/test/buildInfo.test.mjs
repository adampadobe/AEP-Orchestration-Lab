import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getBuildInfo } from '../src/buildInfo.mjs';
import { registerMcpAccessInfoTool } from '../src/tools/mcpAccessInfo.mjs';

test('build metadata is explicit and never substitutes package version for deployment identity', () => {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const expected = { version, commitSha: 'a'.repeat(40), revision: 'service-00160-test', pullRequest: 362 };
  assert.deepEqual(getBuildInfo({ AEP_LAB_BUILD_SHA: expected.commitSha, K_REVISION: expected.revision, AEP_LAB_BUILD_PR: '362' }), expected);
  assert.deepEqual(getBuildInfo({}), { version: expected.version, commitSha: null, revision: null, pullRequest: null });
  assert.equal(getBuildInfo({ AEP_LAB_BUILD_SHA: 'not-a-commit', AEP_LAB_BUILD_PR: 'not-a-pr' }).commitSha, null);
});

test('access info exposes running build metadata', async () => {
  let handler;
  registerMcpAccessInfoTool({ registerTool(_name, _config, callback) { handler = callback; } });
  const response = JSON.parse((await handler()).content[0].text);
  assert.deepEqual(response.build, getBuildInfo());
});
