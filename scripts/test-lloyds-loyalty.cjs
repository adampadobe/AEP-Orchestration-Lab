const assert = require('node:assert/strict');
const { test } = require('node:test');
const model = require('../web/profile-viewer/lloyds-loyalty-model.js');

test('task progress uses reported goal type and actual zero counters, never historical completions', () => {
  const task = { variables: { goal: 3, type: 'quantity' }, accumulators: { qty: 0 }, taskCompletions: ['previous'] };
  assert.deepEqual(model.progress(task), { value: 0, goal: 3, key: 'qty' });
  assert.equal(model.progress({ ...task, variables: { goal: 3 } }), null);
  assert.equal(model.progress({ ...task, accumulators: {} }), null);
  assert.equal(model.progress({ ...task, accumulators: { qty: false } }), null);
  assert.equal(model.progress({ ...task, variables: { goal: 0, type: 'qty' } }), null);
  assert.equal(model.progress({ ...task, variables: { goal: '3', type: 'qty' } }), null);
  assert.deepEqual(model.progress({ variables: { goal: 100, type: 'spend' }, accumulators: { spend: 25, qty: 9 } }),
    { value: 25, goal: 100, key: 'spend' });
});

test('card selection is surface-exact, ranked, JSON-only and retains original proposition and item attribution', () => {
  const surface = 'web://example.invalid/rewards#ContentCardContainer';
  const proposition = (id, scope, rank, content = { title: { content: id } }) => ({
    id, scope, scopeDetails: { decisionProvider: 'CJM', rank }, items: [{
      id: 'item-' + id, itemSelection: { selectionDetail: { strategyID: 'strategy-' + id } },
      data: { rules: [{ consequences: [{ id: 'consequence-' + id, detail: { data: { contentType: 'application/json', content } } }] }] },
    }],
  });
  const low = proposition('low', surface, 1), high = proposition('high', surface, 2);
  const hero = proposition('hero', surface.replace('ContentCardContainer', 'hero-banner'), 999);
  const selected = model.selectCard([low, hero, high], surface);
  assert.equal(selected.proposition, high); assert.equal(selected.item, high.items[0]);
  assert.equal(selected.consequenceId, 'consequence-high');
  assert.equal(model.selectCard([hero], surface), null);
  high.items[0].data.rules[0].consequences[0].detail.data.meta = { rank: 0 };
  assert.equal(model.selectCard([low, high], surface).proposition, low);
  high.items[0].data.rules[0].consequences[0].detail.data.contentType = 'text/html';
  assert.equal(model.selectCard([high], surface), null);
  high.items[0].data.rules[0].consequences[0].detail.data.contentType = 'application/json';
  high.items[0].data.rules[0].consequences[0].detail.data.content = '{broken';
  assert.equal(model.selectCard([high], surface), null);
  high.items[0].data.rules[0].consequences[0].detail.data.content = {};
  assert.equal(model.selectCard([high], surface), null, 'Empty JSON must not become fabricated reward content');
});

test('content-card links refuse executable protocols', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '', 'file:///tmp/test']) {
    assert.equal(model.safeUrl(url, 'https://example.invalid/rewards'), '');
  }
  assert.equal(model.safeUrl('#tasks', 'https://example.invalid/rewards'), 'https://example.invalid/rewards#tasks');
});
