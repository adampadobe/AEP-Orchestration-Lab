import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { compilePlan, contains, evaluateScenario, runPlan } from './provision-decisioning-catalog.mjs';

function fixture() {
  const plan = {
    version: 1, sandbox: 'kirkham', customer: 'Fictional test customer', tenant: '_tenant',
    schemaId: 'https://ns.adobe.com/test/schemas/offers',
    profileSchemaId: 'https://ns.adobe.com/test/schemas/profile',
    catalogId: 'xcore:decision-catalog:test', collectionTemplateId: 'dps:item-collection:template',
    profileFields: [
      { path: '_tenant.test.stage', type: 'number', dataflow: 'fixture only' },
      { path: '_tenant.test.intent', type: 'string', dataflow: 'fixture only' },
    ],
    objectives: [], scenarios: [],
  };
  for (let i = 1; i <= 7; i++) {
    plan.objectives.push({
      key: `objective-${i}`, label: `Objective ${i}`,
      tag: { id: `00000000-0000-4000-8000-00000000000${i}`, name: `Tag ${i}`, sourceOfferId: `dps:offer:source-${i}` },
      rule: { operator: 'and', conditions: [{ path: '_tenant.test.stage', op: 'eq', value: i }] },
      offers: [
        { key: 'preferred', name: `Preferred ${i}`, priority: 20,
          content: { title: 'Fictional test content' },
          rule: { operator: 'and', conditions: [{ path: '_tenant.test.intent', op: 'eq', value: 'buy' }] } },
        { key: 'renew', name: `Renew ${i}`, priority: 15,
          content: { title: 'Fictional renewal content' },
          rule: { operator: 'and', conditions: [{ path: '_tenant.test.intent', op: 'eq', value: 'renew' }] } },
        { key: 'fallback', name: `Fallback ${i}`, priority: 10, content: { title: 'Fictional test content' } },
      ],
    });
    for (const intent of ['buy', 'renew', 'browse']) {
      plan.scenarios.push({ name: `${i} ${intent}`,
        attributes: { '_tenant.test.stage': i, '_tenant.test.intent': intent },
        expectedObjective: `objective-${i}`, expectedOffer: intent === 'buy' ? 'preferred' : intent === 'renew' ? 'renew' : 'fallback' });
    }
  }
  plan.scenarios.push({ name: 'none', attributes: { '_tenant.test.stage': 0, '_tenant.test.intent': 'browse' },
    expectedObjective: null, expectedOffer: null });
  return plan;
}

function backend(plan) {
  const saved = new Map();
  const calls = [];
  const di = '_experience.decisioning.decisionitem.itemTags';
  const templateModel = JSON.stringify({ operator: 'in', value: {
    left: di, right: ['original-tag'], meta: { left: { title: 'Tags', type: 'tag' } },
  } });
  saved.set(plan.collectionTemplateId, { id: plan.collectionTemplateId,
    constraints: [{ itemCatalogId: plan.catalogId, uiModel: templateModel }] });
  for (const o of plan.objectives) saved.set(o.tag.sourceOfferId, { id: o.tag.sourceOfferId,
    _experience: { decisioning: { decisionitem: { itemCatalogID: plan.catalogId,
      itemTags: [o.tag.id], itemTagDetails: [{ id: o.tag.id, name: o.tag.name }] } } } });
  const call = async (route, body) => {
    calls.push({ route, body });
    if (route === 'schema') return { schemaId: plan.schemaId };
    if (route === 'get') return { raw: structuredClone(saved.get(body.id)) };
    if (route === 'change-preview') return { preflight_id: 'preview', required_confirmation: 'exact phrase',
      proposed: body.item };
    if (route === 'change-apply') {
      assert.equal(body.preflight_id, 'preview');
      assert.equal(body.confirmation, 'exact phrase');
      const id = `dps:test:${saved.size}`;
      saved.set(id, { ...structuredClone(body.item), id });
      return { id };
    }
    throw new Error(`Unexpected route ${route}`);
  };
  return { call, calls, saved };
}

test('compiles seven strategies, tag collections, draft content and both rule levels', () => {
  const plan = fixture();
  const result = compilePlan(plan);
  assert.equal(result.assets.filter(a => a.entity_type === 'selection-strategies').length, 7);
  assert.equal(result.assets.filter(a => a.entity_type === 'offer-rules').length, 21);
  assert.equal(result.assets.filter(a => a.entity_type === 'offer-items').length, 21);
  for (const a of result.assets.filter(a => a.entity_type === 'offer-items')) {
    assert.equal(a.item._experience.decisioning.offeritem.lifecycleStatus, 'draft');
    assert.ok(!a.item.id);
  }
  assert.equal(compilePlan({ ...plan, customer: 'Changed' }).fingerprint === result.fingerprint, false);
});

