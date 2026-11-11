const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const model = require('../web/profile-viewer/cp-decisioning-model.js');
const root = path.join(__dirname, '..', 'web', 'profile-viewer');
const plan = JSON.parse(fs.readFileSync(path.join(root, 'cp-decisioning-catalog-plan.json')));

test('all CP controls and rule paths are schema-verified without any airline attributes', () => {
  assert.equal(model.fields.length, 14);
  assert.ok(!JSON.stringify(plan).includes('airlineCustomer'));
  const hospitality = model.fields.filter(field => field.path.includes('.hotel.customerContext.'));
  assert.equal(hospitality.length, 5);
  assert.equal(model.fields.find(field => field.key === 'room').path,
    '_demoemea.individualCharacteristics.travel.preferences.hotel.accommodationType');
  assert.equal(model.fields.find(field => field.key === 'case').path, '_demoemea.complaint.status');
  for (const field of model.fields) {
    assert.ok(!/airline|flight|britishAirways/i.test(field.path), field.path);
    const evidence = plan.evidence.fields.find(leaf => leaf.path === field.path);
    assert.ok(evidence, field.path);
    assert.ok(evidence.type === (field.schemaType || field.type) || field.type === 'number' && evidence.type === 'integer');
    if (field.format) assert.equal(evidence.format, field.format);
  }
});

test('arrival dates round-trip through UTC calendar days without storing a countdown', () => {
  const now = Date.parse('2026-03-28T23:59:59Z');
  for (const days of [-1, 0, 1, 14, 15, 365]) {
    assert.equal(model.arrivalDays(model.arrivalDate(days, now), now), days);
  }
  assert.equal(model.arrivalDate(1, now), '2026-03-29');
  assert.equal(model.arrivalDays('2026-03-29', Date.parse('2026-03-29T23:59:59Z')), 0);
  for (const value of ['2026-02-30', 'not-a-date', '2026-1-01', '2026-01-01T12:00:00Z']) {
    assert.throws(() => model.arrivalDays(value), /Invalid stored check-in/);
  }
  assert.throws(() => model.arrivalDate(1.5), /whole number/);
  for (const [days, objective] of [[0, 'prepare'], [1, 'prepare'], [14, 'prepare'], [15, 'grow'], [365, 'grow'], [-1, null], [366, null], [undefined, null]]) {
    assert.equal(model.evaluate({ ...model.defaults, booking: 'Booked', days }).objective, objective);
  }
});

function profileHelper() {
  const context = { DecisioningDemoModel: model, console };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'tui-decisioning-profile.js'), 'utf8'), context);
  return context.TuiDecisioningProfile;
}

test('profile hydration and Apply snapshots use hospitality fields and serialize dates', () => {
  const helper = profileHelper();
  const stored = model.attributes({ ...model.defaults, days: 7, booking: 'Booked', room: 'Treehouse' });
  const rows = model.fields.map(field => ({ path: field.path, value: stored[field.path],
    valueType: field.schemaType || field.type, industry: helper.industry(field), writable: true }));
  rows.push({ path: '_demoemea.airlineCustomer.journeyStage', value: 'In-Trip', valueType: 'string', industry: 'travel', writable: true });
  rows.push({ path: '_demoemea.hotel.bookingDetails.roomType', value: 'Woodland Lodge', valueType: 'string', industry: 'travel', writable: true });
  const signals = helper.signals(rows);
  assert.equal(signals.booking, 'Booked');
  assert.equal(signals.room, 'Treehouse');
  assert.equal(signals.days, 7);
  assert.equal(helper.signals(rows.filter(row => row.path.includes('airlineCustomer'))).booking, undefined);
  const industries = { generic: { writable: true, schemaId: 'generic' }, travel: { writable: true, schemaId: 'travel' } };
  const batch = helper.snapshots({ rows, industries }, { ...signals, days: 1, case: 'Open' }, ['days', 'case']);
  assert.equal(batch.expected['hotel.bookingDetails.checkInDate'], model.arrivalDate(1));
  assert.equal(batch.expected['complaint.status'], 'Open');
  assert.ok(!Object.keys(batch.expected).some(key => /airline|daysUntil/i.test(key)));
  const update = batch.snapshots.find(group => group.industry === 'travel').updates.find(row => row.path === 'hotel.bookingDetails.checkInDate');
  assert.equal(update.valueType, 'string');
  assert.equal(batch.snapshots.find(group => group.industry === 'generic').updates.find(row => row.path === 'complaint.status').value, 'Open');
  assert.equal(batch.snapshots.find(group => group.industry === 'travel').updates.find(row => row.path === 'airlineCustomer.journeyStage').value, 'In-Trip');
  assert.deepEqual(Array.from(helper.differences([
    ...rows.filter(row => !['hotel.bookingDetails.checkInDate', 'complaint.status'].includes(helper.relative(row.path))),
    ...Object.entries(batch.expected).map(([path, value]) => ({ path, value, valueType: 'string' })),
  ], batch.expected)), []);
  const tui = require('../web/profile-viewer/tui-decisioning-profile.js');
  assert.equal(tui.signals([{ path: '_demoemea.airlineCustomer.journeyStage', value: 'Booked', valueType: 'string' }]).booking, 'Booked');
});

