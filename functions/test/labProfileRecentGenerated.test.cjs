'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSummaryTail,
  buildSummaryLabel,
  buildRecentProfileLabels,
} = require('../labProfileRecentSummaryLabel');
const {
  normalizeItem,
  dedupeItems,
  ITEMS_LIMIT,
  isValidEmail,
} = require('../labProfileRecentGeneratedStore');

describe('labProfileRecentSummaryLabel', () => {
  it('builds travel tail from portal snapshot', () => {
    const tail = buildSummaryTail({
      industry: 'travel',
      snapshot: {
        firstName: 'Ryan',
        lastName: 'Lee',
        age: 65,
        mobilePhone: '+447425627462',
        gender: 'male',
        travel: {
          reservations: {
            enabled: true,
            flight: { departure: 'DOH', arrival: 'ATL', number: 'EK201', class: 'business' },
          },
        },
      },
    });
    assert.match(tail, /Ryan Lee \(65\)/);
    assert.match(tail, /\+447425627462/);
    assert.match(tail, /male/);
    assert.match(tail, /DOH→ATL/);
  });

  it('builds label with em dash separator', () => {
    const { summaryLabel } = buildRecentProfileLabels({
      email: 'adamp.adobedemo+23062026-1@gmail.com',
      industry: 'travel',
      snapshot: {
        firstName: 'Ryan',
        lastName: 'Lee',
        age: 65,
        gender: 'male',
        mobilePhone: '+447425627462',
        travel: {
          reservations: {
            enabled: true,
            flight: { departure: 'DOH', arrival: 'ATL' },
          },
        },
      },
    });
    assert.ok(summaryLabel.startsWith('adamp.adobedemo+23062026-1@gmail.com — '));
    assert.match(summaryLabel, /DOH→ATL/);
  });

  it('builds identity from flat MCP attributes', () => {
    const tail = buildSummaryTail({
      industry: 'generic',
      attributes: {
        'person.name.firstName': 'Alex',
        'person.name.lastName': 'Kim',
        'person.gender': 'female',
        'individualCharacteristics.core.age': 42,
        'mobilePhone.number': '+447425627462',
      },
    });
    assert.match(tail, /Alex Kim \(42\)/);
    assert.match(tail, /female/);
  });
});

describe('labProfileRecentGeneratedStore helpers', () => {
  it('normalizeItem builds summary when missing', () => {
    const item = normalizeItem({
      email: 'demo+001@adobetest.com',
      industry: 'travel',
      snapshot: {
        firstName: 'Sam',
        lastName: 'Jones',
        travel: {
          reservations: { enabled: true, flight: { departure: 'LHR', arrival: 'JFK' } },
        },
      },
      source: 'portal',
    }, 'apalmer');
    assert.equal(item.email, 'demo+001@adobetest.com');
    assert.equal(item.sandbox, 'apalmer');
    assert.ok(item.summaryLabel.includes('demo+001@adobetest.com'));
    assert.match(item.summaryLabel, /LHR→JFK/);
  });

  it('isValidEmail validates addresses', () => {
    assert.equal(isValidEmail('bad'), false);
    assert.equal(isValidEmail('user@example.com'), true);
  });

  it('dedupes by email keeping newest', () => {
    const merged = dedupeItems([
      normalizeItem({ email: 'a@b.com', generatedAt: '2026-01-01T00:00:00.000Z' }, 'sb'),
      normalizeItem({ email: 'a@b.com', generatedAt: '2026-06-01T00:00:00.000Z', ecid: '123' }, 'sb'),
      normalizeItem({ email: 'c@d.com', generatedAt: '2026-06-02T00:00:00.000Z' }, 'sb'),
    ]);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].email, 'c@d.com');
    assert.equal(merged.find((r) => r.email === 'a@b.com').ecid, '123');
  });

  it('caps at ITEMS_LIMIT', () => {
    assert.equal(ITEMS_LIMIT, 20);
  });
});
