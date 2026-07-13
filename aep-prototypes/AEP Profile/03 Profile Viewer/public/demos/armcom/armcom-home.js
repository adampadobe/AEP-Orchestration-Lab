/**
 * Arm.com homepage — highlights carousel, innovation tabs, dynamic sections.
 */
(function () {
  'use strict';

  var data = window.ArmcomMockData || {};

  function el(tag, cls, html) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function renderHero() {
    var mount = document.getElementById('armcomHeroMount');
    if (!mount || !data.hero) return;
    var h = data.hero;
    mount.innerHTML =
      '<div class="armcom-hero-split">' +
      '<div class="armcom-hero-copy">' +
      '<p class="armcom-hero-kicker">' + h.kicker + '</p>' +
      '<h1>' + h.title + '</h1>' +
      '<p class="armcom-hero-lead">' + h.copy + '</p>' +
      '<a href="' + h.ctaHref + '" class="armcom-btn armcom-btn-purple" data-armcom-track="Hero learn more">' + h.cta + '</a>' +
      '</div>' +
      '<div class="armcom-hero-visual">' +
      '<img src="' + h.image + '" alt="' + h.imageAlt + '" class="armcom-hero-product" width="512" height="534" loading="eager">' +
      '</div></div>';
  }

  function renderHighlights() {
    var track = document.getElementById('armcomHighlightsTrack');
    if (!track || !Array.isArray(data.highlights)) return;
    track.innerHTML = data.highlights
      .map(function (card, i) {
        return (
          '<article class="armcom-highlight-card' + (i === 0 ? ' is-active' : '') + '" data-idx="' + i + '">' +
          '<div class="armcom-highlight-img-wrap"><img src="' + card.image + '" alt="" loading="lazy"></div>' +
          '<div class="armcom-highlight-body">' +
          '<h3>' + card.title + '</h3>' +
          '<p>' + card.copy + '</p>' +
          '<a href="' + card.href + '" class="armcom-btn armcom-btn-purple armcom-btn-sm" data-armcom-track="' + card.title + '">' + card.cta + '</a>' +
          '</div></article>'
        );
      })
      .join('');

    var cards = track.querySelectorAll('.armcom-highlight-card');
    var dots = document.getElementById('armcomHighlightsDots');
    var prev = document.getElementById('armcomHighlightsPrev');
    var next = document.getElementById('armcomHighlightsNext');
    var idx = 0;

    if (dots) {
      dots.innerHTML = data.highlights
        .map(function (_, i) {
          return '<button type="button" class="armcom-carousel-dot' + (i === 0 ? ' is-active' : '') + '" data-idx="' + i + '" aria-label="Slide ' + (i + 1) + '"></button>';
        })
        .join('');
    }

    function scrollToIdx(i) {
      idx = (i + cards.length) % cards.length;
      var card = cards[idx];
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
      }
      cards.forEach(function (c, n) {
        c.classList.toggle('is-active', n === idx);
      });
      if (dots) {
        dots.querySelectorAll('.armcom-carousel-dot').forEach(function (d, n) {
          d.classList.toggle('is-active', n === idx);
        });
      }
    }

    if (next) {
      next.addEventListener('click', function () {
        scrollToIdx(idx + 1);
      });
    }
    if (dots) {
      dots.querySelectorAll('.armcom-carousel-dot').forEach(function (d) {
        d.addEventListener('click', function () {
          scrollToIdx(parseInt(d.getAttribute('data-idx'), 10));
        });
      });
    }
    scrollToIdx(0);
  }

  function renderComputeGrid() {
    var grid = document.getElementById('armcomComputeGrid');
    if (!grid || !Array.isArray(data.computeCards)) return;
    grid.innerHTML = data.computeCards
      .map(function (card) {
        return (
          '<a href="' + card.href + '" class="armcom-compute-card" data-armcom-track="' + card.title + '">' +
          '<img src="' + card.image + '" alt="" class="armcom-compute-card-img" loading="lazy">' +
          '<span class="armcom-compute-tag">' + card.tag + '</span>' +
          '<div class="armcom-compute-card-overlay">' +
          '<h3>' + card.title + '</h3>' +
          '<p>' + card.copy + '</p>' +
          '<span class="armcom-link-chevron">Learn more</span>' +
          '</div></a>'
        );
      })
      .join('');
  }

  function renderInnovationTabs() {
    var tabsEl = document.getElementById('armcomInnovationTabs');
    var panel = document.getElementById('armcomInnovationPanel');
    if (!tabsEl || !panel || !Array.isArray(data.innovationTabs)) return;

    var tabs = data.innovationTabs;
    tabsEl.innerHTML = tabs
      .map(function (tab, i) {
        return (
          '<button type="button" class="armcom-innovation-tab' + (i === 0 ? ' is-active' : '') + '" data-tab="' + tab.id + '" data-idx="' + i + '">' +
          '<img src="' + tab.icon + '" alt="" class="armcom-innovation-tab-icon" width="48" height="48">' +
          '<span>' + tab.label + '</span></button>'
        );
      })
      .join('');

    function renderPanel(i) {
      var tab = tabs[i];
      if (!tab) return;
      panel.innerHTML =
        '<div class="armcom-innovation-panel-inner">' +
        '<div class="armcom-innovation-panel-copy">' +
        '<h3>' + tab.title + '</h3>' +
        '<p>' + tab.copy + '</p>' +
        '<ul class="armcom-innovation-bullets">' +
        tab.bullets.map(function (b) { return '<li>' + b + '</li>'; }).join('') +
        '</ul>' +
        '<a href="' + tab.href + '" class="armcom-btn armcom-btn-purple armcom-btn-sm" data-armcom-track="' + tab.label + ' tab">Learn more</a>' +
        '</div>' +
        '<div class="armcom-innovation-panel-visual">' +
        '<img src="' + tab.image + '" alt="" loading="lazy">' +
        '</div></div>';
    }

    tabsEl.querySelectorAll('.armcom-innovation-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = parseInt(btn.getAttribute('data-idx'), 10);
        tabsEl.querySelectorAll('.armcom-innovation-tab').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        renderPanel(i);
      });
    });
    renderPanel(0);
  }

  function renderPartners() {
    var row = document.getElementById('armcomPartnerRow');
    if (!row || !Array.isArray(data.partnerStories)) return;
    row.innerHTML = data.partnerStories
      .map(function (p) {
        return (
          '<article class="armcom-partner-card armcom-partner-card--' + p.theme + '">' +
          '<p class="armcom-partner-brand">' + p.brand + '</p>' +
          '<h3>' + p.title + '</h3>' +
          '<p class="armcom-partner-sub">' + p.subtitle + '</p>' +
          '<p class="armcom-partner-copy">' + p.copy + '</p>' +
          '<button type="button" class="armcom-btn armcom-btn-purple armcom-btn-sm">' + p.cta + '</button>' +
          '</article>'
        );
      })
      .join('');
  }

  function renderLeadership() {
    var row = document.getElementById('armcomLeadershipRow');
    if (!row || !Array.isArray(data.leadership)) return;
    row.innerHTML = data.leadership
      .map(function (item) {
        return (
          '<article class="armcom-leadership-card">' +
          '<img src="' + item.image + '" alt="" loading="lazy">' +
          '<p class="armcom-leadership-kicker">' + item.kicker + '</p>' +
          '<h3>' + item.title + '</h3>' +
          '<p>' + item.copy + '</p>' +
          '<a href="#" class="armcom-link-chevron">' + item.cta + '</a>' +
          '</article>'
        );
      })
      .join('');
  }

  function init() {
    renderHero();
    renderHighlights();
    renderComputeGrid();
    renderInnovationTabs();
    renderPartners();
    renderLeadership();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
