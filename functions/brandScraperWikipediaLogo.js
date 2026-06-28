/**
 * Resolve customer logos from Wikipedia — page image, infobox file list, or Wikidata P154.
 */
'use strict';

const admin = require('firebase-admin');

const BUCKET_NAME = process.env.BRAND_SCRAPER_BUCKET || 'aep-orchestration-lab-brand-scrapes';
const SIGNED_URL_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const USER_AGENT = 'AEP-Orchestration-Lab/1.0 (Adobe internal brand scraper)';

const LOGO_SKIP_RE = /commons-logo|edit-ltr|question book|ambox|symbol category|wikidata|flag of|icon-|favicon/i;

function getBucket() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.storage().bucket(BUCKET_NAME);
}

function safeSlug(s, fallback) {
  const v = String(s || '').toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return v || (fallback || 'item');
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Wikipedia API HTTP ${res.status}`);
  return res.json();
}

function scoreLogoFilename(fileTitle) {
  const n = String(fileTitle || '').toLowerCase();
  if (!n.startsWith('file:')) return -99;
  if (LOGO_SKIP_RE.test(n)) return -50;
  let score = 0;
  if (/logo/.test(n)) score += 25;
  if (/wordmark|brandmark|brand.?mark/.test(n)) score += 12;
  if (/\b20\d{2}\b/.test(n) && /\.svg/i.test(n)) score += 18;
  const year = n.match(/\b(20\d{2})\b/);
  if (year) score += Number(year[1]) - 2000;
  if (/\bhd\b/.test(n) && !/logo/.test(n)) score -= 4;
  if (/\.jpg|\.jpeg|\.png/.test(n) && /logo/.test(n)) score += 2;
  return score;
}

function pageImageLooksLikeLogo(urls) {
  const hay = String(urls || '').toLowerCase();
  if (/logo|wordmark|brand/.test(hay)) return true;
  if (/night.sky|clouds|nebula|earth-moon|commons|appearance of sky/.test(hay)) return false;
  return false;
}

function yearFromFilename(fileTitle) {
  const m = String(fileTitle || '').match(/\b(20\d{2})\b/);
  return m ? Number(m[1]) : 0;
}

function logoUrlLooksValid(url) {
  const hay = String(url || '').toLowerCase();
  if (!hay) return false;
  if (/wikiquote|commons-logo|question_book|ambox|night.sky|nebula/.test(hay)) return false;
  return true;
}

function pickLogoFileFromImages(images) {
  const ranked = (images || [])
    .map((img) => img && img.title)
    .filter(Boolean)
    .map((title) => ({ title, score: scoreLogoFilename(title) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (Math.abs(scoreDiff) <= 20) {
        return yearFromFilename(b.title) - yearFromFilename(a.title);
      }
      return scoreDiff;
    });
  return ranked[0] && ranked[0].title;
}

function buildLogoQueries(customerName, country) {
  const base = String(customerName || '').trim();
  if (!base) return [];
  const countryNorm = String(country || '').trim().toLowerCase();
  if (countryNorm === 'united kingdom' || countryNorm === 'uk') {
    return [...new Set([`${base} UK`, base, `${base} (company)`])];
  }
  return [...new Set([base, `${base} (company)`])];
}

async function queryPageByTitle(title) {
  const api = new URL('https://en.wikipedia.org/w/api.php');
  api.searchParams.set('action', 'query');
  api.searchParams.set('format', 'json');
  api.searchParams.set('titles', title);
  api.searchParams.set('prop', 'pageimages|images|info');
  api.searchParams.set('inprop', 'url');
  api.searchParams.set('piprop', 'thumbnail|original');
  api.searchParams.set('pithumbsize', '500');
  api.searchParams.set('imlimit', '50');

  const data = await fetchJson(api.toString());
  const pages = data.query && data.query.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  if (!page || page.pageid == null || page.missing !== undefined) return null;
  return page;
}

async function searchPageByQuery(query) {
  const api = new URL('https://en.wikipedia.org/w/api.php');
  api.searchParams.set('action', 'query');
  api.searchParams.set('format', 'json');
  api.searchParams.set('generator', 'search');
  api.searchParams.set('gsrsearch', query);
  api.searchParams.set('gsrlimit', '1');
  api.searchParams.set('prop', 'pageimages|images|info');
  api.searchParams.set('inprop', 'url');
  api.searchParams.set('piprop', 'thumbnail|original');
  api.searchParams.set('pithumbsize', '500');
  api.searchParams.set('imlimit', '50');

  const data = await fetchJson(api.toString());
  const pages = data.query && data.query.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  if (!page || page.pageid == null) return null;
  return page;
}

async function resolveFileToImageUrls(fileTitle) {
  const api = new URL('https://en.wikipedia.org/w/api.php');
  api.searchParams.set('action', 'query');
  api.searchParams.set('format', 'json');
  api.searchParams.set('titles', fileTitle);
  api.searchParams.set('prop', 'imageinfo');
  api.searchParams.set('iiprop', 'url|mime');
  api.searchParams.set('iiurlwidth', '500');

  const data = await fetchJson(api.toString());
  const page = Object.values((data.query && data.query.pages) || {})[0];
  const info = page && page.imageinfo && page.imageinfo[0];
  if (!info) return null;
  return {
    thumbnailUrl: info.thumburl || info.url,
    originalUrl: info.url,
    imageFile: fileTitle,
  };
}

async function wikidataEntityLogo(entityId) {
  const api = new URL('https://www.wikidata.org/w/api.php');
  api.searchParams.set('action', 'wbgetentities');
  api.searchParams.set('format', 'json');
  api.searchParams.set('ids', entityId);
  api.searchParams.set('props', 'claims|labels');

  const data = await fetchJson(api.toString());
  const entity = data.entities && data.entities[entityId];
  const p154 = entity && entity.claims && entity.claims.P154;
  const filename = p154 && p154[0] && p154[0].mainsnak && p154[0].mainsnak.datavalue
    && p154[0].mainsnak.datavalue.value;
  if (!filename) return null;
  const fileTitle = filename.startsWith('File:') ? filename : `File:${filename}`;
  const urls = await resolveFileToImageUrls(fileTitle);
  if (!urls) return null;
  const label = entity.labels && entity.labels.en && entity.labels.en.value;
  return {
    title: label || entityId,
    pageUrl: `https://www.wikidata.org/wiki/${entityId}`,
    ...urls,
    source: 'wikidata-p154',
  };
}

