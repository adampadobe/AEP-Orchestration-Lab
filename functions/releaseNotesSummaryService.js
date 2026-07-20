'use strict';

const admin = require('firebase-admin');
const fallbackCatalog = require('./assets/release-notes-fallback.json');
const {
  parseAepPeriod,
  periodToId,
  periodToAjoPrefix,
  parseAepCdpProduct,
  parseAjoSectionProduct,
  parseAjoAggregateProduct,
  parseCjaProduct,
  parseBrandConciergeProduct,
  parseTargetProduct,
  parseCampaignProduct,
} = require('./releaseNotesMarkdownParser');

const CACHE_COLLECTION = 'releaseNotesSummaryCache';
const CACHE_DOC_ID = 'current';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;
const USER_AGENT = 'AEP-Orchestration-Lab/1.0 (+https://aep-orchestration-lab.web.app)';

const SOURCE_URLS = {
  aep: {
    raw:
      'https://raw.githubusercontent.com/AdobeDocs/experience-platform.en/main/help/release-notes/latest/latest.md',
    experienceLeague:
      'https://experienceleague.adobe.com/en/docs/experience-platform/release-notes/latest',
  },
  ajo: {
    raw:
      'https://raw.githubusercontent.com/AdobeDocs/journey-optimizer.en/main/help/using/rn/release-notes.md',
    experienceLeague:
      'https://experienceleague.adobe.com/en/docs/journey-optimizer/using/whats-new/release-notes',
  },
  cja: {
    raw:
      'https://raw.githubusercontent.com/AdobeDocs/analytics-platform.en/main/help/release-notes/latest.md',
    experienceLeague:
      'https://experienceleague.adobe.com/en/docs/analytics-platform/using/releases/latest',
  },
  campaign: {
    raw:
      'https://raw.githubusercontent.com/AdobeDocs/campaign-web.en/main/help/v8/rn/release-notes.md',
    experienceLeague:
      'https://experienceleague.adobe.com/en/docs/campaign-web/v8/release-notes/whats-new',
  },
  brandConcierge: {
    raw:
      'https://raw.githubusercontent.com/AdobeDocs/brand-concierge.en/main/help/release-notes/current.md',
    experienceLeague:
      'https://experienceleague.adobe.com/en/docs/brand-concierge/content/release-notes/current',
  },
  target: {
    raw:
      'https://raw.githubusercontent.com/AdobeDocs/target.en/main/help/main/r-release-notes/release-notes.md',
    experienceLeague:
      'https://experienceleague.adobe.com/en/docs/target/using/release-notes/release-notes',
  },
};

let db;
function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

function getFallbackPeriod(periodId) {
  const id = periodId || fallbackCatalog.defaultPeriodId;
  const entry = fallbackCatalog.periods[id];
  if (!entry) return null;
  return {
    period: entry.period,
    fetchedAt: entry.fetchedAt,
    sourceUrl: entry.sourceUrl,
    periodId: entry.id,
    products: entry.products,
    source: 'fallback',
  };
}

async function fetchMarkdown(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        Accept: 'text/plain, text/markdown, text/html, */*',
        'User-Agent': USER_AGENT,
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return res.text();
  } finally {
    clearTimeout(timer);
  }
}

function mergeProduct(liveProduct, fallbackProduct) {
  if (!liveProduct) return fallbackProduct || null;
  if (!fallbackProduct) return liveProduct;
  const hasLiveItems = (liveProduct.highlights || []).length > 0
    || (liveProduct.sections || []).some((sec) => (sec.items || []).length > 0);
  if (hasLiveItems) return liveProduct;
  return {
    ...fallbackProduct,
    releaseNotesUrl: liveProduct.releaseNotesUrl || fallbackProduct.releaseNotesUrl,
  };
}

