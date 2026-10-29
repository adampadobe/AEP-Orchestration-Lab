/**
 * Visitor-only storage shared by demo journeys, including demos not currently open.
 * Keep environment choices, Tags selection, recent identifiers and uncertain receipts intact.
 */
(function (global) {
  'use strict';
  var registered = false;
  var sessionKeys = [
    'vuseAgeGate', 'vuseCart', 'vuseIdentity', 'vuseAbandonSent', 'vuseConsent', 'vuseLoyalty',
    'armcomFakeAudienceStage', 'armcomJourneySlideIndex', 'armcomPaidAdClickedAfterBrief',
    'armcomToastState', 'armcomBannerState',
    'aepFnbSessionProfileEmail', 'aepFnbAnonymousEcid', 'aepFnbEcidSource', 'aepFnbBusinessAccountPackage',
    'aepOmSessionProfileEmail', 'aepOmAnonymousEcid', 'aepOmEcidSource', 'omBusinessQuotePackage',
    'navigatorProfileSeedEcid', 'riyadhAirJourneyV1',
  ];
  var localKeys = ['armcomPaidAdClickedAfterBrief', 'miralCrossSiteState'];

  function invalidate() {
    sessionKeys.forEach(function (key) { global.sessionStorage.removeItem(key); });
    localKeys.forEach(function (key) { global.localStorage.removeItem(key); });
  }

  function register() {
    if (registered || !global.AepDemoVisitorReset) return;
    global.AepDemoVisitorReset.registerAdapter({ invalidate: invalidate });
    registered = true;
  }

  global.AepDemoVisitorAdapters = { register: register };
  register();
})(typeof window !== 'undefined' ? window : globalThis);
