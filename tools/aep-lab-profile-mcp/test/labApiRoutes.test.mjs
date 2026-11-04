import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lookupProfile } from '../src/labApiClient.mjs';

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

test('profile reads bypass Hosting cached negatives and honor the direct Function origin', async t => {
  const original = process.env.AEP_LAB_FUNCTIONS_ORIGIN;
  process.env.AEP_LAB_FUNCTIONS_ORIGIN = 'https://functions.example.test/';
  t.after(() => {
    if (original === undefined) delete process.env.AEP_LAB_FUNCTIONS_ORIGIN;
    else process.env.AEP_LAB_FUNCTIONS_ORIGIN = original;
  });
  let observed;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    observed = { url: new URL(url), init };
    return Response.json({ code: 'UPS_ENTITY_NOT_FOUND' }, { status: 404 });
  });
  const result = await lookupProfile({
    sandbox: 'offline', namespace: 'ecid', identifier: 'offline-identity', retries: 0,
  });
  assert.equal(result.status, 404);
  assert.equal(observed.url.origin, 'https://functions.example.test');
  assert.equal(observed.url.pathname, '/profileTableProxy');
  assert.equal(observed.init.method, 'GET');
  assert.deepEqual(Object.fromEntries(observed.url.searchParams), {
    sandbox: 'offline', namespace: 'ecid', identifier: 'offline-identity',
  });
});
