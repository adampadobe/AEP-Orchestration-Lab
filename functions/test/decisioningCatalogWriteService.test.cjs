'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPlan,
  confirmationPhrase,
  changePreview,
  changeApply,
  deleteAudit,
  deleteApply,
} = require('../decisioningCatalogWriteService');

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function withFetch(impl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return Promise.resolve(fn()).finally(() => {
    globalThis.fetch = original;
  });
}

test('buildPlan validates entity_type, action, and required fields', () => {
  assert.throws(() => buildPlan({ entityType: 'not-a-thing', action: 'create', item: {} }), /entity_type must be one of/);
  assert.throws(() => buildPlan({ entityType: 'offer-rules', action: 'bogus', item: {} }), /action must be one of/);
  assert.throws(() => buildPlan({ entityType: 'offer-rules', action: 'create' }), /item is required/);
  assert.throws(() => buildPlan({ entityType: 'ranking-formulas', action: 'update', id: 'rf-1' }), /patches is required/);
  assert.throws(
    () => buildPlan({ entityType: 'ranking-formulas', action: 'update', id: 'rf-1', patches: [{ op: 'bogus', path: '/name' }] }),
    /patch\.op must be one of/,
  );
  assert.throws(
    () => buildPlan({ entityType: 'ranking-formulas', action: 'update', id: 'rf-1', patches: [{ op: 'replace', path: 'name' }] }),
    /patch\.path must be a string starting with/,
  );
  assert.throws(() => buildPlan({ entityType: 'placements', action: 'delete' }), /id is required/);
});

test('buildPlan is deterministic and confirmationPhrase matches the action', () => {
  const planA = buildPlan({ entityType: 'offer-rules', action: 'create', item: { name: 'VIP eligibility' } });
  const planB = buildPlan({ entityType: 'offer-rules', action: 'create', item: { name: 'VIP eligibility' } });
  assert.equal(planA.preflightId, planB.preflightId);
  assert.equal(planA.preflightId.length, 64);
  assert.equal(planA.path, '/data/core/dps/offer-rules');
  assert.equal(confirmationPhrase(planA), 'CREATE DECISIONING OFFER-RULES');

  const deletePlan = buildPlan({ entityType: 'placements', action: 'delete', id: 'p-1' });
  assert.equal(confirmationPhrase(deletePlan), 'DELETE DECISIONING PLACEMENTS p-1');
});

test('update uses PATCH with a JSON Patch array, confirmed live against DPS — a full-object PUT also works but silently nulls omitted fields', () => {
  const plan = buildPlan({
    entityType: 'ranking-formulas',
    action: 'update',
    id: 'rf-1',
    patches: [{ op: 'replace', path: '/description', value: 'new' }],
  });
  assert.equal(plan.actionDef.method, 'PATCH');
  assert.equal(plan.path, '/data/core/dps/ranking-formulas/rf-1');
  assert.deepEqual(plan.body, [{ op: 'replace', path: '/description', value: 'new' }]);
});

test('buildPlan hashes the raw id-or-name, not a resolved id, so preview and apply match even when apply later resolves a name', () => {
  const byId = buildPlan({ entityType: 'ranking-formulas', action: 'update', id: 'rf-1', patches: [{ op: 'replace', path: '/description', value: 'x' }] });
  const byName = buildPlan({ entityType: 'ranking-formulas', action: 'update', id: 'My Formula', patches: [{ op: 'replace', path: '/description', value: 'x' }] });
  assert.notEqual(byId.preflightId, byName.preflightId);
  assert.equal(confirmationPhrase(byName), 'UPDATE DECISIONING RANKING-FORMULAS My Formula');
});

test('changePreview never calls the platform and rejects delete', () => {
  const preview = changePreview({ entityType: 'ranking-formulas', action: 'create', item: { name: 'Weather boost' } });
  assert.equal(preview.phase, 'preview');
  assert.equal(preview.request.method, 'POST');
  assert.equal(preview.request.path, '/data/core/dps/ranking-formulas');
  assert.ok(preview.preflight_id);
  assert.throws(() => changePreview({ entityType: 'placements', action: 'delete', id: 'p-1' }), /Use deleteAudit/);
});

test('changeApply requires an unchanged item, matching preflight_id, and exact confirmation before one call', async () => {
  const calls = [];
  await withFetch(
    async (url, init) => {
      calls.push({ url: String(url), init });
      return response({ id: 'rule-1', name: 'VIP eligibility', etag: 1 });
    },
    async () => {
      const item = { name: 'VIP eligibility' };
      const preview = changePreview({ entityType: 'offer-rules', action: 'create', item });

      await assert.rejects(
        () => changeApply({
          sandbox: 'apalmer', accessToken: 'tok', clientId: 'cid', orgId: 'org@AdobeOrg',
          entityType: 'offer-rules', action: 'create', item, preflight_id: preview.preflight_id, confirmation: 'nope',
        }),
        /confirmation must exactly equal/,
      );
      assert.equal(calls.length, 0);

      await assert.rejects(
        () => changeApply({
          sandbox: 'apalmer', accessToken: 'tok', clientId: 'cid', orgId: 'org@AdobeOrg',
          entityType: 'offer-rules', action: 'create', item: { ...item, name: 'changed' },
          preflight_id: preview.preflight_id, confirmation: preview.required_confirmation,
        }),
        /preflight_id is stale or invalid/,
      );
      assert.equal(calls.length, 0);

      const applied = await changeApply({
        sandbox: 'apalmer', accessToken: 'tok', clientId: 'cid', orgId: 'org@AdobeOrg',
        entityType: 'offer-rules', action: 'create', item,
        preflight_id: preview.preflight_id, confirmation: preview.required_confirmation,
      });
      assert.equal(applied.ok, true);
      assert.equal(applied.phase, 'create_submitted');
      assert.equal(applied.id, 'rule-1');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].init.method, 'POST');
      assert.match(calls[0].url, /\/offer-rules$/);
    },
  );
});

