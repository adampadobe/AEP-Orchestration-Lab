/**
 * Brand Scraper — first-slice port of aep-prototypes/brandscrape-studio.
 * Vertical: fetch-based crawler (no Playwright yet) + Anthropic brand analysis.
 * Intentionally dependency-free (no cheerio, no SDK) — regex-level HTML parsing is
 * good enough for the public pages we target here, and keeps the function lean.
 */
'use strict';

const brandScrapeStore = require('./brandScrapeStore');
const assetsV2 = require('./brandScraperAssetsV2');
const exportKit = require('./brandScraperExport');
const modelConfigStore = require('./brandScraperModelConfigStore');

const PLAYWRIGHT_CRAWLER_URL = process.env.PLAYWRIGHT_CRAWLER_URL
  || 'https://brand-scraper-crawler-109406613852.us-central1.run.app';

async function crawlViaPlaywrightService(url, { maxPages } = {}) {
  const { GoogleAuth } = require('google-auth-library');
  const auth = new GoogleAuth();
  const client = await auth.getIdTokenClient(PLAYWRIGHT_CRAWLER_URL);
  const resp = await client.request({
    url: PLAYWRIGHT_CRAWLER_URL + '/crawl',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    data: { url, maxPages },
    timeout: 280000,
  });
  return resp.data;
}

const USER_AGENT = 'Mozilla/5.0 (compatible; AEPOrchestrationLab-BrandScraper/1.0; +https://aep-orchestration-lab.web.app)';
const REQUEST_TIMEOUT_MS = 15000;
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
    const contentType = resp.headers.get('content-type') || '';
    if (!resp.ok) {
      return { status: resp.status, body: '', contentType, reason: 'http_error', error: `HTTP ${resp.status}${resp.statusText ? ' ' + resp.statusText : ''}` };
    }
    const body = await resp.text();
    if (!body) {
      return { status: resp.status, body: '', contentType, reason: 'empty_body', error: 'empty response body' };
    }
    // Detect known bot-challenge / captcha responses
    const bodyLower = body.slice(0, 4000).toLowerCase();
    if (bodyLower.includes('cf-challenge') || bodyLower.includes('cf-turnstile') || bodyLower.includes('captcha') ||
        bodyLower.includes('just a moment...') || bodyLower.includes('checking your browser') ||
        bodyLower.includes('enable javascript and cookies to continue')) {
      return { status: resp.status, body, contentType, reason: 'bot_challenge', error: 'bot-protection challenge returned (Cloudflare / captcha)' };
    }
    // Content-type sanity
    if (contentType && !/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
      return { status: resp.status, body, contentType, reason: 'non_html', error: `non-HTML response (${contentType.split(';')[0]})` };
    }
    return { status: resp.status, body, contentType, reason: 'ok' };
  } catch (e) {
    const msg = String((e && e.message) || e);
    const aborted = e && (e.name === 'AbortError' || /aborted/i.test(msg));
    return {
      status: 0,
      body: '',
      contentType: '',
      reason: aborted ? 'timeout' : 'network',
      error: aborted ? `timeout after ${(opts.timeout || REQUEST_TIMEOUT_MS)/1000}s` : msg,
    };
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

function absoluteOrNull(href, pageUrl) {
  if (!href) return null;
  const trimmed = String(href).trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('javascript:')) return null;
  try { return new URL(trimmed, pageUrl).toString(); } catch (_e) { return null; }
}

function extractAttr(tag, name) {
  const m = new RegExp(name + '\\s*=\\s*["\']([^"\']*)["\']', 'i').exec(tag);
  return m ? m[1] : '';
}

function extractImages(html, pageUrl) {
  if (!html) return [];
  const out = [];
  const seen = new Set();
  const re = /<img\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const src = absoluteOrNull(extractAttr(tag, 'src') || extractAttr(tag, 'data-src'), pageUrl);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    out.push({
      src,
      alt: extractAttr(tag, 'alt') || '',
      width: Number(extractAttr(tag, 'width')) || null,
      height: Number(extractAttr(tag, 'height')) || null,
    });
    if (out.length >= 120) break;
  }
  return out;
}

function extractFavicons(html, pageUrl) {
  if (!html) return [];
  const out = [];
  const re = /<link\b[^>]*rel\s*=\s*["']([^"']*)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const rel = (m[1] || '').toLowerCase();
    if (!/(icon|apple-touch-icon|mask-icon|shortcut icon)/.test(rel)) continue;
    const href = absoluteOrNull(extractAttr(m[0], 'href'), pageUrl);
    if (href) out.push({ rel, href, sizes: extractAttr(m[0], 'sizes') || '' });
  }
  return out;
}

function extractOgImages(html, pageUrl) {
  if (!html) return [];
  const out = [];
  const re = /<meta\b[^>]*(?:property|name)\s*=\s*["'](og:image(?::secure_url)?|twitter:image)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = absoluteOrNull(extractAttr(m[0], 'content'), pageUrl);
    if (url) out.push(url);
  }
  return out;
}

/** Pull hex + rgb colour occurrences from inline styles and <style> blocks. */
function extractColours(html) {
  if (!html) return [];
  const out = [];
  const styleMatches = [];
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let s;
  while ((s = styleRe.exec(html)) !== null) styleMatches.push(s[1]);
  const inlineRe = /style\s*=\s*["']([^"']*)["']/gi;
  while ((s = inlineRe.exec(html)) !== null) styleMatches.push(s[1]);
  const corpus = styleMatches.join('\n');
  const hexRe = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
  let h;
  while ((h = hexRe.exec(corpus)) !== null) {
    let hex = h[1].toLowerCase();
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex === 'ffffff' || hex === '000000') {
      // still keep black/white but don't over-rank them — we rely on frequency.
    }
    out.push('#' + hex);
  }
  const rgbRe = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g;
  let r;
  while ((r = rgbRe.exec(corpus)) !== null) {
    const [_, R, G, B] = r;
    const hex = '#' + [R, G, B].map(n => {
      const v = Math.max(0, Math.min(255, Number(n))).toString(16);
      return v.length === 1 ? '0' + v : v;
    }).join('');
    out.push(hex);
  }
  return out;
}

