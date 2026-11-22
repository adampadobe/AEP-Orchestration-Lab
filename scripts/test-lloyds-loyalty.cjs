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

test('challenge classification preserves explicit participation and rejects ambiguous or malformed state', () => {
  const response = { challengeList: [
    { challenge_id: 'joined-fixture', optedIn: true, tasks: [] },
    { challenge_id: 'available-fixture', optedIn: ' false ', tasks: [{ variables: { spendMin: 75 }, accumulators: { spend: 0 } }] },
    { challenge_id: 'unknown-fixture' },
  ] };
  const state = model.normaliseChallengeResponse(response), groups = model.classifyChallenges(state.challengeList);
  assert.deepEqual(groups.joinedChallenges.map(challenge => challenge.challenge_id), ['joined-fixture']);
  assert.deepEqual(groups.availableChallenges.map(challenge => challenge.challenge_id), ['available-fixture']);
  assert.deepEqual(groups.unknownChallenges.map(challenge => challenge.challenge_id), ['unknown-fixture']);
  assert.equal(state.challengeList[1].tasks[0].accumulators.spend, 0);
  assert.equal(state.challengeList[2].tasksReported, false);
  assert.equal(response.challengeList[1].optedIn, ' false ', 'Parsing does not mutate the Adobe response');
  for (const malformed of [{}, { challengeList: null }, { challengeList: [null] },
    { challengeList: [{ challenge_id: 'x', optedIn: 1 }] },
    { challengeList: [{ challenge_id: 'x', tasks: {} }] },
    { challengeList: [{ challenge_id: 'x', tasks: [null] }] },
    { challengeList: [{ challenge_id: 'x' }, { challenge_id: 'x' }] }]) {
    assert.throws(() => model.normaliseChallengeResponse(malformed), /Malformed/);
  }
  assert.deepEqual(model.classifyChallenges(model.normaliseChallengeResponse({ challengeList: [] }).challengeList),
    { joinedChallenges: [], availableChallenges: [], unknownChallenges: [] });
});

