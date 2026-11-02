'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { summarizeProfileStreamWire, summarizeProfileStreamReceipt } = require('../profileStreamDiagnostics');
const core = require('../profileStreamingCore');

const flowId = '12345678-1234-4234-8234-123456789abc';
const datasetId = '1234567890abcdef12345678';
const schemaId = 'https://ns.adobe.com/demoemea/schemas/1234567890abcdef12345678';
const target = { flowId, datasetId, schemaId, xdmKey: '_customtenant' };

for (const envelope of [false, true]) {
  test(`exact ${envelope ? 'envelope' : 'bare'} wire digest, tenant groups, false/zero and identities`, () => {
    const entity = {
      personalEmail: { address: 'private@example.com' },
      identityMap: {
        Email: [{ id: 'private@example.com', primary: true }],
        ECID: [{ id: '12345678901234567890123456789012345678', primary: false }],
        'secret@example.com': [{ id: 'secret' }],
      },
      _customtenant: {
        industryFsi: {
          financialProducts: { checking: false, savings: true }, creditScoreBand: 0,
          lifeStage: null, employment: '', 'secret@example.com': 'secret',
        },
        industryMedia: { private: 'value' }, industrySports: { private: 'value' },
        industryTelecom: { private: 'value' }, travelReservations: { private: 'value' },
        individualCharacteristics: { retail: { private: 'value' } },
        identification: { core: { email: 'private@example.com' } },
      },
    };
    const original = envelope ? core.buildProfileStreamingEnvelope(entity, 'private@AdobeOrg', 'secret', datasetId, schemaId) : entity;
    const wire = JSON.stringify(original, null, 2);
    const summary = summarizeProfileStreamWire(wire, target);
    assert.equal(summary.payloadFormat, envelope ? 'envelope' : 'bare');
    assert.equal(summary.payloadSha256, createHash('sha256').update(wire).digest('hex'));
    assert.equal(summary.payloadBytes, Buffer.byteLength(wire));
    assert.equal(summary.flowId, flowId);
    assert.equal(summary.datasetId, datasetId);
    assert.equal(summary.schemaId, schemaId);
    assert.equal(summary.headerSchemaRef, envelope ? schemaId : null);
    assert.equal(summary.bodySchemaRef, envelope ? schemaId : null);
    assert.equal(summary.headerSchemaContentType, envelope ? core.PROFILE_STREAM_SCHEMA_CONTENT_TYPE : null);
    assert.equal(summary.bodySchemaContentType, envelope ? core.PROFILE_STREAM_SCHEMA_CONTENT_TYPE : null);
    assert.deepEqual(Object.keys(summary.tenant.industries), ['generic', 'travel', 'fsi', 'retail', 'media', 'sports', 'telecom']);
    for (const [industry, groups] of Object.entries(summary.tenant.industries)) {
      assert.ok(Object.values(groups).some((group) => group.present), industry);
    }
    assert.equal(summary.tenant.industries.fsi.industryFsi.leafCount, 6);
    assert.equal(Object.keys(summary.tenant.fsiLeaves).length, 11);
    assert.deepEqual(summary.tenant.fsiLeaves['financialProducts.checking'], { present: true, type: 'boolean' });
    assert.deepEqual(summary.tenant.fsiLeaves.creditScoreBand, { present: true, type: 'number' });
    assert.deepEqual(summary.tenant.fsiLeaves.lifeStage, { present: true, type: 'null' });
    assert.deepEqual(summary.tenant.fsiLeaves.employment, { present: true, type: 'string' });
    assert.deepEqual(summary.tenant.fsiLeaves.householdIncomeBand, { present: false, type: 'absent' });
    assert.equal(summary.identity.namespaceCount, 3);
    assert.equal(summary.identity.entryCount, 3);
    assert.equal(summary.identity.Email.primaryCount, 1);
    assert.equal(summary.identity.ECID.idCount, 1);
    assert.equal(JSON.stringify(summary).includes('secret'), false);
    assert.equal(JSON.stringify(summary).includes('private'), false);
    assert.equal(JSON.stringify(summary).includes('12345678901234567890123456789012345678'), false);
  });
}

