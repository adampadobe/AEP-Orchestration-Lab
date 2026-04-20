/**
 * Brand Scraper — first-slice port of aep-prototypes/brandscrape-studio.
 * Vertical: fetch-based crawler (no Playwright yet) + Anthropic brand analysis.
 * Intentionally dependency-free (no cheerio, no SDK) — regex-level HTML parsing is
 * good enough for the public pages we target here, and keeps the function lean.
 */
'use strict';

const brandScrapeStore = require('./brandScrapeStore');

const USER_AGENT = 'Mozilla/5.0 (compatible; AEPOrchestrationLab-BrandScraper/1.0; +https://aep-orchestration-lab.web.app)';
const REQUEST_TIMEOUT_MS = 10000;
const MAX_PAGES = 5;
const MAX_DISCOVERED = 200;
const PRIORITY_PATHS = ['/', '/about', '/about-us', '/products', '/services', '/solutions', '/brand', '/company'];

function normaliseUrl(raw) {
  const v = String(raw || '').trim();
  if (!v) throw new Error('URL is required');
  const withScheme = /^https?:\/\//i.test(v) ? v : 'https://' + v;
  const u = new URL(withScheme);
  u.hash = '';
  return u.toString().replace(/\/$/, '');
}

function getBaseDomain(url) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  return parts.slice(-2).join('.');
}

function sameSite(a, b) {
  try { return getBaseDomain(a) === getBaseDomain(b); }
  catch (_e) { return false; }
}

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    });
    const body = resp.ok ? await resp.text() : '';
    return { status: resp.status, body };
  } catch (_e) {
    return { status: 0, body: '' };
  } finally {
    clearTimeout(timer);
  }
}

/** Strip scripts/styles and collapse whitespace to extract readable text. */
function extractText(html) {
  if (!html) return '';
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?(header|footer|nav)[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  return cleaned.replace(/\s+/g, ' ').trim();
}

function extractTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html || '');
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

function extractMeta(html, attrName, attrValue) {
  const re = new RegExp(
    '<meta[^>]*' + attrName + '=["\']' + attrValue + '["\'][^>]*>',
    'i'
  );
  const tag = re.exec(html || '');
  if (!tag) return '';
  const content = /content=["']([^"']*)["']/i.exec(tag[0]);
  return content ? content[1].trim() : '';
}

function extractBrandName(html, url) {
  const ogSite = extractMeta(html, 'property', 'og:site_name');
  if (ogSite) return ogSite;
  const title = extractTitle(html);
  if (title) {
    for (const sep of [' | ', ' - ', ' – ', ' — ', ' : ', ' · ']) {
      if (title.includes(sep)) {
        const parts = title.split(sep).map(s => s.trim()).filter(Boolean);
        if (parts.length) return parts.reduce((a, b) => (a.length <= b.length ? a : b));
      }
    }
    return title;
  }
  const host = new URL(url).hostname.replace(/^www\./, '').split('.')[0];
  return host.charAt(0).toUpperCase() + host.slice(1);
}

function extractLinks(html, pageUrl, baseUrl) {
  if (!html) return [];
  const out = new Set();
  const re = /<a\s[^>]*href=["']([^"'#]+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const abs = new URL(m[1], pageUrl).toString().replace(/\/$/, '');
      if (sameSite(abs, baseUrl)) out.add(abs);
    } catch (_e) { /* ignore */ }
    if (out.size > 200) break;
  }
  return Array.from(out);
}

