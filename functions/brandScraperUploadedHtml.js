/**
 * Uploaded HTML fallback / primary input for Brand Scraper.
 */
'use strict';

const crypto = require('crypto');
const path = require('path');
const unzipper = require('unzipper');
const htmlParse = require('./brandScraperHtmlParse');

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const MAX_FILES = 40;

function isSafeZipEntry(name) {
  const n = String(name || '').replace(/\\/g, '/');
  if (!n || n.startsWith('/') || n.includes('..')) return false;
  return true;
}

function isHtmlName(name) {
  return /\.html?$/i.test(String(name || ''));
}

function decodeBase64Payload(b64) {
  const raw = String(b64 || '').trim();
  if (!raw) return Buffer.alloc(0);
  const comma = raw.indexOf(',');
  const payload = comma >= 0 ? raw.slice(comma + 1) : raw;
  return Buffer.from(payload, 'base64');
}

/**
 * @param {{ files?: Array<{ name: string, contentBase64: string, mimeType?: string }>, zipBase64?: string }} payload
 */
async function parseUploadedPayload(payload, { baseUrl, runTagAudit = true } = {}) {
  const summary = {
    filesUploaded: 0,
    validHtmlFiles: 0,
    invalidFiles: 0,
    emptyFiles: 0,
    assetsDetected: 0,
    errors: [],
  };
  const pages = [];
  const assetPaths = [];
  const fallbackSources = [];
  const entries = [];

  if (!payload || typeof payload !== 'object') {
    return { pages, summary, fallbackSources, assetPaths, uploadEntries: entries };
  }

  if (payload.zipBase64) {
    try {
      const buf = decodeBase64Payload(payload.zipBase64);
      if (buf.length > MAX_UPLOAD_BYTES) {
        summary.errors.push('ZIP exceeds maximum upload size.');
        return { pages, summary, fallbackSources, assetPaths, uploadEntries: entries };
      }
      summary.filesUploaded += 1;
      const directory = await unzipper.Open.buffer(buf);
      for (const entry of directory.files) {
        if (entry.type === 'Directory') continue;
        const name = entry.path;
        if (!isSafeZipEntry(name)) {
          summary.invalidFiles += 1;
          summary.errors.push(`Skipped unsafe ZIP path: ${name}`);
          continue;
        }
        const content = await entry.buffer();
        if (!content || !content.length) {
          summary.emptyFiles += 1;
          continue;
        }
        entries.push({ name, content, isHtml: isHtmlName(name) });
      }
    } catch (e) {
      summary.errors.push('ZIP validation failed: ' + String((e && e.message) || e).slice(0, 200));
      return { pages, summary, fallbackSources, assetPaths, uploadEntries: entries };
    }
  }

  const fileList = Array.isArray(payload.files) ? payload.files : [];
  for (const f of fileList.slice(0, MAX_FILES)) {
    if (!f || !f.name) continue;
    summary.filesUploaded += 1;
    try {
      const buf = decodeBase64Payload(f.contentBase64);
      if (!buf.length) {
        summary.emptyFiles += 1;
        continue;
      }
      if (buf.length > MAX_UPLOAD_BYTES) {
        summary.invalidFiles += 1;
        summary.errors.push(`${f.name}: file too large`);
        continue;
      }
      entries.push({ name: f.name, content: buf, isHtml: isHtmlName(f.name) });
    } catch (e) {
      summary.invalidFiles += 1;
      summary.errors.push(`${f.name}: ${String((e && e.message) || e).slice(0, 120)}`);
    }
  }

  for (const entry of entries) {
    if (entry.isHtml) {
      const html = entry.content.toString('utf8');
      if (!html.trim()) {
        summary.emptyFiles += 1;
        continue;
      }
      const pseudoUrl = baseUrl
        ? new URL('/' + path.basename(entry.name), baseUrl).toString()
        : `uploaded://${entry.name}`;
      let page;
      try {
        page = htmlParse.parseHtmlToPage(html, {
          url: pseudoUrl,
          baseUrl: baseUrl || pseudoUrl,
          fileName: entry.name,
          sourceType: 'uploaded_html',
          runTagAudit,
        });
      } catch (e) {
        summary.invalidFiles += 1;
        summary.errors.push(`${entry.name}: parse error`);
        continue;
      }
      if (!page.textLength && !page.title) {
        summary.invalidFiles += 1;
        continue;
      }
      pages.push(page);
      summary.validHtmlFiles += 1;
      fallbackSources.push({
        type: 'uploaded_html',
        fileName: entry.name,
        contentHash: page.contentHash,
        pagesExtracted: 1,
      });
    } else {
      assetPaths.push({ path: entry.name, size: entry.content.length });
      summary.assetsDetected += 1;
    }
  }

  return { pages, summary, fallbackSources, assetPaths, uploadEntries: entries };
}

