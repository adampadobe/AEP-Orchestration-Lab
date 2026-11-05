import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveIndustryForPath } from '../src/framework/attributeOwnership.mjs';
import { splitAttributesByIndustry } from '../src/framework/dualStreamGenerate.mjs';
import { buildGenericPersonaAttributes } from '../src/personaBuilder/generic.mjs';

test('bare array-valued subtree roots resolve to their owning industry', () => {
  assert.equal(resolveIndustryForPath('subscriptions').industry, 'media');
  assert.equal(resolveIndustryForPath('subscriptions.0.planName').industry, 'media');
  assert.equal(resolveIndustryForPath('telecomSubscription').industry, 'telecom');
  assert.equal(resolveIndustryForPath('preferredLanguage').industry, 'generic');
  assert.equal(resolveIndustryForPath('subscriptionsX').industry, null);
});

test('media subscriptions[] is routed to the media overlay, not the Generic step', () => {
  const { genericAttrs, industryAttrs } = splitAttributesByIndustry({
    'person.name.firstName': 'Ada',
    subscriptions: [{ SKU: 'SKU-1', planName: 'Premium' }],
  }, 'media');
  assert.deepEqual(Object.keys(genericAttrs), ['person.name.firstName']);
  assert.deepEqual(Object.keys(industryAttrs), ['subscriptions']);
});

test('generic persona never emits paths the lab Generic schema does not declare', () => {
  for (let i = 0; i < 200; i += 1) {
    const paths = Object.keys(buildGenericPersonaAttributes());
    assert.equal(paths.some((p) => p.startsWith('individualCharacteristics.public.')), false);
  }
});
