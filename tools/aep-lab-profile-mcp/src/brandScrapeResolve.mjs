/**
 * Resolve an existing brand scrape for a sandbox + URL before starting a new crawl.
 * Mirrors Portal history matching: same Firestore index as lab_list_brand_scrapes.
 */

import { summarizeBrandScrapeListItem } from './brandScrapeSummary.mjs';

/**
 * Normalize a brand URL for host/path comparison (www-stripped, lowercase host, trimmed path).
 * @param {string | null | undefined} raw
 * @returns {{ host: string, path: string, key: string } | null}
 */
export function normalizeBrandScrapeUrl(raw) {
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
export function brandScrapeUrlsMatch(itemUrl, targetNorm) {
  const itemNorm = normalizeBrandScrapeUrl(itemUrl);
  if (!itemNorm || !targetNorm) return false;
  if (itemNorm.key === targetNorm.key) return true;
  if (itemNorm.host === targetNorm.host && (itemNorm.path === '/' || targetNorm.path === '/')) {
    return true;
  }
  return false;
}

/**
 * @param {Record<string, unknown>} item
 * @param {object} filters
 */
function passesScrapeFilters(item, { require_complete, require_personas, max_age_hours }) {
  if (require_complete && String(item.scrapeStatus || '') !== 'complete') return false;
  if (require_personas && !item.personasPresent) return false;
  if (max_age_hours != null && Number.isFinite(max_age_hours) && max_age_hours > 0) {
    const updated = Date.parse(String(item.updatedAt || item.createdAt || ''));
    if (!Number.isFinite(updated)) return false;
    const ageHours = (Date.now() - updated) / 3600000;
    if (ageHours > max_age_hours) return false;
  }
  return true;
}

/**
 * @param {string | null | undefined} itemUrl
 * @param {string | null | undefined} itemBaseUrl
 * @param {{ host: string, path: string, key: string }} targetNorm
 */
function itemMatchesUrl(itemUrl, itemBaseUrl, targetNorm) {
  return (
    brandScrapeUrlsMatch(itemUrl, targetNorm) || brandScrapeUrlsMatch(itemBaseUrl, targetNorm)
  );
}

/**
 * @param {string | null | undefined} status
 */
export function isActiveBrandScrapeStatus(status) {
  const s = String(status || '');
  return s === 'running' || s === 'crawl_complete';
}

/**
 * Pick the newest in-flight scrape for a URL (running / crawl_complete / analysis pending).
 *
 * @param {Array<Record<string, unknown>>} items
 * @param {string} url
 */
export function findInFlightBrandScrapeFromList(items, url) {
  const urlNorm = url ? normalizeBrandScrapeUrl(url) : null;
  if (!urlNorm) return null;
  const list = Array.isArray(items) ? items : [];
  const matches = list.filter((item) => {
    const st = String(item.scrapeStatus || '');
    const active = isActiveBrandScrapeStatus(st) || item.analysisPending === true;
    if (!active) return false;
    return itemMatchesUrl(item.url, item.baseUrl, urlNorm);
  });
  if (!matches.length) return null;
  matches.sort((a, b) => {
    const at = Date.parse(String(a.updatedAt || a.createdAt || '')) || 0;
    const bt = Date.parse(String(b.updatedAt || b.createdAt || '')) || 0;
    return bt - at;
  });
  return matches[0];
}

/**
 * Pick the best existing scrape from a list response (already sorted by updatedAt desc).
 *
 * @param {Array<Record<string, unknown>>} items
 * @param {object} [options]
 * @param {string} [options.url]
 * @param {boolean} [options.prefer_existing]
 * @param {boolean} [options.require_personas]
 * @param {boolean} [options.require_complete]
 * @param {number} [options.max_age_hours]
 */
export function resolveBrandScrapeFromList(items, options = {}) {
  const {
    url,
    prefer_existing = true,
    require_personas = true,
    require_complete = true,
    max_age_hours,
  } = options;

  const list = Array.isArray(items) ? items : [];

  if (!prefer_existing) {
    return {
      need_new_scrape: true,
      reason: 'prefer_existing is false — call lab_brand_scrape to start a new crawl.',
      candidatesChecked: list.length,
    };
  }

  const urlNorm = url ? normalizeBrandScrapeUrl(url) : null;
  if (url && !urlNorm) {
    return {
      need_new_scrape: true,
      reason: `Could not parse url "${url}".`,
      candidatesChecked: list.length,
    };
  }

  const filtered = list.filter((item) =>
    passesScrapeFilters(item, { require_complete, require_personas, max_age_hours }),
  );

  let matches = filtered;
  if (urlNorm) {
    matches = filtered.filter((item) =>
      itemMatchesUrl(item.url, item.baseUrl, urlNorm),
    );
  }

  if (!matches.length) {
    const inFlight = urlNorm ? findInFlightBrandScrapeFromList(list, url) : null;
    const reason = urlNorm
      ? `No complete scrape with personas for ${urlNorm.key} on this sandbox (checked ${list.length} history rows, ${filtered.length} passed filters).`
      : `No complete scrape with personas on this sandbox (checked ${list.length} history rows). Provide url to match a brand site, or call lab_brand_scrape.`;
    return {
      need_new_scrape: !inFlight,
      reason: inFlight
        ? `Scrape already in progress for ${urlNorm.key} — reuse scrape_id ${inFlight.scrapeId} and poll with lab_poll_brand_scrape (do not start another crawl).`
        : reason,
      scrape_id: inFlight ? inFlight.scrapeId : undefined,
      in_flight: inFlight ? summarizeBrandScrapeListItem(inFlight) : undefined,
      candidatesChecked: list.length,
      filteredCount: filtered.length,
      normalized_url: urlNorm?.key || null,
      recentIncomplete: list
        .filter((item) => urlNorm ? itemMatchesUrl(item.url, item.baseUrl, urlNorm) : true)
        .slice(0, 3)
        .map((item) => summarizeBrandScrapeListItem(item)),
    };
  }

  matches.sort((a, b) => {
    const at = Date.parse(String(a.updatedAt || a.createdAt || '')) || 0;
    const bt = Date.parse(String(b.updatedAt || b.createdAt || '')) || 0;
    return bt - at;
  });

  const best = matches[0];
  const summary = summarizeBrandScrapeListItem(best);

  return {
    need_new_scrape: false,
    scrape_id: best.scrapeId,
    summary,
    normalized_url: urlNorm?.key || null,
    matchCount: matches.length,
    alternatives: matches.slice(1, 5).map((item) => summarizeBrandScrapeListItem(item)),
    coworkerHints: {
      reuse: `Reuse scrape_id ${best.scrapeId} with lab_prepare_demo_from_brand_scrape or lab_generate_profile_from_brand_scrape.`,
      refresh: 'Call lab_brand_scrape with force_new:true only when you need a fresh crawl.',
    },
  };
}
