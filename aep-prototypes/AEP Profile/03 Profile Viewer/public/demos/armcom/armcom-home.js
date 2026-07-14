/**
 * Arm.com homepage — highlights carousel, innovation tabs, dynamic sections.
 */
(function () {
  'use strict';

  var data = window.ArmcomMockData || {};

  function tabIconSvg(name) {
    if (name === 'leaf') {
      return '<svg class="armcom-innovation-tab-svg" width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 22c-4-3-8-8-8-13a8 8 0 0116 0c0 5-4 10-8 13z" stroke="currentColor" stroke-width="1.5"/><path d="M12 22V9M12 9C12 9 8 7 6 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    }
    if (name === 'shield') {
      return '<svg class="armcom-innovation-tab-svg" width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" stroke="currentColor" stroke-width="1.5"/></svg>';
    }
    return '<svg class="armcom-innovation-tab-svg" width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 10-14h-7l0-6z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
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
      '<a href="' + h.ctaHref + '" class="armcom-btn armcom-btn-purple" data-armcom-track="Hero read more">' + h.cta + '</a>' +
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
          '<div class="armcom-highlight-img-wrap"><img src="' + card.image + '" alt="' + (card.imageAlt || card.title) + '" loading="' + (i === 0 ? 'eager' : 'lazy') + '" decoding="async"></div>' +
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
      if (card && track) {
        var targetLeft = card.offsetLeft - track.offsetLeft;
        track.scrollTo({ left: targetLeft, behavior: 'smooth' });
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
  }

  function renderStats() {
    var row = document.getElementById('armcomStatsRow');
    if (!row || !Array.isArray(data.stats)) return;
    row.innerHTML = data.stats
      .map(function (stat) {
        return (
          '<div class="armcom-stat-block">' +
          '<p class="armcom-stat-value">' + stat.value + '</p>' +
          '<p class="armcom-stat-label">' + stat.label + '</p>' +
          '</div>'
        );
      })
      .join('');
    var section = document.querySelector('.armcom-section--stats');
    if (section && data.statsBg) {
      section.style.setProperty('--armcom-stats-bg', 'url("' + data.statsBg + '")');
    }
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
          tabIconSvg(tab.icon) +
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

  function renderPersonalAi() {
    var section = document.getElementById('armcomPersonalAi');
    if (!section || !data.personalAi) return;
    var p = data.personalAi;
    section.innerHTML =
      '<div class="armcom-section-inner">' +
      '<h2 class="armcom-section-title armcom-section-title--center">' + p.title + '</h2>' +
      '<p class="armcom-section-lead armcom-section-lead--center armcom-personal-ai-sub">' + p.subtitle + '</p>' +
      '<p class="armcom-personal-ai-copy">' + p.copy + '</p>' +
      '<div class="armcom-personal-ai-carousel">' +
      '<div class="armcom-personal-ai-track" id="armcomPersonalAiTrack">' +
      p.slides.map(function (s) {
        return '<div class="armcom-personal-ai-slide"><img src="' + s.image + '" alt="' + s.alt + '" loading="lazy"></div>';
      }).join('') +
      '</div></div>' +
      '<div class="armcom-personal-ai-footer">' +
      '<a href="' + p.ctaHref + '" class="armcom-btn armcom-btn-blue" data-armcom-track="Personal AI learn more">' + p.cta + '</a>' +
      '<div class="armcom-personal-ai-progress" aria-hidden="true"><span class="armcom-personal-ai-progress-bar"></span></div>' +
      '</div></div>';

    var track = document.getElementById('armcomPersonalAiTrack');
    var bar = section.querySelector('.armcom-personal-ai-progress-bar');
    if (track && bar) {
      track.addEventListener('scroll', function () {
        var max = track.scrollWidth - track.clientWidth;
        var pct = max > 0 ? (track.scrollLeft / max) * 100 : 0;
        bar.style.width = Math.max(20, pct) + '%';
      });
    }
  }

  function renderPartners() {
    var row = document.getElementById('armcomPartnerRow');
    if (!row || !Array.isArray(data.partnerStories)) return;
    row.innerHTML = data.partnerStories
      .map(function (p) {
        return (
          '<article class="armcom-partner-card armcom-partner-card--' + p.theme + '">' +
          '<div class="armcom-partner-card-bg" style="background-image:url(\'' + p.image + '\')"></div>' +
          '<div class="armcom-partner-card-content">' +
          '<p class="armcom-partner-label">' + p.label + '</p>' +
          '<p class="armcom-partner-brand">' + p.brand + '</p>' +
          '<h3>' + p.title + '</h3>' +
          '<p class="armcom-partner-sub">' + p.subtitle + '</p>' +
          '<p class="armcom-partner-copy">' + p.copy + '</p>' +
          '<button type="button" class="armcom-btn armcom-btn-purple armcom-btn-sm">' + p.cta + '</button>' +
          '</div></article>'
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
          '<a href="' + (item.href || '#') + '" class="armcom-link-chevron armcom-link-blue" data-armcom-track="' + item.title + '">' + item.cta + '</a>' +
          '</article>'
        );
      })
      .join('');
  }

  function init() {
    renderHero();
    renderHighlights();
    renderStats();
    renderComputeGrid();
    renderInnovationTabs();
    renderPersonalAi();
    renderPartners();
    renderLeadership();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
