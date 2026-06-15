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
    'Opportunity Workspace': 'opportunity-workspace.html',
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
    'opportunity-workspace.html': 'Opportunity Workspace',
  };

  function currentFile() {
    var parts = (location.pathname || '').split('/');
    var file = parts[parts.length - 1] || 'overview.html';
    return file.split('?')[0];
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

  function findSectionHeader(section) {
    return section.querySelector('[role="button"][aria-expanded]');
  }

  function findSectionBody(section) {
    return (
      section.querySelector('[class*="macro-static-4d9rBe"]') ||
      section.querySelector('[class*="macro-static-KcpNYd"]')
    );
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
    header.querySelectorAll('svg').forEach(function (svg) {
      var style = svg.getAttribute('style') || '';
      if (style.indexOf('rotate') !== -1) {
        svg.style.transform = expanded ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    });
  }

  function setSectionExpanded(section, expanded, persist) {
    if (!section) return;
    var header = findSectionHeader(section);
    var body = findSectionBody(section);
    if (header) header.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    if (body) {
      body.style.display = expanded ? '' : 'none';
      body.setAttribute('data-sky-llm-collapsed', expanded ? 'false' : 'true');
    }
    updateChevron(header, expanded);
    section.classList.toggle('sky-llm-nav-section-collapsed', !expanded);
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
    document.querySelectorAll('.sky-llm-nav-active-rail').forEach(function (el) {
      el.hidden = true;
    });
    findNavButtons().forEach(function (btn) {
      btn.removeAttribute('aria-current');
      btn.removeAttribute('data-current');
    });
    document.querySelectorAll('nav .sky-llm-nav-rail-native').forEach(function (el) {
      el.style.display = 'none';
    });
  }

  function ensureActiveRail(wrap) {
    if (!wrap) return;
    var rail = wrap.querySelector('.sky-llm-nav-active-rail');
    if (!rail) {
      rail = document.createElement('span');
      rail.className = 'sky-llm-nav-active-rail';
      rail.setAttribute('aria-hidden', 'true');
      wrap.insertBefore(rail, wrap.firstChild);
    }
    rail.hidden = false;
  }

  function applyActive(label) {
    clearActive();
    findNavButtons().forEach(function (btn) {
      var btnLabel = (btn.getAttribute('aria-label') || '').trim();
      if (btnLabel !== label) return;
      btn.setAttribute('aria-current', 'page');
      btn.setAttribute('data-current', 'true');
      var wrap = findNavItemWrapper(btn);
      if (wrap) {
        wrap.classList.add('sky-llm-nav-active');
        ensureActiveRail(wrap);
      }
    });
  }

  function wireSectionToggles() {
    document.querySelectorAll('[id^="org-sidebar-section-"]').forEach(function (section) {
      var header = findSectionHeader(section);
      if (!header || header.dataset.skyLlmSectionWired === '1') return;
      header.dataset.skyLlmSectionWired = '1';
      header.addEventListener(
        'click',
        function (e) {
          if (e.target.closest('button[aria-label]')) return;
          var expanded = header.getAttribute('aria-expanded') === 'true';
          setSectionExpanded(section, !expanded, true);
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
  }

  function ensureOpportunityWorkspaceNavItem() {
    if (document.getElementById('org-nav-item-opportunity-workspace')) return;
    var oppItem = document.getElementById('org-nav-item-opportunities');
    if (!oppItem || !oppItem.parentElement) return;

    var clone = oppItem.cloneNode(true);
    clone.id = 'org-nav-item-opportunity-workspace';
    var btn = clone.querySelector('button[aria-label]');
    if (!btn) return;
    btn.setAttribute('aria-label', 'Opportunity Workspace');
    btn.removeAttribute('aria-current');
    btn.removeAttribute('data-current');

    clone.querySelectorAll('[data-rsp-slot="text"]').forEach(function (el) {
      if (el.childElementCount > 0) return;
      var t = (el.textContent || '').trim();
      if (/^\d+$/.test(t)) {
        el.parentElement && el.parentElement.remove();
        return;
      }
      el.textContent = 'Opportunity Workspace';
    });

    oppItem.parentElement.appendChild(clone);
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
    applyStoredSectionStates();
    ensureOpportunityWorkspaceNavItem();
    patchOpportunitiesBadge();
    var file = currentFile();
    if (file === 'opportunity-workspace.html') {
      var oppSection = document.getElementById('org-sidebar-section-opportunities');
      if (oppSection) setSectionExpanded(oppSection, true, false);
    }
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
          var search = location.search || '';
          if (!/(?:\?|&)llmDemo=1(?:&|$)/.test(search)) search = '';
          location.href = target + search;
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
  window.setTimeout(run, 500);
  window.setTimeout(run, 2000);
})();
