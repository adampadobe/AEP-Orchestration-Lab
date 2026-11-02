import test from 'node:test';
import assert from 'node:assert/strict';
import { executeGeneratePlan, planDualStreamGenerate } from '../src/framework/dualStreamGenerate.mjs';

test('dual-stream result preserves the Generic place mirror and per-step evidence', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    return {
      ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({
        ok: true, ecid: '12345678901234567890123456789012345678', appendToken: 'offline-continuation',
        geoMirror: body.industry === 'generic' ? { written: true } : { written: false, reason: 'no_place' },
      }),
    };
  });
  const plan = planDualStreamGenerate({
    industry: 'media', email: 'offline@example.com',
    attributes: { 'profilePlaceContext.city': 'London', 'industryMedia.primaryGenre': 'Drama' },
  });
  const result = await executeGeneratePlan({ email: 'offline@example.com', sandbox: 'offline', plan });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(result.data.geoMirror, { written: true });
  assert.deepEqual(result.stepResults[1].geoMirror, { written: false, reason: 'no_place' });
});
