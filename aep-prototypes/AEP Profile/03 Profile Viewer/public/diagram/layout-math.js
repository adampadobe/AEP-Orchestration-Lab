/**
 * Pure math for align / distribute (used by tests + future Tidy HUD).
 */
(function (global) {
  'use strict';

  function alignLeft(rects) {
    if (!rects || !rects.length) return;
    var minL = Math.min.apply(
      null,
      rects.map(function (r) {
        return r.x;
      })
    );
    rects.forEach(function (r) {
      r.x = minL;
    });
  }

  function distributeHorizCenters(rects, gap) {
    if (!rects || rects.length < 2) return;
    var sorted = rects
      .map(function (r, i) {
        return { i: i, cx: r.x + r.w / 2, r: r };
      })
      .sort(function (a, b) {
        return a.cx - b.cx;
      });
    var g = typeof gap === 'number' ? gap : null;
    if (g == null) {
      var span = sorted[sorted.length - 1].cx - sorted[0].cx;
      g = span / (sorted.length - 1);
    }
    var x = sorted[0].cx;
    sorted.forEach(function (o, idx) {
      if (idx === 0) return;
      x += g;
      var r = o.r;
      r.x = x - r.w / 2;
    });
  }

  global.AEPDiagram = global.AEPDiagram || {};
  global.AEPDiagram.layoutMath = {
    alignLeft: alignLeft,
    distributeHorizCenters: distributeHorizCenters,
  };
})(typeof window !== 'undefined' ? window : this);
