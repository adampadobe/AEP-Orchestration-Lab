/**
 * Non-secret defaults for the AJO Loyalty fake reward provider lab tool.
 * API key lives in Cloud Run / AJO Loyalty admin only — never in this file.
 */
(function () {
  var defaults = {
    providerBaseUrl: 'https://fake-loyalty-provider-a5xduykcsq-uc.a.run.app',
    defaultSandbox: 'apalmer',
    registeredProviderGuid: '15b4d932-9d69-4c3a-b6bd-f8daa5656fdd',
    rewardDefinitionKey: 'points',
    labAudienceId: '409d05fa-9ca6-45ef-8109-fecd33605a14',
    labAudienceName: 'Hotel - Recorded destination context',
    labChallengeId: 'e07ca362-4d53-42cc-a6d5-0e78e8015a26',
    labChallengeName: 'AEP Lab Standard Challenge',
    labEventDefinitionGuid: 'f1fcdc05-17be-4b01-bd40-2a7ba54db385',
    labEventIdentifier: 'commerce.purchases.value',
    labTaskId: 'aep-lab-purchase-task',
    labIdentityNamespace: 'loyaltyId',
    docsUrl:
      'https://github.com/adampadobe/AEP-Orchestration-Lab/blob/main/docs/AJO_LOYALTY_CHALLENGES.md',
  };

  var overlay =
    typeof window !== 'undefined' &&
    window.__LOYALTY_REWARD_PROVIDER_CONFIG__ &&
    typeof window.__LOYALTY_REWARD_PROVIDER_CONFIG__ === 'object'
      ? window.__LOYALTY_REWARD_PROVIDER_CONFIG__
      : {};

  window.loyaltyRewardProviderConfig = Object.assign({}, defaults, overlay);
})();
