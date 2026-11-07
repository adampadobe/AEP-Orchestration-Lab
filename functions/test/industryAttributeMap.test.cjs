const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveIndustryForPath } = require('../industryAttributeMap');

test('bare array-valued subtree roots resolve to their owning industry', () => {
  assert.equal(resolveIndustryForPath('subscriptions').industry, 'media');
  assert.equal(resolveIndustryForPath('_demoemea.subscriptions').industry, 'media');
  assert.equal(resolveIndustryForPath('telecomSubscription').industry, 'telecom');
  assert.equal(resolveIndustryForPath('preferredLanguage').industry, 'generic');
  assert.equal(resolveIndustryForPath('subscriptionsX').industry, null);
});