function pageDedupeKey(page) {
  const url = String(page.url || '').toLowerCase().replace(/\/+$/, '');
  const title = String(page.title || '').toLowerCase().trim();
  const hash = page.contentHash || htmlParse.contentHash(page.text || '');
  return url || title || hash;
}

function mergeCrawlSources(liveCrawl, uploadedPages, { aggregateAssets }) {
  const live = liveCrawl && Array.isArray(liveCrawl.pages) ? liveCrawl.pages : [];
  const uploaded = Array.isArray(uploadedPages) ? uploadedPages : [];
  const seen = new Set();
  const merged = [];

  for (const p of live) {
    const row = { ...p, sourceType: p.sourceType || 'live_url' };
    const key = pageDedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  for (const p of uploaded) {
    const row = { ...p, sourceType: p.sourceType || 'uploaded_html' };
    const key = pageDedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }

  const failures = (liveCrawl && liveCrawl.failures) || [];
  const brandName = (liveCrawl && liveCrawl.brandName)
    || (merged[0] && htmlParse.extractBrandName('', merged[0].url))
    || '';
  const baseUrl = (liveCrawl && liveCrawl.baseUrl) || (merged[0] && merged[0].url) || '';
  const assets = typeof aggregateAssets === 'function'
    ? aggregateAssets(merged)
    : ((liveCrawl && liveCrawl.assets) || {});

  return {
    brandName,
    baseUrl,
    pages: merged,
    totalDiscovered: (liveCrawl && liveCrawl.totalDiscovered) || merged.length,
    assets,
    failures,
    tagAuditSummary: (liveCrawl && liveCrawl.tagAuditSummary) || null,
    _uploadedPageCount: uploaded.length,
    _livePageCount: live.length,
  };
}

function classifyBlockedReason(failure) {
  const status = Number(failure && failure.status) || 0;
  const reason = String((failure && failure.reason) || '');
  if (reason === 'bot_challenge') return 'bot protection';
  if (status === 403) return 'forbidden';
  if (status === 401) return 'auth required';
  if (status === 429) return 'rate limited';
  if (reason === 'http_error' && status >= 400) return 'blocked by site';
  if (reason === 'timeout') return 'timeout';
  if (reason === 'network') return 'network error';
  return reason || 'blocked by site';
}

function buildBlockedPages(failures, { fallbackUsed = false } = {}) {
  if (!Array.isArray(failures)) return [];
  const out = [];
  const seen = new Set();
  for (const f of failures) {
    const url = String((f && f.url) || '');
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const status = Number(f.status) || 0;
    if (status === 403 || f.reason === 'bot_challenge' || (f.reason === 'http_error' && status >= 400)) {
      out.push({
        url,
        status: status || (f.reason === 'bot_challenge' ? 403 : 0),
        reason: classifyBlockedReason(f),
        fallbackUsed: !!fallbackUsed,
      });
    }
  }
  return out;
}

function emptyCrawl(baseUrl, brandName) {
  return {
    brandName: brandName || '',
    baseUrl: baseUrl || '',
    pages: [],
    totalDiscovered: 0,
    assets: {},
    failures: [],
    tagAuditSummary: null,
  };
}

module.exports = {
  parseUploadedPayload,
  mergeCrawlSources,
  buildBlockedPages,
  emptyCrawl,
  decodeBase64Payload,
  MAX_UPLOAD_BYTES,
};
