#!/usr/bin/env node
/**
 * Migrate site-clone demo HTML to centralized data-demo-env-strip-mount="site-clone-shell".
 * Idempotent: skips pages already using site-clone-shell.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pv = path.join(__dirname, '..', 'web', 'profile-viewer');

const DEMOS = [
  'sky-demo.html',
  'jlr-demo.html',
  'mod-demo.html',
  'premier-inn-demo.html',
  'etihad-demo.html',
  'ksia-demo.html',
  'admiral-demo.html',
  'navigator-global-demo.html',
  'race-for-life-demo.html',
  'donate-demo.html',
  'oldmutual-demo.html',
  'oldmutual-wealth.html',
  'oldmutual-insurance-for-business.html',
  'oldmutual-business-quote-thank-you.html',
  'saga-demo.html',
  'social/facebook.html',
  'social/tiktok.html',
  'ferrari-world-abu-dhabi/index.html',
  'ferrari-world-abu-dhabi/booking.html',
  'seaworld-abu-dhabi/index.html',
  'wb-world-abu-dhabi/index.html',
  'aviva-target-demo.html',
];

function escAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPrefix(html) {
  const m = html.match(/data-demo-env-strip-prefix="([^"]+)"/);
  return m ? m[1] : null;
}

function extractAttr(html, name) {
  const re = new RegExp(name + '="([^"]*)"');
  const m = html.match(re);
  return m ? m[1] : '';
}

function extractDisclaimer(html) {
  const m = html.match(/<p class="[^"]*disclaimer[^"]*">([\s\S]*?)<\/p>/i);
  return m ? m[1].trim() : '';
}

function extractScriptPreview(html, prefix) {
  const id = prefix + 'SelectedScript';
  const m = html.match(new RegExp(`<p class="([^"]+)">Selected script:[\\s\\S]*?id="${id}"`, 'i'));
  if (m) return m[1];
  const m2 = html.match(/<p class="([^"]+)">Selected script:/i);
  return m2 ? m2[1] : 'mod-demo-script-preview';
}

function extractMessageId(html, prefix) {
  const known = prefix + 'Message';
  if (html.includes(`id="${known}"`)) return known;
  const m = html.match(/<p id="([^"]+)" class="[^"]*message[^"]*"/i);
  return m ? m[1] : known;
}

function extractProfileBtnLabel(html) {
  const m = html.match(/id="queryProfileBtn"[^>]*>([^<]+)</);
  return m ? m[1].trim() : 'Look up profile';
}

function extractIdInnerClass(html) {
  const m = html.match(/<div class="([^"]*aep-demo-id-inner[^"]*)"/);
  return m ? m[1] : 'aep-demo-id-inner';
}

function findTagCloseIndex(html, fromIndex, tagName) {
  const open = new RegExp(`<${tagName}(\\s|>)`, 'gi');
  const close = new RegExp(`</${tagName}>`, 'gi');
  let idx = fromIndex;
  let depth = 0;
  while (idx < html.length) {
    open.lastIndex = idx;
    close.lastIndex = idx;
    const nextOpen = open.exec(html);
    const nextClose = close.exec(html);
    if (!nextClose) return -1;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      idx = nextOpen.index + nextOpen[0].length;
      continue;
    }
    depth -= 1;
    idx = nextClose.index + nextClose[0].length;
    if (depth <= 0) return idx;
  }
  return -1;
}

function findIdInnerReplaceRange(html) {
  const openRe = /<div class="[^"]*aep-demo-id-inner[^"]*"[^>]*>/i;
  const openMatch = html.match(openRe);
  if (!openMatch) return null;
  const start = html.indexOf(openMatch[0]);
  const innerEnd = findTagCloseIndex(html, start, 'div');
  if (innerEnd < 0) return null;
  let end = innerEnd;
  const tail = html.slice(end);
  const scriptM = tail.match(/^\s*<p class="[^"]*script-preview[^"]*"[\s\S]*?<\/p>/i);
  if (scriptM) end += scriptM.index + scriptM[0].length;
  const tail2 = html.slice(end);
  const msgM = tail2.match(/^\s*<p id="[^"]+" class="[^"]*message[^"]*"[\s\S]*?<\/p>/i);
  if (msgM) end += msgM.index + msgM[0].length;
  const tail3 = html.slice(end);
  const discM = tail3.match(/^\s*<p class="[^"]*disclaimer[^"]*"[\s\S]*?<\/p>/i);
  if (discM) end += discM.index + discM[0].length;
  return { start, end };
}

function migrateFile(rel) {
  const abs = path.join(pv, rel);
  if (!fs.existsSync(abs)) {
    console.warn('skip missing:', rel);
    return false;
  }
  let html = fs.readFileSync(abs, 'utf8');
  if (html.includes('data-demo-env-strip-mount="site-clone-shell"')) {
    console.log('already migrated:', rel);
    return false;
  }
  const prefix = extractPrefix(html);
  if (!prefix) {
    console.warn('skip no prefix:', rel);
    return false;
  }

  const idInnerClass = extractIdInnerClass(html);
  const defaultBcStyle = extractAttr(html, 'data-demo-env-strip-default-bc-style');
  const bcBottom = html.includes('data-demo-env-strip-bc-bottom="1"') ? '\n        data-demo-env-strip-bc-bottom="1"' : '';
  const decisioningOff = html.includes('data-demo-env-strip-decisioning="0"');
  const decisioningAttr = decisioningOff ? '\n        data-demo-env-strip-decisioning="0"' : '';
  const scriptPreviewClass = extractScriptPreview(html, prefix);
  const messageId = extractMessageId(html, prefix);
  const profileBtnLabel = extractProfileBtnLabel(html);
  const disclaimer = extractDisclaimer(html);

  const shellDiv = `      <div class="${idInnerClass}"
        data-demo-env-strip-mount="site-clone-shell"
        data-demo-env-strip-prefix="${prefix}"
        data-demo-env-strip-selected-script-id="${prefix}SelectedScript"
        data-demo-env-strip-script-preview-class="${escAttr(scriptPreviewClass)}"
        data-demo-env-strip-message-id="${messageId}"
        data-demo-env-strip-profile-btn-label="${escAttr(profileBtnLabel)}"${
          defaultBcStyle ? `\n        data-demo-env-strip-default-bc-style="${defaultBcStyle}"` : ''
        }${bcBottom}${decisioningAttr}${
          disclaimer ? `\n        data-demo-env-strip-disclaimer="${escAttr(disclaimer)}"` : ''
        }></div>`;

  const range = findIdInnerReplaceRange(html);
  if (!range) {
    console.warn('skip no id-inner block:', rel);
    return false;
  }

  html = html.slice(0, range.start) + shellDiv + '\n' + html.slice(range.end);
  fs.writeFileSync(abs, html, 'utf8');
  console.log('migrated:', rel);
  return true;
}

let count = 0;
for (const rel of DEMOS) {
  if (migrateFile(rel)) count += 1;
}
console.log(`migrate-demo-env-shell: updated ${count} file(s)`);
