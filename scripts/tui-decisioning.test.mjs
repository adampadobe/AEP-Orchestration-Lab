import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { compilePlan, evaluateScenario } from './provision-decisioning-catalog.mjs';
import { buildTuiPlan } from './tui-decisioning-catalog-plan.mjs';

const model = createRequire(import.meta.url)('../web/profile-viewer/tui-decisioning-model.js');
const raw = model.tags.map(([id, name], i) => ({
  id: `dps:fixture:${i}`, _experience: { decisioning: { decisionitem: {
    itemCatalogID: 'xcore:decision-catalog:18c6b876319b00e4',
    itemTags: [id], itemTagDetails: [{ id, name }],
  } } },
}));

test('every TUI scenario selects its expected objective and offer, including consent holds', () => {
  assert.equal(model.objectives.length, 7);
  assert.equal(model.objectives.reduce((n, o) => n + o.offers.length, 0), 21);
  for (const scenario of model.scenarios) {
    const result = model.evaluate({ ...model.defaults, ...scenario.preset });
    assert.equal(result.objective, scenario.expectedObjective, scenario.name);
    assert.equal(result.offer, scenario.expectedOffer, scenario.name);
  }
});

test('website and compiled catalog agree on all non-consent scenarios', () => {
  const plan = buildTuiPlan(raw);
  const bundle = compilePlan(plan);
  assert.equal(bundle.assets.filter(a => a.entity_type === 'offer-items').length, 21);
  assert.equal(bundle.assets.filter(a => a.entity_type === 'selection-strategies').length, 7);
  assert.equal(bundle.assets.filter(a => a.entity_type === 'item-collections').length, 7);
  for (const scenario of plan.scenarios) {
    assert.deepEqual(evaluateScenario(plan, scenario.attributes),
      { objective: scenario.expectedObjective, offer: scenario.expectedOffer });
  }
  for (const a of bundle.assets.filter(a => a.entity_type === 'offer-items')) {
    assert.equal(a.item._experience.decisioning.offeritem.lifecycleStatus, 'draft');
    assert.ok(!a.item._demoemea.content.mediaAssets, 'Do not invent publicly hosted media URLs');
  }
});

test('all 21 items have a winning assertion and all controls affect actual decision logic', () => {
  const rulePaths = new Set();
  for (const o of model.objectives) {
    o.rule.conditions.forEach(c => rulePaths.add(c.path));
    for (const item of o.offers) {
      item.rule?.conditions.forEach(c => rulePaths.add(c.path));
      assert(model.scenarios.some(s => s.expectedObjective === o.key && s.expectedOffer === item.key));
    }
  }
  for (const f of model.fields) {
    assert(rulePaths.has(f.path) || f.group === 'Consent', f.key + ' must not be decorative');
    assert(!f.path.includes('tuiDecisioning') && !f.path.includes('britishAirwaysDecisioning'));
  }
});

test('service precedence, within-objective switching and exact numeric boundaries', () => {
  const choose = preset => model.evaluate({ ...model.defaults, ...preset });
  assert.equal(choose({ intent: 'High', disruption: 'cancelled' }).objective, 'protect');
  assert.equal(choose({ booking: 'Booked', days: 1 }).offer, 'checkin');
  assert.equal(choose({ booking: 'Booked', days: 2 }).offer, 'seats');
  assert.equal(choose({ booking: 'Booked', days: 14 }).objective, 'prepare');
  assert.equal(choose({ booking: 'Booked', days: 15 }).objective, 'grow');
  assert.equal(choose({ booking: 'Booked', score: 3 }).offer, 'experiences');
  assert.equal(choose({ booking: 'Booked', score: 2.99 }).offer, 'seat-options');
  assert.equal(choose({ booking: 'Booked', score: 2 }).offer, 'seat-options');
  assert.equal(choose({ booking: 'Booked', score: 1.99 }).offer, 'hotel-options');
  for (const value of ['n', 'u', '', undefined]) {
    assert.equal(choose({ emailConsent: value, disruption: 'cancelled' }).offer, null);
    assert.equal(choose({ personalize: value }).offer, null);
  }
});

test('missing verified tags fail closed rather than inventing UUIDs', () => {
  assert.throws(() => buildTuiPlan([]), /Missing live unified tag/);
  const bad = structuredClone(raw);
  bad[0]._experience.decisioning.decisionitem.itemTagDetails = [];
  assert.throws(() => buildTuiPlan(bad), /Missing live unified tag/);
});

test('captured analytics/scripts are not imported and presentation uses dashboard color tokens', async () => {
  const base = new URL('../web/profile-viewer/', import.meta.url);
  const html = await readFile(new URL('tui-decisioning-visualiser.html', base), 'utf8');
  const css = await readFile(new URL('tui-decisioning-demo.css', base), 'utf8');
  const controller = await readFile(new URL('tui-decisioning-visualiser.js', base), 'utf8');
  assert.doesNotMatch(html, /utag|alloy|gigya|datadog|https?:\/\//i);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|prefers-color-scheme/i);
  assert.doesNotMatch(controller, /innerHTML|fetch\(|XMLHttpRequest/);
  for (const f of ['tui-decisioning-demo.html', 'tui-decisioning-visualiser.html']) {
    const text = await readFile(new URL(f, base), 'utf8');
    const sheets = [...text.matchAll(/<link[^>]+href="([^"]+)"/g)].map(m => m[1]);
    assert(sheets.at(-1).startsWith('aep-theme.css'));
  }
});
