'use strict';

/**
 * Normalize brand scrape URLs for host/path comparison (www-stripped, lowercase host, trimmed path).
 * Mirrors tools/aep-lab-profile-mcp/src/brandScrapeResolve.mjs.
 * @param {string | null | undefined} raw
 * @returns {{ host: string, path: string, key: string } | null}
 */
function normalizeBrandScrapeUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  try {
    const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    const u = new URL(withProto);
    let host = u.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    let path = u.pathname || '/';
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    return { host, path, key: `${host}${path}` };
  } catch {
    return null;
  }
}

/**
 * @param {string | null | undefined} itemUrl
 * @param {{ host: string, path: string, key: string }} targetNorm
 */
function brandScrapeUrlsMatch(itemUrl, targetNorm) {
  const itemNorm = normalizeBrandScrapeUrl(itemUrl);
  if (!itemNorm || !targetNorm) return false;
  if (itemNorm.key === targetNorm.key) return true;
  if (itemNorm.host === targetNorm.host && (itemNorm.path === '/' || targetNorm.path === '/')) {
    return true;
  }
  return false;
}

/**
 * @param {string | null | undefined} itemUrl
 * @param {string | null | undefined} itemBaseUrl
 * @param {{ host: string, path: string, key: string }} targetNorm
 */
function itemMatchesBrandScrapeUrl(itemUrl, itemBaseUrl, targetNorm) {
  return (
    brandScrapeUrlsMatch(itemUrl, targetNorm) || brandScrapeUrlsMatch(itemBaseUrl, targetNorm)
  );
}

/**
 * Pick best reusable scrape from list rows (newest updatedAt first).
 * @param {Array<Record<string, unknown>>} items
 * @param {object} [options]
 * @param {string} [options.url]
 * @param {boolean} [options.require_personas]
 * @param {boolean} [options.require_complete]
 */
/**
 * @param {string | null | undefined} status
 */
function isActiveBrandScrapeStatus(status) {
  const s = String(status || '');
  return s === 'running' || s === 'crawl_complete';
}

/**
 * Pick the newest in-flight scrape for a URL (running / crawl_complete).
 * @param {Array<Record<string, unknown>>} items
 * @param {string} url
 */
function findInFlightBrandScrapeFromList(items, url) {
  const urlNorm = url ? normalizeBrandScrapeUrl(url) : null;
  if (!urlNorm) return null;
  const list = Array.isArray(items) ? items : [];
  const matches = list.filter((item) => {
    const st = String(item.scrapeStatus || '');
    const active = isActiveBrandScrapeStatus(st) || item.analysisPending === true;
    if (!active) return false;
    return itemMatchesBrandScrapeUrl(item.url, item.baseUrl, urlNorm);
  });
  if (!matches.length) return null;
  matches.sort((a, b) => {
    const at = Date.parse(String(a.updatedAt || a.createdAt || '')) || 0;
    const bt = Date.parse(String(b.updatedAt || b.createdAt || '')) || 0;
    return bt - at;
  });
  return matches[0];
}

function resolveBrandScrapeFromList(items, options = {}) {
  const {
    url,
    require_personas = true,
    require_complete = true,
  } = options;

  const list = Array.isArray(items) ? items : [];
  const urlNorm = url ? normalizeBrandScrapeUrl(url) : null;
  if (url && !urlNorm) return null;

  const filtered = list.filter((item) => {
    if (require_complete && String(item.scrapeStatus || '') !== 'complete') return false;
    if (require_personas && !item.personasPresent) return false;
    return true;
  });

  let matches = filtered;
  if (urlNorm) {
    matches = filtered.filter((item) =>
      itemMatchesBrandScrapeUrl(item.url, item.baseUrl, urlNorm),
    );
  }

  if (!matches.length) return null;

  matches.sort((a, b) => {
    const at = Date.parse(String(a.updatedAt || a.createdAt || '')) || 0;
    const bt = Date.parse(String(b.updatedAt || b.createdAt || '')) || 0;
    return bt - at;
  });

  return matches[0];
}

module.exports = {
  normalizeBrandScrapeUrl,
  brandScrapeUrlsMatch,
  itemMatchesBrandScrapeUrl,
  isActiveBrandScrapeStatus,
  findInFlightBrandScrapeFromList,
  resolveBrandScrapeFromList,
};
