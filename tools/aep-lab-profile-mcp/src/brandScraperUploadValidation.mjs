/**
 * Client-side validation for brand scrape HTML/ZIP uploads (mirrors functions/brandScraperUploadedHtml.js limits).
 */

import { BRAND_SCRAPER_UPLOAD_LIMITS } from './brandScraperBrief.mjs';

const { maxUploadBytes, maxFiles } = BRAND_SCRAPER_UPLOAD_LIMITS;

function decodeBase64Payload(b64) {
  const raw = String(b64 || '').trim();
  if (!raw) return Buffer.alloc(0);
  const comma = raw.indexOf(',');
  const payload = comma >= 0 ? raw.slice(comma + 1) : raw;
  return Buffer.from(payload, 'base64');
}

function isHtmlName(name) {
  return /\.html?$/i.test(String(name || ''));
}

/**
 * Normalize MCP upload object to brandScraperAnalyze POST body shape.
 * @param {object} upload
 * @param {{ upload_only?: boolean, use_as_fallback?: boolean }} flags
 */
export function buildUploadedHtmlBody(upload, { upload_only, use_as_fallback } = {}) {
  if (!upload || typeof upload !== 'object') return null;

  const files = Array.isArray(upload.files) ? upload.files : [];
  const zipBase64 = upload.zip_base64 || upload.zipBase64 || null;

  const payload = {
    files: files.map((f) => ({
      name: f.name,
      contentBase64: f.content_base64 || f.contentBase64 || '',
      ...(f.mime_type || f.mimeType ? { mimeType: f.mime_type || f.mimeType } : {}),
    })),
    zipBase64: zipBase64 || undefined,
    useAsFallback: use_as_fallback !== false,
    uploadOnly: upload_only === true,
  };

  if (!payload.zipBase64 && !payload.files.length) return null;
  return payload;
}

/**
 * Validate upload payload before POST (no unzip — size/name checks only).
 * @param {object} upload
 * @returns {{ ok: true, summary: object } | { ok: false, error: string, details?: object }}
 */
export function validateBrandScrapeUpload(upload) {
  if (!upload || typeof upload !== 'object') {
    return { ok: false, error: 'upload is required — provide zip_base64 and/or files[] with .html content.' };
  }

  const files = Array.isArray(upload.files) ? upload.files : [];
  const zipBase64 = upload.zip_base64 || upload.zipBase64 || null;

  if (!zipBase64 && !files.length) {
    return { ok: false, error: 'upload must include zip_base64 or at least one file in files[].' };
  }

  const summary = {
    zipPresent: !!zipBase64,
    fileCount: files.length,
    htmlFileCount: 0,
    totalBytes: 0,
    errors: [],
  };

  if (zipBase64) {
    try {
      const buf = decodeBase64Payload(zipBase64);
      summary.totalBytes += buf.length;
      if (buf.length > maxUploadBytes) {
        return {
          ok: false,
          error: `ZIP exceeds maximum upload size (${BRAND_SCRAPER_UPLOAD_LIMITS.maxUploadMb} MB).`,
          details: summary,
        };
      }
    } catch (e) {
      return { ok: false, error: 'zip_base64 is not valid base64.', details: { message: String(e.message || e) } };
    }
  }

  if (files.length > maxFiles) {
    return {
      ok: false,
      error: `Too many files in upload (max ${maxFiles}).`,
      details: summary,
    };
  }

  for (const f of files) {
    if (!f || !f.name) {
      summary.errors.push('Each file entry requires a name.');
      continue;
    }
    const b64 = f.content_base64 || f.contentBase64 || '';
    if (!b64) {
      summary.errors.push(`${f.name}: missing content_base64.`);
      continue;
    }
    try {
      const buf = decodeBase64Payload(b64);
      summary.totalBytes += buf.length;
      if (buf.length > maxUploadBytes) {
        summary.errors.push(`${f.name}: file exceeds ${BRAND_SCRAPER_UPLOAD_LIMITS.maxUploadMb} MB.`);
      }
      if (isHtmlName(f.name)) summary.htmlFileCount += 1;
    } catch {
      summary.errors.push(`${f.name}: invalid base64.`);
    }
  }

  if (summary.totalBytes > maxUploadBytes) {
    return {
      ok: false,
      error: `Combined upload exceeds maximum size (${BRAND_SCRAPER_UPLOAD_LIMITS.maxUploadMb} MB).`,
      details: summary,
    };
  }

  if (summary.errors.length) {
    return { ok: false, error: summary.errors.join(' '), details: summary };
  }

  if (!zipBase64 && summary.htmlFileCount === 0) {
    return {
      ok: false,
      error: 'Upload must include at least one .html file (or a ZIP containing HTML).',
      details: summary,
    };
  }

  return { ok: true, summary };
}
