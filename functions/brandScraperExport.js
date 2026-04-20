/**
 * Brand Scraper export kit — builds a ZIP of brand guidelines, personas,
 * campaigns, segments, classified assets, and raw JSON. Uploads to GCS
 * and returns a 72h signed URL.
 *
 * Images embedded in the ZIP come from the V2 classify step (bucket paths
 * in record.crawlSummary.assets.imagesV2[]). If classify hasn't been run
 * yet, the ZIP ships without images — caller is expected to chain them.
 */
'use strict';

const admin = require('firebase-admin');
const archiver = require('archiver');
const assetsV2 = require('./brandScraperAssetsV2');

const EXPIRY_MS = 72 * 60 * 60 * 1000;

function safeFilename(s) {
  return String(s || 'scrape').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}

function jsonPretty(obj) {
  try { return JSON.stringify(obj, null, 2); }
  catch (_e) { return '{}'; }
}

function mdBrandGuidelines(brandName, analysis) {
  if (!analysis || analysis.skipped || analysis.error) return `# Brand guidelines\n\n_Not generated._\n`;
  const lines = [`# Brand guidelines — ${brandName || ''}`, ''];
  if (analysis.about) lines.push('## About', '', analysis.about, '');
  const tone = Array.isArray(analysis.tone_of_voice) ? analysis.tone_of_voice : [];
  if (tone.length) {
    lines.push('## Tone of voice', '');
    for (const t of tone) lines.push(`- **${t.rule || ''}** — ${t.example || ''}`);
    lines.push('');
  }
  const values = Array.isArray(analysis.brand_values) ? analysis.brand_values : [];
  if (values.length) {
    lines.push('## Brand values', '');
    for (const v of values) lines.push(`- **${v.value || ''}** — ${v.description || ''}`);
    lines.push('');
  }
  const editorial = Array.isArray(analysis.editorial_guidelines) ? analysis.editorial_guidelines : [];
  if (editorial.length) {
    lines.push('## Editorial guidelines', '');
    for (const e of editorial) lines.push(`- **${e.rule || ''}** — ${e.example || ''}`);
    lines.push('');
  }
  const img = Array.isArray(analysis.image_guidelines) ? analysis.image_guidelines : [];
  if (img.length) {
    lines.push('## Image guidelines', '');
    for (const e of img) lines.push(`- ${e.rule || ''}${e.example ? ' — ' + e.example : ''}`);
    lines.push('');
  }
  const channels = Array.isArray(analysis.channel_guidelines) ? analysis.channel_guidelines : [];
  if (channels.length) {
    lines.push('## Channel samples', '');
    for (const c of channels) {
      lines.push(`### ${c.channel || 'Channel'}`);
      if (c.subject_line) lines.push(`- **Subject:** ${c.subject_line}`);
      if (c.preheader) lines.push(`- **Preheader:** ${c.preheader}`);
      if (c.headline) lines.push(`- **Headline:** ${c.headline}`);
      if (c.body) lines.push('', c.body, '');
      if (c.cta) lines.push(`- **CTA:** ${c.cta}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

function mdPersonas(brandName, personasObj) {
  const list = (personasObj && Array.isArray(personasObj.personas)) ? personasObj.personas : [];
  if (!list.length) return `# Personas\n\n_Not generated._\n`;
  const lines = [`# Personas — ${brandName || ''}`, '', `_${list.length} personas._`, ''];
  for (const p of list) {
    lines.push(`## ${p.name || 'Unnamed persona'}`);
    const meta = [p.age, p.occupation, p.location, p.income_range].filter(Boolean).join(' · ');
    if (meta) lines.push(`_${meta}_`, '');
    if (p.bio) lines.push(p.bio, '');
    if (p.brand_affinity) lines.push(`**Brand affinity:** ${p.brand_affinity}`, '');
    if (Array.isArray(p.goals) && p.goals.length) {
      lines.push('**Goals**');
      for (const g of p.goals) lines.push(`- ${g}`);
      lines.push('');
    }
    if (Array.isArray(p.pain_points) && p.pain_points.length) {
      lines.push('**Pain points**');
      for (const g of p.pain_points) lines.push(`- ${g}`);
      lines.push('');
    }
    if (Array.isArray(p.behaviors) && p.behaviors.length) {
      lines.push('**Behaviours**');
      for (const g of p.behaviors) lines.push(`- ${g}`);
      lines.push('');
    }
    if (Array.isArray(p.preferred_channels) && p.preferred_channels.length) {
      lines.push(`**Preferred channels:** ${p.preferred_channels.join(', ')}`, '');
    }
    if (Array.isArray(p.suggested_segments) && p.suggested_segments.length) {
      lines.push(`**Suggested segments:** ${p.suggested_segments.join(', ')}`, '');
    }
    lines.push('---', '');
  }
  return lines.join('\n');
}

function mdCampaigns(brandName, campaignsObj) {
  const list = (campaignsObj && Array.isArray(campaignsObj.campaigns)) ? campaignsObj.campaigns : [];
  if (!list.length) return `# Campaigns\n\n_Not generated._\n`;
  const detected = list.filter(c => !c.is_recommendation);
  const recommended = list.filter(c => c.is_recommendation);
  const render = (arr) => arr.map(c => {
    const sec = [`## ${c.name || 'Untitled'}`, `_${c.type || 'Campaign'} · ${c.channel || ''}_`, ''];
    if (c.summary) sec.push(c.summary, '');
    if (Array.isArray(c.headlines) && c.headlines.length) {
      sec.push('**Headlines**');
      for (const h of c.headlines) sec.push(`- ${h}`);
      sec.push('');
    }
    if (c.cta) sec.push(`**CTA:** ${c.cta}`, '');
    if (c.time_context) sec.push(`**Time context:** ${c.time_context}`);
    if (c.season) sec.push(`**Season:** ${c.season}`);
    if (Array.isArray(c.target_segments) && c.target_segments.length) sec.push(`**Target segments:** ${c.target_segments.join(', ')}`);
    if (Array.isArray(c.source_urls) && c.source_urls.length) {
      sec.push('', '**Evidence URLs**');
      for (const u of c.source_urls) sec.push(`- ${u}`);
    }
    sec.push('', '---', '');
    return sec.join('\n');
  }).join('\n');
  const lines = [`# Campaigns — ${brandName || ''}`, ''];
  if (detected.length) lines.push('## Detected on-site', '', render(detected));
  if (recommended.length) lines.push('## Recommended for demo', '', render(recommended));
  return lines.join('\n');
}

function mdStakeholders(brandName, stakeholdersObj) {
  const list = (stakeholdersObj && Array.isArray(stakeholdersObj.people)) ? stakeholdersObj.people : [];
  if (!list.length) return `# Business stakeholders\n\n_Not generated._\n`;
  const order = ['Founder', 'C-suite', 'Board', 'VP', 'Director', 'Manager', 'IC', 'Unknown'];
  const groups = {};
  for (const p of list) {
    const key = order.includes(p.level) ? p.level : 'Unknown';
    (groups[key] = groups[key] || []).push(p);
  }
  const lines = [`# Business stakeholders — ${brandName || ''}`, '', `_${list.length} people identified._`, ''];
  for (const level of order) {
    const arr = groups[level];
    if (!arr || !arr.length) continue;
    lines.push(`## ${level}`, '');
    for (const p of arr) {
      lines.push(`### ${p.name || 'Unknown'}${p.role ? ' — ' + p.role : ''}`);
      const meta = [p.department, p.linkedin].filter(Boolean);
      if (meta.length) lines.push(`_${meta.join(' · ')}_`, '');
      if (p.bio) lines.push(p.bio, '');
      if (p.image_src) lines.push(`![${p.name || ''}](${p.image_src})`, '');
      if (p.source_url) lines.push(`Source: ${p.source_url}`);
      lines.push('---', '');
    }
  }
  return lines.join('\n');
}

function mdSegments(brandName, segmentsObj) {
  const list = (segmentsObj && Array.isArray(segmentsObj.segments)) ? segmentsObj.segments : [];
  if (!list.length) return `# Audience segments\n\n_Not generated._\n`;
  const groups = { edge: [], streaming: [], batch: [], other: [] };
  for (const s of list) {
    const key = (s.evaluation_type || '').toLowerCase();
    (groups[key] || groups.other).push(s);
  }
  const render = (arr, label) => {
    if (!arr.length) return '';
    const out = [`## ${label}`, ''];
    for (const s of arr) {
      out.push(`### ${s.name || 'Untitled'}`);
      if (s.estimated_size) out.push(`_Estimated size: ${s.estimated_size}_`, '');
      if (s.description) out.push(s.description, '');
      if (Array.isArray(s.criteria) && s.criteria.length) {
        out.push('**Criteria**');
        for (const c of s.criteria) out.push(`- \`${c}\``);
        out.push('');
      }
      if (Array.isArray(s.use_cases) && s.use_cases.length) {
        out.push('**Use cases**');
        for (const u of s.use_cases) out.push(`- ${u}`);
        out.push('');
      }
      if (Array.isArray(s.suggested_campaigns) && s.suggested_campaigns.length) {
        out.push(`**Suggested campaigns:** ${s.suggested_campaigns.join(', ')}`, '');
      }
      if (Array.isArray(s.qualified_personas) && s.qualified_personas.length) {
        out.push(`**Qualified personas:** ${s.qualified_personas.join(', ')}`, '');
      }
      out.push('---', '');
    }
    return out.join('\n');
  };
  const lines = [`# Audience segments — ${brandName || ''}`, '', `_${list.length} Real-Time CDP-style segments._`, ''];
  lines.push(render(groups.edge, 'Edge evaluation (instant)'));
  lines.push(render(groups.streaming, 'Streaming evaluation (minutes)'));
  lines.push(render(groups.batch, 'Batch evaluation (24h)'));
  if (groups.other.length) lines.push(render(groups.other, 'Other'));
  return lines.join('\n');
}

function mdReadme(record) {
  const brand = record.brandName || 'Brand';
  const when = new Date().toISOString();
  return [
    `# ${brand} — brand scrape kit`,
    '',
    `Generated by AEP Orchestration Lab · Brand scraper · ${when}`,
    '',
    `- **URL:** ${record.baseUrl || record.url || ''}`,
    `- **Sandbox:** ${record.sandbox || ''}`,
    `- **Business type:** ${(record.businessType || '').toUpperCase()}`,
    `- **Persona country:** ${record.country || ''}`,
    `- **Scrape ID:** ${record.scrapeId || ''}`,
    '',
    '## Contents',
    '',
    '- `brand-guidelines.md` + `brand-guidelines.json` — tone, values, editorial rules, channel samples.',
    '- `personas.md` + `personas.json` — customer personas localised to the chosen country.',
    '- `campaigns.md` + `campaigns.json` — campaigns detected on the site plus recommended demo campaigns.',
    '- `segments.md` + `segments.json` — Real-Time CDP segments grouped by evaluation type.',
    '- `stakeholders.md` + `stakeholders.json` — leadership / key people identified on the site, grouped by level.',
    '- `assets/palette.json` — top colours and font families extracted from CSS.',
    '- `assets/manifest.json` — image classifications (if classify step was run).',
    '- `assets/images/` — downloaded images (if classify step was run).',
    '- `crawl.json` — full raw scrape record.',
    '',
    'Signed URL for this ZIP expires in 72 hours. Source bucket also auto-deletes objects at age ≥ 3 days.',
    '',
  ].join('\n');
}

/** Stream a ZIP for this scrape straight into a GCS writable stream, then sign. */
async function buildExport(sandbox, scrapeId, record) {
  const bucket = assetsV2.getBucket();
  const safeScrape = String(scrapeId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeSandbox = String(sandbox || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  const brandFilePart = safeFilename(record.brandName || record.baseUrl || 'scrape');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const zipPath = `${safeSandbox}/${safeScrape}/exports/${brandFilePart}-${ts}.zip`;
  const file = bucket.file(zipPath);
  const writeStream = file.createWriteStream({
    contentType: 'application/zip',
    resumable: false,
    metadata: { cacheControl: 'private, max-age=60', metadata: { sandbox: safeSandbox, scrapeId: safeScrape } },
  });

  const archive = archiver('zip', { zlib: { level: 6 } });
  const finishWrite = new Promise((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
    archive.on('error', reject);
  });
  archive.pipe(writeStream);

  // Text artefacts
  archive.append(mdReadme(record), { name: 'README.md' });
  archive.append(mdBrandGuidelines(record.brandName, record.analysis), { name: 'brand-guidelines.md' });
  archive.append(jsonPretty(record.analysis || {}), { name: 'brand-guidelines.json' });
  archive.append(mdPersonas(record.brandName, record.personas), { name: 'personas.md' });
  archive.append(jsonPretty(record.personas || {}), { name: 'personas.json' });
  archive.append(mdCampaigns(record.brandName, record.campaigns), { name: 'campaigns.md' });
  archive.append(jsonPretty(record.campaigns || {}), { name: 'campaigns.json' });
  archive.append(mdSegments(record.brandName, record.segments), { name: 'segments.md' });
  archive.append(jsonPretty(record.segments || {}), { name: 'segments.json' });
  archive.append(mdStakeholders(record.brandName, record.stakeholders), { name: 'stakeholders.md' });
  archive.append(jsonPretty(record.stakeholders || {}), { name: 'stakeholders.json' });
  archive.append(jsonPretty(record), { name: 'crawl.json' });

  const assets = (record.crawlSummary && record.crawlSummary.assets) || {};
  archive.append(jsonPretty({
    colours: assets.colours || [],
    fonts: assets.fonts || [],
    favicons: assets.favicons || [],
    ogImages: assets.ogImages || [],
  }), { name: 'assets/palette.json' });

  const imagesV2 = Array.isArray(assets.imagesV2) ? assets.imagesV2 : [];
  const manifest = imagesV2.map(img => ({
    src: img.src,
    alt: img.alt,
    storagePath: img.storagePath,
    bytes: img.bytes,
    contentType: img.contentType,
    classification: img.classification || null,
    error: img.error || null,
  }));
  archive.append(jsonPretty({ count: manifest.length, images: manifest }), { name: 'assets/manifest.json' });

  // Download each classified image from GCS and embed in the ZIP.
  for (const img of imagesV2) {
    if (!img.storagePath || img.error) continue;
    try {
      const [buf] = await bucket.file(img.storagePath).download();
      const base = img.storagePath.split('/').pop();
      archive.append(buf, { name: `assets/images/${base}` });
    } catch (_e) {
      // Skip missing files — object may have aged out of the bucket.
    }
  }

  await archive.finalize();
  await finishWrite;

  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + EXPIRY_MS,
    version: 'v4',
  });
  return {
    storagePath: zipPath,
    signedUrl: url,
    signedUrlExpiresAt: new Date(Date.now() + EXPIRY_MS).toISOString(),
  };
}

module.exports = { buildExport };
