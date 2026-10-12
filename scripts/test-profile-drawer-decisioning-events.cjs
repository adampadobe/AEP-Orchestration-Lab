const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { flattenEntityToTableRows } = require('../functions/profileTableHelpers');

const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'profile-viewer', 'aep-profile-drawer.js'), 'utf8');
const renderer = source.slice(source.indexOf('function decisioningDisplayCardFields('), source.indexOf('function renderEventTimeline('));
function element(tag) {
  return { tag, children: [], classList: { add() {} }, appendChild(child) { this.children.push(child); } };
}
function context() {
  const sandbox = {
    document: { createElement: element },
    profileDrawerEvents: element('div'),
    fillDrawerEventThumbElement() {},
    formatEventTimelineDate: timestamp => String(timestamp),
    formatExperienceEventDisplayTitle: () => 'Decisioning PropositionDisplay',
    drawerEventTitleFallback: () => 'Event',
    deriveArmcomSiteIdFromRows: () => null,
    formatDrawerEventChannelDisplay: () => 'Web',
    fetch() { throw new Error('Event cards must not request data'); },
  };
  vm.createContext(sandbox);
  vm.runInContext(renderer, sandbox);
  return sandbox;
}
function event(propositions, eventType = 'decisioning.propositionDisplay') {
  return {
    eventType, timestamp: 1791806400000,
    rows: flattenEntityToTableRows({ _experience: { decisioning: { propositions } } }),
  };
}
const proposition = {
  items: [{ name: 'Baggage Status', itemSelection: { selectionDetail: { strategyName: 'NBA Strategy 2 - Travel now' } } }],
  scopeDetails: { decisionProvider: 'AJO', rank: 1 },
};
test('event cards use returned rows beneath the unchanged title and preserve timestamp', () => {
  const sandbox = context();
  const ev = event([proposition]);
  const before = JSON.stringify(ev);
  sandbox.appendDrawerEventTimelineItem(ev);
  const children = sandbox.profileDrawerEvents.children[0].children[1].children;
  assert.deepEqual(children.map(child => child.textContent), [
    '1791806400000', 'Decisioning PropositionDisplay', 'Offer: Baggage Status',
    'Strategy: NBA Strategy 2 - Travel now', 'Provider: AJO', 'Rank: 1', 'Web',
  ]);
  assert.equal(JSON.stringify(ev), before);
});
test('all propositions and items retain numeric array order with matching strategy names', () => {
  const sandbox = context();
  const ev = event([proposition, {
    items: [{ name: 'Second', itemSelection: { selectionDetail: { strategyName: 'Second strategy' } } }, { name: 'Third' }],
    scopeDetails: { decisionProvider: 'Other', rank: 0 },
  }]);
  ev.rows.reverse();
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.decisioningDisplayCardFields(ev))), [
    ['Offer', 'Baggage Status'], ['Strategy', 'NBA Strategy 2 - Travel now'], ['Provider', 'AJO'], ['Rank', '1'],
    ['Offer', 'Second'], ['Strategy', 'Second strategy'], ['Offer', 'Third'], ['Provider', 'Other'], ['Rank', '0'],
  ]);
});
test('missing fields are omitted and other event types remain unchanged', () => {
  const sandbox = context();
  for (const ev of [event([]), event([{}]), event([proposition], 'decisioning.propositionInteract'), null]) {
    assert.equal(sandbox.decisioningDisplayCardFields(ev).length, 0);
  }
  const ev = event([{ items: [{ name: '<img src=x onerror=alert(1)>' }], scopeDetails: { rank: null } }]);
  sandbox.appendDrawerEventTimelineItem(ev);
  const details = sandbox.profileDrawerEvents.children[0].children[1].children[2];
  assert.equal(details.textContent, 'Offer: <img src=x onerror=alert(1)>');
  assert.equal(details.children.length, 0, 'payload values must render as text, not HTML');
});
