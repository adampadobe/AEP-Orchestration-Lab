/**
 * Same-origin navigation for frozen LLM Optimizer sidebar (Overview, Brand Presence, …).
 */
(function () {
  'use strict';

  var ROUTES = {
    Overview: 'overview.html',
    'Brand Presence': 'brand-presence.html',
    'Agentic Traffic': 'overview.html',
    'Referral Traffic': 'overview.html',
    'URL Inspector': 'overview.html',
    Opportunities: 'overview.html',
    Collaboration: 'overview.html',
    'Customer Configuration': 'overview.html',
    Settings: 'overview.html',
    'LLMO University': 'overview.html',
  };

  var ACTIVE_STYLE = {
    backgroundColor: 'rgb(50, 50, 50)',
    color: 'rgb(255, 255, 255)',
    borderColor: 'transparent',
    '--iconPrimary': 'rgb(255, 255, 255)',
  };

  function currentFile() {
    var parts = (location.pathname || '').split('/');
    return parts[parts.length - 1] || 'overview.html';
  }

  function findNavLinks() {
    var seen = new Set();
    var links = [];
    document.querySelectorAll('[role="link"]').forEach(function (el) {
      var label = (el.getAttribute('aria-label') || '').trim();
      if (!label || !ROUTES[label] || seen.has(label)) return;
      seen.add(label);
      links.push({ el: el, label: label });
    });
    return links;
  }

  function applyActiveState(link, active) {
    if (active) {
      link.setAttribute('aria-current', 'page');
      link.setAttribute('data-current', 'true');
      Object.keys(ACTIVE_STYLE).forEach(function (key) {
        link.style.setProperty(key, ACTIVE_STYLE[key]);
      });
    } else {
      link.removeAttribute('aria-current');
      link.removeAttribute('data-current');
      link.style.removeProperty('background-color');
      link.style.removeProperty('color');
      link.style.removeProperty('border-color');
      link.style.removeProperty('--iconPrimary');
    }
  }

  function ensureNavVisible() {
    document.querySelectorAll('[role="link"][aria-label]').forEach(function (el) {
      var label = (el.getAttribute('aria-label') || '').trim();
      if (!ROUTES[label]) return;
      el.style.setProperty('opacity', '1', 'important');
      el.style.setProperty('visibility', 'visible', 'important');
      el.style.setProperty('pointer-events', 'auto', 'important');
      el.style.setProperty('filter', 'none', 'important');
      el.removeAttribute('hidden');
      if (!el.getAttribute('aria-current') && el.getAttribute('data-current') !== 'true') {
        el.style.setProperty('color', 'rgb(50, 50, 50)', 'important');
        el.style.setProperty('--iconPrimary', 'rgb(50, 50, 50)', 'important');
        el.style.setProperty('background-color', 'rgb(255, 255, 255)', 'important');
        el.style.setProperty('border', '1px solid rgb(220, 220, 220)', 'important');
      }
      var node = el.parentElement;
      for (var i = 0; i < 12 && node; i++) {
        node.style.setProperty('opacity', '1', 'important');
        node.style.setProperty('visibility', 'visible', 'important');
        node.style.setProperty('max-height', 'none', 'important');
        node.style.setProperty('overflow', 'visible', 'important');
        if (node.getAttribute && node.getAttribute('hidden') !== null) node.removeAttribute('hidden');
        node = node.parentElement;
      }
    });
  }

  function wireNav() {
    ensureNavVisible();
    var file = currentFile();
    findNavLinks().forEach(function (item) {
      var target = ROUTES[item.label];
      var isActive = target === file;
      applyActiveState(item.el, isActive);
      if (item.el.dataset.skyLlmNavWired === '1') return;
      item.el.dataset.skyLlmNavWired = '1';
      item.el.addEventListener(
        'click',
        function (e) {
          if (target === file) return;
          e.preventDefault();
          e.stopPropagation();
          location.href = target;
        },
        true,
      );
    });
  }

  function run() {
    try {
      wireNav();
    } catch (err) {
      /* frozen snapshot */
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
  window.setTimeout(run, 400);
  window.setTimeout(run, 1200);
})();
