/**
 * Tag / analytics inventory for brand scraper (TAAP-style signals, lightweight).
 * Canonical module — copy to services/crawler/tagAudit.js when changing (Cloud Run image).
 */
'use strict';

const MAX_CONSOLE = 18;
const MAX_NETWORK_ROWS = 90;
const MAX_SLOW = 12;
const MAX_URL_LEN = 420;

function trunc(s, n) {
  const t = String(s || '');
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
}

/** Rough eTLD+1-style match for “same site” (good enough for marketing scans). */
function registrableHost(hostname) {
  const h = String(hostname || '').replace(/^www\./i, '').toLowerCase();
  const parts = h.split('.').filter(Boolean);
  if (parts.length <= 2) return h;
  return parts.slice(-2).join('.');
}

function isThirdParty(pageUrl, requestUrl) {
  try {
    const ph = registrableHost(new URL(pageUrl).hostname);
    const rh = registrableHost(new URL(requestUrl).hostname);
    return ph !== rh;
  } catch (_e) {
    return true;
  }
}

/**
 * Classify a request URL into a vendor bucket (first match wins).
 * @returns {{ id: string, category: string } | null}
 */
function classifyUrl(absUrl) {
  try {
    const u = new URL(absUrl);
    const h = u.hostname.toLowerCase();
    const p = u.pathname.toLowerCase();
    const q = u.search.toLowerCase();
    const full = h + p + q;

    if (/onetrust\.com|cdn\.cookielaw\.org|geolocation\.onetrust\.com/.test(h)) return { id: 'cmp_onetrust', category: 'cmp' };
    if (/cookiebot\.com|consent\.cookiebot\.com/.test(h)) return { id: 'cmp_cookiebot', category: 'cmp' };
    if (/didomi\.io/.test(h)) return { id: 'cmp_didomi', category: 'cmp' };
    if (/quantcast\.mgr\.consensu\.org|quantcast\.com\/choice/.test(full)) return { id: 'cmp_quantcast', category: 'cmp' };
    if (/trustarc\.com|consent\.trustarc\.com/.test(h)) return { id: 'cmp_trustarc', category: 'cmp' };
    if (/cdn\.privacy-mgmt\.com|sp\.messengernotification\.com/.test(h)) return { id: 'cmp_sourcepoint', category: 'cmp' };

    if (/assets\.adobedtm\.com|\.adobedtm\.com|download\.macromedia\.com\/pub\/js\/adobe/.test(h)) return { id: 'adobe_launch', category: 'tms' };
    if (/adobedc\.net|edge\.adobedc\.net|experience\.adobe\.net/.test(h)) return { id: 'adobe_experience_edge', category: 'adobe' };
    if (/demdex\.net|dpm\.demdex\.net/.test(h)) return { id: 'adobe_ecid', category: 'adobe' };
    if (/tt\.omtrdc\.net|sc\.omtrdc\.net|2o7\.net|hit\.x\.|\.hit\.x\./.test(h) || /\/b\/ss\//.test(p)) return { id: 'adobe_analytics_collect', category: 'analytics' };
    if (/everestjs\.net|everesttech\.net/.test(h)) return { id: 'adobe_target', category: 'adobe' };
    if (/company\.target\.|\.tt\.omtrdc\.net\/rest\/v1\/delivery/.test(full)) return { id: 'adobe_target', category: 'adobe' };

    if (/googletagmanager\.com/.test(h) && /gtm\.js|gtm\.load/.test(p + q)) return { id: 'google_gtm', category: 'tms' };
    if (/googletagmanager\.com\/gtag/.test(full) || /google-analytics\.com\/gtag/.test(h)) return { id: 'google_gtag', category: 'analytics' };
    if (/google-analytics\.com\/g\/collect|analytics\.google\.com\/g\/collect/.test(full)) return { id: 'google_ga4_collect', category: 'analytics' };
    if (/google-analytics\.com\/r\/collect|google-analytics\.com\/collect|\/__utm\.gif/.test(full)) return { id: 'google_ua_collect', category: 'analytics' };

    if (/connect\.facebook\.net|facebook\.com\/tr/.test(h)) return { id: 'meta_pixel', category: 'ads' };
    if (/analytics\.tiktok\.com|ads\.tiktok\.com/.test(h)) return { id: 'tiktok', category: 'ads' };
    if (/snap\.licdn\.com|px\.ads\.linkedin\.com/.test(h)) return { id: 'linkedin', category: 'ads' };
    if (/static\.ads-twitter\.com|analytics\.twitter\.com/.test(h)) return { id: 'twitter', category: 'ads' };

    if (/tags\.tiqcdn\.com|tags\.tealiumiq\.com|tealium\.com\/tags/.test(h)) return { id: 'tealium', category: 'tms' };
    if (/cdn\.segment\.com|api\.segment\.io|cdn\.segment\.analytics\.com/.test(h)) return { id: 'segment', category: 'tms' };
    if (/cdn\.rudderlabs\.com|rudderstack/.test(h)) return { id: 'rudderstack', category: 'tms' };

    if (/clarity\.ms\/tag/.test(h)) return { id: 'microsoft_clarity', category: 'analytics' };
    if (/hotjar\.com|static\.hotjar\.com/.test(h)) return { id: 'hotjar', category: 'analytics' };
    if (/fullstory\.com/.test(h)) return { id: 'fullstory', category: 'analytics' };
    if (/matomo|piwik\.php/.test(full)) return { id: 'matomo', category: 'analytics' };

    if (/doubleclick\.net|googleadservices\.com|googlesyndication\.com/.test(h)) return { id: 'google_ads', category: 'ads' };

    return null;
  } catch (_e) {
    return null;
  }
}

function extractAttr(tag, name) {
  const m = new RegExp(name + '\\s*=\\s*["\']([^"\']*)["\']', 'i').exec(tag);
  return m ? m[1] : '';
}

function absoluteOrNull(href, pageUrl) {
  if (!href) return null;
  const t = String(href).trim();
  if (!t || t.startsWith('data:') || t.startsWith('javascript:')) return null;
  try { return new URL(t, pageUrl).toString(); } catch (_e) { return null; }
}

/**
 * Regex-level script inventory from raw HTML (fetch crawler / backup).
 */
function extractHtmlScriptInventory(html, pageUrl) {
  if (!html) return { scriptSrcs: [], inlineHints: [], gtmContainerIds: [], launchHints: [] };
  const scriptSrcs = [];
  const inlineHints = [];
  const gtmContainerIds = new Set();
  const launchHints = [];
  const seen = new Set();

  const re = /<script\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const src = absoluteOrNull(extractAttr(tag, 'src'), pageUrl);
    if (src) {
      if (!seen.has(src)) {
        seen.add(src);
        scriptSrcs.push(trunc(src, MAX_URL_LEN));
      }
    } else {
      const low = tag.toLowerCase();
      if (/googletagmanager|gtm\.js|dataLayer/.test(low)) inlineHints.push('gtm_or_dataLayer_inline');
      if (/adobedtm|_satellite|launch|adobeLaunch/.test(low)) inlineHints.push('adobe_launch_inline');
      if (/tealium|utag\.js|utag\.loader/.test(low)) inlineHints.push('tealium_inline');
    }
  }

  const gtmRe = /GTM-[A-Z0-9]+/gi;
  let g;
  while ((g = gtmRe.exec(html)) !== null) gtmContainerIds.add(g[0].toUpperCase());

  if (/assets\.adobedtm\.com\/[a-f0-9-]{36}\/launch-[a-f0-9-]+\.min\.js/i.test(html)) {
    const lm = html.match(/assets\.adobedtm\.com\/[a-f0-9-]{36}\/launch-[a-f0-9-]+\.min\.js/i);
    if (lm) launchHints.push(trunc(lm[0], 200));
  }

  return {
    scriptSrcs: scriptSrcs.slice(0, 80),
    inlineHints: Array.from(new Set(inlineHints)),
    gtmContainerIds: Array.from(gtmContainerIds),
    launchHints: launchHints.slice(0, 4),
  };
}

