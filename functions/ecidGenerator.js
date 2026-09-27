'use strict';

const crypto = require('crypto');

/**
 * Adobe ECIDs are 38 digits: two zero-padded 19-digit halves, each a signed
 * 64-bit value. Edge Network rejects identities outside that range with
 * "Invalid identity provided", so fabricated "4" + 37 random digits values
 * fail roughly 8% of the time (whenever the low half exceeds 2^63-1).
 */
const ECID_HALF_MAX = 9223372036854775807n;
const ECID_HALF_MIN = 1000000000000000000n;
const ECID_HALF_SPAN = ECID_HALF_MAX - ECID_HALF_MIN + 1n;

function randomEcidHalf() {
  const raw = BigInt(`0x${crypto.randomBytes(16).toString('hex')}`);
  return (ECID_HALF_MIN + (raw % ECID_HALF_SPAN)).toString().padStart(19, '0');
}

/**
 * @returns {string} A 38-digit ECID Edge Network accepts as a valid identity.
 */
function generateEcid() {
  return `${randomEcidHalf()}${randomEcidHalf()}`;
}

/**
 * @param {unknown} value
 * @returns {boolean} True when the value is a canonical 38-digit Adobe ECID.
 */
function isCanonicalEcid(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  const ecid = String(value).trim();
  if (!/^\d{38}$/.test(ecid)) return false;
  return BigInt(ecid.slice(0, 19)) <= ECID_HALF_MAX && BigInt(ecid.slice(19)) <= ECID_HALF_MAX;
}

module.exports = {
  ECID_HALF_MAX,
  generateEcid,
  isCanonicalEcid,
};
