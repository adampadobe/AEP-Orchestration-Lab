/**
 * Final captured-page normalization, before any lab-owned scripts are injected.
 * Keeps the saved, rendered DOM and CSS while removing production JavaScript,
 * then adds deterministic AJO insertion anchors and the offline interaction shim.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const GENERIC_SITE_GLUE_NAME = 'generic-site-glue.js';
const GENERIC_SITE_GLUE_PATH = path.join(__dirname, 'assets', GENERIC_SITE_GLUE_NAME);
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr',
]);

/** Port of the supplied destaticize_page.py regex pass. */
function destaticizeHtml(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/\s+on[a-z]+="[^"]*"/gi, '')
    .replace(/\s+on[a-z]+='[^']*'/gi, '');
}

function tagEnd(html, start) {
  let quote = '';
  for (let i = start + 1; i < html.length; i += 1) {
    const ch = html[i];
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i + 1;
    }
  }
  return html.length;
}

/** Minimal, non-reformatting HTML tree used only to locate safe opening-tag edits. */
function parseHtmlTree(html) {
  const root = { tag: '#document', children: [], parent: null, start: 0, end: html.length };
  const stack = [root];
  const nodes = [];
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf('<', cursor);
    if (start < 0) break;
    if (html.startsWith('<!--', start)) {
      const end = html.indexOf('-->', start + 4);
      cursor = end < 0 ? html.length : end + 3;
      continue;
    }
    const end = tagEnd(html, start);
    const raw = html.slice(start, end);
    cursor = end;
    if (/^<!|^<\?/i.test(raw)) continue;
    const close = /^<\/\s*([a-z][\w:-]*)/i.exec(raw);
    if (close) {
      const tag = close[1].toLowerCase();
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tag !== tag) continue;
        stack[i].closeStart = start;
        stack[i].end = end;
        stack.length = i;
        break;
      }
      continue;
    }
    const open = /^<\s*([a-z][\w:-]*)/i.exec(raw);
    if (!open) continue;
    const tag = open[1].toLowerCase();
    const parent = stack[stack.length - 1];
    const node = {
      tag,
      raw,
      start,
      openEnd: end,
      closeStart: end,
      end,
      parent,
      children: [],
    };
    parent.children.push(node);
    nodes.push(node);
    if (!VOID_TAGS.has(tag) && !/\/\s*>$/.test(raw)) stack.push(node);
  }
  for (const node of stack.slice(1)) {
    node.closeStart = node.openEnd;
    node.end = node.openEnd;
  }
  return { root, nodes };
}

function attrValue(node, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`\\s${escaped}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+)))?`, 'i').exec(node.raw);
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : null;
}

function hasAttr(node, name) {
  return attrValue(node, name) !== null;
}

function decodeText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function innerHtml(node, html) {
  return html.slice(node.openEnd, Math.max(node.openEnd, node.closeStart));
}

function firstHeading(node, html) {
  const match = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(innerHtml(node, html));
  return match ? decodeText(match[1]) : '';
}