test('rejects malformed plans before any network operation', () => {
  const mutations = [
    p => { p.sandbox = 'other'; },
    p => { p.objectives.pop(); },
    p => { p.objectives[0].tag.id = 'dps:tag:legacy'; },
    p => { p.objectives[0].rule.conditions[0].value = '1'; },
    p => { p.objectives[0].rule.conditions[0].path = '_tenant.nonexistent'; },
    p => { p.objectives[0].rule.conditions.push(...p.objectives[0].rule.conditions, ...p.objectives[0].rule.conditions); },
    p => { p.objectives[0].offers[0].content.title = ''; },
    p => { p.objectives[0].offers[0].content.unrecognised = 'copy'; },
    p => { p.objectives[0].offers[0].priority = 10; },
    p => { p.scenarios[0].expectedOffer = 'fallback'; },
    p => { p.scenarios = p.scenarios.filter(s => s.expectedObjective !== 'objective-7'); },
    p => { p.profileFields[0].path = '_tenant.brandDecisioning.stage'; },
  ];
  for (const mutate of mutations) {
    const plan = fixture();
    mutate(plan);
    assert.throws(() => compilePlan(plan));
  }
});

test('evaluates actual eligibility before priority, case-insensitively for strings', () => {
  const plan = fixture();
  assert.deepEqual(evaluateScenario(plan, { '_tenant.test.stage': 1, '_tenant.test.intent': 'BUY' }),
    { objective: 'objective-1', offer: 'preferred' });
  assert.deepEqual(evaluateScenario(plan, {}), { objective: null, offer: null });
  plan.objectives[0].rule.conditions[0] = { path: '_tenant.test.stage', op: 'in', value: [1, 2] };
  assert.equal(evaluateScenario(plan, { '_tenant.test.stage': 2, '_tenant.test.intent': 'browse' }).objective, 'objective-1');
});

test('applies dependencies sequentially, verifies raw values and resumes without duplicates', async () => {
  const plan = fixture();
  const { call, calls, saved } = backend(plan);
  const state = { fingerprint: compilePlan(plan).fingerprint, assets: {} };
  let persisted;
  const save = async value => { persisted = structuredClone(value); };
  const options = { call, state, save, confirm: state.fingerprint };
  const result = await runPlan(plan, options);
  assert.equal(result.policyActivated, false);
  assert.ok(Object.values(persisted.assets).every(a => a.status === 'verified'));
  const count = calls.filter(c => c.route === 'change-apply').length;
  await runPlan(plan, options);
  assert.equal(calls.filter(c => c.route === 'change-apply').length, count);
  const strategy = saved.get(result.ids['objective-1-strategy']);
  assert.equal(strategy.optionSelection.filter, result.ids['objective-1-collection']);
  assert.equal(strategy.profileConstraint.eligibilityRule, result.ids['objective-1-rule']);
  const collection = saved.get(result.ids['objective-1-collection']);
  const model = JSON.parse(collection.constraints[0].uiModel);
  assert.deepEqual(model.value.right, [plan.objectives[0].tag.id]);
  assert.equal(model.value.meta.left.title, 'Tags');
  saved.get(result.ids['objective-1-preferred'])._experience.decisioning.offeritem.lifecycleStatus = 'approved';
  await assert.rejects(runPlan(plan, options), /drifted/);
});

test('requires approval, rejects schema/tag drift and never retries ambiguous writes', async () => {
  const plan = fixture();
  const state = { fingerprint: compilePlan(plan).fingerprint, assets: {} };
  const b = backend(plan);
  await assert.rejects(runPlan(plan, { ...b, state, save: async () => {}, confirm: 'wrong' }), /fingerprint/);
  assert.equal(b.calls.length, 0);
  const source = b.saved.get(plan.objectives[0].tag.sourceOfferId);
  source._experience.decisioning.decisionitem.itemTagDetails[0].name = 'changed';
  await assert.rejects(runPlan(plan, { ...b, state, save: async () => {}, confirm: state.fingerprint }), /tag verification/);
  const good = backend(plan);
  const uncertain = async (route, body) => {
    const result = await good.call(route, body);
    if (route === 'change-apply') throw new Error('timeout after submission');
    return result;
  };
  await assert.rejects(runPlan(plan, { call: uncertain, state, save: async () => {}, confirm: state.fingerprint }), /timeout/);
  assert.equal(state.assets['objective-1-rule'].status, 'pending');
  await assert.rejects(runPlan(plan, { ...good, state, save: async () => {}, confirm: state.fingerprint }), /Ambiguous/);
  assert.equal(good.calls.filter(c => c.route === 'change-apply').length, 1);
});

test('readback rejects missing content and extra tag membership', () => {
  assert.equal(contains({ a: ['one', 'two'] }, { a: ['one'] }), false);
  assert.equal(contains({ a: {} }, { a: { title: 'content' } }), false);
  assert.equal(contains({ a: { title: 'content', id: 'server' } }, { a: { title: 'content' } }), true);
});