test('diagnoses serialization output, not pre-transform presence, and counts UTF-8 bytes', () => {
  const object = { toJSON() {
    return { _demoemea: { industryFsi: { employment: 'é', financialProducts: { checking: false } } } };
  } };
  const wire = JSON.stringify(object);
  const summary = summarizeProfileStreamWire(wire);
  assert.equal(summary.payloadBytes, Buffer.byteLength(wire));
  assert.ok(summary.payloadBytes > wire.length);
  assert.equal(summary.tenant.fsiLeaves.employment.present, true);
  assert.equal(summary.tenant.fsiLeaves['financialProducts.checking'].present, true);
  assert.equal(summarizeProfileStreamWire(JSON.stringify({ _demoemea: { industryFsi: false } }))
    .tenant.industries.fsi.industryFsi.type, 'boolean');
});

test('structural output stays bounded regardless of caller keys and depth', () => {
  let deep = { private: 'value' };
  for (let i = 0; i < 30; i++) deep = { private: deep };
  const summary = summarizeProfileStreamWire(JSON.stringify({
    _demoemea: { industryFsi: deep, ...Object.fromEntries(Array.from({ length: 12000 }, (_, i) => [`secret${i}`, i])) },
  }));
  assert.equal(summary.tenant.truncated, true);
  assert.equal(summary.tenant.industries.fsi.industryFsi.truncated, true);
  assert.ok(JSON.stringify(summary).length < 10000);
  assert.equal(JSON.stringify(summary).includes('secret'), false);
});

test('receipt allowlist extracts only validated IDs, numeric receipt data and validation state/counts', () => {
  for (const wrapped of [false, true]) {
    const receipt = {
      xactionId: '1700000000000:17:28061', inletId: flowId, receivedTimeMs: 1700000000000,
      synchronousValidation: { status: 'passed', enabled: true },
      warnings: [{ message: 'private' }], errors: [{ message: 'private' }],
    };
    const result = summarizeProfileStreamReceipt(wrapped ? { body: receipt } : receipt, { status: 200, errorCount: 2, warningCount: 3 });
    assert.equal(result.xactionId, receipt.xactionId);
    assert.equal(result.inletId, flowId);
    assert.equal(result.receivedTimeMs, receipt.receivedTimeMs);
    assert.equal(result.synchronousValidation.state, 'passed');
    assert.equal(result.synchronousValidation.enabled, true);
    assert.equal(result.streamErrorCount, 2);
    assert.equal(result.streamWarningCount, 3);
    assert.equal(result.responseErrorCount, 1);
    assert.equal(result.responseWarningCount, 1);
    assert.equal(JSON.stringify(result).includes('private'), false);
  }
});

test('malicious targets, response IDs, errors and arbitrary keys cannot leak into logs', () => {
  const secret = 'private@example.com Bearer credentials https://inlet/?appendToken=secret';
  const result = summarizeProfileStreamReceipt({
    xactionId: secret, inletId: secret, receivedTimeMs: secret,
    synchronousValidation: { status: secret, enabled: secret }, errors: [{ code: secret, message: secret }],
    [secret]: secret, Authorization: secret, appendToken: secret,
  }, { status: secret, errorCount: secret, warningCount: secret });
  assert.equal(result.xactionId, null);
  assert.equal(result.inletId, null);
  assert.equal(result.receivedTimeMs, null);
  assert.equal(result.synchronousValidation.state, null);
  const wire = summarizeProfileStreamWire(JSON.stringify({
    header: { schemaRef: { id: `${schemaId}?token=secret`, contentType: secret } },
    body: { xdmMeta: { schemaRef: { id: secret, contentType: secret } }, xdmEntity: { _demoemea: { [secret]: secret } } },
  }), { flowId: secret, datasetId: secret, schemaId: secret });
  assert.equal(wire.headerSchemaRef, null);
  assert.equal(wire.headerSchemaContentType, null);
  assert.equal(wire.flowId, null);
  assert.equal(JSON.stringify({ result, wire }).includes('private'), false);
  assert.equal(JSON.stringify({ result, wire }).includes('secret'), false);
  assert.equal(summarizeProfileStreamReceipt({ xactionId: `${flowId}\n` }).xactionId, null);
});

test('recognizes Adobe syncValidation receipts without assuming absent validation ran', () => {
  for (const data of [{ syncValidation: { skipped: true } }, { body: { syncValidation: { skipped: true } } }]) {
    const result = summarizeProfileStreamReceipt(data, { status: 200 });
    assert.equal(result.synchronousValidation.present, true);
    assert.equal(result.synchronousValidation.skipped, true);
  }
  assert.equal(summarizeProfileStreamReceipt({}).synchronousValidation.present, false);
});
