/**
 * Target VEC / QA mode — detect query params Adobe uses for visual editing vs Activity QA preview.
 * Load synchronously before sdk-resume and demo-head on journey pages.
 */
(function (global) {
  'use strict';

  function queryAndHash() {
    return (
      String((global.location && global.location.search) || '') +
      String((global.location && global.location.hash) || '')
    ).toLowerCase();
  }

  /** Move at_preview_* from hash to query (Target only reads search on Edge requests). */
  function normalizePreviewParamsToSearch() {
    if (!global.location || !global.location.hash) return;
    var hash = String(global.location.hash || '');
    if (hash.toLowerCase().indexOf('at_preview') === -1) return;
    try {
      var fragment = hash.replace(/^#/, '').replace(/^\?/, '');
      if (!fragment) return;
      var url = new URL(global.location.href);
      if (url.searchParams.toString().toLowerCase().indexOf('at_preview') !== -1) return;
      fragment.split('&').forEach(function (pair) {
        if (!pair) return;
        var eq = pair.indexOf('=');
        if (eq === -1) url.searchParams.set(pair, '');
        else url.searchParams.set(pair.slice(0, eq), pair.slice(eq + 1));
      });
      url.hash = '';
      global.location.replace(url.toString());
    } catch (e) {
      /* noop */
    }
  }

  normalizePreviewParamsToSearch();

  /** VEC composer only — skip Launch resume so Alloy does not fight the editor. */
  function isVecCompose() {
    var s = queryAndHash();
    return s.indexOf('adobe_authoring_enabled') !== -1;
  }

  /** Activity QA / preview links — Launch must stay on the page for Web SDK delivery. */
  function isTargetPreview() {
    var s = queryAndHash();
    return s.indexOf('at_preview') !== -1;
  }

  function isAuthoring() {
    return isVecCompose() || isTargetPreview();
  }

  global.AvivaTargetVec = {
    isAuthoring: isAuthoring,
    isVecCompose: isVecCompose,
    isTargetPreview: isTargetPreview,
  };
})(window);