function extractFonts(html) {
  if (!html) return [];
  const out = [];
  const corpus = html;
  const re = /font-family\s*:\s*([^;"'<>{}]+)/gi;
  let m;
  while ((m = re.exec(corpus)) !== null) {
    const list = m[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    for (const f of list) {
      if (f.length > 60) continue;
      // skip generic families + CSS variables
      if (/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|inherit|initial|unset|var\(.*\))$/i.test(f)) continue;
      out.push(f);
    }
  }
  return out;
}

function rankByFrequency(values, limit) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function aggregateAssets(pages) {
  const allImages = [];
  const allFavicons = [];
  const allOgImages = [];
  const allColours = [];
  const allFonts = [];

  const seenImg = new Set();
  for (const p of pages) {
    for (const img of (p._images || [])) {
      if (seenImg.has(img.src)) continue;
      seenImg.add(img.src);
      allImages.push(img);
    }
    for (const f of (p._favicons || [])) allFavicons.push(f);
    for (const o of (p._ogImages || [])) allOgImages.push(o);
    for (const c of (p._colours || [])) allColours.push(c);
    for (const f of (p._fonts || [])) allFonts.push(f);
  }

  // Dedup favicons + og images
  const dedup = (arr, key) => {
    const s = new Set();
    const out = [];
    for (const v of arr) {
      const k = key(v);
      if (s.has(k)) continue;
      s.add(k);
      out.push(v);
    }
    return out;
  };

  return {
    images: allImages.slice(0, 60),
    favicons: dedup(allFavicons, f => f.href),
    ogImages: Array.from(new Set(allOgImages)),
    colours: rankByFrequency(allColours, 16),
    fonts: rankByFrequency(allFonts, 8),
  };
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
  const failures = [];
  let brandName = '';

  // If the seed URL fails with http_error/network, retry with www. prefix or naked host once.
  async function fetchSeed(seedUrl) {
    const first = await fetchWithTimeout(seedUrl);
    if (first.reason === 'ok') return { usedUrl: seedUrl, resp: first };
    try {
      const u = new URL(seedUrl);
      const hasWww = u.hostname.startsWith('www.');
      const altHost = hasWww ? u.hostname.slice(4) : 'www.' + u.hostname;
      const altUrl = u.protocol + '//' + altHost + u.pathname;
      const alt = await fetchWithTimeout(altUrl);
      if (alt.reason === 'ok') return { usedUrl: altUrl, resp: alt };
      // Return the better of the two attempts for diagnostic purposes
      const better = (first.status && !alt.status) ? first : alt;
      return { usedUrl: better === alt ? altUrl : seedUrl, resp: better, sibling: better === alt ? first : alt };
    } catch (_e) {
      return { usedUrl: seedUrl, resp: first };
    }
  }

  while (queue.length && pages.length < maxPages) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    const isSeed = current === baseUrl;
    const { usedUrl, resp, sibling } = isSeed
      ? await fetchSeed(current)
      : { usedUrl: current, resp: await fetchWithTimeout(current) };
    const html = resp.body;
    const status = resp.status;
    if (resp.reason !== 'ok') {
      failures.push({ url: usedUrl, status, reason: resp.reason, error: resp.error, contentType: resp.contentType });
      if (sibling && sibling !== resp) failures.push({ url: current, status: sibling.status, reason: sibling.reason, error: sibling.error, contentType: sibling.contentType });
      continue;
    }
    // If www-retry succeeded, swap the baseUrl so relative link resolution uses the reachable host.
    if (isSeed && usedUrl !== current) {
      discovered.add(usedUrl);
    }

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
      _images: extractImages(html, current),
      _favicons: extractFavicons(html, current),
      _ogImages: extractOgImages(html, current),
      _colours: extractColours(html),
      _fonts: extractFonts(html),
    });
  }

  const assets = aggregateAssets(pages);

  if (!brandName) {
    const host = new URL(baseUrl).hostname.replace(/^www\./, '').split('.')[0];
    brandName = host.charAt(0).toUpperCase() + host.slice(1);
  }

  return {
    brandName,
    baseUrl,
    pages,
    totalDiscovered: discovered.size,
    assets,
    failures,
  };
}

function summariseFailures(failures) {
  if (!failures || !failures.length) return null;
  const byReason = {};
  for (const f of failures) {
    const key = f.reason === 'http_error' ? `http_${f.status}` : f.reason;
    byReason[key] = (byReason[key] || 0) + 1;
  }
  return {
    attempted: failures.length,
    byReason,
    firstFailure: failures[0],
  };
}

function friendlyFailureMessage(url, failures) {
  const summary = summariseFailures(failures);
  if (!summary) return `Could not fetch any pages from ${url}`;
  const first = summary.firstFailure || {};
  const bits = [`Could not fetch any pages from ${url}`];
  if (first.reason === 'http_error') {
    if (first.status === 403) bits.push(`— site returned HTTP 403 (access denied / bot-protection)`);
    else if (first.status === 404) bits.push(`— site returned HTTP 404 (page not found; check the URL)`);
    else if (first.status === 429) bits.push(`— site returned HTTP 429 (rate-limited; try again in a moment)`);
    else if (first.status >= 500) bits.push(`— site returned HTTP ${first.status} (server error)`);
    else bits.push(`— site returned HTTP ${first.status}`);
  } else if (first.reason === 'bot_challenge') {
    bits.push('— site returned a bot-protection challenge (Cloudflare/captcha). JS-rendered crawling (Playwright) required.');
  } else if (first.reason === 'timeout') {
    bits.push(`— request timed out (${first.error || ''})`);
  } else if (first.reason === 'network') {
    bits.push(`— network error: ${first.error || 'unknown'}`);
  } else if (first.reason === 'empty_body') {
    bits.push('— site returned an empty response.');
  } else if (first.reason === 'non_html') {
    bits.push(`— response was not HTML (${first.contentType || 'unknown type'})`);
  }
  const parts = Object.entries(summary.byReason).map(([k, v]) => `${k} × ${v}`).join(', ');
  if (parts) bits.push(`\nAll attempts: ${parts}.`);
  return bits.join(' ');
}

const INDUSTRY_TAXONOMY = [
  'Technology & Software',
  'Financial services',
  'Retail & E-commerce',
  'Healthcare & Pharma',
  'Media & Entertainment',
  'Travel & Hospitality',
  'Automotive',
  'Telecommunications',
  'Energy & Utilities',
  'Consumer packaged goods',
  'Education',
  'Government & Non-profit',
  'Professional services',
  'Real estate',
  'Food & beverage',
  'Manufacturing & Industrial',
  'Other',
];

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