test('numeric boundaries, boolean types and string IN generate matching PQL', () => {
  const plan = fixture();
  plan.profileFields.push({ path: '_tenant.test.enabled', type: 'boolean', dataflow: 'fixture only' });
  for (const s of plan.scenarios) s.attributes['_tenant.test.enabled'] = s.attributes['_tenant.test.intent'] === 'buy';
  plan.objectives[0].offers[0].rule = { operator: 'and', conditions: [
    { path: '_tenant.test.stage', op: 'gte', value: 1 },
    { path: '_tenant.test.enabled', op: 'eq', value: true },
  ] };
  plan.objectives[0].offers[1].rule.conditions[0] = { path: '_tenant.test.intent', op: 'in', value: ['renew', 'RENEWAL'] };
  const compiled = compilePlan(plan);
  assert.match(compiled.assets.find(a => a.key === 'objective-1-preferred-rule').item.condition.value, /stage >= 1/);
  assert.match(compiled.assets.find(a => a.key === 'objective-1-preferred-rule').item.condition.value, /enabled = true/);
  assert.match(compiled.assets.find(a => a.key === 'objective-1-renew-rule').item.condition.value, /stringCompare/);
  const visual = compiled.assets.find(a => a.key === 'objective-1-preferred-rule').item.segmentModel.expression.profileAttributesContainer;
  assert.equal(visual.items[0].comparisonType, '>=');
  assert.equal(visual.items[0].value, 1);
  assert.deepEqual(visual.items[1].value, [true]);
  assert.deepEqual(compiled.assets.find(a => a.key === 'objective-1-renew-rule').item.segmentModel.expression
    .profileAttributesContainer.items[0].value, ['renew', 'RENEWAL']);
  const rule = plan.objectives[0].rule;
  rule.conditions = [
    { path: '_tenant.test.stage', op: 'gte', value: 1 },
    { path: '_tenant.test.stage', op: 'lte', value: 2 },
  ];
  for (const stage of [1, 2]) {
    assert.equal(evaluateScenario(plan, { '_tenant.test.stage': stage, '_tenant.test.intent': 'browse' }).objective, 'objective-1');
  }
  assert.equal(evaluateScenario(plan, { '_tenant.test.stage': 0 }).objective, null);
  assert.equal(evaluateScenario(plan, { '_tenant.test.stage': 3 }).objective, 'objective-3');
});

test('schema drift and a failed pending-journal save prevent all writes', async () => {
  const plan = fixture();
  const state = { fingerprint: compilePlan(plan).fingerprint, assets: {} };
  const b = backend(plan);
  const changedSchema = (route, body) => route === 'schema' ? { schemaId: 'changed' } : b.call(route, body);
  await assert.rejects(runPlan(plan, { call: changedSchema, state, save: async () => {}, confirm: state.fingerprint }),
    /schema differs/);
  await assert.rejects(runPlan(plan, { ...b, state, save: async () => { throw new Error('disk full'); },
    confirm: state.fingerprint }), /disk full/);
  assert.equal(b.calls.filter(c => c.route === 'change-apply').length, 0);
});

test('invalid collection UI metadata fails preflight before creating any rules or items', async () => {
  const plan = fixture();
  const state = { fingerprint: compilePlan(plan).fingerprint, assets: {} };
  const b = backend(plan);
  b.saved.get(plan.collectionTemplateId).constraints[0].uiModel = '{"operator":"and","value":[]}';
  await assert.rejects(runPlan(plan, { ...b, state, save: async () => {}, confirm: state.fingerprint }),
    /single tag IN predicate/);
  assert.equal(b.calls.filter(c => c.route === 'change-apply').length, 0);
  assert.deepEqual(state.assets, {});
});

test('CLI dry run emits the full 21-item bundle without a journal; existing lock is preserved', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aep-catalog-plan-test-'));
  try {
    const plan = fixture();
    const filename = join(dir, 'plan.json');
    const journal = join(dir, 'journal.json');
    await writeFile(filename, JSON.stringify(plan));
    const script = new URL('./provision-decisioning-catalog.mjs', import.meta.url);
    const { fileURLToPath } = await import('node:url');
    const run = (...args) => spawnSync(process.execPath, [fileURLToPath(script), filename, ...args], { encoding: 'utf8' });
    const preview = run();
    assert.equal(preview.status, 0, preview.stderr);
    const parsed = JSON.parse(preview.stdout);
    assert.equal(parsed.assets.filter(a => a.entity_type === 'offer-items').length, 21);
    assert.equal(parsed.fingerprint, compilePlan(plan).fingerprint);
    assert.deepEqual(await readdir(dir), ['plan.json']);
    await writeFile(`${journal}.lock`, 'other active writer');
    const blocked = run('--apply', '--confirm', parsed.fingerprint, '--state', journal);
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /EEXIST/);
    assert.equal(await readFile(`${journal}.lock`, 'utf8'), 'other active writer');
    const badFlag = run('--unknown');
    assert.notEqual(badFlag.status, 0);
    assert.match(badFlag.stderr, /Unknown/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
