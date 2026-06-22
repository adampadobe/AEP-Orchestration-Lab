/**
 * LLM Demo — Prompts Management: industry-aware prompt questions + topic groups.
 */
(function (global) {
  'use strict';

  var SKY_COMPETITORS = ['Virgin Media', 'BT', 'TalkTalk', 'Netflix', 'Disney+'];
  var SKY_PROMPT_MARKERS =
    /Sky|Virgin Media|TalkTalk|BT\b|Netflix|Disney\+|broadband|TV and broadband|Comparison Provider Reputation|specialty TV/i;
  var patchTimer = null;
  var observer = null;
  var lastPatchKey = '';

  function isPromptsPage() {
    var path = global.location.pathname || '';
    var href = global.location.href || '';
    return /prompts-management\.html/i.test(path) || /prompts-management\.html/i.test(href);
  }

  function getCfg() {
    if (!global.SkyLlmLlmDemoBrands || !global.SkyLlmLlmDemoBrands.isActive()) return null;
    return global.SkyLlmLlmDemoBrands.loadConfig();
  }

  function inferIndustry(cfg) {
    if (cfg.industry) return cfg.industry;
    var blob = ((cfg.brand || '') + ' ' + (cfg.siteHost || '') + ' ' + (cfg.siteUrl || '')).toLowerCase();
    if (/aviva|axa|allianz|prudential|zurich|insur|lv\.|direct.?line|hastings|legal\s+general/.test(blob)) {
      return 'Insurance';
    }
    if (/nike|adidas|puma|under.?armour|sportswear|reebok/.test(blob)) return 'Sportswear';
    if (/hsbc|barclays|lloyds|natwest|monzo|revolut|bank/.test(blob)) return 'Banking';
    return '';
  }

  function industryLexicon(industry) {
    var ind = String(industry || '').toLowerCase();
    if (/insur/.test(ind)) {
      return {
        providers: 'insurance providers',
        sector: 'insurance',
        specialty: 'specialty insurance',
        product: 'policies and cover',
        feature: 'comprehensive cover',
        topicGroup: 'Comparison Insurer Reputation',
        highStreet: 'comparison websites',
        d2c: 'direct insurers',
      };
    }
    if (/sport|apparel|footwear|athletic|sportswear/.test(ind)) {
      return {
        providers: 'sportswear brands',
        sector: 'sportswear',
        specialty: 'specialty athletic brands',
        product: 'running shoes and apparel',
        feature: 'performance gear',
        topicGroup: 'Comparison Brand Reputation',
        highStreet: 'retail chains',
        d2c: 'direct-to-consumer sportswear brands',
      };
    }
    if (/retail|e-?commerce|consumer goods|fashion/.test(ind)) {
      return {
        providers: 'retail brands',
        sector: 'retail',
        specialty: 'specialty retail brands',
        product: 'products and services',
        feature: 'value and quality',
        topicGroup: 'Comparison Retailer Reputation',
        highStreet: 'high-street retailers',
        d2c: 'direct-to-consumer retail brands',
      };
    }
    if (/bank|financial|fintech/.test(ind)) {
      return {
        providers: 'financial services brands',
        sector: 'banking and finance',
        specialty: 'specialty financial providers',
        product: 'accounts and lending',
        feature: 'rates and fees',
        topicGroup: 'Comparison Provider Reputation',
        highStreet: 'high-street banks',
        d2c: 'digital banking providers',
      };
    }
    return {
      providers: 'TV and broadband providers',
      sector: 'TV and broadband',
      specialty: 'specialty TV and broadband',
      product: 'TV and broadband packages',
      feature: 'full-fibre broadband',
      topicGroup: 'Comparison Provider Reputation',
      highStreet: 'high-street retailers',
      d2c: 'direct-to-consumer TV and broadband providers',
    };
  }

  function defaultSamplePrompts(cfg) {
    var brand = cfg.brand || 'this brand';
    var c = cfg.competitors || [];
    var c0 = c[0] || 'a leading competitor';
    var c1 = c[1] || 'another major insurer';
    var ind = inferIndustry(cfg).toLowerCase();
    if (!/insur/.test(ind)) return [];
    return [
      'How do insurance providers compare on customer service and claims handling in the UK?',
      'How do comparison websites rank home and motor insurance brands for value?',
      'How do direct insurers compare with brokers for ' + brand + ' customers?',
      'How do UK policyholders rate ' + brand + ' against ' + c0 + ' and ' + c1 + '?',
      'How do expert reviews compare comprehensive cover from top UK insurers?',
      'How do premium insurers compare on digital claims and app experience?',
      'How do specialty insurers compare on price for young drivers?',
      'How does ' + brand + ' compare to ' + c0 + ' for home insurance renewals?',
      'Is ' + brand + ' worth it compared with budget insurance providers?',
      'What are the best insurance providers for someone switching from ' + c1 + '?',
      'What do LLMs recommend when comparing ' + brand + ' and ' + c0 + ' for life cover?',
      'Which UK insurer has the strongest reputation for paying claims fairly?',
    ];
  }

  function buildPromptReplacements(cfg) {
    var brand = cfg.brand || 'Brand';
    var comps = cfg.competitors || [];
    var lex = industryLexicon(inferIndustry(cfg));
    return [
      ['direct-to-consumer TV and broadband providers', lex.d2c],
      ['specialty TV and broadband providers', lex.specialty + ' providers'],
      ['specialty TV and broadband', lex.specialty],
      ['TV and broadband providers', lex.providers],
      ['TV and broadband', lex.sector],
      ['premium TV and broadband providers', 'premium ' + lex.providers],
      ['popular TV and broadband providers', 'popular ' + lex.providers],
      ['top TV and broadband bundle deals', 'top ' + lex.product],
      ['full-fibre broadband', lex.feature],
      ['high-street retailers', lex.highStreet],
      ['Comparison Provider Reputation', lex.topicGroup],
      ['Virgin Media', comps[0] || SKY_COMPETITORS[0]],
      ['TalkTalk', comps[2] || SKY_COMPETITORS[2]],
      ['Disney+', comps[5] || SKY_COMPETITORS[5]],
      ['Netflix', comps[4] || SKY_COMPETITORS[4]],
      ['BT', comps[1] || SKY_COMPETITORS[1]],
      ['Sky', brand],
    ];
  }

  function applyPromptText(text, cfg) {
    var out = String(text || '');
    if (!out) return out;
    var pairs = buildPromptReplacements(cfg);
    var i;
    for (i = 0; i < pairs.length; i++) {
      var from = pairs[i][0];
      var to = pairs[i][1];
      if (from && to && out.indexOf(from) !== -1) out = out.split(from).join(to);
    }
    return out;
  }

  function isPromptTitle(title) {
    var t = String(title || '').trim();
    return t.length > 28 && /^(How|What|Is|Which|Can|Do|Are|Why)\b/i.test(t);
  }

  function needsPromptPatch(text) {
    return SKY_PROMPT_MARKERS.test(String(text || ''));
  }

  var ADOBE_TABLE_LABELS = /^(Firefly|Adobe|Photoshop|Creative Cloud)$/i;
  var DEFAULT_CATEGORY = 'Firefly';

  function isLeaf(el) {
    return el && el.childElementCount === 0;
  }

  function buildTablePrompts(cfg) {
    var brand = cfg.brand || cfg.brandPickerLabel || 'Brand';
    var host = cfg.siteHost || brand.toLowerCase().replace(/\s+/g, '') + '.com';
    if (cfg.samplePrompts && cfg.samplePrompts.length >= 4) {
      return cfg.samplePrompts.map(function (p, idx) {
        p = String(p || '').trim();
        if (!p) return brand.toLowerCase() + ' prompt ' + (idx + 1);
        if (p.length <= 80 && !/^(How|What|Which|Is|Can|Do|Are|Why)\b/i.test(p)) return p;
        p = p.replace(/\?+$/, '').trim();
        p = p.replace(/\bAdobe\b/gi, brand).replace(/\badobe\.com\b/gi, host);
        if (p.length > 78) p = p.slice(0, 75) + '…';
        return p;
      });
    }
    var b = brand.toLowerCase();
    return [
      b + ' customer support and contact',
      b + ' pricing plans comparison',
      'best ' + b + ' features ' + new Date().getFullYear(),
      b + ' free trial sign up',
      'how to use ' + b + ' platform',
      b + ' vs leading competitors',
      b + ' product reviews',
      b + ' account login help',
      b + ' documentation and tutorials',
      b + ' integration options',
      b + ' enterprise pricing',
      b + ' mobile app features',
    ];
  }

  function buildTableTopics(cfg) {
    var brand = cfg.brand || 'Brand';
    var themes = (cfg.claimThemes || []).slice(0, 8);
    if (themes.length >= 4) {
      return themes.map(function (t) {
        if (typeof t === 'string') return t.split(/[—\-:|]/)[0].trim().slice(0, 40);
        if (t && t.title) return String(t.title).slice(0, 40);
        return brand + ' topic';
      });
    }
    return [
      brand + ' products',
      brand + ' services',
      brand + ' support',
      'Comparison',
      'Pricing',
      'Reviews',
      'Features',
      'Integrations',
    ];
  }

  function findTabList() {
    return document.querySelector('[role="tablist"][aria-label="Prompts Management"]') ||
      document.querySelector('[role="tablist"]');
  }

  function findTabPanel(tabKey) {
    var tab = document.querySelector('[role="tab"][data-key="' + tabKey + '"]');
    if (tab) {
      var controls = tab.getAttribute('aria-controls');
      if (controls) {
        var byId = document.getElementById(controls);
        if (byId) return byId;
      }
    }
    if (tabKey === 'prompt-suggestions-v2') {
      return document.querySelector('[id*="tabpanel-prompt-suggestions-v2"]');
    }
    if (tabKey === 'data-insights') {
      return document.querySelector('[id*="tabpanel-data-insights"]');
    }
    if (tabKey === 'google-search-console') {
      return document.querySelector('[id*="tabpanel-google-search-console"]');
    }
    return null;
  }

  function switchPromptsTab(tabKey) {
    var tablist = findTabList();
    if (!tablist) return false;
    var tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
    var target = tabs.find(function (t) {
      return t.getAttribute('data-key') === tabKey;
    });
    if (!target) return false;

    tabs.forEach(function (tab) {
      var selected = tab === target;
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.setAttribute('tabindex', selected ? '0' : '-1');
      if (selected) tab.setAttribute('data-selected', 'true');
      else tab.removeAttribute('data-selected');
    });

    ['data-insights', 'google-search-console', 'prompt-suggestions-v2'].forEach(function (key) {
      var panel = findTabPanel(key);
      if (!panel) return;
      var show = key === tabKey;
      panel.hidden = !show;
      panel.style.display = show ? '' : 'none';
      panel.setAttribute('aria-hidden', show ? 'false' : 'true');
    });

    if (tabKey === 'prompt-suggestions-v2') {
      global.setTimeout(wireIntentCoveragePopup, 50);
    }
    return true;
  }

  function wirePromptsTabList() {
    if (!isPromptsPage()) return;
    var tablist = findTabList();
    if (!tablist || tablist.dataset.llmTabsWired === '1') return;
    tablist.dataset.llmTabsWired = '1';

    tablist.querySelectorAll('[role="tab"]').forEach(function (tab) {
      if (tab.dataset.llmTabWired === '1') return;
      tab.dataset.llmTabWired = '1';
      tab.addEventListener(
        'click',
        function (e) {
          var key = tab.getAttribute('data-key');
          if (!key) return;
          e.preventDefault();
          e.stopPropagation();
          switchPromptsTab(key);
        },
        true,
      );
    });

    var active =
      tablist.querySelector('[role="tab"][aria-selected="true"]') ||
      tablist.querySelector('[role="tab"][data-key="data-insights"]');
    var activeKey = (active && active.getAttribute('data-key')) || 'data-insights';
    switchPromptsTab(activeKey);
  }

  function patchPromptsTable(root, cfg) {
    if (!root) return false;
    var brand = cfg.brand || cfg.brandPickerLabel || 'Brand';
    var prompts = buildTablePrompts(cfg);
    var topics = buildTableTopics(cfg);
    var promptEls = [];
    root.querySelectorAll('[role="rowheader"] [data-rsp-slot="text"]').forEach(function (el) {
      if (!isLeaf(el)) return;
      var txt = (el.textContent || '').trim();
      if (txt.length < 4 || txt.length > 140) return;
      if (/^(Prompt|Category|Intent|Source|Topic|Actions)$/i.test(txt)) return;
      promptEls.push(el);
    });
    if (!promptEls.length) return false;

    promptEls.forEach(function (el, idx) {
      el.textContent = prompts[idx % prompts.length];
    });

    root.querySelectorAll('[role="row"] [data-rsp-slot="text"]').forEach(function (el) {
      if (!isLeaf(el)) return;
      var txt = (el.textContent || '').trim();
      if (ADOBE_TABLE_LABELS.test(txt) || txt === DEFAULT_CATEGORY) el.textContent = brand;
    });

    var topicEls = [];
    root.querySelectorAll('[role="gridcell"] [data-rsp-slot="text"], [role="cell"] [data-rsp-slot="text"]').forEach(
      function (el) {
        if (!isLeaf(el)) return;
        var txt = (el.textContent || '').trim();
        if (!txt || txt.length > 48) return;
        if (/^(informational|research|human|commercial|comparative|transactional|instructional)$/i.test(txt)) return;
        if (ADOBE_TABLE_LABELS.test(txt)) return;
        if (/^(AI Art|AI Animation|AI Avatar|Generic|Partner Models|Video Generator|Tattoo Generator)$/i.test(txt)) {
          topicEls.push(el);
        }
      },
    );
    topicEls.forEach(function (el, idx) {
      el.textContent = topics[idx % topics.length];
    });

    return true;
  }

  function patchAdobeDemoLabels(root, cfg) {
    var brand = cfg.brand || cfg.brandPickerLabel || 'Brand';
    root.querySelectorAll('[data-rsp-slot="text"], span, strong').forEach(function (el) {
      if (!isLeaf(el)) return;
      var txt = (el.textContent || '').trim();
      if (!txt || txt.length > 96) return;
      if (txt === 'Firefly' || txt === 'Adobe' || txt === 'Photoshop') el.textContent = brand;
    });
  }

  function findPromptsRoot() {
    var heads = Array.from(document.querySelectorAll('span[data-rsp-slot="text"], h1, h2')).filter(function (n) {
      var t = (n.textContent || '').trim();
      return (t === 'Prompts Management' || t === 'Prompt Suggestions') && n.childElementCount === 0;
    });
    if (!heads.length) return document.getElementById('root');
    var root = heads[0].parentElement;
    for (var i = 0; i < 16 && root; i++) {
      if (root.querySelector('span[title]') && root.textContent.indexOf('Active Prompts') >= 0) return root;
      if (root.querySelector('[role="tablist"]') && root.textContent.indexOf('Prompt Suggestions') >= 0) return root;
      root = root.parentElement;
    }
    return document.getElementById('root');
  }

  function snapshotBuild() {
    return (global.LLM_DEMO_SNAPSHOT_BUILD || '20260738');
  }

  function activatePromptSuggestionsTab() {
    switchPromptsTab('prompt-suggestions-v2');
  }

  function closeIntentCoverageOverlay() {
    var overlay = document.getElementById('llm-intent-coverage-overlay');
    if (overlay) overlay.remove();
    document.documentElement.classList.remove('llm-intent-coverage-host');
  }

  function openIntentCoverageOverlay() {
    if (document.getElementById('llm-intent-coverage-overlay')) return;
    document.documentElement.classList.add('llm-intent-coverage-host');
    var build = snapshotBuild();
    var overlay = document.createElement('div');
    overlay.id = 'llm-intent-coverage-overlay';
    overlay.className = 'llm-intent-coverage-overlay';
    overlay.innerHTML =
      '<div class="llm-intent-coverage-backdrop" aria-hidden="true"></div>' +
      '<div class="llm-intent-coverage-panel" role="dialog" aria-modal="true" aria-label="Intent Coverage">' +
      '<iframe class="llm-intent-coverage-frame" title="Intent Coverage" src="./intent-coverage-overlay.html?v=' +
      build +
      '&llmDemo=1"></iframe>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('.llm-intent-coverage-backdrop').addEventListener('click', closeIntentCoverageOverlay);
    global.addEventListener(
      'keydown',
      function onKey(e) {
        if (e.key === 'Escape') {
          closeIntentCoverageOverlay();
          global.removeEventListener('keydown', onKey);
        }
      },
      { once: true },
    );
  }

  function findIntentCoverageBlock() {
    var labels = Array.from(document.querySelectorAll('[data-rsp-slot="text"]')).filter(function (el) {
      return (el.textContent || '').trim() === 'Intent coverage' && el.childElementCount === 0;
    });
    if (!labels.length) return null;
    var label = labels[0];
    for (var up = 0; label && up < 14; up++) {
      if ((label.textContent || '').indexOf('View details') >= 0) return label;
      label = label.parentElement;
    }
    return labels[0].closest('[class*="macro-static"]') || labels[0].parentElement;
  }

  function wireIntentCoveragePopup() {
    if (!isPromptsPage()) return;
    var block = findIntentCoverageBlock();
    if (!block) return;
    block.querySelectorAll('button').forEach(function (btn) {
      if (btn.dataset.llmIntentWired === '1') return;
      var txt = (btn.textContent || '').trim();
      if (txt !== 'View details') return;
      btn.dataset.llmIntentWired = '1';
      btn.addEventListener(
        'click',
        function (e) {
          e.preventDefault();
          e.stopPropagation();
          openIntentCoverageOverlay();
        },
        true,
      );
    });
    var card = block.closest('[style*="cursor:pointer"]');
    if (card && card.dataset.llmIntentWired !== '1') {
      card.dataset.llmIntentWired = '1';
      card.setAttribute('data-llm-intent-trigger', '1');
      card.addEventListener(
        'click',
        function (e) {
          if (e.target.closest('button[aria-label="Information"]')) return;
          if (e.target.closest('button') && (e.target.closest('button').textContent || '').trim() !== 'View details') {
            return;
          }
          if (e.target.closest('button[data-llm-intent-wired="1"]')) return;
          openIntentCoverageOverlay();
        },
        true,
      );
    }
  }

  function setPromptNodeText(el, text) {
    if (!el) return;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.value = text;
      try {
        el.setAttribute('value', text);
      } catch (e) {
        /* ignore */
      }
      return;
    }
    el.textContent = text;
  }

  function syncPromptRow(span, text) {
    if (!span) return;
    span.setAttribute('title', text);
    span.querySelectorAll('[data-rsp-slot="text"], label, input, textarea, span').forEach(function (el) {
      if (el === span) return;
      if (el.childElementCount > 0) return;
      var t = (el.textContent || '').trim();
      if (t.length < 8 || t.length > 320) return;
      if (needsPromptPatch(t) || isPromptTitle(t) || t === text) setPromptNodeText(el, text);
    });
  }

  function patchPromptSpan(span, text, cfg) {
    var next = applyPromptText(text, cfg);
    if (next === text) return false;
    syncPromptRow(span, next);
    return true;
  }

  function collectPromptSpans(root) {
    var byTitle = Array.from(root.querySelectorAll('span[title]')).filter(function (span) {
      return isPromptTitle(span.getAttribute('title') || '');
    });
    if (byTitle.length) return byTitle;
    return Array.from(root.querySelectorAll('span[data-rsp-slot="text"]')).filter(function (el) {
      if (el.childElementCount > 0) return false;
      return isPromptTitle(el.textContent || '');
    });
  }

  function patchWithSamplePrompts(root, cfg) {
    var samples = (cfg.samplePrompts && cfg.samplePrompts.length >= 4 && cfg.samplePrompts) ||
      defaultSamplePrompts(cfg);
    if (!samples || samples.length < 4) return false;
    var spans = collectPromptSpans(root);
    if (!spans.length) return false;
    spans.forEach(function (span, idx) {
      syncPromptRow(span, samples[idx % samples.length]);
    });
    return true;
  }

  function patchTopicGroups(root, cfg) {
    var lex = industryLexicon(inferIndustry(cfg));
    root.querySelectorAll('span[data-rsp-slot="text"]').forEach(function (el) {
      if (el.childElementCount > 0) return;
      var txt = (el.textContent || '').trim();
      if (txt === 'Comparison Provider Reputation') el.textContent = lex.topicGroup;
    });
  }

  function patchPromptTitles(root, cfg) {
    var changed = false;
    root.querySelectorAll('span[title]').forEach(function (span) {
      var title = span.getAttribute('title') || '';
      if (!title || title.length > 320) return;
      if (isPromptTitle(title) || needsPromptPatch(title)) {
        if (patchPromptSpan(span, title, cfg)) changed = true;
      }
    });

    root.querySelectorAll('span[data-rsp-slot="text"]').forEach(function (el) {
      if (el.childElementCount > 0) return;
      var txt = (el.textContent || '').trim();
      if (txt.length < 12 || txt.length > 320) return;
      if (!needsPromptPatch(txt) && !isPromptTitle(txt)) return;
      var next = applyPromptText(txt, cfg);
      if (next === txt) return;
      el.textContent = next;
      var titleSpan = el.closest('span[title]');
      if (titleSpan) titleSpan.setAttribute('title', next);
      changed = true;
    });

    patchTopicGroups(root, cfg);
    return changed;
  }

  function patch() {
    if (!isPromptsPage()) return false;
    var cfg = getCfg();
    if (!cfg) return false;
    var root = findPromptsRoot();
    if (!root) return false;

    var key = (cfg.brand || '') + '|' + (cfg.siteHost || '') + '|' + inferIndustry(cfg);
    var didWork = false;
    var insightsPanel = findTabPanel('data-insights') || root;
    if (patchPromptsTable(insightsPanel, cfg)) didWork = true;
    patchAdobeDemoLabels(root, cfg);
    if (patchWithSamplePrompts(root, cfg)) {
      didWork = true;
    } else if (patchPromptTitles(root, cfg)) {
      didWork = true;
    } else {
      patchTopicGroups(root, cfg);
    }

    if (didWork) lastPatchKey = key;
    return didWork;
  }

  function schedulePatch() {
    if (patchTimer) global.clearTimeout(patchTimer);
    patchTimer = global.setTimeout(function () {
      patchTimer = null;
      patch();
    }, 40);
  }

  function ensureObserver() {
    if (observer || !isPromptsPage()) return;
    var root = findPromptsRoot();
    if (!root || !global.MutationObserver) return;
    observer = new global.MutationObserver(function () {
      if (!getCfg()) return;
      schedulePatch();
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }

  function init() {
    if (!isPromptsPage()) return;
    wirePromptsTabList();
    wireIntentCoveragePopup();
    patch();
    ensureObserver();
    schedulePatch();
  }

  global.SkyLlmPromptsManagement = {
    patch: patch,
    schedulePatch: schedulePatch,
    isPromptsPage: isPromptsPage,
    applyPromptText: applyPromptText,
    activatePromptSuggestionsTab: activatePromptSuggestionsTab,
    switchPromptsTab: switchPromptsTab,
    wirePromptsTabList: wirePromptsTabList,
    wireIntentCoveragePopup: wireIntentCoveragePopup,
    openIntentCoverageOverlay: openIntentCoverageOverlay,
    closeIntentCoverageOverlay: closeIntentCoverageOverlay,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  [200, 500, 1200, 2500, 4500].forEach(function (ms) {
    global.setTimeout(function () {
      wirePromptsTabList();
      wireIntentCoveragePopup();
      patch();
    }, ms);
  });

  global.addEventListener('storage', function (e) {
    if (e.key === 'llmDemoPersonalization_v1') {
      lastPatchKey = '';
      schedulePatch();
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
