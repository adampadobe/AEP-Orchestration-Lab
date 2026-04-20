/**
 * Two-step click-through: advance on stage click or Next button; wrap after step 2.
 */
(function () {
  var step = 0;
  var total = 2;

  function imgEl() {
    return document.getElementById('expAccelImg');
  }

  function hintEl() {
    return document.getElementById('expAccelStepHint');
  }

  function btnEl() {
    return document.getElementById('expAccelNextBtn');
  }

  function stageEl() {
    return document.getElementById('expAccelStage');
  }

  function urlsFromDom() {
    var el = imgEl();
    if (!el) return ['', ''];
    return [
      el.getAttribute('data-url-step1') || '',
      el.getAttribute('data-url-step2') || '',
    ];
  }

  function applyStep() {
    var u = urlsFromDom();
    var el = imgEl();
    if (!el || !u.length) return;
    var raw = u[step] || u[0] || '';
    var src = raw;
    if (raw.indexOf('http://') === 0 || raw.indexOf('https://') === 0) {
      try {
        var busted = new URL(raw);
        busted.searchParams.set('_ea', String(Date.now()));
        src = busted.href;
      } catch (e) {
        src = raw + (raw.indexOf('?') >= 0 ? '&' : '?') + '_ea=' + Date.now();
      }
    }
    el.src = src;
    el.alt = '';
    var h = hintEl();
    if (h) {
      h.textContent =
        step === 0
          ? 'Screen 1 of 2 — click anywhere on the screenshot to continue'
          : 'Screen 2 of 2 — click to return to the first screen';
    }
    var b = btnEl();
    if (b) {
      b.textContent = step === 0 ? 'Next screen' : 'Back to first screen';
    }
    var st = stageEl();
    if (st) {
      st.setAttribute('aria-label', step === 0 ? 'Advance to the second demo screen' : 'Return to the first demo screen');
    }
  }

  function advance() {
    step = (step + 1) % total;
    applyStep();
  }

  window.__expAccelApplyStepUrls = function (step1, step2) {
    var el = imgEl();
    if (!el) return;
    if (typeof step1 === 'string') el.setAttribute('data-url-step1', step1);
    if (typeof step2 === 'string') el.setAttribute('data-url-step2', step2);
    step = 0;
    applyStep();
  };

  function init() {
    var st = stageEl();
    if (st) {
      st.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('#expAccelDockOuter')) return;
        advance();
      });
      st.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          advance();
        }
      });
    }
    var b = btnEl();
    if (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        advance();
      });
    }
    applyStep();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