function vendorsFromScriptSrcs(scriptSrcs) {
  const v = {};
  for (const s of scriptSrcs || []) {
    const c = classifyUrl(s);
    if (!c) continue;
    if (c.category === 'cmp') v[c.id] = true;
    else if (c.id === 'google_gtm' || c.id === 'tealium' || c.id === 'segment') v[c.id] = true;
    else if (c.id === 'adobe_launch') v.adobe_launch = true;
    else if (c.id === 'adobe_experience_edge') v.adobe_experience_edge = true;
    else if (c.id === 'adobe_analytics_collect') v.adobe_analytics_collect = true;
    else if (c.id === 'adobe_ecid') v.adobe_ecid = true;
    else if (c.id === 'adobe_target') v.adobe_target = true;
    else if (c.id === 'google_gtag' || c.id === 'google_ga4_collect' || c.id === 'google_ua_collect') {
      if (c.id === 'google_ua_collect') v.google_ua = true;
      else v.google_ga4 = true;
    }
    else v[c.id] = true;
  }
  return v;
}

function mergeVendorFlags(a, b) {
  const out = { ...a };
  for (const k of Object.keys(b || {})) if (b[k]) out[k] = true;
  return out;
}

function countDuplicateCollectors(networkRows) {
  const keys = [];
  for (const row of networkRows || []) {
    const c = row.vendorId
      ? { id: row.vendorId }
      : classifyUrl(row.url);
    if (!c) continue;
    if (c.id === 'adobe_analytics_collect' || c.id === 'google_ga4_collect' || c.id === 'google_ua_collect') {
      try {
        const u = new URL(row.url);
        keys.push(c.id + '|' + u.hostname + u.pathname.split('?')[0].slice(0, 120));
      } catch (_e) {
        keys.push(c.id + '|' + trunc(row.url, 120));
      }
    }
  }
  const counts = new Map();
  for (const k of keys) counts.set(k, (counts.get(k) || 0) + 1);
  return Array.from(counts.entries())
    .filter(([, n]) => n > 1)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function networkRowsFromPlaywright(networkLog) {
  return (networkLog || []).slice(0, MAX_NETWORK_ROWS).map(r => ({
    url: trunc(r.url, MAX_URL_LEN),
    resourceType: r.resourceType || '',
    status: r.status || 0,
    durationMs: Math.round(Number(r.durationMs) || 0),
    vendorId: r.vendorId || (classifyUrl(r.url) && classifyUrl(r.url).id) || null,
  }));
}

function buildVendorMapFromNetwork(networkRows, htmlVendors) {
  const m = { ...htmlVendors };
  for (const row of networkRows || []) {
    const c = row.vendorId
      ? { id: row.vendorId, category: 'unknown' }
      : classifyUrl(row.url);
    if (!c) continue;
    if (String(c.id).startsWith('cmp_')) m[c.id] = true;
    else if (c.id === 'google_gtm' || c.id === 'google_gtag') m[c.id] = true;
    else if (c.id === 'google_ga4_collect') m.google_ga4 = true;
    else if (c.id === 'google_ua_collect') m.google_ua = true;
    else if (c.id === 'adobe_launch' || c.id === 'adobe_experience_edge' || c.id === 'adobe_analytics_collect' ||
      c.id === 'adobe_ecid' || c.id === 'adobe_target') m[c.id] = true;
    else if (c.id === 'tealium' || c.id === 'segment' || c.id === 'rudderstack') m[c.id] = true;
    else if (c.category === 'ads' || c.category === 'analytics') m[c.id] = true;
  }
  return m;
}

function buildFetchPageAudit(html, pageUrl) {
  const inv = extractHtmlScriptInventory(html, pageUrl);
  const htmlVendors = vendorsFromScriptSrcs(inv.scriptSrcs);
  for (const h of inv.inlineHints) {
    if (h === 'gtm_or_dataLayer_inline') htmlVendors.gtm_inline_hint = true;
    if (h === 'adobe_launch_inline') htmlVendors.adobe_launch_inline = true;
    if (h === 'tealium_inline') htmlVendors.tealium_inline = true;
  }
  if (inv.gtmContainerIds.length) htmlVendors.google_gtm = true;
  if (inv.launchHints.length) htmlVendors.adobe_launch = true;

  return {
    mode: 'fetch',
    depthNote: 'HTML-only inventory; use JS-rendered crawl for network timing, console errors, and firing order.',
    vendors: htmlVendors,
    architecture: {
      externalScriptUrls: inv.scriptSrcs.length,
      gtmContainerIds: inv.gtmContainerIds,
      adobeLaunchScriptHints: inv.launchHints,
    },
    dataLayer: null,
    adobeSatellite: null,
    consoleErrors: [],
    duplicateCollectors: [],
    slowThirdPartyScripts: [],
    networkSample: [],
    htmlScriptSrcCount: inv.scriptSrcs.length,
  };
}

function buildPlaywrightPageAudit({
  pageUrl,
  html,
  networkLog,
  consoleErrors,
  probe,
  navigationTiming,
}) {
  const inv = extractHtmlScriptInventory(html, pageUrl);
  const htmlVendors = vendorsFromScriptSrcs(inv.scriptSrcs);
  for (const h of inv.inlineHints) {
    if (h === 'gtm_or_dataLayer_inline') htmlVendors.gtm_inline_hint = true;
    if (h === 'adobe_launch_inline') htmlVendors.adobe_launch_inline = true;
    if (h === 'tealium_inline') htmlVendors.tealium_inline = true;
  }
  if (inv.gtmContainerIds.length) htmlVendors.google_gtm = true;
  if (inv.launchHints.length) htmlVendors.adobe_launch = true;

  const networkRows = networkRowsFromPlaywright(networkLog);
  const vendors = buildVendorMapFromNetwork(networkRows, htmlVendors);

  if (probe && typeof probe === 'object') {
    if (probe.dataLayerLength != null && probe.dataLayerLength > 0) vendors.data_layer_populated = true;
    if (probe.hasSatellite) vendors.adobe_launch = true;
    if (probe.alloyVersion) vendors.adobe_experience_web_sdk = true;
  }

  const slow = [];
  for (const row of networkRows) {
    if (row.resourceType !== 'script') continue;
    if (!isThirdParty(pageUrl, row.url)) continue;
    if ((row.durationMs || 0) < 400) continue;
    slow.push({
      url: row.url,
      durationMs: row.durationMs,
      vendorId: row.vendorId || (classifyUrl(row.url) && classifyUrl(row.url).id) || null,
    });
  }
  slow.sort((a, b) => b.durationMs - a.durationMs);

  const dup = countDuplicateCollectors(networkRows);

  return {
    mode: 'playwright',
    vendors,
    architecture: {
      externalScriptUrls: inv.scriptSrcs.length,
      gtmContainerIds: inv.gtmContainerIds,
      adobeLaunchScriptHints: inv.launchHints,
    },
    dataLayer: probe && typeof probe === 'object'
      ? { present: probe.dataLayerLength != null, length: probe.dataLayerLength }
      : null,
    adobeSatellite: probe && typeof probe === 'object'
      ? { present: !!probe.hasSatellite, buildInfo: probe.satelliteBuild || null }
      : null,
    alloy: probe && typeof probe === 'object' && probe.alloyVersion
      ? { detected: true, version: String(probe.alloyVersion).slice(0, 32) }
      : { detected: false },
    navigationTiming: navigationTiming || null,
    consoleErrors: (consoleErrors || []).slice(0, MAX_CONSOLE),
    duplicateCollectors: dup,
    slowThirdPartyScripts: slow.slice(0, MAX_SLOW),
    networkSample: networkRows.slice(0, 28),
    htmlScriptSrcCount: inv.scriptSrcs.length,
  };
}

function vendorKeysTrue(v) {
  return Object.keys(v || {}).filter(k => v[k]);
}

function summarizeAcrossPages(pages) {
  if (!pages || !pages.length) return null;
  const audited = pages.filter(p => p && p.tagAudit);
  if (!audited.length) return null;
  let merged = {};
  let pagesWithErrors = 0;
  let playwrightPages = 0;
  let fetchPages = 0;
  const perPageScores = [];

  for (const p of audited) {
    const a = p.tagAudit;
    if (!a) continue;
    if (a.mode === 'playwright') playwrightPages++;
    if (a.mode === 'fetch') fetchPages++;
    merged = mergeVendorFlags(merged, a.vendors || {});
    if ((a.consoleErrors || []).length) pagesWithErrors++;
    let thirdMs = 0;
    for (const s of a.slowThirdPartyScripts || []) thirdMs += s.durationMs || 0;
    perPageScores.push({ url: p.url, title: p.title || '', thirdPartyHeavyMs: thirdMs, consoleErrorCount: (a.consoleErrors || []).length });
  }

  perPageScores.sort((a, b) => b.thirdPartyHeavyMs - a.thirdPartyHeavyMs);

  const opportunities = buildOpportunities(merged, pagesWithErrors, audited.length, playwrightPages, fetchPages, perPageScores, pages);

  return {
    pagesInCrawl: pages.length,
    pagesAudited: audited.length,
    engineMix: { playwright: playwrightPages, fetch: fetchPages },
    vendorsDetected: merged,
    vendorTags: vendorKeysTrue(merged).sort(),
    pagesWithConsoleErrors: pagesWithErrors,
    heaviestThirdPartyPages: perPageScores.slice(0, 8),
    opportunities,
  };
}

function buildOpportunities(merged, pagesWithErrors, totalPages, playwrightPages, fetchPages, perPageScores, pages) {
  const lines = [];
  const hasAdobe = !!(merged.adobe_launch || merged.adobe_launch_inline || merged.adobe_experience_edge ||
    merged.adobe_analytics_collect || merged.adobe_ecid || merged.adobe_target || merged.adobe_experience_web_sdk);
  const hasGoogle = !!(merged.google_gtm || merged.google_gtag || merged.google_ga4 || merged.google_ga4_collect || merged.google_ua || merged.google_ua_collect);
  const hasOtherAnalytics = !!(merged.hotjar || merged.microsoft_clarity || merged.matomo || merged.fullstory || merged.segment || merged.tealium);
  const hasCmp = Object.keys(merged).some(k => k.startsWith('cmp_'));

  if (!hasAdobe && !hasGoogle && !hasOtherAnalytics) {
    lines.push('No mainstream analytics TMS or collector patterns were detected on the sampled pages — worth validating measurement strategy and whether tags are blocked or loaded only post-login.');
  }
  if (hasGoogle && merged.google_ua && !merged.google_ga4_collect && !merged.google_ga4) {
    lines.push('Legacy Universal Analytics–style beacons may still be present; confirm GA4 migration completeness.');
  }
  if (pages.some(p => (p.tagAudit && (p.tagAudit.duplicateCollectors || []).length))) {
    lines.push('Possible duplicate analytics collector calls on at least one page — review inflated visit or event counts.');
  }
  if (pagesWithErrors > 0) {
    lines.push(`${pagesWithErrors} of ${totalPages} sampled pages logged browser console errors while loading; broken scripts often mean lost analytics or personalisation signals.`);
  }
  if (fetchPages > 0 && playwrightPages === 0) {
    lines.push('Crawl used HTML-only mode: enable “JS-rendered crawl” for network timings, console errors, and closer parity with TAAP-style audits.');
  }
  if (hasCmp && (hasAdobe || hasGoogle)) {
    lines.push('A consent platform was detected alongside marketing/analytics vendors — review tag firing relative to consent for compliance confidence.');
  }
  if (!hasCmp && (hasAdobe || hasGoogle)) {
    lines.push('No common CMP script pattern detected in the sample — confirm consent approach (banner, regional rules, and tag suppression).');
  }
  if (perPageScores[0] && perPageScores[0].thirdPartyHeavyMs > 5000) {
    lines.push('Several third-party scripts show high load times on key pages — measurement and mar-tech stack may be impacting Core Web Vitals.');
  }
  if (merged.tealium || merged.segment || merged.google_gtm) {
    lines.push('Tag management / CDP tooling detected — good foundation for governance; next step is standardising data layer and reducing one-off hard-coded pixels.');
  }
  return lines.slice(0, 10);
}

module.exports = {
  classifyUrl,
  extractHtmlScriptInventory,
  buildFetchPageAudit,
  buildPlaywrightPageAudit,
  summarizeAcrossPages,
  isThirdParty,
  trunc,
  MAX_NETWORK_ROWS,
};
