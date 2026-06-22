import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareWalnutPage } from './prepare-llm-demo-walnut-page.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapDir = path.join(repoRoot, 'web', 'profile-viewer', 'demos', 'llm-demo', 'snapshot');

const srcAssetsDir =
  process.env.LLM_DEMO_PM_SOURCE_ASSETS ||
  path.join(
    process.env.USERPROFILE || '',
    'Downloads',
    'Adobe Brand Visibility - Jun 08, 2026 Prompt Suggestions_files',
  );

function extractTabPanel(html, idNeedle) {
  const openRe = new RegExp(`<div[^>]*id="[^"]*${idNeedle}"[^>]*role="tabpanel"`, 'i');
  const m = html.match(openRe);
  if (!m) return '';
  const start = html.indexOf(m[0]);
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    if (html.startsWith('<div', i)) depth += 1;
    if (html.startsWith('</div>', i)) {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 6);
    }
  }
  return '';
}

function tabPanelPrefix(html) {
  const m = html.match(/id="(react-aria[^"]+-)tab-prompt-suggestions-v2"/i);
  return m ? m[1] : null;
}

function mergePromptSuggestionsPanel(outHtmlPath) {
  const donorPath = path.join(srcAssetsDir, 'assets(11).html');
  if (!fs.existsSync(donorPath)) {
    console.warn('Donor assets(11).html not found — Prompt Suggestions tabpanel not merged');
    return;
  }
  let html = fs.readFileSync(outHtmlPath, 'utf8');
  if (html.includes('tabpanel-prompt-suggestions-v2')) {
    console.log('Prompt Suggestions tabpanel already present');
    return;
  }

  const donorHtml = fs.readFileSync(donorPath, 'utf8');
  let panel = extractTabPanel(donorHtml, 'tabpanel-prompt-suggestions-v2');
  if (!panel) {
    console.warn('Could not extract Prompt Suggestions tabpanel from assets(11).html');
    return;
  }

  const targetPrefix = tabPanelPrefix(html);
  const donorPrefix = tabPanelPrefix(donorHtml);
  if (targetPrefix && donorPrefix) {
    panel = panel.split(donorPrefix).join(targetPrefix);
  }

  const insightsPanel = extractTabPanel(html, 'tabpanel-data-insights');
  if (!insightsPanel) {
    console.warn('Could not find data-insights tabpanel anchor');
    return;
  }
  const anchor = html.indexOf(insightsPanel) + insightsPanel.length;
  html = html.slice(0, anchor) + panel + html.slice(anchor);

  const psTabRe = /(<div[^>]*data-key="prompt-suggestions-v2"[^>]*role="tab")([^>]*>)/i;
  html = html.replace(psTabRe, function (_full, start, end) {
    var attrs = end.replace(/\s*style="[^"]*"/i, '');
    if (targetPrefix) {
      attrs = attrs.replace(/aria-controls="[^"]*"/i, '');
      attrs =
        ' aria-controls="' +
        targetPrefix +
        'tabpanel-prompt-suggestions-v2"' +
        attrs;
    }
    return start + attrs;
  });

  fs.writeFileSync(outHtmlPath, html, 'utf8');
  console.log('Merged Prompt Suggestions tabpanel from assets(11).html');
}

const outHtml = prepareWalnutPage({
  pageSlug: 'prompts-management',
  srcAssetsDir,
  filesPathPrefix: 'Adobe Brand Visibility - Jun 08, 2026 Prompt Suggestions_files/',
  findHtml: {
    preferredName: 'assets(14).html',
    markers: ['Prompt Suggestions', 'Intent coverage', 'Prompts Management'],
  },
});

mergePromptSuggestionsPanel(outHtml);
