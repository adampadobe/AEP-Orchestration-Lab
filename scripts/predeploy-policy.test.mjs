import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateDeployPolicy } from './predeploy-policy.mjs';

const safeMain = {
  fetchedOrigin: true,
  branch: 'main',
  ahead: 0,
  behind: 0,
  dirty: false,
};

test('allows only clean main at the exact remote SHA for production', () => {
  assert.deepEqual(evaluateDeployPolicy(safeMain), {
    allowed: true,
    mode: 'production',
    reasons: [],
  });
});

for (const [name, change] of [
  ['feature branch', { branch: 'codex/example' }],
  ['unpushed commit', { ahead: 1 }],
  ['stale checkout', { behind: 1 }],
  ['dirty tracked file', { dirty: true }],
  ['untracked deploy file', { untrackedDeployFiles: true }],
  ['failed origin fetch', { fetchedOrigin: false }],
]) {
  test(`rejects production from a ${name}`, () => {
    assert.equal(evaluateDeployPolicy({ ...safeMain, ...change }).allowed, false);
  });
}

test('allows an isolated preview from a feature branch', () => {
  assert.equal(evaluateDeployPolicy({ ...safeMain, previewDeploy: true, branch: 'codex/example' }).mode, 'preview');
});

test('requires an explicit emergency override', () => {
  assert.equal(evaluateDeployPolicy({ ...safeMain, override: true, branch: 'detached', behind: 5 }).mode, 'emergency-override');
});
