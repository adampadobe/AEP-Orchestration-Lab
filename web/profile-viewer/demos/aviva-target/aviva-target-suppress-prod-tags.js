/**
 * Saved Aviva HTML includes production Launch (launch-*.min.js, DTM). That stack
 * configures alloy with Aviva UK org / smetrics.aviva.co.uk and overrides lab inject.
 * Block those scripts on orchestration-lab hosts so only DemoTagsInjection Launch runs.
 */
(function () {
  'use strict';

  if (window.__avivaTargetProdTagsSuppressed) return;
  window.__avivaTargetProdTagsSuppressed = true;

  var host = String((location.hostname || '').toLowerCase());
  if (host.indexOf('aep-orchestration-lab') === -1 && host.indexOf('localhost') === -1) {
    return;
  }

  var BLOCK_SRC =
    /(?:^|\/)assets\/landing\/(?:launch-|dtm-init|dtm-base-init)|\/assets\/landing\/launch-|smetrics\.aviva/i;

  function shouldBlockScript(el) {
    if (!el || el.tagName !== 'SCRIPT') return false;
    var src = String(el.getAttribute('src') || el.src || '');
    return BLOCK_SRC.test(src);
  }

  function neuterScript(el) {
    if (!shouldBlockScript(el)) return;
    try {
      el.removeAttribute('src');
      el.type = 'text/aviva-target-blocked';
      el.setAttribute('data-aviva-target-blocked', '1');
    } catch (e) {}
  }

  function neuterTree(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('script[src]').forEach(neuterScript);
  }

  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'SCRIPT') neuterScript(node);
        else if (node.querySelectorAll) neuterTree(node);
      });
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.head) neuterTree(document.head);
  if (document.body) neuterTree(document.body);

  document.addEventListener(
    'DOMContentLoaded',
    function () {
      neuterTree(document);
    },
    { once: true },
  );
})();
