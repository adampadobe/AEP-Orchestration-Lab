/**
 * ItemsStep (vanilla) — ported from
 * https://github.com/alexmtmr/experience-decisioning-playground/blob/main/src/components/steps/ItemsStep.jsx
 * Expects window.DCE_PLAYGROUND_ITEMS_BY_INDUSTRY + DCE_PLAYGROUND_ITEMS_BRAND from playground-items-offers.js
 */
(function () {
  'use strict';

  var CH_ROW = [
    { k: 'email', l: 'Email', ic: '<svg class="dce-items-ch-ic" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/><rect x="2" y="4" width="20" height="16" rx="2"/></svg>' },
    { k: 'web', l: 'Web', ic: '<svg class="dce-items-ch-ic" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>' },
    { k: 'app', l: 'App', ic: '<svg class="dce-items-ch-ic" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/></svg>' },
    { k: 'push', l: 'Push', ic: '<svg class="dce-items-ch-ic" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>' },
    { k: 'sms', l: 'SMS', ic: '<svg class="dce-items-ch-ic" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' },
    { k: 'code', l: 'Code', ic: '<svg class="dce-items-ch-ic" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/></svg>' },
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  window.dceVizBindPlaygroundItemsStep = function (getIndustry) {
    var panel = document.getElementById('dceViz-panel-channels');
    var mountBar = document.getElementById('dce-items-channel-mount');
    var mountGrid = document.getElementById('dce-items-offer-grid');
    var mountPrev = document.getElementById('dce-items-preview-mount');

    window.dceVizApplyItemsIndustry = function () {};
    window.dceVizUpdateChannelConnector = function () {};

    if (!panel || !mountBar || !mountGrid || !mountPrev) return;
    if (panel.getAttribute('data-dce-items-bound') === '1') return;
    panel.setAttribute('data-dce-items-bound', '1');

    var state = { channel: 'web', selectedId: null };

    function getOffers() {
      var ind = typeof getIndustry === 'function' ? getIndustry() : 'media';
      var m = window.DCE_PLAYGROUND_ITEMS_BY_INDUSTRY;
      if (!m || !m.retail) return [];
      return m[ind] || m.retail;
    }

    function getBrand() {
      var b = window.DCE_PLAYGROUND_ITEMS_BRAND;
      var ind = typeof getIndustry === 'function' ? getIndustry() : 'media';
      if (!b) return 'Your Store';
      return b[ind] || b.retail || 'Your Store';
    }

    function hasCh(o, ch) {
      return o.channels && o.channels.indexOf(ch) >= 0;
    }

    function renderChannelBar() {
      var h = '<div class="dce-items-channel-bar" role="tablist" aria-label="Preview channel">';
      for (var i = 0; i < CH_ROW.length; i++) {
        var c = CH_ROW[i];
        var on = state.channel === c.k;
        h +=
          '<button type="button" class="dce-items-pill' +
          (on ? ' dce-items-pill--active' : '') +
          '" data-dce-items-ch="' +
          esc(c.k) +
          '" role="tab" aria-selected="' +
          (on ? 'true' : 'false') +
          '">' +
          c.ic +
          '<span>' +
          esc(c.l) +
          '</span></button>';
      }
      h += '</div>';
      mountBar.innerHTML = h;
    }

    function renderOfferGrid() {
      var offers = getOffers();
      var ch = state.channel;
      var h = '';
      for (var i = 0; i < offers.length; i++) {
        var item = offers[i];
        var has = hasCh(item, ch);
        var active = state.selectedId === item.id;
        h +=
          '<button type="button" class="dce-items-offer-card card' +
          (active ? ' is-active' : '') +
          '" data-dce-items-offer-id="' +
          item.id +
          '" role="listitem" style="--offer-c:' +
          esc(item.color) +
          ';opacity:' +
          (has ? '1' : '0.3') +
          '">';
        h += '<div class="dce-items-offer-top"><span class="dce-items-offer-ico">' + esc(item.ico) + '</span>';
        h += '<span class="dce-items-offer-pri">' + esc(String(item.priority)) + '</span></div>';
        h += '<h3 class="dce-items-offer-name">' + esc(item.name) + '</h3>';
        h += '<div class="dce-items-offer-badges"><span class="dce-items-badge" style="color:' + esc(item.color) + '">' + esc(item.type) + '</span>';
        if (!has) h += '<span class="dce-items-badge dce-items-badge--muted">No ' + esc(ch) + '</span>';
        h += '</div></button>';
      }
      mountGrid.innerHTML = h;
    }

    function renderPreview() {
      var offers = getOffers();
      var sel = null;
      for (var i = 0; i < offers.length; i++) {
        if (offers[i].id === state.selectedId) sel = offers[i];
      }
      var brand = getBrand();
      var ch = state.channel;

      if (!sel) {
        mountPrev.innerHTML =
          '<div class="dce-items-prev-empty card"><span class="dce-items-prev-empty-ico" aria-hidden="true">👆</span><p class="dce-items-prev-empty-txt">Click an offer to preview</p></div>';
        return;
      }

      var isDark = ch === 'push' || ch === 'sms' || ch === 'code';
      var inner = '';

      if (ch === 'email') {
        inner +=
          '<div class="dce-items-pr-email"><div class="dce-items-pr-email-hdr" style="background:' +
          esc(sel.color) +
          '"><span class="dce-items-pr-email-ico">' +
          esc(sel.ico) +
          '</span><span class="dce-items-pr-email-brand">' +
          esc(brand) +
          '</span></div>';
        inner += '<div class="dce-items-pr-email-body">';
        inner +=
          '<div class="dce-items-pr-email-subj">Subject: ' +
          esc(sel.name) +
          ' — Just for you</div>';
        inner += '<div class="dce-items-pr-email-title">' + esc(sel.name) + '</div>';
        inner +=
          '<div class="dce-items-pr-email-desc">' +
          esc(sel.desc) +
          ". Don't miss out — this offer is available for a limited time only.</div>";
        inner +=
          '<div class="dce-items-pr-email-cta" style="background:' +
          esc(sel.color) +
          '">Shop Now →</div>';
        inner +=
          '<div class="dce-items-pr-email-foot">You\'re receiving this because you opted into marketing emails. Unsubscribe</div>';
        inner += '</div></div>';
      } else if (ch === 'push') {
        inner += '<div class="dce-items-pr-push">';
        inner += '<div class="dce-items-pr-push-top"><span class="dce-items-pr-push-ico" style="background:' + esc(sel.color) + '20">' + esc(sel.ico) + '</span>';
        inner += '<span class="dce-items-pr-push-meta">' + esc(brand) + ' · now</span></div>';
        inner += '<div class="dce-items-pr-push-title">' + esc(sel.name) + '</div>';
        inner += '<div class="dce-items-pr-push-desc">' + esc(sel.desc) + '</div></div>';
      } else if (ch === 'sms') {
        inner += '<div class="dce-items-pr-sms">';
        inner += '<div class="dce-items-pr-sms-bubble">' + esc(sel.name) + ': ' + esc(sel.desc) + '. Reply STOP to opt out.</div>';
        inner += '<div class="dce-items-pr-sms-foot">SMS · ' + esc(brand) + '</div></div>';
      } else if (ch === 'code') {
        var payload = {
          name: sel.name,
          description: sel.desc,
          type: sel.type,
          priority: sel.priority,
          cta: 'Shop Now →',
          imageUrl: 'https://cdn.store.com/...',
          surface: 'web://store.com/#hero-banner',
        };
        inner +=
          '<div class="dce-items-pr-code"><div class="dce-items-pr-code-k">// JSON payload — Code-Based Experience</div><pre class="dce-items-pr-code-pre">' +
          esc(JSON.stringify(payload, null, 2)) +
          '</pre></div>';
      } else if (ch === 'web' || ch === 'app') {
        inner +=
          '<div class="dce-items-pr-web ' +
          (ch === 'app' ? 'dce-items-pr-web--app' : '') +
          '"><img src="' +
          esc(sel.img) +
          '" alt="" class="dce-items-pr-web-img"/><div class="dce-items-pr-web-body">';
        inner += '<div class="dce-items-pr-web-title">' + esc(sel.name) + '</div>';
        inner += '<div class="dce-items-pr-web-desc">' + esc(sel.desc) + '</div>';
        inner +=
          '<div class="dce-items-pr-web-cta" style="background:' +
          esc(sel.color) +
          '">Shop Now →</div>';
        inner += '</div></div>';
      }

      var foot =
        '<div class="dce-items-pr-foot"><span class="dce-items-pr-badge" style="--b:' +
        esc(sel.color) +
        '">' +
        esc(sel.type) +
        '</span><span class="dce-items-pr-badge dce-items-pr-badge--muted">' +
        esc(sel.margin) +
        ' margin</span><span class="dce-items-pr-badge dce-items-pr-badge--muted">' +
        esc(sel.category) +
        '</span></div>';

      var wrapBg = isDark ? '#1B1B1B' : 'var(--paper-2)';
      mountPrev.innerHTML =
        '<div class="dce-items-prev card dce-items-prev--' +
        esc(ch) +
        '"><div class="dce-items-pr-surface" style="background:' +
        wrapBg +
        '">' +
        inner +
        '</div>' +
        foot +
        '</div>';
    }

    function renderAll() {
      renderChannelBar();
      renderOfferGrid();
      renderPreview();
    }

    mountBar.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-dce-items-ch]');
      if (!b || !mountBar.contains(b)) return;
      e.preventDefault();
      state.channel = b.getAttribute('data-dce-items-ch') || 'web';
      renderAll();
    });

    mountGrid.addEventListener('click', function (e) {
      var c = e.target.closest && e.target.closest('[data-dce-items-offer-id]');
      if (!c || !mountGrid.contains(c)) return;
      e.preventDefault();
      var raw = c.getAttribute('data-dce-items-offer-id');
      var id = raw == null ? NaN : parseInt(raw, 10);
      if (isNaN(id)) return;
      state.selectedId = state.selectedId === id ? null : id;
      renderAll();
    });

    window.dceVizApplyItemsIndustry = function () {
      state.selectedId = null;
      renderAll();
    };

    renderAll();
  };
})();
