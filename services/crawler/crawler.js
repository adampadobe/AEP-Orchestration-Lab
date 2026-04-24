/**
 * Playwright-backed crawler — produces the same shape as the fetch-based
 * crawlSite in functions/brandScraperService.js so the Cloud Function can
 * drop this in as a replacement when JS rendering is required.
 */

'use strict';

const { chromium } = require('playwright');
const E = require('./extractors');
const tagAudit = require('./tagAudit');

const DEFAULT_PAGE_TIMEOUT_MS = 25000;
const MAX_DISCOVERED = 200;
const PRIORITY_PATHS = ['/', '/about', '/about-us', '/products', '/services', '/solutions', '/brand', '/company', '/leadership', '/team', '/our-team', '/management', '/people'];

function normaliseUrl(raw) {
  const v = String(raw || '').trim();
  if (!v) throw new Error('URL is required');
  const withScheme = /^https?:\/\//i.test(v) ? v : 'https://' + v;
  const u = new URL(withScheme);
  u.hash = '';
  return u.toString().replace(/\/$/, '');
}

function prioritise(urls) {
  const score = (u) => {
    try {
      const p = new URL(u).pathname.replace(/\/+$/, '').toLowerCase() || '/';
      if (PRIORITY_PATHS.includes(p)) return 0;
      for (const kw of PRIORITY_PATHS) if (kw.length > 1 && p.includes(kw)) return 1;
      return 2 + (p.match(/\//g) || []).length;
    } catch (_e) { return 99; }
  };
  return urls.slice().sort((a, b) => score(a) - score(b));
}

function shouldLogNetworkRequest(pageUrl, reqUrl, resourceType) {
  if (tagAudit.classifyUrl(reqUrl)) return true;
  if (resourceType === 'script' && tagAudit.isThirdParty(pageUrl, reqUrl)) return true;
  if ((resourceType === 'xhr' || resourceType === 'fetch' || resourceType === 'ping') &&
      tagAudit.isThirdParty(pageUrl, reqUrl)) {
    if (/collect|analytics|beacon|\/b\/ss\/|\/ss\/|pixel|events?|\/tr\?|ads|conversion|omtrdc|demdex/i.test(reqUrl)) return true;
  }
  return false;
}

async function tryFetchPage(context, url, { pageTimeout, tagAudit: doTagAudit = true } = {}) {
  const page = await context.newPage();
  const networkLog = [];
  const consoleErrors = [];

  const onConsole = (msg) => {
    if (!doTagAudit) return;
    if (msg.type() === 'error' && consoleErrors.length < 22) {
      consoleErrors.push({ type: msg.type(), text: tagAudit.trunc(msg.text(), 800) });
    }
  };
  const onReqFin = (request) => {
    if (!doTagAudit || networkLog.length >= tagAudit.MAX_NETWORK_ROWS) return;
    try {
      const reqUrl = request.url();
      const rt = request.resourceType();
      if (!shouldLogNetworkRequest(url, reqUrl, rt)) return;
      const resp = request.response();
      const status = resp ? resp.status() : 0;
      let durationMs = 0;
      try {
        const t = request.timing();
        durationMs = Math.max(0, Math.round(t.responseEnd || 0));
      } catch (_e) { /* ignore */ }
      const cls = tagAudit.classifyUrl(reqUrl);
      networkLog.push({
        url: reqUrl,
        resourceType: rt,
        status,
        durationMs,
        vendorId: cls ? cls.id : null,
      });
    } catch (_e) { /* ignore */ }
  };

  page.on('console', onConsole);
  page.on('requestfinished', onReqFin);
  try {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: pageTimeout || DEFAULT_PAGE_TIMEOUT_MS,
    });
    // Give dynamic content a brief moment to settle.
    try {
      await page.waitForLoadState('networkidle', { timeout: 4000 });
    } catch (_e) { /* ignore — domcontentloaded is enough */ }
    const status = response ? response.status() : 0;
    if (status && status >= 400) {
      return { status, html: '', reason: 'http_error', error: `HTTP ${status}`, tagAudit: null };
    }

    let probe = null;
    let navigationTiming = null;
    if (doTagAudit) {
      try {
        probe = await page.evaluate(() => ({
          dataLayerLength: Array.isArray(window.dataLayer)
            ? window.dataLayer.length
            : (window.dataLayer == null ? null : 1),
          hasSatellite: !!(window._satellite && typeof window._satellite.track === 'function'),
          satelliteBuild: (window._satellite && window._satellite.buildInfo &&
            (window._satellite.buildInfo.buildDate || window._satellite.buildInfo.environment)) || null,
          alloyVersion: (typeof window.alloy === 'function') ? 'runtime' : null,
        }));
      } catch (_e) { probe = null; }
      try {
        const nt = await page.evaluate(() => {
          const n = performance.getEntriesByType('navigation')[0];
          if (!n) return null;
          return {
            domContentLoaded: Math.round(n.domContentLoadedEventEnd || 0),
            loadEventEnd: Math.round(n.loadEventEnd || 0),
            transferSize: n.transferSize != null ? n.transferSize : null,
          };
        });
        navigationTiming = nt;
      } catch (_e) { navigationTiming = null; }
    }

    const html = await page.content();
    const pageTagAudit = doTagAudit
      ? tagAudit.buildPlaywrightPageAudit({
        pageUrl: url,
        html,
        networkLog,
        consoleErrors,
        probe,
        navigationTiming,
      })
      : null;
    return { status: status || 200, html, reason: 'ok', tagAudit: pageTagAudit };
  } catch (e) {
    const msg = String((e && e.message) || e);
    const reason = /timeout/i.test(msg) ? 'timeout' : 'network';
    return { status: 0, html: '', reason, error: msg, tagAudit: null };
  } finally {
    page.off('console', onConsole);
    page.off('requestfinished', onReqFin);
    await page.close().catch(() => {});
  }
}

