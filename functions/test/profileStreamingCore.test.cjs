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

  it('buildProfileStreamPayload includes _demoemea.media in envelope xdmEntity', () => {
    const demoemea = {
      identification: { core: { email: 'test@example.com' } },
      media: { accountType: 'monthly', contractStatus: 'Insider Subscription', productHolding: 'Sky News Insider' },
      interestTypes: [{ interests: 'sport' }],
    };
    const built = profileStreamingCore.buildProfileStreamPayload(
      demoemea,
      'test@example.com',
      '',
      '_demoemea',
      'org@test',
      'test',
      { person: { name: { firstName: 'Ada' } } },
      { useEnvelope: true, datasetId: 'ds1', schemaId: 'https://ns.adobe.com/demoemea/schemas/test' },
    );
    assert.equal(built.format, 'envelope');
    const tenant = built.payload.body.xdmEntity._demoemea;
    assert.equal(tenant.media.accountType, 'monthly');
    assert.equal(tenant.media.contractStatus, 'Insider Subscription');
    assert.equal(tenant.media.productHolding, 'Sky News Insider');
    assert.equal(tenant.interestTypes[0].interests, 'sport');
  });
});
