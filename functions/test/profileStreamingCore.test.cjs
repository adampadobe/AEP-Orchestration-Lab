'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const profileStreamingCore = require('../profileStreamingCore');

describe('profileStreamingCore digit-string schema leaves', () => {
  it('isDigitStringSchemaLeafPath covers hotel booking and homeAddress.postalCode', () => {
    assert.equal(profileStreamingCore.isDigitStringSchemaLeafPath('hotel.bookingDetails.roomNumber'), true);
    assert.equal(profileStreamingCore.isDigitStringSchemaLeafPath('homeAddress.postalCode'), true);
    assert.equal(profileStreamingCore.isDigitStringSchemaLeafPath('scoring.npsScore'), false);
  });

  it('assignProfileStreamingAttributes keeps homeAddress.postalCode as string', () => {
    const tenant = {};
    const rootExtras = {};
    profileStreamingCore.assignProfileStreamingAttributes(tenant, rootExtras, {
      'homeAddress.postalCode': '95101',
      'homeAddress.city': 'San Jose',
    });
    assert.equal(typeof rootExtras.homeAddress.postalCode, 'string');
    assert.equal(rootExtras.homeAddress.postalCode, '95101');
    assert.equal(rootExtras.homeAddress.city, 'San Jose');
  });

  it('assignProfileStreamingAttributes still coerces numeric tenant paths', () => {
    const tenant = {};
    const rootExtras = {};
    profileStreamingCore.assignProfileStreamingAttributes(tenant, rootExtras, {
      'scoring.npsScore': '9',
    });
    assert.equal(tenant.scoring.npsScore, 9);
    assert.equal(typeof tenant.scoring.npsScore, 'number');
  });

  it('buildOperationalProfileUnionXdmEntity merges dot-path media leaves under _demoemea', () => {
    const demoemea = {
      identification: { core: { email: 'test@example.com' } },
    };
    profileStreamingCore.setByPath(demoemea, 'media.accountType', 'monthly');
    profileStreamingCore.setByPath(demoemea, 'media.contractStatus', 'Insider Subscription');
    const entity = profileStreamingCore.buildOperationalProfileUnionXdmEntity(
      demoemea,
      'test@example.com',
      '',
      '_demoemea',
      { homeAddress: { city: 'London' } },
    );
    assert.equal(entity._demoemea.media.accountType, 'monthly');
    assert.equal(entity._demoemea.media.contractStatus, 'Insider Subscription');
    assert.equal(entity.homeAddress.city, 'London');
    assert.ok(entity.identityMap.Email);
  });
});
