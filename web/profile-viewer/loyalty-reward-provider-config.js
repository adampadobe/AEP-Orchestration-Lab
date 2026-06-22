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
    labAudienceId: '7a22b088-cff4-4ecc-824f-856bc3c15746',
    labAudienceName: 'Hotel - Elevated modelled churn risk',
    labChallengeId: 'e07ca362-4d53-42cc-a6d5-0e78e8015a26',
    labChallengeName: 'AEP Lab Standard Challenge',
    labChallengeState: 'published',
    labEventDefinitionGuid: 'f1fcdc05-17be-4b01-bd40-2a7ba54db385',
    labEventDefinitionName: 'AEP Lab Purchase Event',
    labEventIdentifier: 'commerce.purchases.value',
    labTaskId: 'aep-lab-purchase-task',
    labJourneyName: 'AEP Lab Loyalty Challenge Journey',
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
