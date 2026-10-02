import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const scriptPath = join(repoRoot, 'tools', 'aep-lab-profile-mcp', 'scripts', 'release-main.sh');
const script = await readFile(scriptPath, 'utf8');

test('Cloud Run release script pins the repository and refuses unsafe git states', () => {
  assert.match(script, /https:\/\/github\.com\/adampadobe\/AEP-Orchestration-Lab\.git/);
  assert.match(script, /git@github\.com:adampadobe\/AEP-Orchestration-Lab\.git/);
  assert.match(script, /git fetch origin/);
  assert.match(script, /git rev-parse --abbrev-ref HEAD/);
  assert.match(script, /git status --porcelain/);
  assert.match(script, /origin\/main/);
  assert.match(script, /git merge --ff-only/);
  assert.match(script, /40-character SHA/i);
});

test('Cloud Run release script pins both gcloud identity and project without changing config', () => {
  assert.match(script, /CLOUDSDK_ACTIVE_CONFIG_NAME=aep-orchestration/);
  assert.match(script, /apalmer@adobe\.com/);
  assert.match(script, /aep-orchestration-lab/);
  assert.match(script, /adbe-gcp0819/);
  assert.match(script, /--project=aep-orchestration-lab/);
  assert.doesNotMatch(script, /gcloud\s+config\s+set\b/);
});

test('Cloud Run release builds an immutable SHA image and updates only the image', () => {
  assert.match(script, /readonly IMAGE="gcr\.io\/\$\{PROJECT_ID\}\/\$\{SERVICE\}:\$\{SHA\}"/);
  assert.match(script, /builds submit --tag "\$IMAGE"/);
  assert.match(script, /run services update[\s\S]*--image/);
  assert.match(script, /expected_image not in images/);
  assert.doesNotMatch(script, /--set-(?:env-vars|secrets|service-account|ingress|timeout|memory|concurrency|scaling)|--clear-|--env-vars-file/);
  assert.match(script, /revision/);
  assert.match(script, /100%/);
  assert.match(script, /binding names/i);
  assert.match(script, /curl[\s\S]*\/health/);
});
