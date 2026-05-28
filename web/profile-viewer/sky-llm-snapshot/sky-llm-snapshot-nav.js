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

  function wireNav() {
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
