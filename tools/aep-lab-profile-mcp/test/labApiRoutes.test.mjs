import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function labApiPaths() {
  const source = readFileSync(`${repoRoot}tools/aep-lab-profile-mcp/src/labApiClient.mjs`, 'utf8');
  const paths = new Set();
  for (const match of source.matchAll(/labApiRequest\(\s*(['"`])(\/api\/[^'"`$]*)\1/g)) {
    paths.add(match[2]);
  }
  return [...paths].sort();
}

function hostingRewriteSources() {
  const firebaseJson = JSON.parse(readFileSync(`${repoRoot}firebase.json`, 'utf8'));
  const hosting = Array.isArray(firebaseJson.hosting) ? firebaseJson.hosting[0] : firebaseJson.hosting;
  return (hosting?.rewrites || []).map((rewrite) => rewrite.source).filter(Boolean);
}

function rewriteMatches(source, path) {
  const pattern = source
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${pattern}$`).test(path);
}

test('every lab API path the MCP calls has a Firebase Hosting rewrite', () => {
  const sources = hostingRewriteSources();
  const paths = labApiPaths();
  assert.ok(paths.includes('/api/geo-hotspots'), 'expected the geo-hotspots path to be covered');
  const missing = paths.filter((path) => !sources.some((source) => rewriteMatches(source, path)));
  assert.deepEqual(
    missing,
    [],
    `These MCP lab API paths have no firebase.json rewrite, so they 404 in production: ${missing.join(', ')}. `
      + 'Add the rewrite and deploy Hosting (not just Functions).',
  );
});

test('rewrite matcher handles the glob styles used in firebase.json', () => {
  assert.equal(rewriteMatches('/api/geo-hotspots', '/api/geo-hotspots'), true);
  assert.equal(rewriteMatches('/api/profile/**', '/api/profile/table'), true);
  assert.equal(rewriteMatches('/api/profile/*', '/api/profile/table'), true);
  assert.equal(rewriteMatches('/api/profile/*', '/api/profile/a/b'), false);
  assert.equal(rewriteMatches('/api/geo-hotspots', '/api/geo-hotspot'), false);
});
