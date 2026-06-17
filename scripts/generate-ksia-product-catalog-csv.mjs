#!/usr/bin/env node
/**
 * Regenerate ksia-product-catalog.csv from KSIA_PRODUCT_CATALOG in ksia-mock-data.js
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const mockPath = join(repoRoot, 'web/profile-viewer/demos/ksia/ksia-mock-data.js');
const outPath = join(repoRoot, 'web/profile-viewer/demos/ksia/ksia-product-catalog.csv');
const downloadsPath = join(
  process.env.HOME || '',
  'Downloads/ksia-product-catalog.csv'
);

const HOST = 'https://aep-orchestration-lab.web.app/profile-viewer/demos/ksia/';

const src = readFileSync(mockPath, 'utf8');
const match = src.match(/var KSIA_PRODUCT_CATALOG = (\[[\s\S]*?\n  \]);/);
if (!match) {
  console.error('KSIA_PRODUCT_CATALOG block not found in ksia-mock-data.js');
  process.exit(1);
}

// eslint-disable-next-line no-eval
const catalog = eval(match[1]);

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const header =
  'productID,_id,productName,productDescription,productPageURL,productImageURL,productRating,';
const rows = catalog.map((p) => {
  const pageUrl = HOST + p.productPageURL;
  const imageUrl = HOST + p.productImageURL;
  return [
    p.productID,
    p.productID,
    p.productName,
    p.productDescription,
    pageUrl,
    imageUrl,
    p.productRating,
  ]
    .map(csvEscape)
    .join(',');
});

const csv = [header, ...rows].join('\n') + '\n';
writeFileSync(outPath, csv, 'utf8');
console.log('Wrote', outPath, `(${catalog.length} products)`);

try {
  copyFileSync(outPath, downloadsPath);
  console.log('Copied to', downloadsPath);
} catch (err) {
  console.warn('Could not copy to Downloads:', err.message);
}