test('changeApply update resolves a display name to a real id, PATCHes with a JSON Patch content type, exactly once', async () => {
  const calls = [];
  await withFetch(
    async (url, init) => {
      const href = String(url);
      calls.push({ url: href, method: init.method, contentType: init.headers['Content-Type'] });
      if (init.method === 'PATCH') return response({ id: 'dps:ranking-function:real-id', name: 'My Formula', etag: 2 });
      if (href.endsWith('/ranking-formulas/My%20Formula')) return response({}, 404);
      if (href.endsWith(`/ranking-formulas/${encodeURIComponent('dps:ranking-function:real-id')}`)) {
        return response({ id: 'dps:ranking-function:real-id', name: 'My Formula' });
      }
      if (href.includes('/ranking-formulas?')) {
        return response({ results: [{ id: 'dps:ranking-function:real-id', name: 'My Formula' }] });
      }
      return response({}, 404);
    },
    async () => {
      const patches = [{ op: 'replace', path: '/description', value: 'updated' }];
      const preview = changePreview({ entityType: 'ranking-formulas', action: 'update', id: 'My Formula', patches });

      const applied = await changeApply({
        sandbox: 'apalmer', accessToken: 'tok', clientId: 'cid', orgId: 'org@AdobeOrg',
        entityType: 'ranking-formulas', action: 'update', id: 'My Formula', patches,
        preflight_id: preview.preflight_id, confirmation: preview.required_confirmation,
      });

      assert.equal(applied.ok, true);
      assert.equal(applied.id, 'dps:ranking-function:real-id');
      const patchCall = calls.find((c) => c.method === 'PATCH');
      assert.ok(patchCall);
      assert.equal(patchCall.contentType, 'application/json-patch+json');
      assert.match(patchCall.url, /\/ranking-formulas\/dps%3Aranking-function%3Areal-id$/);
    },
  );
});

test('deleteAudit reports referencedBy from selection-strategies and deleteApply fails closed on a name change', async () => {
  await withFetch(
    async (url) => {
      const href = String(url);
      if (href.includes('/item-collections/')) {
        return response({ id: 'col-1', name: 'VIP collection', etag: 3 });
      }
      if (href.includes('/selection-strategies')) {
        return response({
          results: [
            { id: 'strat-1', name: 'Hero strategy', optionSelection: { filter: 'col-1' } },
            { id: 'strat-2', name: 'Other strategy', optionSelection: { filter: 'col-2' } },
          ],
        });
      }
      return response({}, 404);
    },
    async () => {
      const audit = await deleteAudit({
        sandbox: 'apalmer', accessToken: 'tok', clientId: 'cid', orgId: 'org@AdobeOrg',
        entityType: 'item-collections', id: 'col-1',
      });
      assert.equal(audit.ok, true);
      assert.equal(audit.phase, 'audit');
      assert.equal(audit.expected_name, 'VIP collection');
      assert.equal(audit.referencedBy.length, 1);
      assert.equal(audit.referencedBy[0].id, 'strat-1');

      await assert.rejects(
        () => deleteApply({
          sandbox: 'apalmer', accessToken: 'tok', clientId: 'cid', orgId: 'org@AdobeOrg',
          entityType: 'item-collections', id: 'col-1', expected_name: 'a stale name',
          preflight_id: audit.preflight_id, confirmation: audit.required_confirmation,
        }),
        /Entity name changed since audit/,
      );
    },
  );
});

test('deleteApply deletes exactly once when the confirmed name still matches', async () => {
  const calls = [];
  await withFetch(
    async (url, init) => {
      calls.push({ url: String(url), method: init.method });
      if (init.method === 'DELETE') return new Response(null, { status: 204 });
      return response({ id: 'p-1', name: 'Homepage hero', etag: 2 });
    },
    async () => {
      const audit = await deleteAudit({
        sandbox: 'apalmer', accessToken: 'tok', clientId: 'cid', orgId: 'org@AdobeOrg',
        entityType: 'placements', id: 'p-1',
      });
      const applied = await deleteApply({
        sandbox: 'apalmer', accessToken: 'tok', clientId: 'cid', orgId: 'org@AdobeOrg',
        entityType: 'placements', id: 'p-1', expected_name: audit.expected_name,
        preflight_id: audit.preflight_id, confirmation: audit.required_confirmation,
      });
      assert.equal(applied.ok, true);
      assert.equal(applied.phase, 'delete_submitted');
      assert.equal(applied.deletedName, 'Homepage hero');
      assert.equal(calls.filter((c) => c.method === 'DELETE').length, 1);
    },
  );
});
