/**
 * Shared prepare pipeline for Walnut-export llm-demo snapshot pages.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripLineDash, repairRechartsResponsiveHtml } from './sky-llm-snapshot-line-dash.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapDir = path.join(repoRoot, 'web', 'profile-viewer', 'demos', 'llm-demo', 'snapshot');
const assetsDir = path.join(snapDir, 'assets');

const SNAPSHOT_SCRIPTS = [
  '<link rel="stylesheet" href="./llm-demo-snapshot-nav.css">',
  '<link rel="stylesheet" href="./llm-demo-snapshot-platform.css">',
  '<script src="./llm-demo-snapshot-build-id.js"></script>',
  '<script src="./llm-demo-snapshot-blockers.js"></script>',
  '<script src="./llm-demo-snapshot-opportunities-catalog.js"></script>',
  '<script src="./llm-demo-snapshot-nav.js"></script>',
  '<script src="./llm-demo-snapshot-patch.js"></script>',
].join('\n');

function guessAssetExt(walnutPath) {
  const fp = path.join(assetsDir, walnutPath);
  if (!fs.existsSync(fp)) return '.css';
  const buf = fs.readFileSync(fp);
  const head = buf.slice(0, 48).toString('utf8');
  if (head.trimStart().startsWith('<svg') || head.includes('<svg')) return '.svg';
  if (head.trimStart().startsWith('<?xml')) return '.svg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return '.png';
  return '.css';
}

function walnutOutName(prefix, walnut) {
  if (walnut === 'assets') return `${prefix}-assets.css`;
  const numbered = walnut.match(/^assets\((\d+)\)$/);
  if (numbered) return `${prefix}-assets-${numbered[1]}${guessAssetExt(walnut)}`;
  return `${prefix}-${walnut.replace(/[()]/g, '-')}${guessAssetExt(walnut)}`;
}

function extractWalnutRefs(html) {
  const refs = new Set();
  const re = /(?:href|src)=["']\.\/(assets(?:\(\d+\))?|assets\([^"']+\))["']/g;
  for (const m of html.matchAll(re)) refs.add(m[1]);
  return [...refs];
}

function buildAliases(prefix, walnutRefs) {
  return walnutRefs.map((walnut) => ({ walnut, out: walnutOutName(prefix, walnut) }));
}

export function findWalnutSourceHtml(assetsDirPath, { preferredName, markers = [] }) {
  if (process.env.LLM_DEMO_WALNUT_SOURCE_HTML && fs.existsSync(process.env.LLM_DEMO_WALNUT_SOURCE_HTML)) {
    return process.env.LLM_DEMO_WALNUT_SOURCE_HTML;
  }
  if (preferredName) {
    const preferred = path.join(assetsDirPath, preferredName);
    if (fs.existsSync(preferred)) return preferred;
  }
  if (fs.existsSync(assetsDirPath)) {
    for (const name of fs.readdirSync(assetsDirPath)) {
      if (!name.endsWith('.html')) continue;
      const fp = path.join(assetsDirPath, name);
      const html = fs.readFileSync(fp, 'utf8');
      if (markers.length && markers.every((m) => html.includes(m))) return fp;
    }
  }
  return path.join(assetsDirPath, 'assets.html');
}

export function copyWalnutAssets(srcAssetsDir) {
  if (!fs.existsSync(srcAssetsDir)) {
    throw new Error(`Source assets folder not found: ${srcAssetsDir}`);
  }
  fs.mkdirSync(assetsDir, { recursive: true });
  let n = 0;
  for (const name of fs.readdirSync(srcAssetsDir)) {
    const src = path.join(srcAssetsDir, name);
    if (!fs.statSync(src).isFile()) continue;
    const base = name.replace(/\.download$/i, '');
    fs.copyFileSync(src, path.join(assetsDir, base));
    n++;
  }
  return n;
}

function materializeAssets(aliases) {
  for (const { walnut, out } of aliases) {
    const src = path.join(assetsDir, walnut);
    const dest = path.join(assetsDir, out);
    if (fs.existsSync(src)) fs.copyFileSync(src, dest);
  }
}

function rewriteAssetHrefs(html, aliases) {
  const sorted = [...aliases].sort((a, b) => b.walnut.length - a.walnut.length);
  for (const { walnut, out } of sorted) {
    html = html.split(`./assets/${walnut}`).join(`./assets/${out}`);
  }
  return html;
}

function fixWalnutAssetPaths(html) {
  html = html.replace(/((?:href|src)="\.\/)assets\/index"/g, '$1assets/assets"');
  html = html.replace(/((?:href|src)="\.\/)assets\((\d+)\)"/g, '$1assets/assets($2)"');
  html = html.replace(/((?:href|src)="\.\/)assets"/g, '$1assets/assets"');
  return html;
}

function stripStrayNotices(html) {
  html = html.replace(
    /<div[^>]*role="status"[^>]*>[\s\S]*?Welcome to Users and Permissions[\s\S]*?<\/button>\s*<\/div>/gi,
    '',
  );
  html = html.replace(
    /<div[^>]*-macro-static-xHSEkc[^>]*>[\s\S]*?Welcome to Users and Permissions[\s\S]*?<\/div>\s*<\/div>/gi,
    '',
  );
  return html;
}

function patchWalnutHtml(html, { filesPathPrefix, assetPrefix, aliases }) {
  const filesEsc = filesPathPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  html = html.replace(new RegExp(`\\.\\/${filesEsc}`, 'g'), './assets/');
  html = html.replace(/\.\/assets\((\d+)\)/g, './assets($1)');
  html = html.replace(/\.download/g, '');
  html = fixWalnutAssetPaths(html);
  html = rewriteAssetHrefs(html, aliases);
  html = stripStrayNotices(html);

  html = html.replace(/<script[^>]*src="\.\/assets\/rum-standalone\.js"[^>]*><\/script>/gi, '');
  html = html.replace(/<script[^>]*src="\.\/assets\/adobe-ims\.[^"]+"[^>]*><\/script>/gi, '');
  html = html.replace(/<script[^>]*src="\.\/assets\/auth\.[^"]+"[^>]*><\/script>/gi, '');
  html = html.replace(/<script[^>]*src="\.\/assets\/vendor\.[^"]+"[^>]*><\/script>/gi, '');
  html = html.replace(/<script[^>]*src="\.\/assets\/main\.[^"]+"[^>]*><\/script>/gi, '');
  html = html.replace(/<script[^>]*src="\.\/assets\/launch-[^"]+"[^>]*><\/script>/gi, '');
  html = html.replace(/<script[^>]*src="\.\/assets\/RC[^"]+"[^>]*><\/script>/gi, '');
  html = html.replace(/<script[^>]*src="\.\/assets\/index\.js"[^>]*><\/script>/gi, '');
  html = html.replace(/<script[^>]*src="\.\/assets\/web-vitals[^"]+"[^>]*><\/script>/gi, '');
  html = html.replace(/<script>window\.SAMPLE_PAGEVIEWS_AT_RATE[^<]*<\/script>/i, '');

  html = html.replace(/Adobe LLM Optimizer/gi, 'Adobe Brand Visibility');
  html = stripLineDash(html);
  html = repairRechartsResponsiveHtml(html);

  html = html.replace(/<\/body>\s*<div id="walnut-root-popin-element"[\s\S]*$/i, '</body>\n');
  html = html.replace(
    /<link rel="stylesheet" href="\.\/llm-demo-snapshot[^"]*">[\s\S]*?<script src="\.\/llm-demo-snapshot-market\.js"><\/script>/gi,
    '',
  );
  if (!html.includes('llm-demo-snapshot-nav.js')) {
    html = html.replace('</body>', `${SNAPSHOT_SCRIPTS}\n</body>`);
  }

  return html;
}

/**
 * @param {{
 *   pageSlug: string;
 *   outHtmlName?: string;
 *   srcAssetsDir: string;
 *   filesPathPrefix: string;
 *   findHtml?: { preferredName?: string; markers?: string[] };
 * }} config
 */
export function prepareWalnutPage(config) {
  const {
    pageSlug,
    outHtmlName = `${pageSlug}.html`,
    srcAssetsDir,
    filesPathPrefix,
    findHtml = {},
  } = config;

  const srcHtml = findWalnutSourceHtml(srcAssetsDir, findHtml);
  if (!fs.existsSync(srcHtml)) {
    throw new Error(`Source HTML not found: ${srcHtml}`);
  }

  const copied = copyWalnutAssets(srcAssetsDir);
  let html = fs.readFileSync(srcHtml, 'utf8');
  const aliases = buildAliases(pageSlug, extractWalnutRefs(html));
  materializeAssets(aliases);
  html = patchWalnutHtml(html, { filesPathPrefix, assetPrefix: pageSlug, aliases });

  const outHtml = path.join(snapDir, outHtmlName);
  fs.mkdirSync(snapDir, { recursive: true });
  fs.writeFileSync(outHtml, html, 'utf8');

  console.log('Source:', srcHtml);
  console.log('Copied', copied, 'asset files');
  console.log('Materialized', aliases.length, 'Walnut assets');
  console.log('Wrote', outHtml, '(' + Math.round(html.length / 1024) + ' KB)');
  return outHtml;
}
