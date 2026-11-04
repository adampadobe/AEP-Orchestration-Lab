import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lookupProfile } from '../src/labApiClient.mjs';
import { runProfileReadbackAcceptance } from '../src/profileReadbackAcceptance.mjs';

const email = 'acceptance@example.com';
const ecid = '12345678901234567890123456789012345678';
const generatedAt = '2026-11-04T08:00:00.000Z';

function profileData() {
  return {
    found: true,
    profileEmail: email,
    ecid,
    profileAccessHints: {
      identityMapHasEmail: true,
      identityMapHasEcid: true,
    },
    rows: [
      { path: '_demoemea.identification.core.email', value: email },
      { path: '_demoemea.identification.core.ecid', value: ecid },
    ],
  };
}

describe('read-only profile readback acceptance', () => {
  it('uses a read-only correlated profile lookup request', async (t) => {
    let request;
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      request = { url: new URL(url), init };
      return new Response(JSON.stringify({ code: 'UPS_ENTITY_NOT_FOUND' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const result = await lookupProfile({
      sandbox: 'apalmer',
      namespace: 'ecid',
      identifier: ecid,
      profile_readback: true,
      correlation_id: 'd4e4e6a8-b707-41f0-bf23-5b66b783ed4c',
    });

    assert.equal(request.init.method, 'GET');
    assert.equal(request.url.searchParams.get('profileReadback'), '1');
    assert.equal(request.url.searchParams.get('namespace'), 'ecid');
    assert.equal(request.init.headers['x-aep-lab-correlation-id'], 'd4e4e6a8-b707-41f0-bf23-5b66b783ed4c');
    assert.equal(result.status, 404);
  });

  it('passes when the first email read has both identities and ECID lookup resolves within SLA', async () => {
    let time = Date.parse(generatedAt);
    const calls = [];
    const lookupEvents = [];
    const result = await runProfileReadbackAcceptance({
      sandbox: 'apalmer',
      industry: 'media',
      email,
      ecid,
      generatedAt,
      slaSeconds: 60,
      pollIntervalMs: 5_000,
      now: () => time,
      sleep: async (ms) => { time += ms; },
      onLookup: (event) => lookupEvents.push(event),
      lookupProfile: async ({ namespace }) => {
        calls.push(namespace);
        if (namespace === 'email') return { ok: true, status: 200, data: profileData() };
        if (calls.filter((value) => value === 'ecid').length === 1) {
          return { ok: false, status: 404, data: { code: 'UPS_ENTITY_NOT_FOUND' } };
        }
        return { ok: true, status: 200, data: profileData() };
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.elapsedSeconds, 5);
    assert.deepEqual(result.firstReadbackChecks, {
      profileEmailMatches: true,
      profileEcidMatches: true,
      identityMapHasEmail: true,
      identityMapHasEcid: true,
      coreEmailMatches: true,
      coreEcidMatches: true,
    });
    assert.deepEqual(calls, ['email', 'ecid', 'ecid']);
    assert.deepEqual(lookupEvents.map(({ namespace, attempt, status, found }) => ({
      namespace, attempt, status, found,
    })), [
      { namespace: 'email', attempt: 1, status: 200, found: true },
      { namespace: 'ecid', attempt: 1, status: 404, found: false },
      { namespace: 'ecid', attempt: 2, status: 200, found: true },
    ]);
    assert.equal(JSON.stringify(lookupEvents).includes(email), false);
    assert.equal(JSON.stringify(lookupEvents).includes(ecid), false);
  });

  it('fails immediately when required identification.core fields are absent on the first email read', async () => {
    const data = profileData();
    data.rows = data.rows.filter((row) => !row.path.endsWith('.ecid'));
    let calls = 0;
    const result = await runProfileReadbackAcceptance({
      sandbox: 'apalmer',
      industry: 'media',
      email,
      ecid,
      generatedAt,
      now: () => Date.parse(generatedAt),
      lookupProfile: async ({ namespace }) => {
        calls += 1;
        return { ok: true, status: 200, data };
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'first_email_readback_missing_required_identity');
    assert.equal(result.firstReadbackChecks.coreEcidMatches, false);
    assert.equal(calls, 2);
  });

  it('fails the ECID lookup SLA without treating a 404 as ingestion success', async () => {
    let time = Date.parse(generatedAt);
    const result = await runProfileReadbackAcceptance({
      sandbox: 'apalmer',
      industry: 'travel',
      email,
      ecid,
      generatedAt,
      slaSeconds: 10,
      pollIntervalMs: 5_000,
      now: () => time,
      sleep: async (ms) => { time += ms; },
      lookupProfile: async ({ namespace }) => namespace === 'email'
        ? { ok: true, status: 200, data: profileData() }
        : { ok: false, status: 404, data: { code: 'UPS_ENTITY_NOT_FOUND' } },
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, 'ecid_lookup_sla_exceeded');
    assert.equal(result.elapsedSeconds, 10);
  });

  it('stops on non-404 lookup failures instead of polling or disguising them', async () => {
    await assert.rejects(runProfileReadbackAcceptance({
      sandbox: 'apalmer',
      industry: 'fsi',
      email,
      ecid,
      generatedAt,
      lookupProfile: async () => ({ ok: false, status: 403, data: {} }),
    }), /Email profile lookup failed with HTTP 403/);
  });
});
