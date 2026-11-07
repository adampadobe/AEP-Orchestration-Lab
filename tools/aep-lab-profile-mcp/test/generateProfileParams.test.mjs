import test from 'node:test';
import assert from 'node:assert/strict';
import { ensurePreferredLanguageOnAttributes } from '../src/framework/generateProfileParams.mjs';
import { buildPersonaAttributes } from '../src/personaBuilder/index.mjs';

test('all seven personas and language defaults emit only the canonical language path', () => {
  for (const industry of ['travel', 'media', 'fsi', 'retail', 'telecom', 'sports', 'generic']) {
    const attributes = buildPersonaAttributes(industry, 'offline@example.com', undefined, {
      place_mode: 'area', place_area: 'London',
    });
    assert.equal(typeof attributes.preferredLanguage, 'string', industry);
    assert.equal(attributes['preferences.preferredLanguage'], undefined, industry);
    assert.equal(attributes['personalEmail.language'], undefined, industry);
  }
  assert.deepEqual(ensurePreferredLanguageOnAttributes({}).attributes, { preferredLanguage: 'en-US' });
});

test('explicit language aliases survive for backend schema validation without inventing extra mirrors', () => {
  const attributes = { 'personalEmail.language': 'de-DE' };
  assert.deepEqual(ensurePreferredLanguageOnAttributes(attributes).attributes, attributes);
  assert.deepEqual(ensurePreferredLanguageOnAttributes(attributes, { force: true }).attributes, {
    ...attributes, preferredLanguage: 'de-DE',
  });
  assert.deepEqual(attributes, { 'personalEmail.language': 'de-DE' });
});
