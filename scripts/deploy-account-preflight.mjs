#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXPECTED_FIREBASE_PROJECT,
  EXPECTED_GITHUB_REPOSITORY,
  evaluateDeployAccountPolicy,
  firebaseProjectIds,
} from './deploy-account-policy.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readArg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length).trim() || '';
}

function run(command, args) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
  }).trim();
}

function fail(message) {
  console.error(`deploy-account-preflight: ${message}`);
  process.exit(1);
}

const firebaseTarget = readArg('firebase-project') || process.env.GCLOUD_PROJECT || '';
let remoteUrl = '';
let githubRepository = '';
let firebaseProjects = [];

try {
  remoteUrl = run('git', ['remote', 'get-url', 'origin']);
} catch {
  fail('could not read the origin remote; refusing to infer a repository');
}

try {
  githubRepository = run('gh', [
    'api',
    `repos/${EXPECTED_GITHUB_REPOSITORY}`,
    '--jq',
    '.full_name',
  ]);
} catch {
  fail(
    `could not verify authenticated GitHub access to ${EXPECTED_GITHUB_REPOSITORY}; run "gh auth status" without switching accounts automatically`,
  );
}

try {
  const output = run('npx', [
    '-y',
    'firebase-tools@latest',
    'projects:list',
    '--json',
    '--non-interactive',
  ]);
  firebaseProjects = firebaseProjectIds(JSON.parse(output));
} catch {
  fail(
    `could not verify authenticated Firebase access to ${EXPECTED_FIREBASE_PROJECT}; authenticate the intended account explicitly`,
  );
}

const policy = evaluateDeployAccountPolicy({
  remoteUrl,
  githubRepository,
  githubAccessVerified: githubRepository === EXPECTED_GITHUB_REPOSITORY,
  firebaseTarget,
  accessibleFirebaseProjects: firebaseProjects,
});

if (!policy.allowed) {
  fail(`deployment identity or target mismatch:\n${policy.reasons.map((reason) => `  - ${reason}`).join('\n')}`);
}

console.log(
  `deploy-account-preflight: verified ${EXPECTED_GITHUB_REPOSITORY} and Firebase project ${EXPECTED_FIREBASE_PROJECT}`,
);