async function wikidataLogoFromTitle(enwikiTitle) {
  const api = new URL('https://www.wikidata.org/w/api.php');
  api.searchParams.set('action', 'wbgetentities');
  api.searchParams.set('format', 'json');
  api.searchParams.set('sites', 'enwiki');
  api.searchParams.set('titles', String(enwikiTitle).replace(/ /g, '_'));
  api.searchParams.set('props', 'claims');

  const data = await fetchJson(api.toString());
  const entity = Object.values(data.entities || {}).find((e) => e && e.claims);
  const p154 = entity && entity.claims && entity.claims.P154;
  const filename = p154 && p154[0] && p154[0].mainsnak && p154[0].mainsnak.datavalue
    && p154[0].mainsnak.datavalue.value;
  if (!filename) return null;
  const fileTitle = filename.startsWith('File:') ? filename : `File:${filename}`;
  const urls = await resolveFileToImageUrls(fileTitle);
  if (!urls) return null;
  return {
    title: enwikiTitle,
    pageUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(enwikiTitle).replace(/ /g, '_'))}`,
    ...urls,
    source: 'wikidata-p154',
  };
}

function pageToLogoResult(page, source) {
  const pageUrl = page.fullurl
    || `https://en.wikipedia.org/wiki/${encodeURIComponent(String(page.title).replace(/ /g, '_'))}`;

  const thumb = page.thumbnail && page.thumbnail.source;
  const original = page.original && page.original.source;
  if (thumb && pageImageLooksLikeLogo(`${thumb} ${original || ''}`)) {
    return {
      title: page.title,
      pageUrl,
      thumbnailUrl: thumb,
      originalUrl: original || thumb,
      source: source || 'wikipedia-pageimage',
    };
  }

  const logoFile = pickLogoFileFromImages(page.images);
  if (logoFile) {
    return resolveFileToImageUrls(logoFile).then((urls) => {
      if (!urls) return null;
      return {
        title: page.title,
        pageUrl,
        thumbnailUrl: urls.thumbnailUrl,
        originalUrl: urls.originalUrl,
        imageFile: urls.imageFile,
        source: 'wikipedia-file',
      };
    });
  }

  if (thumb && !page.images) {
    return {
      title: page.title,
      pageUrl,
      thumbnailUrl: thumb,
      originalUrl: original || thumb,
      source: source || 'wikipedia-pageimage-fallback',
    };
  }

  return null;
}

/**
 * @param {string} query
 * @param {{ country?: string }} opts
 */
