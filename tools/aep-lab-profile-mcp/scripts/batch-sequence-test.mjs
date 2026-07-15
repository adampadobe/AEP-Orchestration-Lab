/**
 * Verifies lab_send_profile_events_batch sends one POST /api/events/generator per event.
 */
import assert from 'node:assert/strict';
import { LAB_EVENT_TOOL_TARGET_ID } from '../src/framework/buildGeneratorPostBody.mjs';
import { sendProfileEventSequence } from '../src/framework/sendProfileEventSequence.mjs';

const mockTarget = {
  id: LAB_EVENT_TOOL_TARGET_ID,
  transport: 'edge',
  dataStreamId: 'mock-ds-123',
};

/** @type {Array<Record<string, unknown>>} */
const sendCalls = [];

async function run() {
  const outcome = await sendProfileEventSequence({
    sandbox: 'apalmer',
    email: 'batch-seq-test@adobetest.com',
    ecid: '62722406001178632594092146103219305888',
    delay_ms: 0,
    preflight: false,
    events: [
      { event_type: 'donation.made', view_name: 'Donate', channel: 'web' },
      { event_type: 'web.webPageDetails.pageViews', view_name: 'Home', channel: 'web' },
      { event_type: 'transaction', channel: 'web' },
    ],
    deps: {
      listEventTargets: async () => ({
        ok: true,
        data: { targets: [mockTarget] },
      }),
      sendProfileEvent: async (params) => {
        sendCalls.push(params);
        return {
          ok: true,
          data: {
            ok: true,
            transport: 'edge',
            requestId: `req-${sendCalls.length}`,
            message: 'Event sent to Edge interact.',
          },
        };
      },
    },
  });

  assert.equal(sendCalls.length, 3, 'one generator POST per event');
  assert.equal(outcome.ok, true, 'all steps ok');
  assert.equal(outcome.sent, 3, 'sent count');
  assert.equal(outcome.send_mode, 'sequential_generator_posts', 'send mode documented');
  assert.equal(outcome.results.length, 3, 'three step results');

  sendCalls.forEach((call, i) => {
    assert.equal(call.target_id, LAB_EVENT_TOOL_TARGET_ID, `step ${i} target`);
    assert.equal(call.sandbox, 'apalmer', `step ${i} sandbox`);
    assert.equal(call.email, 'batch-seq-test@adobetest.com', `step ${i} email`);
    assert.ok(call.timestamp, `step ${i} timestamp`);
    assert.ok(call.event_type, `step ${i} event_type`);
    assert.equal(call.channel, 'web', `step ${i} channel`);
  });

  assert.equal(sendCalls[0].event_type, 'donation.made');
  assert.equal(sendCalls[0].view_name, 'Donate');
  assert.equal(sendCalls[1].event_type, 'web.webPageDetails.pageViews');
  assert.equal(sendCalls[1].view_name, 'Home');

  const timestamps = sendCalls.map((c) => c.timestamp);
  assert.equal(new Set(timestamps).size, timestamps.length, 'distinct timestamps per step');

  outcome.results.forEach((row) => {
    assert.equal(row.transport, 'edge');
    assert.ok(row.requestId, 'edge requestId present');
    assert.equal(row.eventId, null, 'edge transport has null eventId');
  });

  console.log(JSON.stringify({ ok: true, tests: 'batch-sequence-send', sendCalls: sendCalls.length }));
}

run().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err) }));
  process.exit(1);
});
