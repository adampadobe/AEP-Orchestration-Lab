/**
 * Runs inside walnut-guided-page1/page2 wrappers.
 * - Removes nested iframe scrollbars (all same-origin Walnut frames)
 * - Normalizes dark canvas backgrounds to white to avoid black seams
 * - Keeps only one "Latest updates" section in page2 captures
 */
(function () {
  var title = (document.title || '').toLowerCase();
  var isPage2 = title.indexOf('page 2') !== -1;

  function parseTopPct(el) {
    try {
      var txt = (el && el.getAttribute && el.getAttribute('style')) || '';
      var m = txt.match(/top:\s*([\d.]+)%/i);
      return m ? parseFloat(m[1]) : NaN;
    } catch (e) {
      return NaN;
    }
  }

  function squashScroll(doc) {
    try {
      if (doc.documentElement) {
        doc.documentElement.style.overflow = 'hidden';
        doc.documentElement.style.background = '#fff';
      }
      if (doc.body) {
        doc.body.style.overflow = 'hidden';
        doc.body.style.background = '#fff';
      }
    } catch (e) {}
  }

  function lightenDarkCanvas(doc) {
    var nodes;
    var i;
    var el;
    var s;
    try {
      nodes = doc.querySelectorAll('[style*="background-color"]');
      for (i = 0; i < nodes.length; i++) {
        el = nodes[i];
        s = String(el.getAttribute('style') || '');
        if (s.indexOf('var(--color-dark-5)') !== -1 || s.indexOf('rgb(17, 19, 24)') !== -1) {
          el.style.backgroundColor = '#fff';
        }
      }
    } catch (e) {}
  }

  function dedupeLatestInPage2(doc) {
    if (!isPage2) return;
    var labels;
    var matches = [];
    var i;
    var t;
    var p;
    var all;
    var j;
    var q;
    try {
      labels = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, div');
      for (i = 0; i < labels.length; i++) {
        t = (labels[i].textContent || '').trim();
        if (t !== 'Latest updates') continue;
        p = parseTopPct(labels[i]);
        if (isNaN(p)) continue;
        matches.push({ el: labels[i], top: p });
      }
      if (matches.length <= 1) return;
      // Keep only the first/upper section; hide duplicates below it.
      matches.sort(function (a, b) {
        return a.top - b.top;
      });
      for (i = 1; i < matches.length; i++) {
        matches[i].el.style.display = 'none';
        all = doc.querySelectorAll('[style*="top"]');
        for (j = 0; j < all.length; j++) {
          q = parseTopPct(all[j]);
          if (isNaN(q)) continue;
          if (q >= matches[i].top - 1 && q <= matches[i].top + 17) {
            all[j].style.display = 'none';
          }
        }
      }
    } catch (e) {}
  }

  function applyToDoc(doc) {
    if (!doc) return;
    squashScroll(doc);
    lightenDarkCanvas(doc);
    dedupeLatestInPage2(doc);
  }

  function walk(win, depth) {
    if (!win || depth > 16) return;
    try {
      applyToDoc(win.document);
    } catch (e) {}
    try {
      var ifr = win.document.querySelectorAll('iframe');
      var i;
      for (i = 0; i < ifr.length; i++) {
        try {
          walk(ifr[i].contentWindow, depth + 1);
        } catch (e2) {}
      }
    } catch (e3) {}
  }

  function run() {
    walk(window, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  [250, 900, 2200, 4200].forEach(function (ms) {
    setTimeout(run, ms);
  });

  try {
    var mo = new MutationObserver(function () {
      run();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e4) {}
})();
