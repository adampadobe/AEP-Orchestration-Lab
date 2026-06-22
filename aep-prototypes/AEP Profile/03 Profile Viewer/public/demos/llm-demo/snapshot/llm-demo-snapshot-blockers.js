/**
 * Remove Walnut demo overlay appended after </body> in frozen snapshots (blocks all clicks).
 * Must load before page interaction scripts.
 */
(function () {
  'use strict';

  function stripSpaBundles() {
    document.querySelectorAll('script[defer][src*="/assets/"], script[defer][src^="./assets/"]').forEach(function (s) {
      s.parentNode && s.parentNode.removeChild(s);
    });
    document.querySelectorAll('script[src*="assets/auth."], script[src*="assets/main."], script[src*="assets/vendor."]').forEach(
      function (s) {
        if (s.defer || /auth\.|main\.|vendor\./.test(s.getAttribute('src') || '')) {
          s.parentNode && s.parentNode.removeChild(s);
        }
      }
    );
  }

  function stripWalnut() {
    var walnut = document.getElementById('walnut-root-popin-element');
    if (!walnut) return false;
    if (walnut.parentNode) walnut.parentNode.removeChild(walnut);
    return true;
  }

  stripSpaBundles();
  stripWalnut();

  if (window.MutationObserver) {
    var obs = new MutationObserver(function () {
      stripWalnut();
    });
    obs.observe(document.documentElement, { childList: true, subtree: false });
  }

  document.addEventListener('DOMContentLoaded', stripWalnut);
  [0, 50, 200, 800, 2000].forEach(function (ms) {
    window.setTimeout(stripWalnut, ms);
  });
})();
