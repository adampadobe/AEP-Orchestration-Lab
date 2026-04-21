/**
 * Runs inside walnut-guided-page3.html. Walks nested same-origin demo iframes and
 * notifies the top Profile Viewer page when the user activates the "Homepage Hero Image Test" row.
 */
(function () {
  var NEEDLE = 'Homepage Hero Image Test';
  var MSG = { type: 'aep-exp-accel-walnut', action: 'openPage4' };

  var attached = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
  var attachedDocs = [];

  function isAttached(doc) {
    if (attached && attached.has(doc)) return true;
    for (var i = 0; i < attachedDocs.length; i++) {
      if (attachedDocs[i] === doc) return true;
    }
    return false;
  }

  function markAttached(doc) {
    if (attached) {
      try {
        attached.add(doc);
      } catch (e) {}
    } else {
      attachedDocs.push(doc);
    }
  }

  function notifyTop() {
    try {
      window.top.postMessage(MSG, '*');
    } catch (e) {}
  }

  function markHeroLinks(doc) {
    if (!doc || !doc.querySelectorAll) return;
    try {
      var candidates = doc.querySelectorAll(
        'a, button, [role="link"], [role="row"], [role="gridcell"], td, th, span, p, div, li'
      );
      var i;
      var el;
      var t;
      for (i = 0; i < candidates.length; i++) {
        el = candidates[i];
        t = (el.textContent || '').trim();
        if (t.indexOf(NEEDLE) === -1) continue;
        if (t.length > 200) continue;
        el.style.setProperty('cursor', 'pointer');
      }
    } catch (e0) {}
  }

  function textAround(el) {
    if (!el || el.nodeType !== 1) return '';
    var node = el;
    var buf = '';
    for (var i = 0; i < 10 && node; i++) {
      buf += (node.innerText || node.textContent || '') + '\n';
      node = node.parentElement;
    }
    return buf;
  }

  function onClickCapture(e) {
    if (textAround(e.target).indexOf(NEEDLE) === -1) return;
    e.preventDefault();
    e.stopPropagation();
    notifyTop();
  }

  function attachToDocument(doc, depth) {
    if (!doc || depth > 10) return;
    if (isAttached(doc)) return;
    markAttached(doc);
    doc.addEventListener('click', onClickCapture, true);

    var list = doc.querySelectorAll('iframe');
    for (var i = 0; i < list.length; i++) {
      (function (frame) {
        function hook() {
          try {
            var inner = frame.contentDocument;
            if (inner) attachToDocument(inner, depth + 1);
          } catch (e2) {}
        }
        frame.addEventListener('load', hook);
        hook();
      })(list[i]);
    }
  }

  function markHeroDeep(win, depth) {
    if (!win || depth > 12) return;
    try {
      markHeroLinks(win.document);
    } catch (e) {}
    try {
      var ifr = win.document.querySelectorAll('iframe');
      var j;
      for (j = 0; j < ifr.length; j++) {
        try {
          var w = ifr[j].contentWindow;
          if (w) markHeroDeep(w, depth + 1);
        } catch (e2) {}
      }
    } catch (e3) {}
  }

  function scan() {
    attachToDocument(document, 0);
    markHeroDeep(window, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }

  try {
    var root = document.documentElement;
    if (root && typeof MutationObserver !== 'undefined') {
      var mo = new MutationObserver(function () {
        scan();
      });
      mo.observe(root, { childList: true, subtree: true });
    }
  } catch (e3) {}

  [400, 1200, 3000].forEach(function (ms) {
    setTimeout(scan, ms);
  });
})();
