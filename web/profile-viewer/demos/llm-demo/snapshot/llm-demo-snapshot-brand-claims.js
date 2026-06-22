/**
 * LLM Demo — Brand Claims page: Risk by Theme categories + page brand chrome.
 */
(function (global) {
  'use strict';

  var SKY_CLAIM_THEMES = [
    'Broadband & TV',
    'Brand Types & Positioning',
    'Pricing & Value',
    'Sustainability & Ethics',
    'Consumer Preferences',
    'Supply Chain & Sourcing',
    'Subscription & Membership',
    'Customer Support',
    'Data & Analytics',
    'Channel Monitoring',
    'Security & Compliance',
    'Technology & AI',
  ];

  var SPORTSWEAR_THEMES = [
    'Product & Performance',
    'Brand Positioning',
    'Pricing & Value',
    'Sustainability & Ethics',
    'Consumer Preferences',
    'Supply Chain & Sourcing',
    'Membership & Loyalty',
    'Customer Support',
    'Data & Analytics',
    'Retail & Channel Partners',
    'Security & Compliance',
    'Technology & AI',
  ];

  var RETAIL_THEMES = [
    'Product Range & Availability',
    'Brand Positioning',
    'Pricing & Promotions',
    'Sustainability & Ethics',
    'Shopper Preferences',
    'Supply Chain & Sourcing',
    'Loyalty & Membership',
    'Customer Support',
    'Data & Personalisation',
    'Omnichannel & Stores',
    'Security & Compliance',
    'Technology & AI',
  ];

  function isBrandClaimsPage() {
    return /brand-claims\.html/i.test(global.location.pathname || '');
  }

  function themesForIndustry(industry) {
    var ind = String(industry || '').toLowerCase();
    if (/telecom|broadband|pay[- ]?tv|media bundle/i.test(ind)) return SKY_CLAIM_THEMES.slice();
    if (/sport|apparel|footwear|athletic|sportswear/i.test(ind)) return SPORTSWEAR_THEMES.slice();
    if (/retail|e-?commerce|consumer goods|fashion/i.test(ind)) return RETAIL_THEMES.slice();
    return SPORTSWEAR_THEMES.slice();
  }

  function buildThemeMap(cfg) {
    var labels =
      cfg.claimThemes && cfg.claimThemes.length >= SKY_CLAIM_THEMES.length
        ? cfg.claimThemes
        : themesForIndustry(cfg.industry);
    var map = {};
    var i;
    for (i = 0; i < SKY_CLAIM_THEMES.length; i++) {
      var sky = SKY_CLAIM_THEMES[i];
      var next = labels[i] || sky;
      map[sky] = next;
      map[sky.replace(/&/g, '&amp;')] = next.replace(/&/g, '&amp;');
    }
    return map;
  }

  function sortedThemeKeys(themeMap) {
    return Object.keys(themeMap).sort(function (a, b) {
      return b.length - a.length;
    });
  }

  function replaceThemeText(raw, keys, themeMap) {
    var next = String(raw || '');
    var i;
    for (i = 0; i < keys.length; i++) {
      var from = keys[i];
      if (from && next.indexOf(from) >= 0) next = next.split(from).join(themeMap[from]);
    }
    return next;
  }

  function findRiskByThemeRoot() {
    var heads = Array.from(document.querySelectorAll('span[data-rsp-slot="text"], h2, h3')).filter(function (n) {
      return (n.textContent || '').trim() === 'Risk by Theme' && n.childElementCount === 0;
    });
    if (!heads.length) return null;
    var root = heads[0].parentElement;
    for (var i = 0; i < 12 && root; i++) {
      if (root.textContent.indexOf('Broadband') >= 0 || root.textContent.indexOf('Brand Types') >= 0) return root;
      root = root.parentElement;
    }
    return heads[0].parentElement;
  }

  function patchRiskByTheme(cfg) {
    var root = findRiskByThemeRoot();
    if (!root) return;
    var themeMap = buildThemeMap(cfg);
    var keys = sortedThemeKeys(themeMap);

    root.querySelectorAll('[data-rsp-slot="text"]').forEach(function (el) {
      if (el.childElementCount > 0) return;
      var txt = (el.textContent || '').trim();
      if (!txt || txt.length > 80) return;
      var hit = false;
      var i;
      for (i = 0; i < SKY_CLAIM_THEMES.length; i++) {
        if (txt === SKY_CLAIM_THEMES[i] || txt.indexOf(SKY_CLAIM_THEMES[i]) >= 0) {
          hit = true;
          break;
        }
      }
      if (!hit && txt.indexOf('% cited') < 0) return;
      var next = replaceThemeText(el.textContent, keys, themeMap);
      if (next !== el.textContent) el.textContent = next;
    });

    root.querySelectorAll('[aria-label]').forEach(function (el) {
      var label = el.getAttribute('aria-label') || '';
      if (!/Broadband|Subscription|Brand Types|Channel Monitoring/i.test(label)) return;
      var next = replaceThemeText(label, keys, themeMap);
      if (next !== label) el.setAttribute('aria-label', next);
    });
  }

  function patchPageBrandChrome(cfg) {
    if (!global.SkyLlmLlmDemoBrands) return;
    var label = global.SkyLlmLlmDemoBrands.brandPickerLabel();
    var brand = cfg.brand;
    document
      .querySelectorAll('header [data-rsp-slot="text"], [role="combobox"] [data-rsp-slot="text"]')
      .forEach(function (el) {
        if (el.childElementCount > 0) return;
        var txt = (el.textContent || '').trim();
        if (!txt || txt.length > 96) return;
        if (txt === 'Sky' || txt === 'Sky TV and broadband' || /frescopa/i.test(txt)) {
          el.textContent = label;
        } else if (
          txt === 'Virgin Media' ||
          txt === 'BT' ||
          txt === 'TalkTalk' ||
          txt === 'Netflix' ||
          txt === 'Disney+'
        ) {
          el.textContent = global.SkyLlmLlmDemoBrands.skyToDisplay(txt);
        } else if (txt === brand) {
          /* already personalised */
        }
      });
  }

  function patch() {
    if (!isBrandClaimsPage()) return;
    if (!global.SkyLlmLlmDemoBrands || !global.SkyLlmLlmDemoBrands.isActive()) return;
    var cfg = global.SkyLlmLlmDemoBrands.loadConfig();
    if (!cfg) return;
    patchPageBrandChrome(cfg);
    patchRiskByTheme(cfg);
  }

  global.SkyLlmBrandClaims = { patch: patch, isBrandClaimsPage: isBrandClaimsPage };
})(typeof window !== 'undefined' ? window : globalThis);
