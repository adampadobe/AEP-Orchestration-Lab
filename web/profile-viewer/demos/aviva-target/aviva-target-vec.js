/**
 * Target VEC / authoring mode — detect query params Adobe uses for visual editing.
 * Load synchronously before sdk-resume and demo-head on journey pages.
 */
(function (global) {
  'use strict';

  function isAuthoring() {
    var s = String((global.location && global.location.search) || '').toLowerCase();
    return (
      s.indexOf('adobe_authoring_enabled') !== -1 ||
      s.indexOf('mboxdisable=1') !== -1 ||
      s.indexOf('at_preview') !== -1
    );
  }

  global.AvivaTargetVec = { isAuthoring: isAuthoring };
})(window);
