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
function engagementContext(events, hoursBack = 24) {
  let requests = 0;
  const sandbox = {
    window: {},
    _config: {},
    lastLookedUpProfile: { engagementMetricsHoursBack: hoursBack, events: [] },
    cacheDomRefs() {},
    getNamespaceForDrawer: () => 'email',
    fetchProfileEventsList: async () => { requests++; return events; },
    filterDrawerEventsForTimeline: events => events,
    visibleDrawerEventsForPanel: (events, limit) => events.slice(0, limit),
    DRAWER_EVENTS_STORY_MAX: 100,
    patchLastProfileOrUpdate(partial) { Object.assign(sandbox.lastLookedUpProfile, partial); },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'web', 'profile-viewer', 'email-engagement-metrics.js'), 'utf8'), sandbox);
  vm.runInContext(source.slice(source.indexOf('function resolveEngagementMetricsHoursBack('), source.indexOf('function formatEngagementMetricsRangeHint(')), sandbox);
  vm.runInContext(source.slice(source.indexOf('async function refreshDrawerEventsForIdentity('), source.indexOf('/** Re-fetch events using')), sandbox);
  return { sandbox, requests: () => requests };
}
function messageEvent(channel, ageHours = 0) {
  return {
    eventName: 'message sent',
    timestamp: Date.now() - ageHours * 3600000,
    rows: [{ path: `_experience.customerJourneyManagement.${channel}ChannelContext.namespace`, value: channel }],
  };
}
test('event polling refreshes email and push counts from the full event list without extra requests', async () => {
  const events = Array.from({ length: 7 }, () => messageEvent('email'));
  events.push(messageEvent('push'), messageEvent('email', 25));
  const { sandbox, requests } = engagementContext(events);
  await sandbox.refreshDrawerEventsForIdentity('test@example.com', 'email');
  assert.equal(sandbox.lastLookedUpProfile.emailSendsLast24h, 7);
  assert.equal(sandbox.lastLookedUpProfile.pushSendsLast24h, 1);
  assert.equal(sandbox.lastLookedUpProfile.events.length, 5);
  assert.equal(requests(), 1);
  events.push(messageEvent('email'));
  await sandbox.refreshDrawerEventsForIdentity('test@example.com', 'email');
  assert.equal(sandbox.lastLookedUpProfile.emailSendsLast24h, 8);
});
test('event polling preserves the selected metrics window and removes expired sends', async () => {
  const events = [messageEvent('email', 25), messageEvent('email', 169)];
  const { sandbox } = engagementContext(events, 168);
  await sandbox.refreshDrawerEventsForIdentity('test@example.com', 'email');
  assert.equal(sandbox.lastLookedUpProfile.emailSendsLast24h, 1);
  assert.equal(sandbox.lastLookedUpProfile.engagementMetricsHoursBack, 168);
  events[0].timestamp = Date.now() - 170 * 3600000;
  await sandbox.refreshDrawerEventsForIdentity('test@example.com', 'email');
  assert.equal(sandbox.lastLookedUpProfile.emailSendsLast24h, 0);
  assert.equal(sandbox.lastLookedUpProfile.pushSendsLast24h, 0);
});
test('event polling leaves metrics unavailable when engagement helpers are absent', async () => {
  const { sandbox } = engagementContext([messageEvent('email')]);
  delete sandbox.window.EmailEngagementMetrics;
  await sandbox.refreshDrawerEventsForIdentity('test@example.com', 'email');
  assert.equal(sandbox.lastLookedUpProfile.emailSendsLast24h, undefined);
  assert.equal(sandbox.lastLookedUpProfile.pushSendsLast24h, undefined);
});
test('event cards use returned rows beneath the unchanged title and preserve timestamp', () => {
  const sandbox = context();
  const ev = event([proposition]);
  const before = JSON.stringify(ev);
  sandbox.appendDrawerEventTimelineItem(ev);
  const children = sandbox.profileDrawerEvents.children[0].children[1].children;
  assert.deepEqual(children.map(child => child.textContent), [
    '1791806400000', 'Decisioning PropositionDisplay', 'Offer: Baggage Status',
    'Strategy: NBA Strategy 2 - Travel now',
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
    ['Offer', 'Baggage Status'], ['Strategy', 'NBA Strategy 2 - Travel now'],
    ['Offer', 'Second'], ['Strategy', 'Second strategy'], ['Offer', 'Third'],
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
test('display cards omit channel even without offer details; other cards retain their channel', () => {
  const sandbox = context();
  sandbox.appendDrawerEventTimelineItem(event([{ scopeDetails: { decisionProvider: 'AJO', rank: 1 } }]));
  sandbox.appendDrawerEventTimelineItem(event([], 'web.webPageDetails.pageViews'));
  const cards = sandbox.profileDrawerEvents.children;
  assert.equal(cards[0].children[1].children.length, 2);
  assert.equal(cards[1].children[1].children.at(-1).textContent, 'Web');
});
test('BA channel labels use the recorded Run channel, without rewriting historical Web events', () => {
  const sandbox = context();
  sandbox.aepProfileDrawerMessageChannelKind = () => null;
  sandbox.isArmcomExperienceEvent = () => false;
  vm.runInContext(source.slice(source.indexOf('function formatDrawerEventChannelDisplay('), source.indexOf('/** Lowercase blob of event head')), sandbox);
  for (const channel of ['email', 'web']) {
    const ev = {
      eventName: 'British Airways Decisioning',
      rows: flattenEntityToTableRows({
        web: { webPageDetails: { name: 'British Airways Decisioning' } },
        _demoemea: { interactionDetails: { core: { channel } } },
      }),
    };
    assert.equal(sandbox.formatDrawerEventChannelDisplay(ev), channel === 'email' ? 'Email' : 'Web');
    sandbox.appendDrawerEventTimelineItem(ev);
    assert.equal(sandbox.profileDrawerEvents.children.at(-1).children[1].children.at(-1).textContent, channel === 'email' ? 'Email' : 'Web');
  }
  assert.equal(sandbox.formatDrawerEventChannelDisplay({ eventName: 'British Airways Decisioning', rows: [] }), 'Web');
  assert.equal(sandbox.formatDrawerEventChannelDisplay({ eventName: 'Other demo', channel: 'email', rows: [] }), 'Web');
});
test('Decisioning event cards use sparkles, including BA decisions with a Web event type', () => {
  const sandbox = context();
  sandbox.isArmcomExperienceEvent = () => false;
  sandbox.aepProfileImageCssUrl = name => name;
  vm.runInContext(source.slice(source.indexOf('function aepDrawerEventHeadTypeBlob('), source.indexOf('function isWebInteractionExperienceEvent(')), sandbox);
  vm.runInContext(source.slice(source.indexOf('const AEP_EVENT_THUMB_SVG = {'), source.indexOf('function aepProfileDrawerMessageChannelKind(')), sandbox);
  for (const ev of [
    { eventType: 'decisioning.propositionDisplay' },
    { eventType: 'decisioning.propositionInteract' },
    { eventType: 'web.webPageDetails.pageViews', eventName: 'British Airways Decisioning' },
    { eventName: 'Decisioning hotel offer' },
  ]) {
    const icon = sandbox.eventThumbForEvent(ev);
    assert.equal(icon.variant, 'decisioning');
    assert.ok(icon.svg.includes('M12 2.5'));
    assert.ok(icon.svg.includes('currentColor'));
    assert.ok(icon.svg.includes('aria-hidden="true"'));
  }
  assert.equal(sandbox.eventThumbForEvent({ eventType: 'web.webPageDetails.pageViews' }).variant, 'event-web');
  assert.equal(sandbox.eventThumbForEvent({ eventName: 'Web Pageview', rows: [{ path: 'web.webPageDetails.pageViews.value', value: 1 }] }).variant, 'event-web');

  // Message tracking uses inline SVG mailCheck icon
  const msgTracking = sandbox.eventThumbForEvent({ eventType: 'message.tracking' });
  assert.equal(msgTracking.variant, 'message-tracking');
  assert.ok(msgTracking.svg.includes('m16 19 2 2 4-4'), 'mailCheck SVG should contain checkmark');
  assert.ok(msgTracking.svg.includes('M22 13V6'), 'mailCheck SVG should contain envelope');

  // Flight abandoned uses shopping cart icon
  const flightAbandoned = sandbox.eventThumbForEvent({ eventType: 'flight.abandoned' });
  assert.equal(flightAbandoned.variant, 'commerce-cart');
  assert.ok(flightAbandoned.svg.includes('M1 1h4l2.68 13.39'), 'flight.abandoned should use shopping cart SVG');

  // Flight disruption uses plane with clock badge icon
  const flightDisruption = sandbox.eventThumbForEvent({ eventType: 'flight.disruption' });
  assert.equal(flightDisruption.variant, 'flight-disruption');
  assert.ok(flightDisruption.svg.includes('M17.8 19.2'), 'flight.disruption should include plane icon');
  assert.ok(flightDisruption.svg.includes('circle cx="17.5" cy="17.5" r="4.5"'), 'flight.disruption should include clock badge circle');
  assert.ok(flightDisruption.svg.includes('M17.5 15v2.5l1.5 1'), 'flight.disruption should include clock hands');
});
