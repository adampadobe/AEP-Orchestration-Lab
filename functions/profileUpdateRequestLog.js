'use strict';

const { summarizeProfileStreamWire, summarizeProfileStreamReceipt } = require('./profileStreamDiagnostics');

// Never emit caller-supplied paths, keys, masked identities, or per-value hashes.
function summarizeProfileUpdateRequest({ updates, dryRun, hasConsent } = {}) {
  return {
    dryRun: dryRun === true,
    hasConsent: hasConsent === true,
    updateCount: Array.isArray(updates) ? updates.length : 0,
  };
}

function buildPayloadLogEntry({ wireBody, target, streamingResponse, status, errorCount, warningCount } = {}) {
  return {
    ...summarizeProfileStreamWire(wireBody, target),
    ...(streamingResponse !== undefined
      ? summarizeProfileStreamReceipt(streamingResponse, { status, errorCount, warningCount })
      : {}),
  };
}

module.exports = { summarizeProfileUpdateRequest, buildPayloadLogEntry };