const INDUSTRY_SYSTEM = `You classify a brand into exactly one industry from a fixed taxonomy. Respond with valid JSON only:
{"industry": "<one of the allowed values>", "confidence": "low|medium|high", "rationale": "<one short sentence>"}

Allowed values (return the string exactly as shown):
${INDUSTRY_TAXONOMY.map(x => `- ${x}`).join('\n')}

Use "Other" only when the brand genuinely doesn't fit any other sector. If the brand spans multiple sectors, pick the dominant one (where most revenue or attention comes from).`;

async function classifyIndustry({ about, brandName, baseUrl, crawlText }) {
  const parts = [];
  if (brandName) parts.push(`Brand: ${brandName}`);
  if (baseUrl) parts.push(`Website: ${baseUrl}`);
  if (about) parts.push(`About (from brand analysis): ${about}`);
  if (crawlText) parts.push(`Page snippets:\n${String(crawlText).slice(0, 1500)}`);
  if (!parts.length) return { skipped: true, reason: 'no context available' };

  let raw;
  try {
    raw = await callGemini(INDUSTRY_SYSTEM, parts.join('\n\n'), {
      maxOutputTokens: 2048,
      jsonMode: false,
      model: 'gemini-2.5-flash',
      temperature: 0.0,
    });
  } catch (e) {
    return { error: String(e && e.message || e) };
  }

  const cleaned = stripJsonFences(raw);
  let parsed = null;
  try { parsed = JSON.parse(cleaned); }
  catch (_e) {
    // Fallback: pull "industry": "..." from a truncated / malformed response.
    const m = /"industry"\s*:\s*"([^"]+)"/.exec(cleaned);
    if (m) parsed = { industry: m[1], confidence: 'low', rationale: '(recovered from truncated response)' };
  }
  if (!parsed) return { error: 'invalid JSON', raw: cleaned.slice(0, 400) };

  const requested = String(parsed.industry || '').trim();
  const match = INDUSTRY_TAXONOMY.find(x => x.toLowerCase() === requested.toLowerCase());
  return {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    industry: match || (requested ? 'Other' : ''),
    confidence: String(parsed.confidence || 'medium').toLowerCase(),
    rationale: String(parsed.rationale || '').slice(0, 280),
    raw_response: requested && !match ? requested : undefined,
  };
}

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

async function callOpenAI(apiKey, systemPrompt, userPrompt, { maxTokens = 4096, temperature = 0.4, model = 'gpt-4o' } = {}) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = (data && data.error && data.error.message) || resp.statusText;
    throw new Error(`OpenAI ${resp.status}: ${msg}`);
  }
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return (text || '').trim();
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

async function callGemini(systemPrompt, userPrompt, { maxOutputTokens = 8192, jsonMode = true, model: modelOverride, temperature = 0.4 } = {}) {
  const client = getVertexClient();
  const modelName = modelOverride || process.env.VERTEX_GEMINI_MODEL || 'gemini-2.5-pro';
  const generationConfig = { temperature, maxOutputTokens };
  if (jsonMode) generationConfig.responseMimeType = 'application/json';
  const model = client.getGenerativeModel({
    model: modelName,
    systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
    generationConfig,
  });
  const resp = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
  });
  const candidates = resp && resp.response && resp.response.candidates;
  if (!candidates || !candidates.length) throw new Error('Gemini returned no candidates');
  const finish = candidates[0].finishReason;
  const parts = (candidates[0].content && candidates[0].content.parts) || [];
  const text = parts.map(p => p.text || '').join('').trim();
  if (!text) {
    throw new Error(`Gemini returned empty content (finishReason=${finish || 'unknown'})`);
  }
  if (finish && finish !== 'STOP' && finish !== 'MAX_TOKENS') {
    throw new Error(`Gemini stopped with finishReason=${finish}`);
  }
  return text;
}

function stripJsonFences(text) {
  if (!text) return '';
  const s = String(text);
  // Properly closed fenced block: ```json ... ```
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fenced) return fenced[1].trim();
  // Unterminated opening fence (model was truncated before closing ```).
  const opening = /```(?:json)?\s*([\s\S]*)$/i.exec(s);
  if (opening) return opening[1].trim();
  return s.trim();
}

const STAKEHOLDER_SYSTEM = `You extract the business stakeholders (leadership, executives, founders, board members) from crawled website content so a sales team can see who to target.

Respond with valid JSON only, no other text. Use this exact structure:
{
  "people": [
    {
      "name": "...",
      "role": "<exact title as shown on the site>",
      "level": "C-suite|VP|Director|Manager|IC|Board|Founder|Unknown",
      "department": "<e.g. Engineering, Product, Marketing, Finance, Sales, Legal, HR, or empty>",
      "bio": "<1-2 sentence summary from the page content>",
      "image_src": "<exact URL from the provided image list that depicts this person, or empty string>",
      "linkedin": "<linkedin URL from the page if present, else empty string>",
      "source_url": "<URL of the page that describes this person>"
    }
  ]
}

Level classification:
- C-suite: CEO, CFO, COO, CTO, CMO, CIO, CRO, CPO, President
- Founder: Founder, Co-founder (may overlap with C-suite; prefer Founder when that is how the page describes them)
- Board: Board member, Chairman/Chair, Non-executive, Advisor
- VP: SVP, EVP, VP, Head of X
- Director: Director, Senior Director, General Manager
- Manager: Manager, Team Lead
- IC: Engineer, Designer, Analyst, Scientist, etc.
- Unknown: if the role is unclear

