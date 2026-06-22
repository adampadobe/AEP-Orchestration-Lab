/**
 * Normalize page headers to the Prompts Management text-only layout (no decorative icon).
 */
(function (global) {
  'use strict';

  function isExcludedPage() {
    var path = global.location.pathname || '';
    return (
      /prompts-management\.html/i.test(path) || /intent-coverage-overlay\.html/i.test(path)
    );
  }

  function isDecorativePageIcon(el) {
    if (!el || el.nodeType !== 1 || el.tagName !== 'DIV') return false;
    if (el.querySelector('h1, #dashboard-layout-heading, button, [role="button"]')) return false;
    var svg = el.querySelector(':scope > svg');
    if (!svg) return false;
    var inner = svg.innerHTML || '';
    var vb = svg.getAttribute('viewBox') || '';
    if (/radialgradient|FFECCF|lineargradient|clippath id="/i.test(inner)) return true;
    if (/96/.test(vb)) return true;
    return false;
  }

  function hideDecorativeIcons(scope) {
    if (!scope) return;
    scope.querySelectorAll('div').forEach(function (div) {
      if (div.classList.contains('llm-page-header-icon-hidden')) return;
      if (isDecorativePageIcon(div)) div.classList.add('llm-page-header-icon-hidden');
    });
  }

  function findHeading() {
    var byId = document.getElementById('dashboard-layout-heading');
    if (byId) return byId;
    var h1s = document.querySelectorAll('h1');
    for (var i = 0; i < h1s.length; i++) {
      var t = (h1s[i].textContent || '').trim();
      if (t === 'Overview') return h1s[i];
    }
    return null;
  }

  function findOverviewRow(heading) {
    var el = heading.parentElement;
    while (el && el !== document.body) {
      var childDivs = Array.prototype.filter.call(el.children, function (c) {
        return c.tagName === 'DIV';
      });
      if (childDivs.length >= 2) {
        var hasIcon = childDivs.some(isDecorativePageIcon);
        var hasTitle = childDivs.some(function (d) {
          return d.contains(heading);
        });
        if (hasIcon && hasTitle) return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function findWalnutHeaderBand(heading) {
    var in8 = heading.closest('[class*="macro-static-8MDf3"]');
    if (in8) {
      return (
        in8.closest('[class*="macro-static-GCYPAb"]') ||
        in8.closest('[class*="macro-static-8MDf3"]') ||
        in8
      );
    }
    var content = heading.closest('[id="dashboard-layout-content"]');
    if (content) {
      var gc = content.querySelector('[class*="macro-static-GCYPAb"]');
      if (gc) return gc;
    }
    return heading.closest('[class*="macro-static-hEwxZc"]') || heading.parentElement;
  }

  function applyLayoutClasses(band, heading) {
    if (!band) return;

    band.classList.add('llm-page-header-band');

    var uz = band.querySelector('[class*="macro-static-UZueWc"]');
    if (uz) uz.classList.add('llm-page-header-root');

    var h7 = band.querySelector('[class*="macro-static-h7Bmqc"]');
    if (h7) h7.classList.add('llm-page-header-root');

    var s6 = band.querySelector('[class*="macro-static-6pVFYd"]');
    if (s6) s6.classList.add('llm-page-header-root');

    if (heading && (heading.textContent || '').trim() === 'Overview') {
      var row = findOverviewRow(heading);
      if (row) row.classList.add('llm-page-header-overview-row', 'llm-page-header-band');
      else if (heading.parentElement) {
        heading.parentElement.classList.add('llm-page-header-root', 'llm-page-header-band');
      }
    }
  }

  function normalizePageHeader() {
    if (isExcludedPage()) return;

    var heading = findHeading();
    if (!heading) return;

    var band = findWalnutHeaderBand(heading) || findOverviewRow(heading) || heading.parentElement;
    hideDecorativeIcons(band || document);
    applyLayoutClasses(band, heading);
  }

  function init() {
    normalizePageHeader();
    global.setTimeout(normalizePageHeader, 120);
    global.setTimeout(normalizePageHeader, 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.LlmPageHeader = { normalizePageHeader: normalizePageHeader };
})(typeof window !== 'undefined' ? window : globalThis);
