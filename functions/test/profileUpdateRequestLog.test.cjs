'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  maskEmail,
  emailHash,
  summarizeProfileUpdateRequest,
  summarizeProfileUpdatePayload,
} = require('../profileUpdateRequestLog');

describe('profileUpdateRequestLog', () => {
  it('masks the email but keeps a stable correlation hash', () => {
    assert.equal(maskEmail('adamp.adobedemo+27092026-41@gmail.com'), 'ad***41@gmail.com');
    assert.equal(maskEmail('a@x.io'), 'a***@x.io');
    assert.equal(maskEmail(''), '');
    assert.equal(emailHash('Foo@Example.com'), emailHash(' foo@example.com '));
    assert.match(emailHash('foo@example.com'), /^[0-9a-f]{12}$/);
  });

  it('summarizes paths and place rows without logging values', () => {
    const s = summarizeProfileUpdateRequest({
      email: 'someone+1@example.com',
      sandbox: 'apalmer',
      dryRun: false,
      hasConsent: false,
      updates: [
        { path: 'person.name.firstName', value: 'Secret' },
        { path: '_demoemea.profilePlaceContext.latitude', value: 24.7 },
        { path: 'profilePlaceContext.city', value: 'Riyadh' },
        { path: 'scoring.core.propensityScore', value: 50 },
      ],
    });
    assert.equal(s.updateCount, 4);
    assert.equal(s.placeRowCount, 2);
    assert.deepEqual(s.placeLeaves, ['latitude', 'city']);
    assert.deepEqual(s.paths, [
      'person.name.firstName',
      '_demoemea.profilePlaceContext.latitude',
      'profilePlaceContext.city',
      'scoring.core.propensityScore',
    ]);
    assert.equal(s.sandbox, 'apalmer');
    assert.equal(s.email, 'so***+1@example.com');
    assert.equal(JSON.stringify(s).includes('Secret'), false);
    assert.equal(JSON.stringify(s).includes('Riyadh'), false);
  });

  it('caps the logged path list', () => {
    const updates = Array.from({ length: 90 }, (_, i) => ({ path: `a.b${i}`, value: i }));
    const s = summarizeProfileUpdateRequest({ email: 'x@y.z', updates });
    assert.equal(s.updateCount, 90);
    assert.equal(s.paths.length, 60);
    assert.equal(s.pathsTruncated, true);
  });

  it('tolerates malformed update rows', () => {
    const s = summarizeProfileUpdateRequest({ email: 'x@y.z', updates: [null, 5, { value: 1 }, { path: 'a' }] });
    assert.equal(s.updateCount, 4);
    assert.deepEqual(s.paths, ['a']);
    assert.equal(s.placeRowCount, 0);
  });

  it('reports whether place survived into the built envelope', () => {
    const envelope = {
      body: {
        xdmEntity: {
          _demoemea: { profilePlaceContext: { latitude: 1, longitude: 2, city: 'Riyadh' }, scoring: {} },
        },
      },
    };
    assert.deepEqual(summarizeProfileUpdatePayload(envelope, '_demoemea'), {
      tenantKeys: ['profilePlaceContext', 'scoring'],
      placeInPayload: true,
      placeLeavesInPayload: ['latitude', 'longitude', 'city'],
    });
    const flat = { _demoemea: { scoring: {} } };
    assert.deepEqual(summarizeProfileUpdatePayload(flat, '_demoemea'), {
      tenantKeys: ['scoring'],
      placeInPayload: false,
      placeLeavesInPayload: [],
    });
    assert.deepEqual(summarizeProfileUpdatePayload(null), {
      tenantKeys: [],
      placeInPayload: false,
      placeLeavesInPayload: [],
    });
  });
});