Rules:
- Only include real people named on the crawled pages with a role or title.
- image_src MUST come from the provided image list, or be an empty string. Never invent URLs.
- Limit to the 20 most senior / most prominent people.
- If no stakeholders can be identified, return {"people": []}.
- Keep strings short, no line breaks inside values.`;

async function generateStakeholders(crawl, { provider, anthropicKey, openaiKey } = {}) {
  const chosen = (provider || process.env.BRAND_SCRAPER_PROVIDER || 'gemini').toLowerCase();

  const peoplePagePattern = /(about|team|leadership|people|management|executives|our-story|company|board)/i;
  const prioritised = crawl.pages.slice().sort((a, b) => {
    const as = peoplePagePattern.test((a.url || '') + ' ' + (a.title || '')) ? 0 : 1;
    const bs = peoplePagePattern.test((b.url || '') + ' ' + (b.title || '')) ? 0 : 1;
    return as - bs;
  });
  const pages = prioritised.slice(0, 8);
  const combinedText = pages.map(p =>
    `URL: ${p.url}\nTitle: ${p.title}\n${(p.description || '').slice(0, 200)}\n${(p.text || '').slice(0, 2500)}`
  ).join('\n\n---\n\n').slice(0, 14000);

  const imageList = [];
  const seenImg = new Set();
  for (const p of pages) {
    for (const img of (p._images || [])) {
      if (seenImg.has(img.src)) continue;
      seenImg.add(img.src);
      imageList.push(img.src + (img.alt ? ` (alt: ${img.alt})` : ''));
      if (imageList.length >= 80) break;
    }
    if (imageList.length >= 80) break;
  }

  const userPrompt =
    `Brand: ${crawl.brandName}\n` +
    `Website: ${crawl.baseUrl}\n\n` +
    `Image list (image_src values must come from this list or be empty):\n${imageList.length ? imageList.join('\n') : '(no images captured)'}\n\n` +
    `Crawled pages:\n${combinedText}`;

  let raw;
  let usedProvider;
  try {
    if (chosen === 'anthropic') {
      if (!anthropicKey) return { skipped: true, reason: 'Anthropic selected but no API key stored for this sandbox' };
      raw = await callAnthropic(anthropicKey, STAKEHOLDER_SYSTEM, userPrompt);
      usedProvider = 'anthropic';
    } else if (chosen === 'openai') {
      if (!openaiKey) return { skipped: true, reason: 'OpenAI selected but no API key stored for this sandbox' };
      raw = await callOpenAI(openaiKey, STAKEHOLDER_SYSTEM, userPrompt, { maxTokens: 4096 });
      usedProvider = 'openai';
    } else {
      raw = await callGemini(STAKEHOLDER_SYSTEM, userPrompt, { maxOutputTokens: 12000, jsonMode: false });
      usedProvider = 'gemini';
    }
  } catch (e) {
    return { error: `${chosen} provider failed: ${String(e && e.message || e)}` };
  }

  try {
    const parsed = JSON.parse(stripJsonFences(raw));
    const list = Array.isArray(parsed && parsed.people) ? parsed.people : [];
    // Validate image_src against our image list to eliminate hallucinations.
    const allowedImages = new Set(imageList.map(s => s.split(' (alt:')[0]));
    const clean = list.map(p => ({
      ...p,
      image_src: (p.image_src && allowedImages.has(p.image_src)) ? p.image_src : '',
    }));
    return { provider: usedProvider, people: clean };
  } catch (_e) {
    return { provider: usedProvider, error: 'Model response was not valid JSON', raw: raw.slice(0, 4000) };
  }
}

const PERSONA_SYSTEM = `You are a customer research expert. Generate realistic customer personas for the given brand based on its website content.

Respond with valid JSON only, no other text. Use this exact structure:
{
  "personas": [
    {
      "name": "...",
      "age": 30,
      "location": "City, Country",
      "occupation": "...",
      "income_range": "...",
      "bio": "2-3 sentences",
      "goals": ["..."],
      "pain_points": ["..."],
      "behaviors": ["..."],
      "preferred_channels": ["Email", "SMS", "Push", "Social", "Web"],
      "brand_affinity": "Why they connect with this brand",
      "suggested_segments": ["segment names"]
    }
  ]
}

Rules:
- Generate exactly 6 personas.
- All personas must live in the specified country. Use culturally appropriate names, cities, income ranges, and behaviours.
- Make them diverse in age, income, life stage, and behaviours.
- Make them specific to this brand's target market and business type (B2C vs B2B).
- Each persona: 2-3 goals, 2-3 pain points, 2-3 behaviours, 2-4 preferred channels, 1-3 suggested segments.
- Keep each persona concise — short strings, no nested objects.`;

const CAMPAIGN_SYSTEM = `You are a digital marketing strategist. Analyse the provided website content to (a) detect marketing campaigns that are currently visible on the site, and (b) suggest additional demo campaigns that would be great for a presentation about this brand.

Respond with valid JSON only, no other text. Use this exact structure:
{
  "campaigns": [
    {
      "name": "...",
      "type": "Seasonal Campaign|Product Launch|Promotion|Service Promotion|Core Brand Platform|Awareness",
      "summary": "2-3 sentence description",
      "headlines": ["..."],
      "cta": "...",
      "time_context": "Active now|Upcoming|Year-round|Seasonal",
      "season": "",
      "channel": "Email|SMS|Push|Web|Social|Multi-channel",
      "source_urls": ["URLs on the site where evidence was found — only for detected campaigns"],
      "is_recommendation": false,
      "target_segments": ["segment names this campaign should target"]
    }
  ]
}

Rules:
- Detect 2-5 campaigns currently visible (is_recommendation: false). Only include ones with clear textual evidence from the crawled content. Populate source_urls with URLs where the evidence appeared.
- Suggest 3-4 additional demo campaigns (is_recommendation: true). source_urls should be empty for these.
- Each campaign needs at least 2 headlines and a CTA.
- target_segments: 1-3 short segment names this campaign would target.
- Keep strings short and avoid line breaks inside values.`;

const SEGMENT_SYSTEM = `You are an Adobe Real-Time CDP specialist. Generate audience segments for the given brand, designed for Real-Time CDP demo scenarios.

Respond with valid JSON only, no other text. Use this exact structure:
{
  "segments": [
    {
      "name": "...",
      "description": "2-3 sentences",
      "evaluation_type": "edge|streaming|batch",
      "criteria": ["rule 1", "rule 2"],
      "estimated_size": "5-10%",
      "suggested_campaigns": ["campaign name"],
      "use_cases": ["demo scenario description"],
      "qualified_personas": ["persona name that would qualify"]
    }
  ]
}

Evaluation types:
- edge: instant evaluation on Edge Network. Use for same-page personalisation and next-best-action (e.g. "Currently browsing product page").
- streaming: near real-time, within minutes. Use for event-driven triggers (e.g. "Added to cart in last 30 minutes").
- batch: evaluated every 24h. Use for historical patterns, LTV, complex calculations (e.g. "High-value customer (>£500 lifetime spend)").

