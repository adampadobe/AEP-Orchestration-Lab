/**
 * Runs inside walnut-guided-page1.html. Hides the first “Latest updates” block in the
 * captured demo so the stitched Overview (page 1 + page 2) only shows that section once
 * (from the lower capture), directly under Core metrics as in the reference flow.
 */
(function () {
  var SECTION_LABEL = 'Latest updates';

  function parseTopPct(el) {
    try {
      var st = (el && el.style && el.style.top) || (el && el.getAttribute && el.getAttribute('style')) || '';
      var m = String(st).match(/top:\s*([\d.]+)%/);
      if (!m) return NaN;
      return parseFloat(m[1]);
    } catch (e) {
      return NaN;
    }
  }

  function hideLatestUpdatesFirst(doc) {
    if (!doc || !doc.querySelectorAll) return;
    var candidates = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, div');
    var matches = [];
    var i;
    var el;
    var t;
    var tp;
    for (i = 0; i < candidates.length; i++) {
      el = candidates[i];
      t = (el.textContent || '').trim();
      if (t !== SECTION_LABEL) continue;
      tp = parseTopPct(el);
      if (isNaN(tp)) continue;
      matches.push({ el: el, top: tp });
    }
    if (matches.length === 0) return;
    matches.sort(function (a, b) {
      return a.top - b.top;
    });
    var head = matches[0].el;
    var tPct = matches[0].top;
    head.style.setProperty('display', 'none', 'important');
    var lo = tPct - 1;
    var hi = tPct + 18;
    var all = doc.querySelectorAll('[style*="top"]');
    for (i = 0; i < all.length; i++) {
      el = all[i];
      if (el === head) continue;
      tp = parseTopPct(el);
      if (isNaN(tp)) continue;
      if (tp >= lo && tp <= hi) {
        el.style.setProperty('display', 'none', 'important');
      }
    }
  }

  function walk(win, depth) {
    if (!win || depth > 16) return;
    try {
      hideLatestUpdatesFirst(win.document);
    } catch (e0) {}
    try {
      var ifr = win.document.querySelectorAll('iframe');
      var j;
      for (j = 0; j < ifr.length; j++) {
        try {
          var w = ifr[j].contentWindow;
          if (w) walk(w, depth + 1);
        } catch (e1) {}
      }
    } catch (e2) {}
  }

  function run() {
    walk(window, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  [350, 900, 2000, 4000].forEach(function (ms) {
    setTimeout(run, ms);
  });

  try {
    var mo = new MutationObserver(function () {
      run();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e3) {}
})();
