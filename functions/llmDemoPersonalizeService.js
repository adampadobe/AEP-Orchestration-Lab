/**
 * LLM Demo — crawl customer site + grounded research for brand/competitors/config.
 * POST /api/llm-demo/personalize { url }
 */
'use strict';

const brandScraperService = require('./brandScraperService');
const { callGemini, callGeminiResearch, stripJsonFences } = require('./vertexClient');

const SKY_COMPETITORS = ['Virgin Media', 'BT', 'TalkTalk', 'Netflix', 'Disney+'];

/** Paths used in the frozen Sky snapshot (opportunities / URL tables). */
const SKY_DEMO_PATHS = [
  '/content/status',
  '/help/server-status',
  '/tv/sky-glass',
  '/tv/sky-glass/packages',
  '/tv/sky-stream',
  '/broadband/deals',
  '/broadband/full-fibre',
  '/tv/sports',
  '/tv/cinema',
  '/shop/tv',
  '/help/home',
  '/help/broadband',
];

const RESEARCH_SYSTEM = `You research brands for an Adobe LLM Optimizer sales demo.
Use Google Search grounding to find real, current competitors in the same market and country as the target brand.

Respond in markdown with exactly these sections (headings must match):

## BRAND
Official consumer-facing brand name (not legal entity unless that is what customers know).

## COMPETITORS
Bullet list of exactly 6 direct competitors (real company/brand names, same industry and region).

## INDUSTRY
One short industry label (e.g. Telecommunications, Retail banking, Airlines).

## ABOUT
Two sentences describing what the brand offers.

## PATHS
Bullet list of 8–12 realistic URL paths on the brand's own website (path only, starting with /) that would appear in an SEO or agentic-traffic audit — product, help, status, or content pages. Use paths plausible for this brand; do not invent sky.com paths.`;

const JSON_SYSTEM = `You convert brand research into JSON for a demo UI. Respond with valid JSON only:
{
  "brand": "string",
  "siteHost": "hostname without www",
  "competitors": ["six strings"],
  "industry": "string",
  "about": "string",
  "samplePaths": ["8-12 paths starting with /"]
}`;

function normaliseUrl(raw) {
  const v = String(raw || '').trim();
  if (!v) throw new Error('url is required');
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  const u = new URL(withScheme);
  u.hash = '';
  return u.toString().replace(/\/$/, '');
}

function hostFromUrl(url) {
  return new URL(url).hostname.replace(/^www\./i, '');
}

function buildAxisMap(brand, competitors) {
  const c = competitors || [];
  return {
    Adobe: brand,
    WKND: c[0] || brand,
    Automattic: c[1] || brand,
    Contentful: c[2] || brand,
    Global: c[0] || brand,
    AEM: c[5] || brand,
    Wix: c[2] || brand,
    Webflow: c[0] || brand,
    Frescopa: brand,
    'Sweet Maria\u2019s': c[1] || brand,
    Cropster: c[2] || brand,
    Agtron: c[0] || brand,
  };
}

function parseSection(raw, heading) {
  const text = String(raw || '');
  const re = new RegExp(
    `(?:^|\\n)\\s*#+\\s*${heading}\\s*\\n([\\s\\S]*?)(?=\\n\\s*#+\\s*[A-Z_]|$)`,
    'i',
  );
  const m = re.exec(text);
  return m && m[1] ? m[1].trim() : '';
}

function bulletsToList(section) {
  return String(section || '')
    .split('\n')
    .map((line) => line.replace(/^[\s*-•]+/, '').trim())
    .filter(Boolean);
}

function pathsFromCrawl(pages, siteHost, limit) {
  const out = [];
  const seen = new Set();
  for (const p of pages || []) {
    try {
      const u = new URL(p.url);
      if (u.hostname.replace(/^www\./i, '') !== siteHost) continue;
      const path = u.pathname || '/';
      if (path === '/' || seen.has(path)) continue;
      seen.add(path);
      out.push(path);
      if (out.length >= limit) break;
    } catch (_e) {
      /* skip */
    }
  }
  return out;
}

