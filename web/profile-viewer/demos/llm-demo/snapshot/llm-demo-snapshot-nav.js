/**
 * Sidebar navigation for frozen Adobe Brand Visibility snapshots (2026 grouped nav).
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'skyLlmNavSectionExpanded';

  var ROUTES = {
    Overview: 'overview.html',
    'Brand Presence': 'brand-presence.html',
    'Brand Presence (Semrush)': 'brand-presence.html',
    'Brand Claims': 'brand-claims.html',
    'Prompts Management': 'prompts-management.html',
    'Visibility Overview': 'visibility-overview.html',
    'Prompt Research': 'overview.html',
    'Market Comparison': 'overview.html',
    'URL Inspector': 'url-inspector.html',
    'Agentic Traffic': 'agentic-traffic.html',
    'Referral Traffic': 'referral-traffic.html',
    'Health Checks': 'overview.html',
    Opportunities: 'opportunities.html',
    'Opportunity Workspace': 'opportunity-workspace.html',
    'Brands Management': 'overview.html',
    Collaboration: 'overview.html',
    'Users and Permissions': 'overview.html',
    Settings: 'overview.html',
    'LLMO University': 'overview.html',
    Documentation: 'overview.html',
    Support: 'overview.html',
  };

  var PAGE_ACTIVE = {
    'overview.html': 'Overview',
    'brand-presence.html': 'Brand Presence (Semrush)',
    'brand-claims.html': 'Brand Claims',
    'prompts-management.html': 'Prompts Management',
    'visibility-overview.html': 'Visibility Overview',
    'url-inspector.html': 'URL Inspector',
    'agentic-traffic.html': 'Agentic Traffic',
    'referral-traffic.html': 'Referral Traffic',
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
      el.remove();
    });
    findNavButtons().forEach(function (btn) {
      btn.removeAttribute('aria-current');
      btn.removeAttribute('data-current');
    });
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

  function setLeafText(root, text) {
    if (!root) return;
    root.querySelectorAll('[data-rsp-slot="text"]').forEach(function (el) {
      if (el.closest('.sky-llm-nav-new-badge-wrap')) return;
      if ((el.textContent || '').trim() === 'New') return;
      if (el.childElementCount === 0) el.textContent = text;
    });
  }

  function stripNativeNewBadge(header) {
    if (!header) return;
    header.querySelectorAll('[class*="macro-static-PMFcqb"]').forEach(function (el) {
      el.remove();
    });
    header.querySelectorAll('[data-rsp-slot="text"]').forEach(function (el) {
      if ((el.textContent || '').trim() !== 'New') return;
      var wrap = el.closest('[role="presentation"]') || el.parentElement;
      if (wrap && wrap !== header) wrap.remove();
    });
  }

  function findMarketOverviewTitle(header) {
    if (!header) return null;
    var titleRow = header.querySelector('[class*="macro-static-5h50Oc"]');
    if (!titleRow) return null;
    var titleEl = null;
    titleRow.querySelectorAll('[data-rsp-slot="text"]').forEach(function (el) {
      if (el.childElementCount !== 0) return;
      if (el.closest('.sky-llm-nav-new-badge-wrap')) return;
      if ((el.textContent || '').trim() === 'New') return;
      titleEl = el;
    });
    return titleEl;
  }

  function patchRebrand() {
    if (/Adobe LLM Optimizer/i.test(document.title || '')) {
      document.title = document.title.replace(/Adobe LLM Optimizer/gi, 'Adobe Brand Visibility');
    }
    var meta = document.querySelector('meta[name="description"]');
    if (meta) {
      var content = meta.getAttribute('content') || '';
      if (/Adobe LLM Optimizer/i.test(content)) {
        meta.setAttribute('content', content.replace(/Adobe LLM Optimizer/gi, 'Adobe Brand Visibility'));
      }
    }
    document.querySelectorAll('[data-rsp-slot="text"], span, div').forEach(function (el) {
      if (el.childElementCount !== 0) return;
      if ((el.textContent || '').trim() === 'Adobe LLM Optimizer') {
        el.textContent = 'Adobe Brand Visibility';
      }
    });
  }

  function patchBrandPresenceLabel() {
    var item =
      document.getElementById('org-nav-item-brand-presence') ||
      document.getElementById('org-nav-item-brand-presence-sr');
    if (!item) return;
    var btn = item.querySelector('button[aria-label]');
    if (btn) btn.setAttribute('aria-label', 'Brand Presence (Semrush)');
    setLeafText(item, 'Brand Presence (Semrush)');
  }

  function cloneNavItem(sourceId, newId, label) {
    if (document.getElementById(newId)) return document.getElementById(newId);
    var source = document.getElementById(sourceId);
    if (!source) return null;
    var clone = source.cloneNode(true);
    clone.id = newId;
    clone.classList.remove('sky-llm-nav-active');
    var rail = clone.querySelector('.sky-llm-nav-active-rail');
    if (rail) rail.remove();
    var btn = clone.querySelector('button[aria-label]');
    if (!btn) return null;
    btn.setAttribute('aria-label', label);
    btn.removeAttribute('aria-current');
    btn.removeAttribute('data-current');
    btn.removeAttribute('data-sky-llm-nav-wired');
    setLeafText(clone, label);
    return clone;
  }

  function patchMarketOverviewHeader() {
    var section = document.getElementById('org-sidebar-section-ai-visibility');
    if (!section) return;
    var header = findSectionHeader(section);
    if (!header) return;

    stripNativeNewBadge(header);

    var titleEl = findMarketOverviewTitle(header);
    if (titleEl) titleEl.textContent = 'Market Overview';

    var iconHost =
      header.querySelector('[slot="icon"]') ||
      header.querySelector('[class*="macro-static-wXhwbd"]');
    if (iconHost && !iconHost.querySelector('.sky-llm-nav-semrush-icon')) {
      iconHost.innerHTML =
        '<span class="sky-llm-nav-semrush-icon" aria-hidden="true">' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="3.35 0 18.75 11.55" width="18" height="11" focusable="false">' +
        '<path fill="currentColor" d="M16.3321 0.00153191C19.505 0.00153331 22.1008 2.61983 22.1008 5.74789C22.1008 8.87595 19.6034 11.4122 16.4784 11.4929H8.23157L13.2173 8.84014H3.35645L12.3132 4.07857H7.3842L13.3997 0.883318C14.4788 0.32137 15.4458 0 16.3321 0V0.00153191Z"></path>' +
        '</svg></span>';
    }

    if (!titleEl) {
      header.querySelectorAll('[data-rsp-slot="text"]').forEach(function (el) {
        if (el.childElementCount === 0 && (el.textContent || '').trim() === 'Market Overview') {
          titleEl = el;
        }
      });
    }
    if (!titleEl) return;

    var badgeWrap = header.querySelector('.sky-llm-nav-new-badge-wrap');
    if (!badgeWrap) {
      badgeWrap = document.createElement('div');
      badgeWrap.className = 'sky-llm-nav-new-badge-wrap';
      var badge = document.createElement('span');
      badge.className = 'sky-llm-nav-new-badge';
      badge.setAttribute('role', 'presentation');
      badge.textContent = 'New';
      badgeWrap.appendChild(badge);
    } else {
      var existingBadge = badgeWrap.querySelector('.sky-llm-nav-new-badge');
      if (existingBadge) existingBadge.textContent = 'New';
    }

    var titleRow = titleEl.closest('[class*="macro-static-5h50Oc"]') || titleEl.parentElement;
    if (titleRow && badgeWrap.parentElement !== titleRow) {
      titleRow.classList.add('sky-llm-nav-market-title-row');
      titleRow.appendChild(badgeWrap);
    }
  }

  function ensureMarketOverviewSection() {
    if (document.getElementById('org-sidebar-section-ai-visibility')) {
      patchMarketOverviewHeader();
      return;
    }
    var brandSection = document.getElementById('org-sidebar-section-brand');
    var domainSection = document.getElementById('org-sidebar-section-domain');
    if (!brandSection || !domainSection || !brandSection.parentNode) return;

    var section = brandSection.cloneNode(true);
    section.id = 'org-sidebar-section-ai-visibility';
    section.classList.remove('sky-llm-nav-section-collapsed');

    var header = findSectionHeader(section);
    if (header) {
      delete header.dataset.skyLlmSectionWired;
      header.setAttribute('aria-expanded', 'true');
      var titleEl = findMarketOverviewTitle(header);
      if (titleEl) titleEl.textContent = 'Market Overview';
    }

    var body = findSectionBody(section);
    if (body) {
      body.style.display = '';
      body.setAttribute('data-sky-llm-collapsed', 'false');
      body.querySelectorAll('[id^="org-nav-item-"]').forEach(function (el) {
        el.remove();
      });
    }

    var listWrap = (body && body.querySelector('[class*="macro-static-KcpNYd"]')) || body;
    if (!listWrap) return;

    [
      ['org-nav-item-ai-visibility-results', 'Visibility Overview'],
      ['org-nav-item-prompt-research-results', 'Prompt Research'],
      ['org-nav-item-competitor-research', 'Market Comparison'],
    ].forEach(function (pair) {
      var item = cloneNavItem('org-nav-item-brand-claims', pair[0], pair[1]);
      if (item) listWrap.appendChild(item);
    });

    brandSection.parentNode.insertBefore(section, domainSection);
    patchMarketOverviewHeader();
  }

  function ensureHealthChecksNavItem() {
    if (document.getElementById('org-nav-item-health-checks')) return;
    var referral = document.getElementById('org-nav-item-referral-traffic');
    var item = cloneNavItem('org-nav-item-referral-traffic', 'org-nav-item-health-checks', 'Health Checks');
    if (!item || !referral || !referral.parentElement) return;
    referral.parentElement.appendChild(item);
  }

  function ensureUsersAndPermissionsNavItem() {
    if (document.getElementById('org-nav-item-users-and-permissions')) return;
    var settings = document.getElementById('org-nav-item-settings');
    var item = cloneNavItem('org-nav-item-settings', 'org-nav-item-users-and-permissions', 'Users and Permissions');
    if (!item || !settings || !settings.parentElement) return;
    settings.parentElement.insertBefore(item, settings);
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
    patchRebrand();
    patchBrandPresenceLabel();
    ensureMarketOverviewSection();
    ensureHealthChecksNavItem();
    ensureUsersAndPermissionsNavItem();
    wireSectionToggles();
    applyStoredSectionStates();
    ensureOpportunityWorkspaceNavItem();
    patchOpportunitiesBadge();
    var file = currentFile();
    if (file === 'opportunity-workspace.html') {
      var oppSection = document.getElementById('org-sidebar-section-opportunities');
      if (oppSection) setSectionExpanded(oppSection, true, false);
    }
    if (file === 'visibility-overview.html') {
      var marketSection = document.getElementById('org-sidebar-section-ai-visibility');
      if (marketSection) setSectionExpanded(marketSection, true, false);
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
