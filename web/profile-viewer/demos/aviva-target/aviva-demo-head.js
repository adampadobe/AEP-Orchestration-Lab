/**
 * Aviva demo — suppress OneTrust cookie UI on quote-flow pages (landing keeps the banner).
 * Load synchronously in <head> so the banner never flashes on step pages.
 */
(function () {
  'use strict';

  var page = (location.pathname.split('/').pop() || 'index.html').replace(/^\.\//, '');
  if (page === 'index.html') return;

  var HIDE =
    '#onetrust-consent-sdk,#onetrust-banner-sdk,.onetrust-pc-dark-filter,#ot-sdk-btn-floating,.ot-sdk-show-settings{display:none!important;visibility:hidden!important;pointer-events:none!important;height:0!important;overflow:hidden!important}';

  function injectStyle() {
    if (document.getElementById('aviva-demo-no-cookies')) return;
    var style = document.createElement('style');
    style.id = 'aviva-demo-no-cookies';
    style.textContent = HIDE;
    (document.head || document.documentElement).appendChild(style);
  }

  function removeNodes() {
    document
      .querySelectorAll(
        '#onetrust-consent-sdk,#onetrust-banner-sdk,.onetrust-pc-dark-filter,#ot-sdk-btn-floating',
      )
      .forEach(function (node) {
        node.remove();
      });
  }

  window.OptanonWrapper = function () {};

  injectStyle();
  removeNodes();

  if (typeof MutationObserver !== 'undefined' && document.documentElement) {
    new MutationObserver(function () {
      injectStyle();
      removeNodes();
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
