/**
 * Non-secret defaults for the AJO Loyalty reward provider lab tool.
 * API key lives in Cloud Run / AJO Loyalty admin only — never in this file.
 */
(function () {
  var providerCloudRunHost = 'loyalty-reward-provider-a5xduykcsq-uc.a.run.app';
  var defaultSandbox = 'apalmer';

  /** @type {Record<string, object>} */
  var sandboxProfiles = {
    apalmer: {
      registeredProviderGuid: '2938ecb7-2e47-4098-9d55-89a57b919bd9',
      rewardDefinitionKey: 'points',
      labAudienceId: '409d05fa-9ca6-45ef-8109-fecd33605a14',
      labAudienceName: 'Hotel - Recorded destination context',
      labChallengeId: '7d144e04-64cc-4660-a85d-d3755583db93',
      labChallengeName: 'Buy 3 Coffees — Lab Challenge',
      labChallengeState: 'published',
      labEventDefinitionGuid: '0c5c7286-4c51-4f2f-a7bb-d45467d8e7da',
      labEventDefinitionName: 'AEP Lab Coffee Purchase Event',
      labEventIdentifier: 'loyalty.coffee.purchase',
      labTaskId: 'aep-lab-coffee-purchase-task',
      labCoffeePurchaseGoal: 3,
      labRewardPoints: '100',
      labJourneyName: 'Buy 3 Coffees — Lab Journey',
      labIdentityNamespace: 'loyaltyId',
    },
  };

  function buildProviderBaseUrl() {
    return 'https://' + providerCloudRunHost;
  }

  function fulfillPathForSandbox(sandbox) {
    return '/' + String(sandbox || defaultSandbox).trim().toLowerCase() + '/v1/fulfill';
  }

  function resolveSandboxProfile(sandbox) {
    var key = String(sandbox || defaultSandbox).trim().toLowerCase();
    var base = sandboxProfiles[key] || sandboxProfiles[defaultSandbox] || {};
    return Object.assign({}, base, { sandbox: key });
  }

  function buildConfigForSandbox(sandbox) {
    var profile = resolveSandboxProfile(sandbox);
    var baseUrl = buildProviderBaseUrl();
    return Object.assign({}, profile, {
      providerCloudRunHost: providerCloudRunHost,
      providerBaseUrl: baseUrl,
      defaultSandbox: defaultSandbox,
      fulfillPath: fulfillPathForSandbox(profile.sandbox || sandbox),
      fulfillUrl: baseUrl + fulfillPathForSandbox(profile.sandbox || sandbox),
      docsUrl:
        'https://github.com/adampadobe/AEP-Orchestration-Lab/blob/main/docs/AJO_LOYALTY_CHALLENGES.md',
    });
  }

  var overlay =
    typeof window !== 'undefined' &&
    window.__LOYALTY_REWARD_PROVIDER_CONFIG__ &&
    typeof window.__LOYALTY_REWARD_PROVIDER_CONFIG__ === 'object'
      ? window.__LOYALTY_REWARD_PROVIDER_CONFIG__
      : {};

  window.loyaltyRewardProviderConfig = Object.assign(
    buildConfigForSandbox(defaultSandbox),
    overlay,
  );

  window.loyaltyRewardProviderConfig.getForSandbox = function (sandbox) {
    return Object.assign(buildConfigForSandbox(sandbox), overlay);
  };
})();