function sampleUrls(siteUrl, paths) {
  const origin = String(siteUrl || '').replace(/\/$/, '');
  return (paths || [])
    .map((p) => {
      const path = String(p || '').trim();
      if (!path) return '';
      return origin + (path.startsWith('/') ? path : `/${path}`);
    })
    .filter(Boolean);
}

function buildClientConfig({
  sourceUrl,
  siteUrl,
  siteHost,
  brand,
  competitors,
  industry,
  about,
  samplePaths,
  researchUsed,
  crawlPages,
}) {
  const comps = (competitors || []).slice(0, 6);
  while (comps.length < 6) comps.push(SKY_COMPETITORS[comps.length] || `Competitor ${comps.length + 1}`);
  const paths = (samplePaths || []).slice(0, 12);
  const urls = sampleUrls(siteUrl, paths);
  const urlReplacements = [];
  SKY_DEMO_PATHS.forEach((skyPath, i) => {
    const to = urls[i % urls.length] || `${siteUrl}${skyPath}`;
    urlReplacements.push({
      from: `https://sky.com${skyPath}`,
      fromWww: `https://www.sky.com${skyPath}`,
      to,
    });
  });
  return {
    siteUrl,
    siteHost,
    brand,
    brandPickerLabel: brand,
    competitors: comps,
    industry: industry || '',
    about: about || '',
    axisMap: buildAxisMap(brand, comps),
    samplePaths: paths,
    sampleUrls: urls,
    urlReplacements,
    sourceUrl,
    researchUsed: !!researchUsed,
    crawlPages: crawlPages || 0,
    updatedAt: Date.now(),
  };
}

function mergeParsedJson(parsed, fallback) {
  const brand = String(parsed.brand || fallback.brand || '').trim() || fallback.brand;
  const siteHost = String(parsed.siteHost || fallback.siteHost || '').trim() || fallback.siteHost;
  let competitors = Array.isArray(parsed.competitors) ? parsed.competitors.map(String).filter(Boolean) : [];
  if (competitors.length < 4) competitors = fallback.competitors;
  const samplePaths = Array.isArray(parsed.samplePaths)
    ? parsed.samplePaths.map((p) => String(p).trim()).filter((p) => p.startsWith('/'))
    : fallback.samplePaths;
  return {
    brand,
    siteHost,
    competitors: competitors.slice(0, 6),
    industry: String(parsed.industry || fallback.industry || '').trim(),
    about: String(parsed.about || fallback.about || '').trim(),
    samplePaths: samplePaths.length ? samplePaths : fallback.samplePaths,
  };
}

async function researchBrand({ url, siteHost, brandName, crawlText }) {
  const userPrompt = [
    `Target website: ${url}`,
    `Hostname: ${siteHost}`,
    `Working brand name from crawl: ${brandName}`,
    '',
    'Crawled page snippets:',
    String(crawlText || '').slice(0, 6000),
  ].join('\n');

  const raw = await callGeminiResearch(RESEARCH_SYSTEM, userPrompt, {
    maxOutputTokens: 3072,
    temperature: 0.35,
    retryOn429: true,
    retryOn429Attempts: 1,
    retryOn429DelayMs: 15000,
  });

  const brandSec = parseSection(raw, 'BRAND');
  const compSec = parseSection(raw, 'COMPETITORS');
  const industry = parseSection(raw, 'INDUSTRY').split('\n')[0] || '';
  const about = parseSection(raw, 'ABOUT').replace(/\n+/g, ' ').trim();
  const pathBullets = bulletsToList(parseSection(raw, 'PATHS'));

  const competitors = bulletsToList(compSec).slice(0, 6);
  const brand = brandSec.split('\n')[0].trim() || brandName;

  return {
    raw,
    brand,
    competitors,
    industry,
    about,
    samplePaths: pathBullets,
  };
}

