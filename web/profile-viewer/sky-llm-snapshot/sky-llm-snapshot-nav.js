/**
 * Sidebar navigation for frozen LLM Optimizer snapshots (2026 grouped nav).
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'skyLlmNavSectionExpanded';

  var ROUTES = {
    Overview: 'overview.html',
    'Brand Presence': 'brand-presence.html',
    'Brand Claims': 'brand-claims.html',
    'Prompts Management': 'prompts-management.html',
    'URL Inspector': 'url-inspector.html',
    'Agentic Traffic': 'agentic-traffic.html',
    'Referral Traffic': 'overview.html',
    Opportunities: 'opportunities.html',
    'Brands Management': 'overview.html',
    Collaboration: 'overview.html',
    Settings: 'overview.html',
    'LLMO University': 'overview.html',
    Documentation: 'overview.html',
    Support: 'overview.html',
  };

  var PAGE_ACTIVE = {
    'overview.html': 'Overview',
    'brand-presence.html': 'Brand Presence',
    'brand-claims.html': 'Brand Claims',
    'prompts-management.html': 'Prompts Management',
    'url-inspector.html': 'URL Inspector',
    'agentic-traffic.html': 'Agentic Traffic',
    'opportunities.html': 'Opportunities',
  };

  function currentFile() {
    var parts = (location.pathname || '').split('/');
    return parts[parts.length - 1] || 'overview.html';
  }

  function findNavRoot() {
    return (
      document.querySelector('nav[style*="flex-direction: column"]') ||
      document.querySelector('nav[class*="macro-static"]') ||
      document.querySelector('nav')
    );
  }

  function findNavButtons() {
    var nav = findNavRoot();
    if (!nav) return [];
    return Array.from(nav.querySelectorAll('button[type="button"][aria-label]')).filter(function (btn) {
      return ROUTES[(btn.getAttribute('aria-label') || '').trim()];
    });
  }

  function findNavItemWrapper(btn) {
    return btn.closest('[id^="org-nav-item-"]') || btn.parentElement;
  }

  function sectionKey(section) {
    return section.getAttribute('id') || '';
  }

  function findSectionBody(section) {
    return section.querySelector('.macro-static-4d9rBe, .macro-static-KcpNYd');
  }

  function readSectionStates() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function writeSectionState(key, expanded) {
    if (!key) return;
    var states = readSectionStates();
    states[key] = expanded;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
    } catch (e) {
      /* ignore */
    }
  }

  function updateChevron(header, expanded) {
    if (!header) return;
    var chevron = header.querySelector('svg[style*="rotate"]');
    if (chevron) {
      chevron.style.transform = expanded ? 'rotate(180deg)' : 'rotate(0deg)';
    }
  }

  function setSectionExpanded(section, expanded, persist) {
    if (!section) return;
    var header = section.querySelector('[role="button"][aria-expanded]');
    var body = findSectionBody(section);
    if (header) header.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    if (body) body.style.display = expanded ? '' : 'none';
    updateChevron(header, expanded);
    if (persist) writeSectionState(sectionKey(section), expanded);
  }

  function applyStoredSectionStates() {
    var states = readSectionStates();
    var hasStored = Object.keys(states).length > 0;
    document.querySelectorAll('[id^="org-sidebar-section-"]').forEach(function (section) {
      var key = sectionKey(section);
      if (hasStored && Object.prototype.hasOwnProperty.call(states, key)) {
        setSectionExpanded(section, !!states[key], false);
      } else {
        setSectionExpanded(section, true, false);
      }
    });
  }

  function clearActive() {
    document.querySelectorAll('[id^="org-nav-item-"].sky-llm-nav-active').forEach(function (el) {
      el.classList.remove('sky-llm-nav-active');
    });
    findNavButtons().forEach(function (btn) {
      btn.removeAttribute('aria-current');
      btn.removeAttribute('data-current');
    });
    document.querySelectorAll('nav .sky-llm-nav-rail-native').forEach(function (el) {
      el.style.display = 'none';
    });
  }

  function showNativeRail(btn) {
    var wrap = findNavItemWrapper(btn);
    if (!wrap) return;
    var rail = wrap.querySelector('.sky-llm-nav-rail-native');
    if (!rail) {
      var native = wrap.querySelector('div[class*="macro-dynamic-kn9iqo"], div.J1DOfn11, div.HkNNfn11');
      if (native) {
        native.classList.add('sky-llm-nav-rail-native');
        rail = native;
      }
    }
    if (rail) rail.style.display = '';
  }

  function applyActive(label) {
    clearActive();
    findNavButtons().forEach(function (btn) {
      var btnLabel = (btn.getAttribute('aria-label') || '').trim();
      if (btnLabel !== label) return;
      btn.setAttribute('aria-current', 'page');
      btn.setAttribute('data-current', 'true');
      var wrap = findNavItemWrapper(btn);
      if (wrap) wrap.classList.add('sky-llm-nav-active');
      showNativeRail(btn);
      var section = btn.closest('[id^="org-sidebar-section-"]');
      if (section) {
        var sectionRail = section.querySelector('.J1DOfn11, .HkNNfn11');
        if (sectionRail) {
          sectionRail.classList.add('sky-llm-nav-rail-native');
          sectionRail.style.display = '';
        }
      }
    });
  }

  function wireSectionToggles() {
    document.querySelectorAll('[id^="org-sidebar-section-"] [role="button"][aria-expanded]').forEach(function (header) {
      if (header.dataset.skyLlmSectionWired === '1') return;
      header.dataset.skyLlmSectionWired = '1';
      header.addEventListener(
        'click',
        function (e) {
          var section = header.closest('[id^="org-sidebar-section-"]');
          if (!section) return;
          var expanded = header.getAttribute('aria-expanded') === 'true';
          var next = !expanded;
          setSectionExpanded(section, next, true);
          e.preventDefault();
          e.stopPropagation();
        },
        true,
      );
    });
  }

  function ensureNavVisible() {
    var nav = findNavRoot();
    if (!nav) return;
    nav.style.setProperty('display', 'flex', 'important');
    nav.style.setProperty('flex-direction', 'column', 'important');
    nav.style.setProperty('gap', '8px', 'important');
    nav.style.setProperty('opacity', '1', 'important');
    nav.style.setProperty('visibility', 'visible', 'important');
    nav.style.setProperty('pointer-events', 'auto', 'important');

    findNavButtons().forEach(function (btn) {
      btn.style.setProperty('opacity', '1', 'important');
      btn.style.setProperty('visibility', 'visible', 'important');
      btn.style.setProperty('color', 'rgb(41, 41, 41)', 'important');
      btn.style.setProperty('pointer-events', 'auto', 'important');
    });

    document.querySelectorAll('[id^="org-sidebar-section-"]').forEach(function (section) {
      section.style.setProperty('opacity', '1', 'important');
      section.style.setProperty('visibility', 'visible', 'important');
    });

    applyStoredSectionStates();
  }

  function patchOpportunitiesBadge() {
    var catalog = window.SkyLlmOpportunitiesCatalog;
    if (!catalog) return;
    var count = catalog.OPPORTUNITIES.length;
    findNavButtons().forEach(function (btn) {
      if ((btn.getAttribute('aria-label') || '').trim() !== 'Opportunities') return;
      var wrap = findNavItemWrapper(btn);
      if (!wrap) return;
      Array.from(wrap.querySelectorAll('[data-rsp-slot="text"], span')).forEach(function (el) {
        if (el.childElementCount === 0 && /^\d+$/.test(el.textContent.trim())) {
          el.textContent = String(count);
        }
      });
    });
  }

  function wireNav() {
    ensureNavVisible();
    wireSectionToggles();
    patchOpportunitiesBadge();
    var file = currentFile();
    var activeLabel = PAGE_ACTIVE[file] || 'Overview';
    applyActive(activeLabel);

    findNavButtons().forEach(function (btn) {
      var label = (btn.getAttribute('aria-label') || '').trim();
      var target = ROUTES[label];
      if (!target || btn.dataset.skyLlmNavWired === '1') return;
      btn.dataset.skyLlmNavWired = '1';
      btn.addEventListener(
        'click',
        function (e) {
          if (target === file && label === activeLabel) return;
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
