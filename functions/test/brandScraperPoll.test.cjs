'use strict';

const test = require('node:test');
const assert = require('node:assert');

/** Mirrors client pollDelayMs for history refresh backoff. */
function pollDelayMs(tick) {
  if (tick < 15) return 2500;
  if (tick < 45) return 3500;
  return 5000;
}

test('pollDelayMs uses tiered backoff', () => {
  assert.strictEqual(pollDelayMs(1), 2500);
  assert.strictEqual(pollDelayMs(14), 2500);
  assert.strictEqual(pollDelayMs(15), 3500);
  assert.strictEqual(pollDelayMs(44), 3500);
  assert.strictEqual(pollDelayMs(45), 5000);
});