function slugify(value) {
  return decodeText(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
    .replace(/-$/g, '');
}

function meaningfulClass(node) {
  const classes = String(attrValue(node, 'class') || '').split(/\s+/).filter(Boolean);
  const semantic = classes.find((name) => {
    if (name.length > 40 || /^(css|jsx|sc|x|_[a-z0-9]|[a-z]{0,3}\d)[-_]/i.test(name)) return false;
    if (/^[a-f0-9]{8,}$/i.test(name) || /[a-z]+[0-9]{5,}/i.test(name)) return false;
    return /[a-z]{3}/i.test(name);
  });
  return semantic || '';
}

function derivedSlug(node, html, fallbackIndex) {
  return slugify(
    firstHeading(node, html)
      || attrValue(node, 'id')
      || meaningfulClass(node)
      || `section-${fallbackIndex}`,
  ) || `section-${fallbackIndex}`;
}

function descendants(node) {
  const out = [];
  const queue = [...node.children];
  while (queue.length) {
    const next = queue.shift();
    out.push(next);
    queue.unshift(...next.children);
  }
  return out;
}

function addAttrs(editMap, node, attrs) {
  const missing = attrs.filter(([name]) => !hasAttr(node, name));
  if (!missing.length) return;
  const insertAt = node.openEnd - (/\/\s*>$/.test(node.raw) ? 2 : 1);
  const text = missing.map(([name, value]) => value === null ? ` ${name}` : ` ${name}="${value}"`).join('');
  editMap.set(insertAt, (editMap.get(insertAt) || '') + text);
}

function uniqueSlug(base, used) {
  let value = base || 'section';
  let suffix = 2;
  while (used.has(value)) value = `${base || 'section'}-${suffix++}`;
  used.add(value);
  return value;
}

function childSignature(node) {
  const classes = String(attrValue(node, 'class') || '')
    .split(/\s+/)
    .map(slugify)
    .filter(Boolean)
    .slice(0, 2)
    .sort()
    .join('.');
  const childTags = node.children.slice(0, 4).map((child) => child.tag).join(',');
  return `${node.tag}|${classes}|${childTags}`;
}

function looksLikeGrid(node) {
  const children = node.children.filter((child) => !['script', 'style', 'template'].includes(child.tag));
  if (children.length < 3) return false;
  const counts = new Map();
  for (const child of children) {
    const sig = childSignature(child);
    counts.set(sig, (counts.get(sig) || 0) + 1);
  }
  const repeated = Math.max(...counts.values());
  const semantic = `${attrValue(node, 'id') || ''} ${attrValue(node, 'class') || ''}`;
  return repeated >= 3 && (repeated / children.length >= 0.6 || /grid|cards?|tiles?|listing|products?/i.test(semantic));
}

function pascalCase(value) {
  return slugify(value).split('-').filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join('');
}

function applyEdits(html, editMap) {
  let out = html;
  const edits = Array.from(editMap.entries()).sort((a, b) => b[0] - a[0]);
  for (const [offset, text] of edits) out = out.slice(0, offset) + text + out.slice(offset);
  return out;
}

function annotateAjoMarkup(html) {
  const source = String(html || '');
  if (!source) return source;
  const { nodes } = parseHtmlTree(source);
  const edits = new Map();
  const body = nodes.find((node) => node.tag === 'body');
  const main = nodes.find((node) => node.tag === 'main');

  if (!nodes.some((node) => attrValue(node, 'id') === 'TopRibbon')) {
    let offset = main ? main.start : (body ? body.openEnd : 0);
    if (!main && body) {
      const chrome = body.children.filter((node) => node.tag === 'header' || node.tag === 'nav');
      if (chrome.length) offset = chrome[chrome.length - 1].end;
    }
    edits.set(offset, (edits.get(offset) || '')
      + '\n<div id="TopRibbon" class="decisioning-zone decisioning-zone--ribbon" aria-live="polite" data-ajo-insert-section="top-ribbon"></div>\n');
  }

  const candidates = nodes.filter((node) => {
    if (node.tag === 'section') return true;
    if (main && node.parent === main && !['script', 'style', 'template'].includes(node.tag)) return true;
    if (node.tag === 'header' && node.parent && node.parent !== body) return true;
    return false;
  });
  const usedSections = new Set(nodes.map((node) => attrValue(node, 'data-ajo-insert-section')).filter(Boolean));
  candidates.forEach((node, index) => {
    if (hasAttr(node, 'data-ajo-insert-section')) return;
    const slug = uniqueSlug(derivedSlug(node, source, index + 1), usedSections);
    addAttrs(edits, node, [['data-ajo-insert-section', slug]]);
  });

  if (!nodes.some((node) => hasAttr(node, 'data-hero-mount'))) {
    const scope = main || body;
    const possible = scope ? descendants(scope).filter((node) => ['section', 'article', 'div', 'header'].includes(node.tag)) : [];
    let hero = null;
    let best = -Infinity;
    possible.slice(0, 80).forEach((node, index) => {
      const content = innerHtml(node, source);
      const semantic = `${attrValue(node, 'id') || ''} ${attrValue(node, 'class') || ''}`;
      const hasImage = /<(?:img|picture)\b/i.test(content) || /background(?:-image)?\s*:/i.test(node.raw);
      const hasText = /<h[1-6]\b/i.test(content) && /<(?:p|span|a|button)\b/i.test(content);
      const namedHero = /hero|banner|masthead|promo|campaign/i.test(semantic);
      if ((!hasImage || !hasText) && !namedHero) return;
      const dimension = /\b(?:width|height)\s*=\s*["']?(\d{3,4})/i.exec(content);
      const score = (namedHero ? 120 : 0) + (/<h1\b/i.test(content) ? 35 : 0)
        + (hasImage ? 25 : 0) + (hasText ? 20 : 0) + (dimension ? Math.min(20, Number(dimension[1]) / 100) : 0) - index;
      if (score > best) { best = score; hero = node; }
    });
    if (hero) {
      const attrs = [['data-hero-mount', null]];
      if (!hasAttr(hero, 'id') && !nodes.some((node) => attrValue(node, 'id') === 'hero-banner')) {
        attrs.unshift(['id', 'hero-banner']);
      }
      addAttrs(edits, hero, attrs);
    }
  }

  const grids = nodes.filter((node) => ['div', 'section', 'ul', 'ol'].includes(node.tag) && looksLikeGrid(node));
  const outerGrids = grids.filter((node) => !grids.some((other) => other !== node && node.start > other.start && node.end < other.end));
  const usedIds = new Set(nodes.map((node) => attrValue(node, 'id')).filter(Boolean));
  outerGrids.forEach((node, index) => {
    if (hasAttr(node, 'id')) return;
    const sectionName = derivedSlug(node, source, index + 1);
    const base = outerGrids.length === 1
      ? 'ContentCardContainer'
      : `${pascalCase(sectionName) || `Section${index + 1}`}ContentCardContainer`;
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) id = `${base}${suffix++}`;
    usedIds.add(id);
    addAttrs(edits, node, [['id', id]]);
  });

  return applyEdits(source, edits);
}

function injectGenericSiteGlue(html) {
  const source = String(html || '');
  if (!source || new RegExp(`(?:^|[/'"])${GENERIC_SITE_GLUE_NAME.replace('.', '\\.')}(?:[?'"/]|$)`, 'i').test(source)) return source;
  const tag = `<script src="${GENERIC_SITE_GLUE_NAME}"></script>`;
  if (/<\/body>/i.test(source)) return source.replace(/<\/body>/i, `${tag}</body>`);
  return `${source}\n${tag}`;
}

function normalizeCapturedHtml(html) {
  return injectGenericSiteGlue(annotateAjoMarkup(destaticizeHtml(html)));
}

function genericSiteGlueFile() {
  return {
    name: GENERIC_SITE_GLUE_NAME,
    content: fs.readFileSync(GENERIC_SITE_GLUE_PATH),
    contentType: 'application/javascript; charset=utf-8',
  };
}

module.exports = {
  GENERIC_SITE_GLUE_NAME,
  destaticizeHtml,
  annotateAjoMarkup,
  injectGenericSiteGlue,
  normalizeCapturedHtml,
  genericSiteGlueFile,
};
