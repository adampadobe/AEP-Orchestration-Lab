'use strict';

/** @deprecated Use loyaltyRewardProviderProxy — backward-compat re-export. */
const loyaltyRewardProviderProxy = require('./loyaltyRewardProviderProxy');

module.exports = {
  handleFakeLoyaltyRequest: loyaltyRewardProviderProxy.handleLoyaltyRewardProviderRequest,
  FAKE_LOYALTY_ALLOWED_HOST: loyaltyRewardProviderProxy.LEGACY_ALLOWED_HOST,
  DEFAULT_FAKE_LOYALTY_BASE_URL: loyaltyRewardProviderProxy.DEFAULT_PROVIDER_BASE_URL,
};
