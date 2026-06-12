/**
 * Remove Walnut demo overlay appended after </body> in frozen snapshots (blocks all clicks).
 * Must load before page interaction scripts.
 */
(function () {
  'use strict';

  function stripWalnut() {
    var walnut = document.getElementById('walnut-root-popin-element');
    if (!walnut) return false;
    if (walnut.parentNode) walnut.parentNode.removeChild(walnut);
    return true;
  }

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
