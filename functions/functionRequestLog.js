'use strict';

const crypto = require('node:crypto');

const CORRELATION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requestCorrelationId(req) {
  const supplied = String(
    (req && req.headers && req.headers['x-aep-lab-correlation-id'])
      || (req && typeof req.get === 'function' && req.get('x-aep-lab-correlation-id'))
      || '',
  ).trim();
  return CORRELATION_ID_RE.test(supplied) ? supplied.toLowerCase() : crypto.randomUUID();
}

function logFunctionEvent(severity, event, fields = {}) {
  const safeSeverity = ['INFO', 'WARNING', 'ERROR'].includes(severity) ? severity : 'INFO';
  console.log(JSON.stringify({
    severity: safeSeverity,
    message: event,
    ...fields,
  }));
}

module.exports = { requestCorrelationId, logFunctionEvent };
