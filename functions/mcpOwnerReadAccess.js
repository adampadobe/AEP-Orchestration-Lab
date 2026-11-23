'use strict';

const admin = require('firebase-admin');
const { OWNER_EMAIL } = require('./labUsageService');

async function ownerMayReadSandbox(principal, sandbox, method, deps = {}) {
  if (method !== 'GET' || !principal?.keyId || !principal?.principalUid || typeof sandbox !== 'string'
      || !/^[a-z0-9][a-z0-9_-]{0,47}$/.test(sandbox)) return false;
  try {
    if (!deps.ownerAuth && !admin.apps.length) admin.initializeApp();
    const auth = deps.ownerAuth || admin.auth();
    const owner = await auth.getUserByEmail(OWNER_EMAIL);
    return owner.uid === principal.principalUid && !owner.disabled;
  } catch {
    console.error('Owner read authorization lookup failed.');
    throw new Error('Owner read authorization is unavailable.');
  }
}

module.exports = { ownerMayReadSandbox };