function prioritise(urls, baseUrl) {
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

async function crawlSite(rawUrl, { maxPages = MAX_PAGES } = {}) {
  const baseUrl = normaliseUrl(rawUrl);
  const visited = new Set();
  const discovered = new Set([baseUrl]);
  const queue = [baseUrl];
  const pages = [];
  let brandName = '';

  while (queue.length && pages.length < maxPages) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    const { body: html, status } = await fetchWithTimeout(current);
    if (!html) continue;

    const text = extractText(html);
    if (!brandName) brandName = extractBrandName(html, baseUrl);

    const description = extractMeta(html, 'name', 'description') || extractMeta(html, 'property', 'og:description');
    const links = extractLinks(html, current, baseUrl);
    for (const l of links) {
      if (discovered.size < MAX_DISCOVERED) discovered.add(l);
      if (!visited.has(l) && !queue.includes(l)) queue.push(l);
    }
    // Re-prioritise queue after every page so priority paths bubble up
    queue.splice(0, queue.length, ...prioritise(queue, baseUrl));

    pages.push({
      url: current,
      status,
      title: extractTitle(html),
      description,
      textLength: text.length,
      text: text.slice(0, 8000),
    });
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
  };
}

const BRAND_ANALYSIS_SYSTEM = `You are a brand strategist and marketing expert. Analyse the provided website content and generate concise brand guidelines.

Respond with valid JSON only, no other text. Use this exact structure:
{
  "about": "2-3 sentence brand description",
  "tone_of_voice": [{"rule": "...", "example": "..."}],
  "brand_values": [{"value": "...", "description": "..."}],
  "editorial_guidelines": [{"rule": "...", "example": "..."}],
  "image_guidelines": [{"rule": "...", "example": "..."}],
  "channel_guidelines": [{"channel": "Email|SMS|Push|In-App", "subject_line": "...", "preheader": "...", "headline": "...", "body": "...", "cta": "..."}]
}

Provide 5-8 tone rules, 3-5 values, 5-8 editorial rules, 4-6 image rules, and 4 channels (Email, SMS, Push, In-App).`;

async function callAnthropic(apiKey, systemPrompt, userPrompt) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    const msg = (data && data.error && data.error.message) || resp.statusText;
    throw new Error(`Anthropic ${resp.status}: ${msg}`);
  }
  const text = (data.content || []).map(b => b.text || '').join('').trim();
  return text;
}

let vertexClientCache;
function getVertexClient() {
  if (!vertexClientCache) {
    // Lazy require so the SDK only loads when Gemini is actually used.
    const { VertexAI } = require('@google-cloud/vertexai');
    const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'aep-orchestration-lab';
    const location = process.env.VERTEX_LOCATION || 'us-central1';
    vertexClientCache = new VertexAI({ project, location });
  }
  return vertexClientCache;
}

async function callGemini(systemPrompt, userPrompt) {
  const client = getVertexClient();
  const modelName = process.env.VERTEX_GEMINI_MODEL || 'gemini-2.5-flash';
  const model = client.getGenerativeModel({
    model: modelName,
    systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
  });
  const resp = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
  });
  const candidates = resp && resp.response && resp.response.candidates;
  if (!candidates || !candidates.length) throw new Error('Gemini returned no candidates');
  const parts = (candidates[0].content && candidates[0].content.parts) || [];
  return parts.map(p => p.text || '').join('').trim();
}

function stripJsonFences(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  return (fenced ? fenced[1] : text).trim();
}

async function analyseBrand(crawl, { provider, anthropicKey } = {}) {
  const chosen = (provider || process.env.BRAND_SCRAPER_PROVIDER || 'gemini').toLowerCase();

  const combinedText = crawl.pages.map(p =>
    `URL: ${p.url}\nTitle: ${p.title}\nDescription: ${p.description}\n\n${p.text}`
  ).join('\n\n---\n\n').slice(0, 15000);

  const userPrompt = `Analyse this brand and generate brand guidelines.\n\nBrand: ${crawl.brandName}\nWebsite URL: ${crawl.baseUrl}\n\nWebsite Content:\n${combinedText}`;

  let raw;
  let usedProvider;
  try {
    if (chosen === 'anthropic') {
      if (!anthropicKey) return { skipped: true, reason: 'ANTHROPIC_API_KEY not configured' };
      raw = await callAnthropic(anthropicKey, BRAND_ANALYSIS_SYSTEM, userPrompt);
      usedProvider = 'anthropic';
    } else {
      raw = await callGemini(BRAND_ANALYSIS_SYSTEM, userPrompt);
      usedProvider = 'gemini';
    }
  } catch (e) {
    return { error: `${chosen} provider failed: ${String(e && e.message || e)}` };
  }

  try {
    const parsed = JSON.parse(stripJsonFences(raw));
    return { provider: usedProvider, ...parsed };
  } catch (_e) {
    return { provider: usedProvider, error: 'Model response was not valid JSON', raw: raw.slice(0, 4000) };
  }
}