test('available summaries describe arbitrary task goals without inferring currency or accumulated progress', () => {
  assert.equal(model.getChallengeSummary({ tasks: [{ variables: { spendMin: 75 } }] }), 'Qualifying spend target: 75');
  assert.equal(model.getChallengeSummary({ tasks: [{ variables: { spendMin: 80, currencyCode: 'EUR' }, accumulators: { spend: 20 } }] }),
    'Qualifying spend target: 80 EUR');
  assert.equal(model.getChallengeSummary({ tasks: [
    { variables: { qtyMin: 4 } }, { taskName: 'Visit a partner', variables: { customTarget: 9 } },
    { desc: 'An Adobe-authored goal', variables: { mystery: 1 } },
  ] }), '4 qualifying items; Visit a partner; An Adobe-authored goal');
  assert.equal(model.getChallengeSummary({}), '');
  assert.equal(model.getChallengeSummary({ tasks: [{ taskName: 'Visit a partner', variables: { goal: 3, type: 'customCounter' } }] }),
    'Visit a partner target: 3', 'Technical counter types stay in API details');
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

test('all content cards are ranked stably without merging proposition, item or consequence contexts', () => {
  const surface = 'web://example.invalid/rewards#ContentCardContainerLoyalty';
  const content = title => ({ contentType: 'application/json', content: { title: { content: title } } });
  const first = { id: 'first', scope: surface, scopeDetails: { rank: 1, correlationID: 'first-token' },
    items: [{ id: 'first-item', data: content('First') }] };
  const second = { id: 'second', scope: surface, scopeDetails: { rank: 2, correlationID: 'second-token' },
    items: [{ id: 'second-item', data: { rules: [{ consequences: [
      { id: 'second-a', detail: { data: content('Second A') } },
      { id: 'second-b', detail: { data: content('Second B') } },
    ] }] } }, { id: 'override-item', data: { ...content('Override'), meta: { rank: '3', challengeId: 'dynamic' } } }] };
  const unranked = { id: 'unranked', scope: surface, scopeDetails: {}, items: [
    { id: 'last-a', data: content('Last A') }, { id: 'last-b', data: content('Last B') },
  ] };
  const before = JSON.stringify([first, second, unranked]);
  const cards = model.selectCards([first, second, unranked, { ...second, scope: surface + '-other' }], surface);
  assert.deepEqual(cards.map(card => card.content.title.content), ['Override', 'Second A', 'Second B', 'First', 'Last A', 'Last B']);
  assert.equal(cards[1].proposition, second);
  assert.equal(cards[1].item, second.items[0]);
  assert.equal(cards[2].consequenceId, 'second-b');
  assert.equal(cards[0].meta, second.items[1].data.meta);
  assert.equal(model.selectCard([first, second, unranked], surface).consequenceId, cards[0].consequenceId);
  assert.equal(JSON.stringify([first, second, unranked]), before);
  assert.deepEqual(model.selectCards([], surface), []);
});

test('evaluated native journey cards retain their original item and exact surface', () => {
  const surface = 'web://example.invalid/rewards#ContentCardContainerLoyalty';
  const proposition = { id: 'journey', scope: surface, scopeDetails: { decisionProvider: 'CJM' },
    items: [{ id: 'card', schema: 'https://ns.adobe.com/personalization/message/content-card',
      data: { content: { title: 'Journey reward', body: 'Delivered card', imageUrl: 'https://example.invalid/reward.png',
        actionUrl: '#tasks' }, meta: { buttonLabel: 'View tasks' } } }] };
  const selected = model.selectCard([proposition], surface);
  assert.equal(selected.proposition, proposition);
  assert.equal(selected.item, proposition.items[0]);
  assert.equal(selected.content.title.content, 'Journey reward');
  assert.equal(selected.content.body.content, 'Delivered card');
  assert.equal(selected.content.image.url, 'https://example.invalid/reward.png');
  assert.equal(selected.content.buttons[0].text.content, 'View tasks');
  assert.equal(model.selectCard([proposition], surface.replace('Loyalty', 'Other')), null);
});

test('ruleset cards retain event-only buttons and the delivered challenge metadata', () => {
  const surface = 'web://example.invalid/rewards#ContentCardContainerLoyalty';
  const data = { contentType: 'application/json',
    content: { title: { content: 'Join a challenge' }, buttons: [{
      id: 'button-fixture', interactId: 'joinChallenge', actionUrl: '', text: { content: 'Join Challenge' },
    }] }, meta: { challengeId: 'dynamic-challenge-fixture' } };
  const proposition = { id: 'ruleset-fixture', scope: surface, scopeDetails: { decisionProvider: 'AJO' },
    items: [{ id: 'original-item', schema: 'https://ns.adobe.com/personalization/ruleset-item',
      data: { rules: [{ consequences: [{ id: 'card-consequence', detail: {
        schema: 'https://ns.adobe.com/personalization/message/content-card', data,
      } }] }] } }] };
  const card = model.selectCard([proposition], surface);
  assert.equal(card.meta, data.meta, 'Read challengeId from consequence data, not proposition/item IDs');
  assert.equal(card.content.buttons[0].interactId, 'joinChallenge');
  assert.equal(card.content.buttons[0].actionUrl, '', 'An event-only button must not require navigation');
  assert.equal(card.item, proposition.items[0], 'Preserve the original ruleset attribution');
  data.content = { title: 'Native title inside a raw ruleset', body: 'Native copy', actionUrl: '#tasks' };
  data.meta.buttonLabel = 'View tasks';
  const native = model.selectCard([proposition], surface);
  assert.equal(native.content.title.content, 'Native title inside a raw ruleset');
  assert.equal(native.content.buttons[0].text.content, 'View tasks');
});
