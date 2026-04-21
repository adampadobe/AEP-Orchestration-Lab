/**
 * Runs inside walnut-guided-page1/page2 wrappers.
 * - Removes nested iframe scrollbars (all same-origin Walnut frames)
 * - Normalizes dark canvas backgrounds to white to avoid black seams
 * - Keeps nested content stable without independent inner scrolling
 */
(function () {
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

  function applyToDoc(doc) {
    if (!doc) return;
    squashScroll(doc);
    lightenDarkCanvas(doc);
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