Rules:
- Generate 8-10 segments total.
- Include a mix: 2-3 edge, 3-4 streaming, 3-4 batch.
- Make them specific to the brand's vertical and offerings.
- Each segment: 2-4 criteria, 1-2 suggested_campaigns, 1-2 use_cases.
- estimated_size should be a realistic percentage range like "5-10%" or "1-3%".
- qualified_personas must reference persona names from the provided list only; omit if none fit.
- suggested_campaigns should reference campaign names from the provided list when possible.
- Keep strings short, no line breaks inside values.`;

async function generateSegments(crawl, personasObj, campaignsObj, { provider, anthropicKey } = {}) {
  const chosen = (provider || process.env.BRAND_SCRAPER_PROVIDER || 'gemini').toLowerCase();

  const personaNames = (personasObj && Array.isArray(personasObj.personas))
    ? personasObj.personas.map(p => p.name).filter(Boolean) : [];
  const personaSummary = (personasObj && Array.isArray(personasObj.personas))
    ? personasObj.personas.map(p => `- ${p.name} (${p.occupation || '—'}${p.age ? ', ' + p.age : ''}): ${(p.bio || '').slice(0, 200)}`).join('\n')
    : '(no personas available)';

  const campaignSummary = (campaignsObj && Array.isArray(campaignsObj.campaigns))
    ? campaignsObj.campaigns.map(c => `- ${c.name} [${c.type || 'Campaign'}${c.is_recommendation ? ', recommended' : ', detected'}] — ${(c.summary || '').slice(0, 200)}`).join('\n')
    : '(no campaigns available)';

  const combinedText = crawl.pages.map(p =>
    `URL: ${p.url}\nTitle: ${p.title}\n${(p.text || '').slice(0, 800)}`
  ).join('\n\n---\n\n').slice(0, 6000);

  const userPrompt =
    `Brand: ${crawl.brandName}\n` +
    `Website: ${crawl.baseUrl}\n\n` +
    `Personas available (qualified_personas must draw from these names only):\n${personaSummary}\n\n` +
    `Campaigns available (suggested_campaigns should reference these names when relevant):\n${campaignSummary}\n\n` +
    `Website content:\n${combinedText}` +
    (personaNames.length ? `\n\nValid persona names: ${personaNames.join(', ')}` : '');

  let raw;
  let usedProvider;
  try {
    if (chosen === 'anthropic') {
      if (!anthropicKey) return { skipped: true, reason: 'Anthropic selected but no API key stored for this sandbox' };
      raw = await callAnthropic(anthropicKey, SEGMENT_SYSTEM, userPrompt);
      usedProvider = 'anthropic';
    } else if (chosen === 'openai') {
      if (!openaiKey) return { skipped: true, reason: 'OpenAI selected but no API key stored for this sandbox' };
      raw = await callOpenAI(openaiKey, SEGMENT_SYSTEM, userPrompt, { maxTokens: 4096 });
      usedProvider = 'openai';
    } else {
      raw = await callGemini(SEGMENT_SYSTEM, userPrompt, { maxOutputTokens: 12000, jsonMode: false });
      usedProvider = 'gemini';
    }
  } catch (e) {
    return { error: `${chosen} provider failed: ${String(e && e.message || e)}` };
  }

  try {
    const parsed = JSON.parse(stripJsonFences(raw));
    const list = Array.isArray(parsed && parsed.segments) ? parsed.segments : [];
    return { provider: usedProvider, segments: list };
  } catch (_e) {
    return { provider: usedProvider, error: 'Model response was not valid JSON', raw: raw.slice(0, 4000) };
  }
}

async function generateCampaigns(crawl, { provider, anthropicKey, openaiKey } = {}) {
  const chosen = (provider || process.env.BRAND_SCRAPER_PROVIDER || 'gemini').toLowerCase();

  const combinedText = crawl.pages.map(p =>
    `URL: ${p.url}\nTitle: ${p.title}\nDescription: ${(p.description || '').slice(0, 200)}\n${(p.text || '').slice(0, 1500)}`
  ).join('\n\n---\n\n').slice(0, 12000);

  const userPrompt =
    `Brand: ${crawl.brandName}\n` +
    `Website: ${crawl.baseUrl}\n\n` +
    `Website content:\n${combinedText}`;

  let raw;
  let usedProvider;
  try {
    if (chosen === 'anthropic') {
      if (!anthropicKey) return { skipped: true, reason: 'Anthropic selected but no API key stored for this sandbox' };
      raw = await callAnthropic(anthropicKey, CAMPAIGN_SYSTEM, userPrompt);
      usedProvider = 'anthropic';
    } else if (chosen === 'openai') {
      if (!openaiKey) return { skipped: true, reason: 'OpenAI selected but no API key stored for this sandbox' };
      raw = await callOpenAI(openaiKey, CAMPAIGN_SYSTEM, userPrompt, { maxTokens: 4096 });
      usedProvider = 'openai';
    } else {
      raw = await callGemini(CAMPAIGN_SYSTEM, userPrompt, { maxOutputTokens: 12000, jsonMode: false });
      usedProvider = 'gemini';
    }
  } catch (e) {
    return { error: `${chosen} provider failed: ${String(e && e.message || e)}` };
  }

  try {
    const parsed = JSON.parse(stripJsonFences(raw));
    const list = Array.isArray(parsed && parsed.campaigns) ? parsed.campaigns : [];
    return { provider: usedProvider, campaigns: list };
  } catch (_e) {
    return { provider: usedProvider, error: 'Model response was not valid JSON', raw: raw.slice(0, 4000) };
  }
}

async function generatePersonas(crawl, analysis, { country, businessType }, { provider, anthropicKey, openaiKey } = {}) {
  const chosen = (provider || process.env.BRAND_SCRAPER_PROVIDER || 'gemini').toLowerCase();

  const aboutLine = (analysis && !analysis.skipped && !analysis.error && analysis.about) ? analysis.about : '';
  const combinedText = crawl.pages.map(p =>
    `URL: ${p.url}\nTitle: ${p.title}\n${(p.description || '').slice(0, 200)}\n${(p.text || '').slice(0, 1200)}`
  ).join('\n\n---\n\n').slice(0, 8000);

  const userPrompt =
    `Brand: ${crawl.brandName}\n` +
    `Website: ${crawl.baseUrl}\n` +
    `Business type: ${(businessType || 'b2c').toUpperCase()}\n` +
    `Persona country: ${country || 'Germany'}\n` +
    (aboutLine ? `About: ${aboutLine}\n` : '') +
    `\nWebsite content:\n${combinedText}`;

  let raw;
  let usedProvider;
  try {
    if (chosen === 'anthropic') {
      if (!anthropicKey) return { skipped: true, reason: 'Anthropic selected but no API key stored for this sandbox' };
      raw = await callAnthropic(anthropicKey, PERSONA_SYSTEM, userPrompt);
      usedProvider = 'anthropic';
    } else if (chosen === 'openai') {
      if (!openaiKey) return { skipped: true, reason: 'OpenAI selected but no API key stored for this sandbox' };
      raw = await callOpenAI(openaiKey, PERSONA_SYSTEM, userPrompt, { maxTokens: 4096 });
      usedProvider = 'openai';
    } else {
      raw = await callGemini(PERSONA_SYSTEM, userPrompt, { maxOutputTokens: 16384, jsonMode: false });
      usedProvider = 'gemini';
    }
  } catch (e) {
    return { error: `${chosen} provider failed: ${String(e && e.message || e)}` };
  }

  try {
    const parsed = JSON.parse(stripJsonFences(raw));
    const list = Array.isArray(parsed && parsed.personas) ? parsed.personas : [];
    return { provider: usedProvider, personas: list };
  } catch (_e) {
    return { provider: usedProvider, error: 'Model response was not valid JSON', raw: raw.slice(0, 4000) };
  }
}

async function analyseBrand(crawl, { provider, anthropicKey, openaiKey } = {}) {
  const chosen = (provider || process.env.BRAND_SCRAPER_PROVIDER || 'gemini').toLowerCase();

  const combinedText = crawl.pages.map(p =>
    `URL: ${p.url}\nTitle: ${p.title}\nDescription: ${p.description}\n\n${p.text}`
  ).join('\n\n---\n\n').slice(0, 15000);

  const userPrompt = `Analyse this brand and generate brand guidelines.\n\nBrand: ${crawl.brandName}\nWebsite URL: ${crawl.baseUrl}\n\nWebsite Content:\n${combinedText}`;

  let raw;
  let usedProvider;
  try {
    if (chosen === 'anthropic') {
      if (!anthropicKey) return { skipped: true, reason: 'Anthropic selected but no API key stored for this sandbox' };
      raw = await callAnthropic(anthropicKey, BRAND_ANALYSIS_SYSTEM, userPrompt);
      usedProvider = 'anthropic';
    } else if (chosen === 'openai') {
      if (!openaiKey) return { skipped: true, reason: 'OpenAI selected but no API key stored for this sandbox' };
      raw = await callOpenAI(openaiKey, BRAND_ANALYSIS_SYSTEM, userPrompt);
      usedProvider = 'openai';
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

function mergeScrapeRecords(existing, fresh) {
  if (!existing || !existing.crawlSummary) return fresh;
  const out = { ...fresh };
  const e = existing;
  const f = fresh;

  // Merge crawl summary
  const pagesByUrl = new Map();
  for (const p of (e.crawlSummary && e.crawlSummary.pages) || []) pagesByUrl.set(p.url, p);
  for (const p of (f.crawlSummary && f.crawlSummary.pages) || []) pagesByUrl.set(p.url, p); // fresh wins

  const eAssets = (e.crawlSummary && e.crawlSummary.assets) || {};
  const fAssets = (f.crawlSummary && f.crawlSummary.assets) || {};
  const mergeByKey = (arrA, arrB, key) => {
    const map = new Map();
    for (const v of arrA || []) map.set(key(v), v);
    for (const v of arrB || []) map.set(key(v), v);
    return Array.from(map.values());
  };
  const mergeCounts = (arrA, arrB, limit) => {
    const counts = new Map();
    for (const v of arrA || []) counts.set(v.value, (counts.get(v.value) || 0) + (v.count || 1));
    for (const v of arrB || []) counts.set(v.value, (counts.get(v.value) || 0) + (v.count || 1));
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([value, count]) => ({ value, count }));
  };

  out.crawlSummary = {
    pagesScraped: pagesByUrl.size,
    totalDiscovered: Math.max((e.crawlSummary && e.crawlSummary.totalDiscovered) || 0, (f.crawlSummary && f.crawlSummary.totalDiscovered) || 0),
    pages: Array.from(pagesByUrl.values()),
    assets: {
      images: mergeByKey(eAssets.images, fAssets.images, x => x.src).slice(0, 120),
      favicons: mergeByKey(eAssets.favicons, fAssets.favicons, x => x.href),
      ogImages: Array.from(new Set([...(eAssets.ogImages || []), ...(fAssets.ogImages || [])])),
      colours: mergeCounts(eAssets.colours, fAssets.colours, 16),
      fonts: mergeCounts(eAssets.fonts, fAssets.fonts, 8),
    },
  };

  // Analysis: latest fresh value wins (brand guidelines don't compose).
  out.analysis = f.analysis || e.analysis || null;
  out.analysisError = f.analysisError || null;

  // Personas: union by name. Growing library across appends.
  const personaMap = new Map();
  const ePs = (e.personas && Array.isArray(e.personas.personas)) ? e.personas.personas : [];
  const fPs = (f.personas && Array.isArray(f.personas.personas)) ? f.personas.personas : [];
  for (const p of ePs) if (p && p.name) personaMap.set(p.name.toLowerCase(), p);
  for (const p of fPs) if (p && p.name) personaMap.set(p.name.toLowerCase(), p); // fresh wins on same name
  out.personas = {
    provider: (f.personas && f.personas.provider) || (e.personas && e.personas.provider) || null,
    personas: Array.from(personaMap.values()),
  };
  out.personasError = f.personasError || null;

  // Campaigns: union by (name + is_recommendation flag). Fresh wins on collision.
  const campaignMap = new Map();
  const eCs = (e.campaigns && Array.isArray(e.campaigns.campaigns)) ? e.campaigns.campaigns : [];
  const fCs = (f.campaigns && Array.isArray(f.campaigns.campaigns)) ? f.campaigns.campaigns : [];
  const cKey = (c) => (c && c.name ? c.name.toLowerCase() : '') + '|' + (c && c.is_recommendation ? 'r' : 'd');
  for (const c of eCs) if (c && c.name) campaignMap.set(cKey(c), c);
  for (const c of fCs) if (c && c.name) campaignMap.set(cKey(c), c);
  out.campaigns = {
    provider: (f.campaigns && f.campaigns.provider) || (e.campaigns && e.campaigns.provider) || null,
    campaigns: Array.from(campaignMap.values()),
  };
  out.campaignsError = f.campaignsError || null;

  // Segments: union by name. Keep growing across appends.
  const segMap = new Map();
  const eSs = (e.segments && Array.isArray(e.segments.segments)) ? e.segments.segments : [];
  const fSs = (f.segments && Array.isArray(f.segments.segments)) ? f.segments.segments : [];
  for (const s of eSs) if (s && s.name) segMap.set(s.name.toLowerCase(), s);
  for (const s of fSs) if (s && s.name) segMap.set(s.name.toLowerCase(), s);
  out.segments = {
    provider: (f.segments && f.segments.provider) || (e.segments && e.segments.provider) || null,
    segments: Array.from(segMap.values()),
  };
  out.segmentsError = f.segmentsError || null;

  // Stakeholders: union by name (case-insensitive). Fresh wins on collision.
  const peopleMap = new Map();
  const ePe = (e.stakeholders && Array.isArray(e.stakeholders.people)) ? e.stakeholders.people : [];
  const fPe = (f.stakeholders && Array.isArray(f.stakeholders.people)) ? f.stakeholders.people : [];
  for (const p of ePe) if (p && p.name) peopleMap.set(p.name.toLowerCase(), p);
  for (const p of fPe) if (p && p.name) peopleMap.set(p.name.toLowerCase(), p);
  out.stakeholders = {
    provider: (f.stakeholders && f.stakeholders.provider) || (e.stakeholders && e.stakeholders.provider) || null,
    people: Array.from(peopleMap.values()),
  };
  out.stakeholdersError = f.stakeholdersError || null;

  // Pass through identity fields
  out.brandName = f.brandName || e.brandName;
  out.url = f.url || e.url;
  out.baseUrl = f.baseUrl || e.baseUrl;
  out.businessType = f.businessType || e.businessType;
  out.country = f.country || e.country;
  out.industry = f.industry || e.industry || '';
  out.industryInfo = f.industryInfo || e.industryInfo || null;
  return out;
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
    const requestedPages = Math.floor(Number(body.maxPages));
    const maxPages = requestedPages > 0 ? Math.min(requestedPages, 25) : undefined;
    const crawlerMode = String(body.crawler || body.useJs || 'fetch').toLowerCase();
    const wantJs = crawlerMode === 'js' || crawlerMode === 'true' || body.useJs === true;
    let crawl;
    try {
      if (wantJs) {
        crawl = await crawlViaPlaywrightService(url, { maxPages: maxPages || 5 });
      } else {
        crawl = await crawlSite(url, maxPages ? { maxPages } : undefined);
      }
    } catch (e) {
      res.status(502).json({ error: 'Crawler failed: ' + String((e && e.message) || e) });
      return;
    }
    if (!crawl.pages || !crawl.pages.length) {
      res.status(502).json({
        error: friendlyFailureMessage(url, crawl.failures),
        details: summariseFailures(crawl.failures),
        engine: crawl.engine || 'fetch',
      });
      return;
    }
    // Per-sandbox LLM resolution: Firestore + Secret Manager. The client may
    // still send body.provider to override for one-off testing, but the
    // sandbox config is the default.
    let resolvedProvider = 'gemini';
    let resolvedAnthropicKey = anthropicKey || '';
    let resolvedOpenAIKey = '';
    try {
      const resolved = await modelConfigStore.resolveProviderForSandbox(sandbox);
      if (resolved && resolved.provider) {
        resolvedProvider = resolved.provider;
        if (resolved.provider === 'anthropic') resolvedAnthropicKey = resolved.apiKey || resolvedAnthropicKey;
        if (resolved.provider === 'openai') resolvedOpenAIKey = resolved.apiKey || '';
      }
    } catch (_e) { /* fall back to default */ }
    const providerPref = String(body.provider || resolvedProvider || '').toLowerCase();
    const providerOpts = { provider: providerPref, anthropicKey: resolvedAnthropicKey, openaiKey: resolvedOpenAIKey };

    // Selective run: body.include = { analysis, personas, campaigns, segments }.
    // Any key omitted or truthy → run; false → skip (returns {skipped:true} so UI knows).
    const inc = (key) => !body.include || body.include[key] !== false;
    const skipped = (reason) => ({ skipped: true, reason: reason || 'disabled by user' });

    let analysis = null;
    let analysisError = null;
    let personas = null;
    let personasError = null;
    let campaigns = null;
    let campaignsError = null;
    let segments = null;
    let segmentsError = null;
    let stakeholders = null;
    let stakeholdersError = null;
    let recordClassification = null;
    try {
      const [analysisResult, personasResult, campaignsResult, stakeholdersResult] = await Promise.all([
        inc('analysis')
          ? analyseBrand(crawl, providerOpts).catch(e => ({ error: String(e && e.message || e) }))
          : Promise.resolve(skipped('Brand guidelines disabled in Options')),
        inc('personas')
          ? generatePersonas(crawl, null, {
              country: body.country || '',
              businessType: body.businessType || 'b2c',
            }, providerOpts).catch(e => ({ error: String(e && e.message || e) }))
          : Promise.resolve(skipped('Personas disabled in Options')),
        inc('campaigns')
          ? generateCampaigns(crawl, providerOpts).catch(e => ({ error: String(e && e.message || e) }))
          : Promise.resolve(skipped('Campaigns disabled in Options')),
        inc('stakeholders')
          ? generateStakeholders(crawl, providerOpts).catch(e => ({ error: String(e && e.message || e) }))
          : Promise.resolve(skipped('Stakeholders disabled in Options')),
      ]);
      analysis = analysisResult;
      personas = personasResult;
      campaigns = campaignsResult;
      stakeholders = stakeholdersResult;

      // Segments + industry classification run AFTER the trio in parallel.
      // Segments consumes personas + campaigns; industry consumes analysis.about
      // (falls back on brand name + crawl snippets if analysis was skipped).
      const crawlSnippet = crawl.pages.map(p =>
        [p.title, p.description, (p.text || '').slice(0, 400)].filter(Boolean).join(' · ')
      ).join('\n').slice(0, 2000);
      const industryInputs = {
        about: (analysis && !analysis.skipped && !analysis.error) ? analysis.about : '',
        brandName: crawl.brandName,
        baseUrl: crawl.baseUrl,
        crawlText: crawlSnippet,
      };

      const [segmentsResult, industryClassification] = await Promise.all([
        inc('segments')
          ? generateSegments(crawl, personas, campaigns, providerOpts)
              .catch(e => ({ error: String(e && e.message || e) }))
          : Promise.resolve(skipped('Segments disabled in Options')),
        classifyIndustry(industryInputs).catch(e => ({ error: String(e && e.message || e) })),
      ]);
      segments = segmentsResult;
      // Expose classification result for persistence below.
      recordClassification = industryClassification;
    } catch (e) {
      analysisError = String(e && e.message || e);
    }
    const crawlSummary = {
      pagesScraped: crawl.pages.length,
      totalDiscovered: crawl.totalDiscovered,
      engine: crawl.engine || 'fetch',
      pages: crawl.pages.map(p => ({
        url: p.url, title: p.title, description: p.description, textLength: p.textLength, status: p.status,
      })),
      assets: crawl.assets,
    };
    const elapsedMs = Date.now() - started;

    const inferredIndustry = (recordClassification && !recordClassification.error && !recordClassification.skipped)
      ? String(recordClassification.industry || '').trim()
      : '';

    const appendMode = body.mode === 'append' && body.existingScrapeId;
    let recordToPersist = {
      url,
      baseUrl: crawl.baseUrl,
      brandName: crawl.brandName,
      businessType: body.businessType || 'b2c',
      country: body.country || '',
      industry: inferredIndustry,
      industryInfo: recordClassification,
      crawlSummary,
      analysis,
      analysisError,
      personas,
      personasError,
      campaigns,
      campaignsError,
      segments,
      segmentsError,
      stakeholders,
      stakeholdersError,
      elapsedMs,
    };
    if (appendMode) {
      try {
        const existing = await brandScrapeStore.getScrape(sandbox, body.existingScrapeId);
        if (existing) {
          recordToPersist = mergeScrapeRecords(existing, recordToPersist);
          recordToPersist.scrapeId = existing.scrapeId;
        }
      } catch (_e) { /* fall through — save as new */ }
    }

    let saved = null;
    let persistError = null;
    try {
      saved = await brandScrapeStore.saveScrape(sandbox, recordToPersist);
    } catch (e) {
      persistError = String(e && e.message || e);
      console.error('[brandScraperAnalyze] persist failed', {
        sandbox,
        scrapeId: recordToPersist.scrapeId,
        brandName: recordToPersist.brandName,
        url: recordToPersist.url,
        error: persistError,
      });
      analysisError = analysisError || ('Persist failed: ' + persistError);
    }

    res.status(200).json({
      scrapeId: saved && saved.scrapeId,
      persistError,
      sandbox,
      brandName: (saved && saved.brandName) || crawl.brandName,
      baseUrl: (saved && saved.baseUrl) || crawl.baseUrl,
      businessType: (saved && saved.businessType) || body.businessType || 'b2c',
      country: (saved && saved.country) || body.country || '',
      industry: (saved && saved.industry) || inferredIndustry,
      industryInfo: (saved && saved.industryInfo) || recordClassification,
      crawl: (saved && saved.crawlSummary) || crawlSummary,
      analysis: (saved && saved.analysis) || analysis,
      analysisError: (saved && saved.analysisError) || analysisError,
      personas: (saved && saved.personas) || personas,
      personasError: (saved && saved.personasError) || personasError,
      campaigns: (saved && saved.campaigns) || campaigns,
      campaignsError: (saved && saved.campaignsError) || campaignsError,
      segments: (saved && saved.segments) || segments,
      segmentsError: (saved && saved.segmentsError) || segmentsError,
      stakeholders: (saved && saved.stakeholders) || stakeholders,
      stakeholdersError: (saved && saved.stakeholdersError) || stakeholdersError,
      appended: !!appendMode,
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

async function handleClassifyAssets(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const sandbox = resolveSandbox(req);
  if (!sandbox) { res.status(400).json({ error: 'sandbox is required' }); return; }
  const scrapeId = String((req.body && req.body.scrapeId) || (req.query && req.query.scrapeId) || '').trim();
  if (!scrapeId) { res.status(400).json({ error: 'scrapeId is required' }); return; }

  const record = await brandScrapeStore.getScrape(sandbox, scrapeId);
  if (!record) { res.status(404).json({ error: 'scrape not found' }); return; }

  const started = Date.now();
  let result;
  try {
    result = await assetsV2.classifyScrapeAssets(sandbox, scrapeId, record);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
    return;
  }

  // Write imagesV2 back into the scrape record.
  const patchedRecord = {
    ...record,
    crawlSummary: {
      ...(record.crawlSummary || {}),
      assets: {
        ...((record.crawlSummary && record.crawlSummary.assets) || {}),
        imagesV2: result.images || [],
      },
    },
  };
  await brandScrapeStore.saveScrape(sandbox, patchedRecord);

  res.status(200).json({
    scrapeId,
    sandbox,
    classified: result.classified,
    total: result.total || (result.images || []).length,
    signedUrlExpiresAt: result.signedUrlExpiresAt,
    images: result.images,
    elapsedMs: Date.now() - started,
  });
}

async function handleExport(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const sandbox = resolveSandbox(req);
  if (!sandbox) { res.status(400).json({ error: 'sandbox is required' }); return; }
  const scrapeId = String((req.body && req.body.scrapeId) || (req.query && req.query.scrapeId) || '').trim();
  if (!scrapeId) { res.status(400).json({ error: 'scrapeId is required' }); return; }

  const record = await brandScrapeStore.getScrape(sandbox, scrapeId);
  if (!record) { res.status(404).json({ error: 'scrape not found' }); return; }

  const started = Date.now();
  let result;
  try {
    result = await exportKit.buildExport(sandbox, scrapeId, record);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
    return;
  }

  // Track the latest export URL on the scrape record so the UI can show it.
  await brandScrapeStore.saveScrape(sandbox, {
    ...record,
    lastExport: {
      storagePath: result.storagePath,
      signedUrl: result.signedUrl,
      signedUrlExpiresAt: result.signedUrlExpiresAt,
      createdAt: new Date().toISOString(),
    },
  });

  res.status(200).json({
    scrapeId,
    sandbox,
    storagePath: result.storagePath,
    signedUrl: result.signedUrl,
    signedUrlExpiresAt: result.signedUrlExpiresAt,
    elapsedMs: Date.now() - started,
  });
}

async function handleModelConfig(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  const sandbox = resolveSandbox(req);
  if (!sandbox) { res.status(400).json({ error: 'sandbox is required' }); return; }

  try {
    if (req.method === 'GET') {
      const cfg = await modelConfigStore.getConfig(sandbox);
      res.status(200).json(cfg);
      return;
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = (req.body && typeof req.body === 'object') ? req.body : {};
      const cfg = await modelConfigStore.updateConfig(sandbox, body);
      res.status(200).json(cfg);
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}

module.exports = { crawlSite, analyseBrand, handleAnalyse, handleScrapes, handleClassifyAssets, handleExport, handleModelConfig };