async function searchWikipediaPage(query, opts = {}) {
  const queries = buildLogoQueries(query, opts.country);
  if (!queries.length) return null;

  for (const q of queries) {
    const page = await queryPageByTitle(q);
    if (!page) continue;
    const result = await pageToLogoResult(page, 'wikipedia-title');
    if (result && logoUrlLooksValid(result.thumbnailUrl)) return result;
    const wd = await wikidataLogoFromTitle(page.title);
    if (wd && logoUrlLooksValid(wd.thumbnailUrl)) return wd;
  }

  const searchPage = await searchPageByQuery(query);
  if (searchPage) {
    const result = await pageToLogoResult(searchPage, 'wikipedia-search');
    if (result && logoUrlLooksValid(result.thumbnailUrl)) return result;
    const wd = await wikidataLogoFromTitle(searchPage.title);
    if (wd && logoUrlLooksValid(wd.thumbnailUrl)) return wd;
  }

  return null;
}

/**
 * Search Wikidata by label and resolve P154 (logo image) when Wikipedia lookup fails.
 * @param {string} query
 */
async function searchWikidataLogoByName(query) {
  const q = String(query || '').trim();
  if (!q) return null;

  const api = new URL('https://www.wikidata.org/w/api.php');
  api.searchParams.set('action', 'wbsearchentities');
  api.searchParams.set('format', 'json');
  api.searchParams.set('language', 'en');
  api.searchParams.set('search', q);
  api.searchParams.set('limit', '8');

  const data = await fetchJson(api.toString());
  const hits = data.search || [];
  const ranked = hits
    .map((item) => {
      const label = String(item.label || '').toLowerCase();
      let score = 0;
      if (label === q.toLowerCase()) score += 30;
      if (label.startsWith(q.toLowerCase())) score += 12;
      if (/company|corporation|brand|news|media|group|plc|ltd|inc/.test(String(item.description || '').toLowerCase())) score += 8;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score);

  for (const { item } of ranked) {
    if (!item || !item.id) continue;
    const logo = await wikidataEntityLogo(item.id);
    if (logo && logoUrlLooksValid(logo.thumbnailUrl)) return logo;
  }
  return null;
}

async function signedUrlFor(path) {
  const [url] = await getBucket().file(path).getSignedUrl({
    action: 'read',
    expires: Date.now() + SIGNED_URL_EXPIRY_MS,
    version: 'v4',
  });
  return url;
}

/**
 * @param {string} customerName
 * @param {{ sandbox?: string, scrapeId?: string, persist?: boolean, country?: string }} opts
 */
async function fetchCustomerLogo(customerName, opts = {}) {
  const query = String(customerName || '').trim();
  if (!query) return null;

  const wiki = await searchWikipediaPage(query, { country: opts.country });
  if (!wiki || !wiki.thumbnailUrl) return null;

  let url = wiki.thumbnailUrl;
  let storedPath = null;
  let signedUrlExpiresAt = null;

  if (opts.persist !== false && opts.sandbox && opts.scrapeId) {
    try {
      const imgRes = await fetch(wiki.thumbnailUrl, { headers: { 'User-Agent': USER_AGENT } });
      if (imgRes.ok) {
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const ct = (imgRes.headers.get('content-type') || 'image/png').split(';')[0].trim();
        const ext = ct.includes('png') ? 'png' : ct.includes('svg') ? 'svg' : 'jpg';
        storedPath = `scrapes/${safeSlug(opts.sandbox)}/${safeSlug(opts.scrapeId)}/customer-logo.${ext}`;
        await getBucket().file(storedPath).save(buf, {
          contentType: ct,
          resumable: false,
          metadata: { cacheControl: 'private, max-age=3600' },
        });
        const signed = await signedUrlFor(storedPath);
        signedUrlExpiresAt = new Date(Date.now() + SIGNED_URL_EXPIRY_MS).toISOString();
        url = signed;
      }
    } catch (e) {
      console.warn('[brandScraperWikipediaLogo] GCS store failed — using Wikipedia URL', String((e && e.message) || e));
      url = wiki.thumbnailUrl;
    }
  }

  return {
    source: wiki.source || 'wikipedia',
    query,
    wikipediaTitle: wiki.title,
    wikipediaUrl: wiki.pageUrl,
    thumbnailUrl: wiki.thumbnailUrl,
    originalUrl: wiki.originalUrl,
    imageFile: wiki.imageFile || null,
    url,
    storedPath,
    signedUrlExpiresAt,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = {
  scoreLogoFilename,
  pickLogoFileFromImages,
  buildLogoQueries,
  searchWikipediaPage,
  searchWikidataLogoByName,
  fetchCustomerLogo,
};