async function structureConfig(research, crawlFallback) {
  const userPrompt = JSON.stringify(
    {
      researchMarkdown: String(research.raw || '').slice(0, 8000),
      crawlFallback,
    },
    null,
    2,
  );
  const raw = await callGemini(JSON_SYSTEM, userPrompt, {
    model: 'gemini-2.5-flash',
    temperature: 0.1,
    maxOutputTokens: 2048,
    jsonMode: true,
    allowTruncation: true,
  });
  let parsed = {};
  try {
    parsed = JSON.parse(stripJsonFences(raw));
  } catch (_e) {
    parsed = {};
  }
  return mergeParsedJson(parsed, crawlFallback);
}

async function personalizeUrl(rawUrl) {
  const url = normaliseUrl(rawUrl);
  const siteHost = hostFromUrl(url);
  const siteUrl = new URL(url).origin;

  let crawl = null;
  try {
    crawl = await brandScraperService.crawlSite(url, {
      maxPages: 3,
      tagAudit: false,
      maxWallMs: 45000,
    });
  } catch (e) {
    crawl = { pages: [], brandName: '', failures: [{ error: String(e && e.message || e) }] };
  }

  const crawlBrand = (crawl && crawl.brandName) || '';
  const crawlText = (crawl && crawl.pages || [])
    .map((p) => `${p.url}\n${(p.title || '')}\n${(p.description || '')}\n${(p.text || '').slice(0, 500)}`)
    .join('\n\n---\n\n');

  const pathFallback = pathsFromCrawl(crawl && crawl.pages, siteHost, 12);
  const hostBrand = siteHost.split('.')[0];
  const brandFallback =
    crawlBrand ||
    (hostBrand ? hostBrand.charAt(0).toUpperCase() + hostBrand.slice(1) : 'Brand');

  const crawlFallback = {
    brand: brandFallback,
    siteHost,
    competitors: SKY_COMPETITORS.slice(),
    industry: '',
    about: (crawl && crawl.pages && crawl.pages[0] && crawl.pages[0].description) || '',
    samplePaths: pathFallback.length ? pathFallback : ['/', '/about', '/products', '/help', '/contact'],
  };

  let research = null;
  let structured = crawlFallback;
  let researchUsed = false;
  try {
    research = await researchBrand({
      url,
      siteHost,
      brandName: brandFallback,
      crawlText,
    });
    researchUsed = true;
    structured = await structureConfig(research, {
      brand: research.brand || brandFallback,
      siteHost,
      competitors: research.competitors.length ? research.competitors : crawlFallback.competitors,
      industry: research.industry,
      about: research.about || crawlFallback.about,
      samplePaths: research.samplePaths.length ? research.samplePaths : crawlFallback.samplePaths,
    });
  } catch (e) {
    console.warn('[llmDemoPersonalize] research failed, using crawl fallback', String(e && e.message || e));
    structured = crawlFallback;
  }

  const config = buildClientConfig({
    sourceUrl: url,
    siteUrl,
    siteHost: structured.siteHost || siteHost,
    brand: structured.brand,
    competitors: structured.competitors,
    industry: structured.industry,
    about: structured.about,
    samplePaths: structured.samplePaths,
    researchUsed,
    crawlPages: (crawl && crawl.pages && crawl.pages.length) || 0,
  });

  return {
    ok: true,
    config,
    meta: {
      crawlPages: config.crawlPages,
      researchUsed: config.researchUsed,
      crawlFailures: (crawl && crawl.failures && crawl.failures.length) || 0,
    },
  };
}

async function handlePersonalize(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const url = body.url;
  if (!url) {
    res.status(400).json({ error: 'url is required' });
    return;
  }

  try {
    const out = await personalizeUrl(url);
    if (body.brandOverride && out.config) {
      out.config.brand = String(body.brandOverride).trim();
      out.config.axisMap = buildAxisMap(out.config.brand, out.config.competitors);
    }
    res.status(200).json(out);
  } catch (e) {
    const msg = String((e && e.message) || e);
    console.error('[llmDemoPersonalize]', msg);
    res.status(500).json({ error: msg });
  }
}

module.exports = {
  handlePersonalize,
  personalizeUrl,
  buildAxisMap,
  buildClientConfig,
};
