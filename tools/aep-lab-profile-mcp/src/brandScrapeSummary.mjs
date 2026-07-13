/**
 * Coworker-friendly summary of a brand scrape record (same shape as Portal / GCS payload).
 */

import {
  extractScrapeIndustryTaxonomy,
  inferLabIndustryFromScrape,
} from './brandScrapePersonaMap.mjs';

const PORTAL_BRAND_SCRAPER_URL = 'https://aep-orchestration-lab.web.app/profile-viewer/brand-scraper.html';

/**
 * Lab industry fields for Coworker (scrape taxonomy → dual-stream industry key).
 * @param {Record<string, unknown> | null | undefined} record
 * @param {string | null | undefined} [listIndustry]
 */
export function scrapeIndustryLabFields(record, listIndustry) {
  const scrapeIndustry =
    extractScrapeIndustryTaxonomy(record) || String(listIndustry || '').trim() || null;
  const inferred = inferLabIndustryFromScrape(scrapeIndustry);
  return {
    scrape_industry: scrapeIndustry,
    inferred_industry: inferred.scrape_industry,
    lab_industry: inferred.industry,
    industry_source: inferred.source,
  };
}

function colorEntries(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 16).map((entry) => {
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry === 'object') {
      return entry.hex || entry.color || entry.value || entry.name || JSON.stringify(entry);
    }
    return String(entry);
  });
}

function fontEntries(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 10).map((entry) => {
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry === 'object') return entry.family || entry.name || entry.font || JSON.stringify(entry);
    return String(entry);
  });
}

function listCount(block, key) {
  if (!block || typeof block !== 'object') return null;
  const arr = block[key];
  return Array.isArray(arr) ? arr.length : null;
}

/**
 * @param {Record<string, unknown> | null | undefined} record
 */
export function summarizeBrandScrape(record) {
  if (!record || typeof record !== 'object') return null;

  const crawlSummary = /** @type {Record<string, unknown>} */ (record.crawlSummary || {});
  const assets = /** @type {Record<string, unknown>} */ (crawlSummary.assets || {});
  const analysis = /** @type {Record<string, unknown>} */ (record.analysis || {});

  const personasBlock = /** @type {Record<string, unknown>} */ (record.personas || {});
  const campaignsBlock = /** @type {Record<string, unknown>} */ (record.campaigns || {});
  const segmentsBlock = /** @type {Record<string, unknown>} */ (record.segments || {});
  const stakeholdersBlock = /** @type {Record<string, unknown>} */ (record.stakeholders || {});

  const scrapeId = String(record.scrapeId || '');
  const sandbox = String(record.sandbox || record.scopeId || '');
  const industryFields = scrapeIndustryLabFields(record);

  return {
    scrapeId,
    sandbox,
    brandName: record.brandName || null,
    url: record.url || record.baseUrl || null,
    businessType: record.businessType || null,
    country: record.country || null,
    industry: industryFields.scrape_industry,
    ...industryFields,
    scrapeStatus: record.scrapeStatus || null,
    scrapeError: record.scrapeError || null,
    buildPhase: record.buildPhase || null,
    analysisPending: record.analysisPending ?? null,
    pagesScraped: crawlSummary.pagesScraped ?? record.pagesScraped ?? null,
    elapsedMs: record.elapsedMs ?? null,
    colors: colorEntries(assets.colors),
    fonts: fontEntries(assets.fonts),
    logoCandidates: Array.isArray(assets.imagesV2)
      ? assets.imagesV2.filter((img) => img && img.role === 'logo').slice(0, 5).map((img) => img.url || img.signedUrl)
      : [],
    about: analysis.about ? String(analysis.about).slice(0, 600) : null,
    tone: analysis.tone || analysis.brandTone || null,
    tagAuditSummary: crawlSummary.tagAuditSummary || null,
    personasCount: listCount(personasBlock, 'personas'),
    campaignsCount: listCount(campaignsBlock, 'campaigns'),
    segmentsCount: listCount(segmentsBlock, 'segments'),
    stakeholdersCount: listCount(stakeholdersBlock, 'people'),
    analysisPresent: record.analysisPresent ?? Boolean(analysis.about || analysis.tone),
    personasPresent: record.personasPresent ?? listCount(personasBlock, 'personas') > 0,
    campaignsPresent: record.campaignsPresent ?? listCount(campaignsBlock, 'campaigns') > 0,
    segmentsPresent: record.segmentsPresent ?? listCount(segmentsBlock, 'segments') > 0,
    stakeholdersPresent: record.stakeholdersPresent ?? listCount(stakeholdersBlock, 'people') > 0,
    updatedAt: record.updatedAt || null,
    createdAt: record.createdAt || null,
    portalUrl: PORTAL_BRAND_SCRAPER_URL,
    portalHint:
      scrapeId && sandbox
        ? `Open Brand scraper in Profile Viewer (${PORTAL_BRAND_SCRAPER_URL}) with sandbox ${sandbox}; scrape ${scrapeId} appears in history and Image hosting.`
        : `Open Brand scraper (${PORTAL_BRAND_SCRAPER_URL}) and select the same sandbox to view saved scrapes.`,
  };
}

/**
 * @param {Record<string, unknown>} item
 */
export function summarizeBrandScrapeListItem(item) {
  if (!item || typeof item !== 'object') return null;
  const industryFields = scrapeIndustryLabFields(null, item.industry);
  return {
    scrapeId: item.scrapeId,
    brandName: item.brandName,
    url: item.url || item.baseUrl,
    scrapeStatus: item.scrapeStatus,
    scrapeError: item.scrapeError,
    pagesScraped: item.pagesScraped,
    industry: industryFields.scrape_industry,
    ...industryFields,
    analysisPresent: item.analysisPresent,
    personasPresent: item.personasPresent,
    campaignsPresent: item.campaignsPresent,
    segmentsPresent: item.segmentsPresent,
    stakeholdersPresent: item.stakeholdersPresent,
    updatedAt: item.updatedAt,
    createdAt: item.createdAt,
  };
}

/**
 * @param {string | null | undefined} status
 */
export function isBrandScrapeTerminal(status) {
  const s = String(status || '').toLowerCase();
  return s === 'complete' || s === 'failed';
}

/**
 * @param {Record<string, unknown> | null | undefined} record
 */
export function brandScrapeProgressHint(record) {
  const status = String(record?.scrapeStatus || '');
  if (isBrandScrapeTerminal(status)) return null;
  return 'Brand scrape still running — poll with lab_poll_brand_scrape or lab_get_brand_scrape every 10–30s. Typical runs take 3–8 minutes.';
}
