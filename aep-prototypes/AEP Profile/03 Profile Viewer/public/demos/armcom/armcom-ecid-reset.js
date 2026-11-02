/**
 * Arm visitor-state adapter. Adobe identity reset and verification belong to the shared controller.
 */
(function (global) {
  'use strict';

  var SESSION_KEYS = [
    'armcomFakeAudienceStage',
    'armcomJourneySlideIndex',
    'armcomPaidAdClickedAfterBrief',
    'armcomToastState',
    'armcomBannerState',
  ];
  var registered = false;

  function isArmcomLabPage() {
    return !!(global.document && document.body &&
      (document.body.classList.contains('armcom-demo-page') ||
        document.body.classList.contains('armcom-mobile-demo-page')));
  }

  function invalidate() {
    SESSION_KEYS.forEach(function (key) { global.sessionStorage.removeItem(key); });
    global.localStorage.removeItem('armcomPaidAdClickedAfterBrief');
    if (global.ArmcomFakeAudiences && typeof global.ArmcomFakeAudiences.reset === 'function') {
      global.ArmcomFakeAudiences.reset();
    }
    // Audience reset can persist its initial stage; leave no journey state to restore on reload.
    SESSION_KEYS.forEach(function (key) { global.sessionStorage.removeItem(key); });
  }

  function register() {
    if (registered || !isArmcomLabPage() || !global.AepDemoVisitorReset) return;
    global.AepDemoVisitorReset.registerAdapter({
      beforeReset: function () {
        if (global.armcomVisitorSendCount > 0) throw new Error('Wait for the current Arm event before resetting the visitor.');
      },
      invalidate: invalidate,
    });
    registered = true;
  }

  async function reset() {
    if (!isArmcomLabPage()) throw new Error('ECID reset is only available on Arm demo pages.');
    if (global.envBar && typeof global.envBar.ready === 'function') await global.envBar.ready();
    register();
    if (!registered) throw new Error('Shared visitor reset is unavailable. Reload the lab before trying again.');
    return global.AepDemoVisitorReset.reset();
  }

  global.ArmcomEcidReset = {
    reset: reset,
    isArmcomLabPage: isArmcomLabPage,
    isAvailable: function () {
      return isArmcomLabPage() && !!global.AepDemoVisitorReset &&
        global.AepDemoVisitorReset.availability().available;
    },
    isBlocked: function () { return !global.AepDemoVisitorReset || global.AepDemoVisitorReset.isBlocked(); },
  };

  register();
  if (!registered && global.envBar && typeof global.envBar.ready === 'function') {
    global.envBar.ready().then(register).catch(function (error) {
      console.error('Arm visitor adapter could not initialise:', error);
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
