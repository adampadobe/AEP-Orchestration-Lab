/**
 * HTML → structured bits extractors. Mirrors the set used in
 * functions/brandScraperService.js so the Cloud Run crawler produces a
 * drop-in crawlSummary shape.
 */

'use strict';

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

function extractTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html || '');
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

function extractMeta(html, attrName, attrValue) {
  const re = new RegExp('<meta[^>]*' + attrName + '=["\']' + attrValue + '["\'][^>]*>', 'i');
  const tag = re.exec(html || '');
  if (!tag) return '';
  const c = /content=["']([^"']*)["']/i.exec(tag[0]);
  return c ? c[1].trim() : '';
}

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
    out.push('#' + hex);
  }
  const rgbRe = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g;
  let r;
  while ((r = rgbRe.exec(corpus)) !== null) {
    const [, R, G, B] = r;
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
  const re = /font-family\s*:\s*([^;"'<>{}]+)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const list = m[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    for (const f of list) {
      if (f.length > 60) continue;
      if (/^(serif|sans-serif|monospace|cursive|fantasy|system-ui|inherit|initial|unset|var\(.*\))$/i.test(f)) continue;
      out.push(f);
    }
  }
  return out;
}

function extractLinks(html, pageUrl, baseUrl) {
  if (!html) return [];
  const out = new Set();
  const re = /<a\s[^>]*href=["']([^"'#]+)["']/gi;
  let m;
  const basePart = (() => { try { return new URL(baseUrl).hostname.replace(/^www\./, '').split('.').slice(-2).join('.'); } catch { return ''; } })();
  while ((m = re.exec(html)) !== null) {
    try {
      const abs = new URL(m[1], pageUrl).toString().replace(/\/$/, '');
      const absHost = new URL(abs).hostname.replace(/^www\./, '').split('.').slice(-2).join('.');
      if (absHost === basePart) out.add(abs);
    } catch (_e) { /* ignore */ }
    if (out.size > 200) break;
  }
  return Array.from(out);
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
  const dedup = (arr, key) => {
    const s = new Set();
    const o = [];
    for (const v of arr) {
      const k = key(v);
      if (s.has(k)) continue;
      s.add(k);
      o.push(v);
    }
    return o;
  };
  return {
    images: allImages.slice(0, 60),
    favicons: dedup(allFavicons, f => f.href),
    ogImages: Array.from(new Set(allOgImages)),
    colours: rankByFrequency(allColours, 16),
    fonts: rankByFrequency(allFonts, 8),
  };
}

module.exports = {
  extractTitle,
  extractMeta,
  extractText,
  extractBrandName,
  extractImages,
  extractFavicons,
  extractOgImages,
  extractColours,
  extractFonts,
  extractLinks,
  aggregateAssets,
};
