/**
 * Overview — Content Visibility gauge + Latest Opportunities synced with Opportunities page.
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

  function findLatestOpportunitiesHost() {
    var head = Array.from(document.querySelectorAll('span[data-rsp-slot="text"], div')).find(function (n) {
      return n.childElementCount === 0 && n.textContent.trim() === 'Latest Opportunities';
    });
    if (!head) return null;
    var walk = head.parentElement;
    for (var i = 0; i < 12 && walk; i++) {
      if (walk.querySelector('.macro-static-CzVEte')) return walk;
      walk = walk.parentElement;
    }
    return null;
  }

  function patchLatestOpportunities() {
    var catalog = window.SkyLlmOpportunitiesCatalog;
    if (!catalog) return;

    var host = findLatestOpportunitiesHost();
    if (!host) return;

    var rows = Array.from(host.querySelectorAll('.macro-static-CzVEte'));
    if (!rows.length) return;

    var latest = catalog.getLatest(3);

    rows.forEach(function (row, idx) {
      var opp = latest[idx];
      if (!opp) {
        row.style.display = 'none';
        return;
      }
      row.style.display = '';
      row.classList.add('sky-llm-op-overview-row');

      var titleEl = row.querySelector('.macro-static-voHAv, [class*="voHAv"]');
      if (!titleEl) {
        titleEl = Array.from(row.querySelectorAll('[data-rsp-slot="text"]')).find(function (el) {
          return el.textContent.trim().length > 20 && !/Content Optimization|Technical SEO|hits affected|URLs affected/i.test(el.textContent);
        });
      }
      if (titleEl) titleEl.textContent = opp.title;

      var tagEl = row.querySelector('.macro-static-HtCHXb, [class*="HtCHXb"]');
      if (tagEl) tagEl.textContent = opp.tag;

      var descEl = row.querySelector('.macro-static-5WdxVc, [class*="5WdxVc"]');
      if (descEl) descEl.textContent = opp.description;

      var bulletWrap = row.querySelector('.macro-static-lvMTJ');
      var bulletEl = row.querySelector('.macro-static-XT4Hxd');
      if (opp.bullet) {
        if (bulletWrap) bulletWrap.style.display = '';
        if (bulletEl) bulletEl.textContent = opp.bullet;
      } else if (bulletWrap) {
        bulletWrap.style.display = 'none';
      }

      if (row.dataset.skyLlmOverviewRowWired === '1') return;
      row.dataset.skyLlmOverviewRowWired = '1';
      row.style.cursor = 'pointer';
      row.addEventListener(
        'click',
        function (e) {
          e.preventDefault();
          e.stopPropagation();
          location.href = catalog.detailHref(opp.id);
        },
        true,
      );
    });

    var viewAll = document.getElementById('latest-opportunities-view-details-button');
    if (viewAll && viewAll.dataset.skyLlmOverviewViewAllWired !== '1') {
      viewAll.dataset.skyLlmOverviewViewAllWired = '1';
      viewAll.addEventListener(
        'click',
        function (e) {
          e.preventDefault();
          e.stopPropagation();
          location.href = 'opportunities.html';
        },
        true,
      );
    }
  }

  function run() {
    if (!document.querySelector('svg[role="meter"][aria-label*="Content Visibility"]') && !findLatestOpportunitiesHost()) {
      return;
    }
    lockContentVisibility();
    patchLatestOpportunities();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
  [500, 1500, 2800].forEach(function (ms) {
    window.setTimeout(run, ms);
  });
})();
