'use strict';

/**
 * Shared CORS + build stamp headers for Cloud Functions HTTP handlers.
 * Keeps index.js and sandboxApiGateway.js aligned on Access-Control-* wiring.
 */
const buildInfo = require('./buildInfo');

/**
 * @param {import('express').Response} res
 * @param {string} [methods='GET, POST, OPTIONS']
 */
function setCors(res, methods = 'GET, POST, OPTIONS') {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', methods);
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  buildInfo.setBuildHeaders(res);
}

module.exports = { setCors };
