'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  resolveClaudeSkillsBucketName,
  resolveProjectId,
} = require('../claudeSkillsService');

function withEnv(patch, fn) {
  const prior = {};
  for (const key of Object.keys(patch)) {
    prior[key] = process.env[key];
    const v = patch[key];
    if (v === undefined) delete process.env[key];
    else process.env[key] = v;
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(patch)) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  }
}

test('resolveClaudeSkillsBucketName prefers CLAUDE_SKILLS_BUCKET', () => {
  withEnv({
    CLAUDE_SKILLS_BUCKET: 'my-skills-bucket',
    FIREBASE_STORAGE_BUCKET: 'other',
    FIREBASE_CONFIG: JSON.stringify({ storageBucket: 'from-config.firebasestorage.app' }),
    GCLOUD_PROJECT: 'aep-orchestration-lab',
  }, () => {
    assert.strictEqual(resolveClaudeSkillsBucketName(), 'my-skills-bucket');
  });
});

test('resolveClaudeSkillsBucketName uses FIREBASE_CONFIG.storageBucket', () => {
  withEnv({
    CLAUDE_SKILLS_BUCKET: '',
    FIREBASE_STORAGE_BUCKET: '',
    FIREBASE_CONFIG: JSON.stringify({
      projectId: 'aep-orchestration-lab',
      storageBucket: 'aep-orchestration-lab.firebasestorage.app',
    }),
    GCLOUD_PROJECT: 'aep-orchestration-lab',
  }, () => {
    assert.strictEqual(
      resolveClaudeSkillsBucketName(),
      'aep-orchestration-lab.firebasestorage.app',
    );
  });
});

test('resolveClaudeSkillsBucketName falls back to firebasestorage.app not appspot', () => {
  withEnv({
    CLAUDE_SKILLS_BUCKET: '',
    FIREBASE_STORAGE_BUCKET: '',
    FIREBASE_CONFIG: '',
    GCLOUD_PROJECT: 'aep-orchestration-lab',
  }, () => {
    const name = resolveClaudeSkillsBucketName();
    assert.strictEqual(name, 'aep-orchestration-lab.firebasestorage.app');
    assert.ok(!name.endsWith('.appspot.com'));
  });
});

test('resolveProjectId reads FIREBASE_CONFIG.projectId', () => {
  withEnv({
    GCLOUD_PROJECT: '',
    GCP_PROJECT: '',
    GOOGLE_CLOUD_PROJECT: '',
    FIREBASE_CONFIG: JSON.stringify({ projectId: 'sandbox-project' }),
  }, () => {
    assert.strictEqual(resolveProjectId(), 'sandbox-project');
  });
});