function resolveSandbox(req) {
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const fromBody = String(body.sandbox || '').trim();
  if (fromBody) return fromBody;
  const fromQuery = String((req.query && req.query.sandbox) || '').trim();
  return fromQuery;
}

async function handleAnalyse(req, res, { anthropicKey }) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const url = body.url;
  if (!url) { res.status(400).json({ error: 'url is required' }); return; }

  const sandbox = resolveSandbox(req);
  if (!sandbox) { res.status(400).json({ error: 'sandbox is required' }); return; }

  const started = Date.now();
  try {
    const crawl = await crawlSite(url);
    if (!crawl.pages.length) {
      res.status(502).json({ error: 'Could not fetch any pages from ' + url });
      return;
    }
    let analysis = null;
    let analysisError = null;
    try {
      const providerPref = (body.provider || '').toString().toLowerCase();
      analysis = await analyseBrand(crawl, { provider: providerPref, anthropicKey });
    } catch (e) {
      analysisError = String(e && e.message || e);
    }
    const crawlSummary = {
      pagesScraped: crawl.pages.length,
      totalDiscovered: crawl.totalDiscovered,
      pages: crawl.pages.map(p => ({
        url: p.url, title: p.title, description: p.description, textLength: p.textLength, status: p.status,
      })),
    };
    const elapsedMs = Date.now() - started;

    let saved = null;
    try {
      saved = await brandScrapeStore.saveScrape(sandbox, {
        url,
        baseUrl: crawl.baseUrl,
        brandName: crawl.brandName,
        businessType: body.businessType || 'b2c',
        country: body.country || '',
        crawlSummary,
        analysis,
        analysisError,
        elapsedMs,
      });
    } catch (e) {
      // Non-fatal — still return result to the client.
      analysisError = analysisError || ('Persist failed: ' + String(e && e.message || e));
    }

    res.status(200).json({
      scrapeId: saved && saved.scrapeId,
      sandbox,
      brandName: crawl.brandName,
      baseUrl: crawl.baseUrl,
      businessType: body.businessType || 'b2c',
      country: body.country || '',
      crawl: crawlSummary,
      analysis,
      analysisError,
      elapsedMs,
    });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
}

async function handleScrapes(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const sandbox = resolveSandbox(req);
  if (!sandbox) { res.status(400).json({ error: 'sandbox is required' }); return; }

  // Route by path: /api/brand-scraper/scrapes | /api/brand-scraper/scrapes/:id
  const path = String(req.path || '').replace(/\/+$/, '');
  const m = /\/scrapes(?:\/([^/]+))?$/.exec(path);
  const scrapeId = m && m[1] ? decodeURIComponent(m[1]) : '';

  try {
    if (req.method === 'GET' && !scrapeId) {
      const items = await brandScrapeStore.listScrapes(sandbox);
      res.status(200).json({ sandbox, items });
      return;
    }
    if (req.method === 'GET' && scrapeId) {
      const record = await brandScrapeStore.getScrape(sandbox, scrapeId);
      if (!record) { res.status(404).json({ error: 'not found' }); return; }
      res.status(200).json(record);
      return;
    }
    if (req.method === 'DELETE' && scrapeId) {
      const ok = await brandScrapeStore.deleteScrape(sandbox, scrapeId);
      if (!ok) { res.status(404).json({ error: 'not found' }); return; }
      res.status(200).json({ ok: true });
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
}

module.exports = { crawlSite, analyseBrand, handleAnalyse, handleScrapes };