function buildLiveProducts(docs, period, ajoPrefix) {
  const ajoUrl = SOURCE_URLS.ajo.experienceLeague;
  const ajoAnchor = ajoPrefix || 'june-26';
  const ajoMarkdown = docs.ajo || '';

  const products = {
    cdp: parseAepCdpProduct(docs.aep, SOURCE_URLS.aep.experienceLeague),
    ajoJ: parseAjoSectionProduct(ajoMarkdown, ajoAnchor, 'journeys', {
      id: 'ajoJ',
      name: 'Journey Optimizer — Journeys',
      shortName: 'AJO-J',
      releaseNotesUrl: `${ajoUrl}#${ajoAnchor}-journeys`,
      sectionTitle: 'Journeys',
    }),
    ajoC: parseAjoSectionProduct(ajoMarkdown, ajoAnchor, 'oc', {
      id: 'ajoC',
      name: 'Journey Optimizer — Orchestrated Campaigns',
      shortName: 'AJO-C',
      releaseNotesUrl: `${ajoUrl}#${ajoAnchor}-oc`,
      sectionTitle: 'Orchestrated campaigns',
    }),
    ajoDecisioning: parseAjoSectionProduct(ajoMarkdown, ajoAnchor, 'decisioning', {
      id: 'ajoDecisioning',
      name: 'Journey Optimizer — Decisioning',
      shortName: 'Decisioning',
      releaseNotesUrl: `${ajoUrl}#${ajoAnchor}-decisioning`,
      sectionTitle: 'Decisioning',
    }),
    ajo: parseAjoAggregateProduct(ajoMarkdown, ajoAnchor, ajoUrl),
    cja: docs.cja
      ? parseCjaProduct(docs.cja, SOURCE_URLS.cja.experienceLeague)
      : { id: 'cja', name: 'Customer Journey Analytics', shortName: 'CJA', releaseNotesUrl: SOURCE_URLS.cja.experienceLeague, highlights: [], sections: [] },
    campaign: docs.campaign
      ? parseCampaignProduct(docs.campaign, SOURCE_URLS.campaign.experienceLeague)
      : { id: 'campaign', name: 'Campaign v8 Web', shortName: 'Campaign', releaseNotesUrl: SOURCE_URLS.campaign.experienceLeague, highlights: [], sections: [] },
    brandConcierge: docs.brandConcierge
      ? parseBrandConciergeProduct(docs.brandConcierge, SOURCE_URLS.brandConcierge.experienceLeague)
      : { id: 'brandConcierge', name: 'Brand Concierge', shortName: 'Concierge', releaseNotesUrl: SOURCE_URLS.brandConcierge.experienceLeague, highlights: [], sections: [] },
    target: docs.target
      ? parseTargetProduct(docs.target, SOURCE_URLS.target.experienceLeague)
      : { id: 'target', name: 'Adobe Target', shortName: 'Target', releaseNotesUrl: SOURCE_URLS.target.experienceLeague, highlights: [], sections: [] },
  };

  const fallbackPeriod = getFallbackPeriod(periodToId(period));
  const fallbackProducts = fallbackPeriod ? fallbackPeriod.products : {};

  for (const productId of fallbackCatalog.productOrder) {
    const merged = mergeProduct(products[productId], fallbackProducts[productId]);
    if (merged) products[productId] = merged;
  }

  return products;
}

async function fetchLiveSummary() {
  const settled = await Promise.allSettled(
    Object.entries(SOURCE_URLS).map(async ([key, source]) => {
      const markdown = await fetchMarkdown(source.raw);
      return [key, markdown];
    }),
  );

  const docs = {};
  for (const result of settled) {
    if (result.status !== 'fulfilled') {
      console.warn('[release-notes] source fetch failed:', result.reason?.message || result.reason);
      continue;
    }
    const [key, markdown] = result.value;
    docs[key] = markdown;
  }

  if (!docs.aep) {
    throw new Error('Could not fetch Adobe Experience Platform release notes');
  }

  const period = parseAepPeriod(docs.aep);
  const ajoPrefix = periodToAjoPrefix(period);
  const products = buildLiveProducts(docs, period, ajoPrefix);

  return {
    period,
    fetchedAt: new Date().toISOString(),
    sourceUrl:
      'https://experienceleague.adobe.com/en/docs/release-notes/experience-cloud/current',
    periodId: periodToId(period),
    products,
    source: 'experience-league',
  };
}

async function readCache() {
  try {
    const snap = await getDb().collection(CACHE_COLLECTION).doc(CACHE_DOC_ID).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    if (!data.payload || !data.expiresAtMs || Date.now() > data.expiresAtMs) return null;
    return { ...data.payload, source: data.payload.source || 'cache' };
  } catch (err) {
    console.warn('[release-notes] cache read failed:', err.message || err);
    return null;
  }
}

async function writeCache(payload) {
  try {
    await getDb().collection(CACHE_COLLECTION).doc(CACHE_DOC_ID).set({
      payload,
      fetchedAtMs: Date.now(),
      expiresAtMs: Date.now() + CACHE_TTL_MS,
    });
  } catch (err) {
    console.warn('[release-notes] cache write failed:', err.message || err);
  }
}

async function resolveSummary({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = await readCache();
    if (cached) return cached;
  }

  try {
    const live = await fetchLiveSummary();
    await writeCache(live);
    return live;
  } catch (err) {
    console.warn('[release-notes] live fetch failed:', err.message || err);
    const fallback = getFallbackPeriod();
    if (fallback) return fallback;
    throw err;
  }
}

async function handleSummary(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const forceRefresh = String(req.query.refresh || '') === '1';
  try {
    const payload = await resolveSummary({ forceRefresh });
    res.set('Cache-Control', forceRefresh ? 'private, no-store' : 'public, max-age=300');
    res.status(200).json(payload);
  } catch (err) {
    res.status(502).json({
      error: 'Could not load release notes summary',
      detail: String(err.message || err),
    });
  }
}

module.exports = {
  CACHE_COLLECTION,
  CACHE_DOC_ID,
  CACHE_TTL_MS,
  SOURCE_URLS,
  fetchLiveSummary,
  resolveSummary,
  handleSummary,
  getFallbackPeriod,
};
