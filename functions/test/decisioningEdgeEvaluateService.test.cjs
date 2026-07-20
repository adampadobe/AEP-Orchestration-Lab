'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseEdgeInteractPropositions,
  buildDecisionIdentityMap,
  isValidEdgeEcid,
} = require('../eventEdgeService');
const {
  buildSurfacesFromPageUrl,
  buildDecisionScopes,
  buildEdgeDecisionInteractPayload,
} = require('../decisioningEdgeEvaluateService');
const {
  resolvePlacementForProposition,
  summarizePropositions,
  buildZeroPropositionChecklist,
  scopeMatchesFragment,
} = require('../decisioningExplainService');

const ECID = '62722406001178632594092146103219305888';
const EMAIL = 'demo+001@adobetest.com';

test('parseEdgeInteractPropositions extracts personalization handle payloads', () => {
  const data = {
    requestId: 'req-1',
    handle: [
      {
        type: 'personalization:decisions',
        payload: [
          { id: 'p1', scope: 'web://example.com/page#TopRibbon', items: [{ schema: 'html' }] },
        ],
      },
    ],
  };
  const props = parseEdgeInteractPropositions(data);
  assert.equal(props.length, 1);
  assert.equal(props[0].id, 'p1');
});

test('parseEdgeInteractPropositions accepts top-level propositions', () => {
  const props = parseEdgeInteractPropositions({
    propositions: [{ id: 'a' }, { id: 'b' }],
  });
  assert.equal(props.length, 2);
});

test('buildDecisionIdentityMap ECID primary when both email and ecid', () => {
  const map = buildDecisionIdentityMap({ email: EMAIL, ecid: ECID, namespace: 'email' });
  assert.equal(map.ECID[0].primary, true);
  assert.equal(map.Email[0].primary, false);
  assert.equal(isValidEdgeEcid(ECID), true);
});

test('buildSurfacesFromPageUrl builds web:// host/path#fragment surfaces', () => {
  const placements = [
    { key: 'topRibbon', fragment: 'TopRibbon' },
    { key: 'hero', fragment: 'hero-banner' },
  ];
  const surfaces = buildSurfacesFromPageUrl(
    'https://aep-orchestration-lab.web.app/profile-viewer/content-decision-live-edge.html',
    placements,
  );
  assert.ok(surfaces.some((s) => s.includes('web://aep-orchestration-lab.web.app')));
  assert.ok(surfaces.some((s) => s.endsWith('#TopRibbon')));
  assert.ok(surfaces.some((s) => s.endsWith('#hero-banner')));
});

test('buildDecisionScopes prefers explicit extra scopes', () => {
  const scopes = buildDecisionScopes(
    'https://example.com/page',
    [{ fragment: 'TopRibbon' }],
    ['scope-a', 'scope-b'],
  );
  assert.deepEqual(scopes, ['scope-a', 'scope-b']);
});

test('buildEdgeDecisionInteractPayload surfaces mode includes query.personalization', () => {
  const built = buildEdgeDecisionInteractPayload(
    {
      targetPageUrl: 'https://example.com/decision-lab',
      edgePersonalizationMode: 'surfaces',
      placements: [{ key: 'topRibbon', fragment: 'TopRibbon', label: 'Top ribbon' }],
    },
    { email: EMAIL, ecid: ECID },
  );
  assert.equal(built.ok, true);
  assert.equal(built.mode, 'surfaces');
  assert.ok(Array.isArray(built.surfaces));
  assert.ok(built.payload.query.personalization.surfaces.length > 0);
  assert.ok(Array.isArray(built.payload.query.personalization.schemas));
});

test('buildEdgeDecisionInteractPayload decisionScopes mode uses decisionScopes query', () => {
  const built = buildEdgeDecisionInteractPayload(
    {
      targetPageUrl: 'web://example.com/decision-lab',
      edgePersonalizationMode: 'decisionScopes',
    },
    { email: EMAIL, decisionScopes: ['web://example.com/decision-lab#hero-banner'] },
  );
  assert.equal(built.ok, true);
  assert.equal(built.mode, 'decisionScopes');
  assert.deepEqual(built.decisionScopes, ['web://example.com/decision-lab#hero-banner']);
  assert.ok(built.payload.query.personalization.decisionScopes);
});

test('scopeMatchesFragment matches hash fragment in scope URI', () => {
  assert.equal(scopeMatchesFragment('web://host/path#TopRibbon', 'TopRibbon'), true);
  assert.equal(scopeMatchesFragment('web://host/path#hero', 'TopRibbon'), false);
});

test('resolvePlacementForProposition maps scope to placement key', () => {
  const placements = [
    { key: 'topRibbon', fragment: 'TopRibbon', label: 'Top ribbon' },
    { key: 'hero', fragment: 'hero-banner', label: 'Hero' },
  ];
  const placement = resolvePlacementForProposition(
    { scope: 'web://lab.example/content-decision-live-edge.html#TopRibbon' },
    placements,
  );
  assert.equal(placement.key, 'topRibbon');
});

test('summarizePropositions extracts item title from json payload', () => {
  const summaries = summarizePropositions(
    [
      {
        scope: 'web://x/y#hero-banner',
        items: [
          {
            schema: 'https://ns.adobe.com/personalization/json-content-item',
            data: { title: 'Summer offer', fullDescription: 'Save 20%', imageUrl: 'https://img/x.jpg' },
          },
        ],
      },
    ],
    [{ key: 'hero', fragment: 'hero-banner' }],
  );
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].items[0].title, 'Summer offer');
});

test('buildZeroPropositionChecklist includes guidance when count is zero', () => {
  const list = buildZeroPropositionChecklist({
    propositions: [],
    mode: 'surfaces',
    surfaces: ['web://x#TopRibbon'],
    datastreamId: 'ds-1',
    identityMap: { ECID: [{ id: ECID, primary: true }] },
  });
  assert.ok(list.some((line) => /Zero propositions/i.test(line)));
});
