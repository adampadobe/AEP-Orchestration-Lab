/**
 * Overview-only: lock Content Visibility gauge to 36% (not tied to date/platform filters).
 */
(function () {
  'use strict';

  var PCT = 36;
  var CAPTION = 'Fair — some content is visible to AI models';

  function lockContentVisibility() {
    var meter = document.querySelector('svg[role="meter"][aria-label*="Content Visibility"]');
    if (!meter) return;

    meter.setAttribute('aria-valuenow', String(PCT));
    meter.setAttribute('aria-label', 'Content Visibility: ' + PCT + '%');

    var pctText = meter.querySelector('text');
    if (pctText) pctText.textContent = PCT + '%';

    var circumference = 2 * Math.PI * 64;
    var offset = circumference * (1 - PCT / 100);
    var arc = meter.querySelector('circle[stroke-dasharray]');
    if (arc) {
      arc.setAttribute('stroke-dasharray', String(circumference));
      arc.setAttribute('stroke-dashoffset', String(offset));
      arc.setAttribute('stroke', '#c45c26');
    }

    var track = meter.querySelector('circle:not([stroke-dasharray])');
    if (track) track.setAttribute('stroke', '#e8e8e8');

    document.querySelectorAll('div, span, p').forEach(function (el) {
      if (el.childElementCount > 0) return;
      var t = (el.textContent || '').trim();
      if (/^Fair\s*—/i.test(t) || /some content is visible to AI/i.test(t)) {
        el.textContent = CAPTION;
      }
      if (/Your content can.t be seen by AI/i.test(t)) {
        el.textContent = 'Your content can\u2019t be seen by AI';
      }
    });
  }

  function run() {
    if (!document.querySelector('svg[role="meter"][aria-label*="Content Visibility"]')) return;
    lockContentVisibility();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
  window.setTimeout(run, 500);
  window.setTimeout(run, 1500);
})();