async function crawl(rawUrl, { maxPages = 5, pageTimeout = DEFAULT_PAGE_TIMEOUT_MS, tagAudit: runTagAudit = true } = {}) {
  const baseUrl = normaliseUrl(rawUrl);
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
      locale: 'en-GB',
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: { 'Accept-Language': 'en-GB,en;q=0.9' },
    });

    const visited = new Set();
    const discovered = new Set([baseUrl]);
    const queue = [baseUrl];
    const pages = [];
    const failures = [];
    let brandName = '';

    while (queue.length && pages.length < maxPages) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);

      const { status, html, reason, error, tagAudit: pageTagAudit } = await tryFetchPage(context, current, { pageTimeout, tagAudit: runTagAudit });
      if (reason !== 'ok' || !html) {
        failures.push({ url: current, status, reason, error });
        // For the seed URL, try the www-toggle once.
        if (current === baseUrl) {
          try {
            const u = new URL(current);
            const altHost = u.hostname.startsWith('www.') ? u.hostname.slice(4) : 'www.' + u.hostname;
            const altUrl = u.protocol + '//' + altHost + u.pathname;
            if (!visited.has(altUrl)) {
              const alt = await tryFetchPage(context, altUrl, { pageTimeout, tagAudit: runTagAudit });
              visited.add(altUrl);
              if (alt.reason === 'ok' && alt.html) {
                discovered.add(altUrl);
                pages.push(buildPage(altUrl, alt.status, alt.html, baseUrl, alt.tagAudit));
                if (!brandName) brandName = E.extractBrandName(alt.html, baseUrl);
                for (const l of E.extractLinks(alt.html, altUrl, baseUrl)) {
                  if (discovered.size < MAX_DISCOVERED) discovered.add(l);
                  if (!visited.has(l) && !queue.includes(l)) queue.push(l);
                }
                continue;
              } else {
                failures.push({ url: altUrl, status: alt.status, reason: alt.reason, error: alt.error });
              }
            }
          } catch (_e) { /* ignore */ }
        }
        continue;
      }

      pages.push(buildPage(current, status, html, baseUrl, pageTagAudit));
      if (!brandName) brandName = E.extractBrandName(html, baseUrl);
      const links = E.extractLinks(html, current, baseUrl);
      for (const l of links) {
        if (discovered.size < MAX_DISCOVERED) discovered.add(l);
        if (!visited.has(l) && !queue.includes(l)) queue.push(l);
      }
      queue.splice(0, queue.length, ...prioritise(queue));
    }

    if (!brandName) {
      const host = new URL(baseUrl).hostname.replace(/^www\./, '').split('.')[0];
      brandName = host.charAt(0).toUpperCase() + host.slice(1);
    }

    const tagAuditSummary = runTagAudit ? tagAudit.summarizeAcrossPages(pages) : null;

    return {
      brandName,
      baseUrl,
      pages,
      totalDiscovered: discovered.size,
      assets: E.aggregateAssets(pages),
      failures,
      engine: 'playwright',
      tagAuditSummary,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

function buildPage(url, status, html, baseUrl, pageTagAudit) {
  const text = E.extractText(html);
  const row = {
    url,
    status,
    title: E.extractTitle(html),
    description: E.extractMeta(html, 'name', 'description') || E.extractMeta(html, 'property', 'og:description'),
    textLength: text.length,
    text: text.slice(0, 8000),
    _images: E.extractImages(html, url),
    _favicons: E.extractFavicons(html, url),
    _ogImages: E.extractOgImages(html, url),
    _colours: E.extractColours(html),
    _fonts: E.extractFonts(html),
  };
  if (pageTagAudit) row.tagAudit = pageTagAudit;
  return row;
}

module.exports = { crawl };