test('seven CP strategies and scenarios have explicit precedence and CP-only names', () => {
  assert.equal(model.objectives.length, 7);
  assert.deepEqual(model.demoScenarios.map(s => s.rank), [7, 6, 5, 4, 3, 2, 1]);
  for (const scenario of model.scenarios) {
    const result = model.evaluate({ ...model.defaults, ...scenario.preset });
    assert.equal(result.objective, scenario.expectedObjective, scenario.name);
    assert.equal(result.offer, scenario.expectedOffer, scenario.name);
  }
  const offers = model.objectives.flatMap(o => o.offers);
  assert.equal(offers.length, 21);
  assert.equal(new Set(offers.map(item => item.name)).size, 21);
  for (const item of offers) {
    assert.ok(item.name.startsWith('CP - '));
    assert.ok(fs.existsSync(path.join(root, item.image)), item.image);
  }
  assert.equal(model.evaluate({ ...model.defaults, case: 'Escalated', booking: 'In-Trip', abandoned: true }).objective, 'protect');
});

test('consent is explicit and missing values cannot satisfy conditions', () => {
  for (const channel of ['emailConsent', 'personalize']) {
    for (const value of ['n', 'u', undefined, null]) {
      assert.equal(model.evaluate({ ...model.defaults, [channel]: value }).offer, null);
    }
  }
  assert.equal(model.evaluate({ emailConsent: 'y', personalize: 'y' }).offer, null);
});

test('every CP offer is reachable with customer-specific signals', () => {
  const winners = new Set();
  for (const booking of ['Dreaming', 'Booked', 'In-Trip', 'Post-Trip'])
    for (const days of [1, 7, 14, 15, 30])
      for (const score of [1, 2, 3])
        for (const room of ['Woodland Lodge', 'Executive Lodge', 'Treehouse'])
          for (const status of ['None', 'Open', 'Pending', 'Escalated'])
            for (const engagement of ['Active', 'Dormant'])
              for (const service of [false, true])
                for (const abandoned of [false, true])
                  for (const app of [false, true]) {
                    const result = model.evaluate({ ...model.defaults, booking, days, score, room, case: status,
                      engagement, service, abandoned, app, intent: abandoned ? 'High' : 'None' });
                    if (result.offer) winners.add(result.offer);
                  }
  // High-intent searches can convert without an abandonment event.
  for (const room of ['Woodland Lodge', 'Treehouse']) winners.add(model.evaluate({ ...model.defaults, intent: 'High', room }).offer);
  assert.deepEqual([...winners].sort(), model.objectives.flatMap(o => o.offers.map(item => item.key)).sort());
});

