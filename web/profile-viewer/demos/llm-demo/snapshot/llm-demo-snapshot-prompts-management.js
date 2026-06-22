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

  function findPromptsRoot() {
    var heads = Array.from(document.querySelectorAll('span[data-rsp-slot="text"], h1, h2')).filter(function (n) {
      return (n.textContent || '').trim() === 'Prompts Management' && n.childElementCount === 0;
    });
    if (!heads.length) return document.getElementById('root');
    var root = heads[0].parentElement;
    for (var i = 0; i < 16 && root; i++) {
      if (root.querySelector('span[title]') && root.textContent.indexOf('Active Prompts') >= 0) return root;
      root = root.parentElement;
    }
    return document.getElementById('root');
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
    patch();
    ensureObserver();
    schedulePatch();
  }

  global.SkyLlmPromptsManagement = {
    patch: patch,
    schedulePatch: schedulePatch,
    isPromptsPage: isPromptsPage,
    applyPromptText: applyPromptText,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  [200, 500, 1200, 2500, 4500].forEach(function (ms) {
    global.setTimeout(init, ms);
  });

  global.addEventListener('storage', function (e) {
    if (e.key === 'llmDemoPersonalization_v1') {
      lastPatchKey = '';
      schedulePatch();
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
