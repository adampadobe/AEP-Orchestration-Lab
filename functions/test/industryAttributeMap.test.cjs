const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveIndustryForPath } = require('../industryAttributeMap');

for (const [root, industry] of [
  ['customerProfile', 'travel'],
  ['fsiProfile', 'fsi'],
  ['retailProfile', 'retail'],
  ['telecomProfile', 'telecom'],
  ['mediaProfile', 'media'],
  ['sportsProfile', 'sports'],
]) {
  test(`CRM ${root} root and nested leaf belong to ${industry}`, () => {
    for (const prefix of ['', '_demoemea.', '_derceneea.']) {
      for (const suffix of ['', '.customerSegment']) {
        const path = `${prefix}${root}${suffix}`;
        assert.equal(resolveIndustryForPath(path).industry, industry, path);
      }
      for (const unrelated of [`${root}Extra`, `${root}Extra.customerSegment`, `other.${root}.customerSegment`]) {
        const path = `${prefix}${unrelated}`;
        assert.equal(resolveIndustryForPath(path).industry, null, path);
      }
    }
  });
}

test('CRM ownership leaves direct-stream and shared roots unchanged', () => {
  for (const [path, industry] of [
    ['_demoemea.travelReservations.bookingId', 'travel'],
    ['personalFinances.creditScores.0.score', 'fsi'],
    ['_demoemea.individualCharacteristics.retail.preferredStore', 'retail'],
    ['telecomSubscription.0.planName', 'telecom'],
    ['subscriptions.0.planName', 'media'],
    ['_demoemea.industrySports.fanFlags', 'sports'],
    ['_demoemea.identification.core.crmId', 'generic'],
    ['_demoemea.orderProfile.orderId', 'generic'],
    ['_demoemea.unrelatedProfile.customerSegment', null],
    ['_demoemea.profile.customerSegment', null],
  ]) {
    assert.equal(resolveIndustryForPath(path).industry, industry, path);
  }
});

test('bare array-valued subtree roots resolve to their owning industry', () => {
  assert.equal(resolveIndustryForPath('subscriptions').industry, 'media');
  assert.equal(resolveIndustryForPath('_demoemea.subscriptions').industry, 'media');
  assert.equal(resolveIndustryForPath('telecomSubscription').industry, 'telecom');
  assert.equal(resolveIndustryForPath('preferredLanguage').industry, 'generic');
  assert.equal(resolveIndustryForPath('subscriptionsX').industry, null);
});
