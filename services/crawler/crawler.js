/**
 * Playwright-backed crawler — produces the same shape as the fetch-based
 * crawlSite in functions/brandScraperService.js so the Cloud Function can
 * drop this in as a replacement when JS rendering is required.
 */

'use strict';

const { chromium } = require('playwright');
const E = require('./extractors');

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

async function tryFetchPage(context, url, { pageTimeout } = {}) {
  const page = await context.newPage();
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
      return { status, html: '', reason: 'http_error', error: `HTTP ${status}` };
    }
    const html = await page.content();
    return { status: status || 200, html, reason: 'ok' };
  } catch (e) {
    const msg = String((e && e.message) || e);
    const reason = /timeout/i.test(msg) ? 'timeout' : 'network';
    return { status: 0, html: '', reason, error: msg };
  } finally {
    await page.close().catch(() => {});
  }
}

async function crawl(rawUrl, { maxPages = 5, pageTimeout = DEFAULT_PAGE_TIMEOUT_MS } = {}) {
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

      const { status, html, reason, error } = await tryFetchPage(context, current, { pageTimeout });
      if (reason !== 'ok' || !html) {
        failures.push({ url: current, status, reason, error });
        // For the seed URL, try the www-toggle once.
        if (current === baseUrl) {
          try {
            const u = new URL(current);
            const altHost = u.hostname.startsWith('www.') ? u.hostname.slice(4) : 'www.' + u.hostname;
            const altUrl = u.protocol + '//' + altHost + u.pathname;
            if (!visited.has(altUrl)) {
              const alt = await tryFetchPage(context, altUrl, { pageTimeout });
              visited.add(altUrl);
              if (alt.reason === 'ok' && alt.html) {
                discovered.add(altUrl);
                pages.push(buildPage(altUrl, alt.status, alt.html, baseUrl));
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

      pages.push(buildPage(current, status, html, baseUrl));
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

    return {
      brandName,
      baseUrl,
      pages,
      totalDiscovered: discovered.size,
      assets: E.aggregateAssets(pages),
      failures,
      engine: 'playwright',
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

function buildPage(url, status, html, baseUrl) {
  const text = E.extractText(html);
  return {
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
}

module.exports = { crawl };
