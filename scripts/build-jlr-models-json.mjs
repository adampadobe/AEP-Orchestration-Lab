import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const csvPath = path.join(repoRoot, 'web/profile-viewer/jlr-demo-assets/jlr_merged_availability_and_images.csv');
const outPath = path.join(repoRoot, 'web/profile-viewer/jlr-demo-assets/jlr-models.json');

const raw = fs.readFileSync(csvPath, 'utf8');
const lines = raw.trim().split(/\r?\n/);
const headers = lines[0].split(',');

function parseLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === ',' && !inQ) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function electricClass(p) {
  const t = String(p || '').toLowerCase();
  if (/\belectric\b/.test(t) && !/hybrid|plug-in|phev|mild/.test(t)) return 'bev';
  if (/plug-in|phev|p270e|p460e|p550e/.test(t)) return 'phev';
  if (/mild hybrid/.test(t)) return 'mhev';
  if (/hybrid/.test(t)) return 'hybrid';
  return 'ice';
}

const models = [];
for (let i = 1; i < lines.length; i++) {
  const cols = parseLine(lines[i]);
  if (cols.length < 5) continue;
  const row = {};
  headers.forEach((h, idx) => {
    row[h] = cols[idx] || '';
  });
  const colours = String(row.colour_summary || '')
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  const seats = parseInt(String(row.seats_or_passengers || '').trim(), 10) || null;
  models.push({
    id: slug(row.model_name || row.model),
    brandFamily: row.brand_family,
    model: row.model_name || row.model,
    variant: row.variant_or_body_style,
    availability: row.availability_status,
    isJaguar: row.brand_family === 'Jaguar',
    isUsedOnly: /approved used/i.test(row.availability_status || ''),
    bodyStyle: row.body_style,
    drivetrain: row.drivetrain,
    powertrain: row.engine_or_powertrain,
    electricClass: electricClass(row.engine_or_powertrain),
    seats,
    doors: parseInt(row.number_of_doors, 10) || null,
    bootLitres: row.boot_or_loadspace_litres ? parseFloat(row.boot_or_loadspace_litres) : null,
    colours,
    colourSummary: row.colour_summary,
    notes: row.notes,
    pageUrl: row.official_model_page_url,
    heroImage: row.direct_image_url,
    imageStatus: row.image_status,
  });
}

fs.writeFileSync(outPath, JSON.stringify({ generatedFrom: 'jlr_merged_availability_and_images.csv', models }, null, 2));
console.log('Wrote', models.length, 'models to', outPath);
