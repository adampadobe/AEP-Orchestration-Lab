/**
 * Overview — Content Visibility gauge + Latest Opportunities synced with Opportunities page.
 */
(function () {
  'use strict';

  var DEFAULT_PCT = 36;
  var contentVisibilityPct = null;
  var patchDebounceTimer;

  function opportunitiesPageUrl(hashSuffix) {
    return 'opportunities.html' + (location.search || '') + (hashSuffix || '');
  }

  function qs(root, sel) {
    return (root || document).querySelector(sel);
  }

  function qsa(root, sel) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function parseVisibilityPercent(metrics) {
    if (!metrics || !metrics.visibility) return DEFAULT_PCT;
    var n = parseInt(String(metrics.visibility).replace(/[^\d]/g, ''), 10);
    return isNaN(n) ? DEFAULT_PCT : Math.min(99, Math.max(0, n));
  }

  function visibilityPctFromPlatform() {
    if (window.skyLlmSnapshotPlatform && window.skyLlmSnapshotPlatform.getDashboardMetrics) {
      return parseVisibilityPercent(window.skyLlmSnapshotPlatform.getDashboardMetrics());
    }
    return DEFAULT_PCT;
  }

  function captionForPct(pct) {
    if (pct >= 55) return 'Strong — content is frequently cited by AI models';
    if (pct >= 40) return 'Good — solid visibility in AI-generated answers';
    if (pct >= 28) return 'Fair — some content is visible to AI models';
    return 'Low — limited visibility in AI answers';
  }

  function gaugeStrokeForPct(pct) {
    if (pct >= 55) return '#047857';
    if (pct >= 40) return '#2563eb';
    if (pct >= 28) return '#c45c26';
    return '#b91c1c';
  }

  function patchContentVisibility() {
    var meter = qs(document, 'svg[role="meter"][aria-label*="Content Visibility"]');
    if (!meter) return;

    var pct = visibilityPctFromPlatform();
    if (contentVisibilityPct === pct && meter.getAttribute('data-sky-gauge-pct') === String(pct)) return;
    contentVisibilityPct = pct;
    meter.setAttribute('data-sky-gauge-pct', String(pct));
    meter.setAttribute('aria-valuenow', String(pct));
    meter.setAttribute('aria-label', 'Content Visibility: ' + pct + '%');

    var pctText = meter.querySelector('text');
    if (pctText) pctText.textContent = pct + '%';

    var circumference = 2 * Math.PI * 64;
    var offset = circumference * (1 - pct / 100);
    var arc = meter.querySelector('circle[stroke-dasharray]');
    if (arc) {
      arc.setAttribute('stroke-dasharray', String(circumference));
      arc.setAttribute('stroke-dashoffset', String(offset));
      arc.setAttribute('stroke', gaugeStrokeForPct(pct));
    }

    var track = meter.querySelector('circle:not([stroke-dasharray])');
    if (track) track.setAttribute('stroke', '#e8e8e8');

    var caption = captionForPct(pct);
    var captionHost = meter.parentElement;
    if (captionHost) {
      qsa(captionHost, 'div, span, p').forEach(function (el) {
        if (el.childElementCount > 0) return;
        var t = (el.textContent || '').trim();
        if (/^(Strong|Good|Fair|Low)\s*—/i.test(t) || /content is visible to AI/i.test(t) || /visibility in AI/i.test(t)) {
          el.textContent = caption;
        }
        if (/Your content can.t be seen by AI/i.test(t)) {
          el.textContent = 'Your content can\u2019t be seen by AI';
        }
      });
    }
  }

  function findLatestOpportunitiesHost() {
    var head = qsa(document, 'span[data-rsp-slot="text"], div').find(function (n) {
      return n.childElementCount === 0 && n.textContent.trim() === 'Latest Opportunities';
    });
    if (!head) return null;
    var walk = head.parentElement;
    for (var i = 0; i < 16 && walk; i++) {
      if (qs(walk, '[class*="macro-static-CzVEte"]') || qs(walk, '[class*="macro-static-PM7sac"]')) {
        return walk;
      }
      walk = walk.parentElement;
    }
    return null;
  }

  function findLatestRows(host) {
    if (!host) return [];
    var rows = qsa(host, '[class*="macro-static-CzVEte"]');
    return rows.slice(0, 3);
  }

  function setLeafText(row, classPart, text) {
    var el = qs(row, '[class*="' + classPart + '"]');
    if (el && el.childElementCount === 0) {
      el.textContent = text;
      return true;
    }
    return false;
  }

  function patchLatestOpportunities() {
    var catalog = window.SkyLlmOpportunitiesCatalog;
    if (!catalog) return false;

    var host = findLatestOpportunitiesHost();
    if (!host) return false;

    var rows = findLatestRows(host);
    if (!rows.length) return false;

    var latest = catalog.getLatest(3);

    rows.forEach(function (row, idx) {
      var opp = latest[idx];
      if (!opp) {
        row.style.display = 'none';
        return;
      }
      row.style.display = '';
      row.classList.add('sky-llm-op-overview-row');

      setLeafText(row, 'macro-static-voHAv', opp.title) ||
        qsa(row, '[data-rsp-slot="text"]').some(function (el) {
          if (el.childElementCount > 0) return false;
          var t = el.textContent.trim();
          if (t.length < 8) return false;
          if (/Content Optimization|Content Opportunity|Technical SEO|Technical & GEO|hits affected|URLs affected/i.test(t)) {
            return false;
          }
          el.textContent = opp.title;
          return true;
        });

      setLeafText(row, 'macro-static-HtCHXb', opp.tag);
      setLeafText(row, 'macro-static-5WdxVc', opp.description);

      var bulletWrap = qs(row, '[class*="macro-static-lvMTJ"]');
      var bulletEl = qs(row, '[class*="macro-static-XT4Hxd"]');
      if (opp.bullet) {
        if (bulletWrap) bulletWrap.style.display = '';
        if (bulletEl) bulletEl.textContent = opp.bullet;
      } else if (bulletWrap) {
        bulletWrap.style.display = 'none';
      }

      if (row.dataset.skyLlmOverviewOpId !== opp.id) {
        row.dataset.skyLlmOverviewOpId = opp.id;
        row.style.cursor = 'pointer';
        row.addEventListener(
          'click',
          function (e) {
            e.preventDefault();
            e.stopPropagation();
            location.href = opportunitiesPageUrl('#detail/' + opp.id);
          },
          true,
        );
      }
    });

    var viewAll = document.getElementById('latest-opportunities-view-details-button');
    if (viewAll && viewAll.dataset.skyLlmOverviewViewAllWired !== '1') {
      viewAll.dataset.skyLlmOverviewViewAllWired = '1';
      viewAll.addEventListener(
        'click',
        function (e) {
          e.preventDefault();
          e.stopPropagation();
          location.href = opportunitiesPageUrl('');
        },
        true,
      );
    }

    return true;
  }

  function schedulePatchLatest() {
    if (patchDebounceTimer) window.clearTimeout(patchDebounceTimer);
    patchDebounceTimer = window.setTimeout(patchLatestOpportunities, 150);
  }

  function run() {
    patchContentVisibility();
    schedulePatchLatest();
  }

  document.addEventListener('sky-llm-platform-change', function () {
    contentVisibilityPct = null;
    patchContentVisibility();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
  window.setTimeout(run, 800);
  window.setTimeout(run, 2500);
})();