test('catalog plan is schema-verified and contains visual rules and tag collection models, not PQL alone', () => {
  assert.equal(plan.customer, 'CP');
  assert.equal(plan.status, 'preview-only');
  assert.equal(plan.assetsCreated, false);
  assert.equal(plan.activationAllowed, false);
  assert.equal(plan.evidence.sandbox, 'kirkham');
  assert.equal(plan.evidence.fields.length, model.fields.length);
  for (const objective of plan.objectives) {
    assert.ok(objective.tag.name.startsWith('CP - '));
    const constraint = objective.collection.constraints[0];
    assert.match(constraint.constraint, /itemTags IN/);
    assert.equal(JSON.parse(constraint.uiModel).operator, 'in');
    assert.equal(objective.strategy.rank.priority, objective.rank);
    for (const rule of [objective.eligibility, ...objective.offers.map(item => item.eligibility).filter(Boolean)]) {
      assert.ok(rule.name.startsWith('CP - '));
      assert.equal(rule.exdRule, true);
      assert.equal(rule.condition.format, 'pql/text');
      const container = rule.segmentModel.expression.profileAttributesContainer;
      assert.ok(container.items.length >= 1 && container.items.length <= 3);
      function check(container) {
        for (const item of container.items) {
          if (item.itemType === 'segmentContainer') { check(item); continue; }
          assert.equal(item.itemType, 'segmentRule');
          assert.ok(['bx', 'rE'].includes(item.component.type));
          if (item.comparisonType === 'rolling-range-future') {
            assert.equal(item.temporalConstraint.referencedDirection, 'after');
            assert.equal(item.temporalConstraint.start.unit, 'days');
            assert.ok(item.temporalConstraint.start.quantity >= 1);
          }
          if (item.comparisonType === 'equals') assert.ok(Array.isArray(item.value));
          assert.ok(plan.evidence.fields.some(field => 'profile.' + field.path === item.component.id));
        }
      }
      check(container);
    }
  }
  assert.throws(() => model.catalogPlan(null), /verification/);
});

test('CP customer content is live-only while retaining explicit Apply and profile safeguards', () => {
  const html = fs.readFileSync(path.join(root, 'cp-decisioning-demo.html'), 'utf8');
  assert.match(html, /data-demo-env-strip-prefix="cpDecisioning"/);
  assert.match(html, /tui-decisioning-attribution\.js\?v=20261111-selected-offer/);
  assert.match(html, /tui-decisioning-drawer\.js\?v=20261111-compact-names/);
  assert.match(html, /tui-profile-hero\.js/);
  assert.match(html, /autoRunDecisioning: false/);
  const visualiser = fs.readFileSync(path.join(root, 'cp-decisioning-visualiser.html'), 'utf8');
  assert.doesNotMatch(html + visualiser, /href="cp-decisioning-catalog-plan\.json"|Historical AJO catalog plan|AJO catalog plan/);
  assert.match(visualiser, /Verified schema \/ mapping boundary/);
  assert.doesNotMatch(visualiser, /No assets created or activated/);
  assert.equal(model.brand.showSimulation, false);
  assert.doesNotMatch(visualiser, /<img\b/);
  assert.match(visualiser, /Awaiting a live decision/);
  const source = fs.readFileSync(path.join(root, 'tui-decisioning-demo.js'), 'utf8');
  assert.doesNotMatch(source, /global\.confirm\(/);
  assert.equal(model.brand.confirmProfileChanges, undefined);
  assert.ok(source.indexOf('await preflight(') < source.indexOf('await global.postProfileUpdate('));
  assert.match(source, /if \(!isTest\(latest\)\)/);
  assert.ok(source.indexOf('await api().prepareDecision(') < source.indexOf('await result.manualDisplay.alloy('));
  assert.ok(source.indexOf('api().commitDecision(') < source.indexOf('await result.manualDisplay.alloy('));
  assert.match(source, /Live decision succeeded; follow-up failed:/);
  assert.match(source, /brand\.requiredSandbox && ctx\.sandbox !== brand\.requiredSandbox/);
});
