import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EXPECTED_FIREBASE_PROJECT,
  EXPECTED_GITHUB_REPOSITORY,
  evaluateDeployAccountPolicy,
  firebaseProjectIds,
  normalizeGitHubRepository,
} from './deploy-account-policy.mjs';
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

const safeAccount = {
  remoteUrl: 'https://github.com/adampadobe/AEP-Orchestration-Lab.git',
  githubRepository: EXPECTED_GITHUB_REPOSITORY,
  githubAccessVerified: true,
  firebaseTarget: EXPECTED_FIREBASE_PROJECT,
  accessibleFirebaseProjects: [EXPECTED_FIREBASE_PROJECT],
};

test('allows the expected GitHub repository and accessible Firebase target', () => {
  assert.deepEqual(evaluateDeployAccountPolicy(safeAccount), {
    allowed: true,
    reasons: [],
    remoteRepository: EXPECTED_GITHUB_REPOSITORY,
  });
});

for (const [name, change] of [
  ['different GitHub owner', { remoteUrl: 'https://github.com/adobe/AEP-Orchestration-Lab.git' }],
  ['unverified GitHub access', { githubAccessVerified: false }],
  ['different GitHub repository', { githubRepository: 'adampadobe/another-repo' }],
  ['implicit Firebase target', { firebaseTarget: '' }],
  ['different Firebase target', { firebaseTarget: 'another-project' }],
  ['missing Firebase access', { accessibleFirebaseProjects: [] }],
]) {
  test(`rejects deployment with ${name}`, () => {
    assert.equal(evaluateDeployAccountPolicy({ ...safeAccount, ...change }).allowed, false);
  });
}

test('normalizes supported GitHub origin formats', () => {
  assert.equal(
    normalizeGitHubRepository('git@github.com:adampadobe/AEP-Orchestration-Lab.git'),
    EXPECTED_GITHUB_REPOSITORY,
  );
  assert.equal(
    normalizeGitHubRepository('ssh://git@github.com/adampadobe/AEP-Orchestration-Lab.git'),
    EXPECTED_GITHUB_REPOSITORY,
  );
});

test('reads Firebase projects from current and legacy CLI JSON shapes', () => {
  assert.deepEqual(
    firebaseProjectIds({ status: 'success', result: [{ projectId: EXPECTED_FIREBASE_PROJECT }] }),
    [EXPECTED_FIREBASE_PROJECT],
  );
  assert.deepEqual(
    firebaseProjectIds({
      status: 'success',
      result: { projects: [{ project_id: EXPECTED_FIREBASE_PROJECT }] },
    }),
    [EXPECTED_FIREBASE_PROJECT],
  );
});
