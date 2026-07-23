'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildExecutionPayload,
  normalizeVariableDefinitions,
  validateTemplateBody,
} = require('../liveActivityCore');
const { builtinTemplatesFromCollection } = require('../liveActivityTemplateStore');

function sampleTemplate() {
  return {
    requestId: '{{requestId}}',
    campaignId: '{{campaignID}}',
    recipients: [{
      type: 'aep',
      userId: '{{ECID}}',
      namespace: 'ECID',
      context: {
        requestPayload: {
          aps: {
            'content-available': 1,
            timestamp: 0,
            event: 'start',
            'attributes-type': 'TravelLiveActivityAttributes',
            attributes: {
              flightNumber: 'RX 123',
              liveActivityData: { liveActivityID: '{{LiveActivityID}}' },
            },
            alert: { title: 'Flight update', body: 'Your flight changed' },
          },
        },
      },
    }],
  };
}

describe('liveActivityCore', () => {
  it('validates one-recipient AJO unitary templates', () => {
    assert.equal(validateTemplateBody(sampleTemplate()).recipients.length, 1);
    assert.throws(() => validateTemplateBody({ recipients: [] }), /exactly one/);
  });

  it('returns conversational missing fields before rendering', () => {
    const result = buildExecutionPayload({
      templateBody: sampleTemplate(),
      variableDefinitions: [{
        key: 'flight_number',
        label: 'Flight number',
        path: 'recipients.0.context.requestPayload.aps.attributes.flightNumber',
        required: true,
      }],
      input: {},
    });
    assert.equal(result.ready, false);
    assert.deepEqual(
      result.missingFields.map((row) => row.key),
      ['campaign_id', 'ecid', 'live_activity_id', 'event', 'variables.flight_number'],
    );
  });

  it('builds server-owned request fields and applies allowlisted variables', () => {
    const template = sampleTemplate();
    template.requestId = 'old';
    template.campaignId = 'old';
    template.recipients[0].userId = '1234567890';
    template.recipients[0].context.requestPayload.aps.attributes.liveActivityData.liveActivityID = 'old-live-id';
    const result = buildExecutionPayload({
      templateBody: template,
      variableDefinitions: [{
        key: 'flight_number',
        label: 'Flight number',
        path: 'recipients.0.context.requestPayload.aps.attributes.flightNumber',
        type: 'string',
      }],
      input: {
        campaignId: '43a8ba87-81c0-4e0c-86ec-8bdbb4faf2e85',
        ecid: '69861237882705185278691173436829',
        liveActivityId: 'live-activity-test-12345',
        event: 'update',
        variables: { flight_number: 'BA 281' },
      },
      nowMs: 1_700_000_000_000,
    });
    assert.equal(result.ready, true);
    assert.notEqual(result.payload.requestId, 'old');
    assert.equal(result.payload.campaignId, '43a8ba87-81c0-4e0c-86ec-8bdbb4faf2e85');
    assert.equal(result.payload.recipients[0].userId, '69861237882705185278691173436829');
    const aps = result.payload.recipients[0].context.requestPayload.aps;
    assert.equal(aps.timestamp, 1_700_000_000);
    assert.equal(aps.event, 'update');
    assert.equal(aps.attributes.flightNumber, 'BA 281');
    assert.equal(aps.attributes.liveActivityData.liveActivityID, 'live-activity-test-12345');
    assert.equal(result.payloadHash.length, 64);
  });

  it('rejects unresolved template placeholders', () => {
    const template = sampleTemplate();
    template.recipients[0].context.requestPayload.aps.alert.title = '{{customerTitle}}';
    assert.throws(
      () => buildExecutionPayload({
        templateBody: template,
        variableDefinitions: [],
        input: {
          campaignId: 'campaign-12345',
          ecid: '69861237882705185278691173436829',
          liveActivityId: 'live-activity-test-12345',
          event: 'start',
        },
      }),
      /unresolved placeholders/,
    );
  });

  it('restricts variable definitions to safe APS content roots', () => {
    assert.throws(
      () => normalizeVariableDefinitions([{ key: 'campaign', path: 'campaignId' }]),
      /must be inside APS/,
    );
  });

  it('parses all current Postman customer templates into stable built-ins', () => {
    const collection = require('../../web/profile-viewer/data/live-activities.postman_collection.json');
    const templates = builtinTemplatesFromCollection(collection);
    assert.equal(templates.length, 22);
    assert.ok(templates.some((row) => row.customer === 'Etihad'));
    assert.ok(templates.some((row) => row.customer === 'KSIA'));
    assert.ok(templates.some((row) => row.customer === 'Travel (Generic)'));
    assert.ok(templates.every((row) => row.id.startsWith('la-builtin-')));
  });
});
