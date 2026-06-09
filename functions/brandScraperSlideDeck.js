/**
 * Brand Scraper slide deck — PPTX export of scrape results (PptxGenJS).
 */
'use strict';

const ADOBE_RED = 'EB1000';
const INK = '1A1A1A';
const INK_SOFT = '4A5060';
const INK_MUTE = '7D8492';
const DEFAULT_ACCENT = '1473E6';

function safeFilename(s) {
  return String(s || 'brand-scrape').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}

function truncate(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function accentHex(record) {
  const crawl = record.crawlSummary || record.crawl || {};
  const palette = crawl.assets && crawl.assets.palette;
  if (Array.isArray(palette)) {
    for (const raw of palette) {
      const c = String(raw || '').replace(/^#/, '').trim();
      if (/^[0-9A-Fa-f]{6}$/.test(c)) return c.toUpperCase();
    }
  }
  return DEFAULT_ACCENT;
}

function crawlOf(record) {
  return record.crawlSummary || record.crawl || {};
}

function analysisOf(record) {
  const a = record.analysis;
  if (!a || a.skipped || a.error) return null;
  return a;
}

function bulletText(items, maxItems, maxLen) {
  return (items || [])
    .slice(0, maxItems)
    .map((t) => truncate(t, maxLen))
    .filter(Boolean);
}

function addFooter(slide) {
  slide.addText('Adobe', {
    x: 0.4, y: 7.05, w: 1.2, h: 0.3,
    color: ADOBE_RED, fontSize: 14, bold: true,
  });
  slide.addText(`© ${new Date().getFullYear()} Adobe. All Rights Reserved. Adobe Confidential.`, {
    x: 4.0, y: 7.1, w: 9.0, h: 0.2,
    color: INK_MUTE, fontSize: 8, align: 'right',
  });
}

function addSectionSlide(pres, accent, title, subtitle, bullets, body) {
  const slide = pres.addSlide();
  slide.background = { color: 'FFFFFF' };
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 13.333, h: 0.12,
    fill: { color: accent }, line: { color: accent, width: 0 },
  });
  slide.addText(title, {
    x: 0.55, y: 0.35, w: 12.2, h: 0.65,
    fontSize: 26, bold: true, color: INK,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.55, y: 0.98, w: 12.2, h: 0.35,
      fontSize: 11, color: INK_MUTE,
    });
  }
  let y = subtitle ? 1.45 : 1.2;
  if (body) {
    slide.addText(body, {
      x: 0.55, y, w: 12.2, h: 1.35,
      fontSize: 13, color: INK_SOFT, valign: 'top',
    });
    y += 1.45;
  }
  const list = bulletText(bullets, 12, 220);
  if (list.length) {
    slide.addText(
      list.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })),
      {
        x: 0.55, y, w: 12.2, h: Math.max(1.5, 6.8 - y),
        fontSize: 12.5, color: INK_SOFT, valign: 'top',
      },
    );
  } else if (!body) {
    slide.addText('Not generated for this scrape.', {
      x: 0.55, y: 1.6, w: 12.2, h: 0.4,
      fontSize: 12, color: INK_MUTE, italic: true,
    });
  }
  addFooter(slide);
  return slide;
}

function buildConversationStarters(record, crawl) {
  const analysis = analysisOf(record);
  const tagSummary = crawl.tagAuditSummary || null;
  const vendors = tagSummary && Array.isArray(tagSummary.vendorTags) ? tagSummary.vendorTags.slice(0, 4) : [];
  const opportunities = tagSummary && Array.isArray(tagSummary.opportunities) ? tagSummary.opportunities.slice(0, 2) : [];
  const campaigns = (record.campaigns && !record.campaigns.error && !record.campaigns.skipped && Array.isArray(record.campaigns.campaigns))
    ? record.campaigns.campaigns.filter((c) => !c.is_recommendation).slice(0, 2)
    : [];
  const segments = (record.segments && !record.segments.error && !record.segments.skipped && Array.isArray(record.segments.segments))
    ? record.segments.segments
    : [];
  const stakeholders = (record.stakeholders && !record.stakeholders.error && !record.stakeholders.skipped && Array.isArray(record.stakeholders.people))
    ? record.stakeholders.people
    : [];
  const starters = [];
  if (record.industry) starters.push(`Primary industry signal: ${record.industry}.`);
  if (vendors.length) starters.push(`Detected martech vendors on sampled pages: ${vendors.join(', ')}.`);
  for (const o of opportunities) starters.push(String(o));
  if (campaigns.length) {
    const names = campaigns.map((c) => c.name || 'campaign').filter(Boolean);
    if (names.length) starters.push(`Current on-site campaign evidence: ${names.join('; ')}.`);
  }
  if (segments.length) starters.push(`${segments.length} audience segment(s) inferred from site messaging and behavior.`);
  if (stakeholders.length) starters.push(`${stakeholders.length} named stakeholder(s) identified on the site.`);
  if (analysis && analysis.about && !starters.length) starters.push(truncate(analysis.about, 160));
  return starters.slice(0, 6);
}

async function renderSlideDeck(record) {
  const PptxGenJS = require('pptxgenjs');
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE';
  const brandName = record.brandName || 'Brand';
  const baseUrl = record.baseUrl || record.url || '';
  const accent = accentHex(record);
  pres.title = `${brandName} — brand scrape deck`;
  pres.author = 'Adobe AEP Orchestration Lab';

  const crawl = crawlOf(record);
  const analysis = analysisOf(record);
  const metaParts = [
    baseUrl,
    (record.businessType || '').toUpperCase(),
    record.country || '',
    record.industry || '',
  ].filter(Boolean);

  // ─── Slide 1 — Title ───────────────────────────────────────────────────
  const s1 = pres.addSlide();
  s1.background = { color: 'FFFFFF' };
  s1.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 13.333, h: 0.14,
    fill: { color: accent }, line: { color: accent, width: 0 },
  });
  s1.addText(brandName, {
    x: 0.55, y: 1.35, w: 12.2, h: 1.0,
    fontSize: 40, bold: true, color: INK,
  });
  s1.addText('Brand scrape overview', {
    x: 0.55, y: 2.35, w: 12.2, h: 0.45,
    fontSize: 16, color: INK_SOFT,
  });
  if (metaParts.length) {
    s1.addText(metaParts.join(' · '), {
      x: 0.55, y: 2.95, w: 12.2, h: 0.35,
      fontSize: 11, color: INK_MUTE,
    });
  }
  if (analysis && analysis.about) {
    s1.addText(truncate(analysis.about, 320), {
      x: 0.55, y: 3.55, w: 12.2, h: 2.2,
      fontSize: 14, color: INK_SOFT, valign: 'top',
    });
  }
  s1.addText(`Generated ${new Date().toISOString().slice(0, 10)} · AEP Orchestration Lab`, {
    x: 0.55, y: 6.35, w: 12.2, h: 0.3,
    fontSize: 9, color: INK_MUTE,
  });
  addFooter(s1);

  // ─── Slide 2 — Summary ─────────────────────────────────────────────────
  const summaryBullets = buildConversationStarters(record, crawl);
  const tagSummary = crawl.tagAuditSummary;
  const vendorLine = tagSummary && Array.isArray(tagSummary.vendorTags) && tagSummary.vendorTags.length
    ? `Technology profile (crawl sample): ${tagSummary.vendorTags.slice(0, 6).join(', ')}.`
    : '';
  if (vendorLine) summaryBullets.unshift(vendorLine);
  addSectionSlide(
    pres,
    accent,
    'Summary',
    metaParts.join(' · ') || undefined,
    summaryBullets,
    analysis && analysis.about ? truncate(analysis.about, 480) : '',
  );

  // ─── Slide 3 — Competitor analysis ─────────────────────────────────────
  const cfg = record.llmDemoConfig;
  if (cfg && typeof cfg === 'object') {
    const compBullets = [];
    if (Array.isArray(cfg.competitors) && cfg.competitors.length) {
      compBullets.push(`Competitors: ${cfg.competitors.slice(0, 6).join(', ')}`);
    }
    if (Array.isArray(cfg.samplePaths) && cfg.samplePaths.length) {
      compBullets.push(`Sample paths: ${cfg.samplePaths.slice(0, 6).join(', ')}`);
    }
    if (Array.isArray(cfg.samplePrompts) && cfg.samplePrompts.length) {
      for (const p of cfg.samplePrompts.slice(0, 5)) compBullets.push(truncate(p, 200));
      if (cfg.samplePrompts.length > 5) compBullets.push(`…and ${cfg.samplePrompts.length - 5} more comparison prompts.`);
    }
    addSectionSlide(
      pres,
      accent,
      'Competitor analysis',
      'Direct competitors, site paths, and consumer comparison prompts from this scrape.',
      compBullets,
    );
  }

  // ─── Brand guidelines ──────────────────────────────────────────────────
  if (analysis) {
    const guideBullets = [];
    for (const t of (analysis.tone_of_voice || []).slice(0, 4)) {
      guideBullets.push(`${t.rule || 'Tone'}${t.example ? ` — ${t.example}` : ''}`);
    }
    for (const v of (analysis.brand_values || []).slice(0, 4)) {
      guideBullets.push(`${v.value || 'Value'} — ${v.description || ''}`);
    }
    for (const e of (analysis.editorial_guidelines || []).slice(0, 3)) {
      guideBullets.push(`${e.rule || 'Rule'}${e.example ? ` — ${e.example}` : ''}`);
    }
    for (const ch of (analysis.channel_guidelines || []).slice(0, 2)) {
      const bits = [ch.channel, ch.headline, ch.subject_line, ch.cta].filter(Boolean);
      if (bits.length) guideBullets.push(bits.join(' · '));
    }
    if (guideBullets.length) {
      addSectionSlide(pres, accent, 'Brand guidelines', 'Tone, values, editorial rules, and channel samples.', guideBullets);
    }
  }

  // ─── Campaigns ─────────────────────────────────────────────────────────
  const campaignList = (record.campaigns && !record.campaigns.error && !record.campaigns.skipped && Array.isArray(record.campaigns.campaigns))
    ? record.campaigns.campaigns
    : [];
  if (campaignList.length) {
    const bullets = [];
    for (const c of campaignList.slice(0, 6)) {
      const label = c.is_recommendation ? '[Recommended] ' : '[On-site] ';
      const parts = [c.name, c.channel, c.summary, c.cta].filter(Boolean);
      bullets.push(label + truncate(parts.join(' · '), 180));
    }
    addSectionSlide(pres, accent, 'Campaigns', `${campaignList.length} campaign(s) detected or recommended.`, bullets);
  }

  // ─── Personas ──────────────────────────────────────────────────────────
  const personaList = (record.personas && !record.personas.error && !record.personas.skipped && Array.isArray(record.personas.personas))
    ? record.personas.personas
    : [];
  if (personaList.length) {
    const bullets = personaList.slice(0, 5).map((p) => {
      const meta = [p.name, p.age, p.occupation, p.location].filter(Boolean).join(' · ');
      const tail = p.bio ? ` — ${truncate(p.bio, 120)}` : '';
      return meta + tail;
    });
    addSectionSlide(pres, accent, 'Customer personas', `${personaList.length} persona(s) for ${record.country || 'target market'}.`, bullets);
  }

  // ─── Audience segments ───────────────────────────────────────────────────
  const segmentList = (record.segments && !record.segments.error && !record.segments.skipped && Array.isArray(record.segments.segments))
    ? record.segments.segments
    : [];
  if (segmentList.length) {
    const bullets = segmentList.slice(0, 6).map((s) => {
      const bits = [s.name, s.evaluation_type, s.estimated_size, s.description].filter(Boolean);
      return truncate(bits.join(' · '), 200);
    });
    addSectionSlide(pres, accent, 'Audience segments', 'Real-Time CDP-style segments grounded in personas and campaigns.', bullets);
  }

  // ─── Stakeholders ──────────────────────────────────────────────────────
  const people = (record.stakeholders && !record.stakeholders.error && !record.stakeholders.skipped && Array.isArray(record.stakeholders.people))
    ? record.stakeholders.people
    : [];
  if (people.length) {
    const bullets = people.slice(0, 8).map((p) => {
      const bits = [p.name, p.role, p.level, p.department].filter(Boolean);
      return bits.join(' · ');
    });
    addSectionSlide(pres, accent, 'Business stakeholders', `${people.length} people identified from leadership / team pages.`, bullets);
  }

  // ─── Tag & analytics ───────────────────────────────────────────────────
  if (tagSummary && typeof tagSummary === 'object') {
    const bullets = [];
    if (Array.isArray(tagSummary.vendorTags) && tagSummary.vendorTags.length) {
      bullets.push(`Detected vendors: ${tagSummary.vendorTags.join(', ')}`);
    }
    if (tagSummary.pagesAudited) bullets.push(`Pages audited: ${tagSummary.pagesAudited}`);
    if (tagSummary.pagesWithConsoleErrors) bullets.push(`Console errors on ${tagSummary.pagesWithConsoleErrors} page(s).`);
    if (Array.isArray(tagSummary.opportunities)) {
      for (const o of tagSummary.opportunities.slice(0, 4)) bullets.push(String(o));
    }
    if (bullets.length) {
      addSectionSlide(pres, accent, 'Tag & analytics audit', 'Directional martech inventory from the crawl sample.', bullets);
    }
  }

  // ─── Brand assets ──────────────────────────────────────────────────────
  const assets = crawl.assets || {};
  const assetBullets = [];
  if (Array.isArray(assets.palette) && assets.palette.length) {
    assetBullets.push(`Colour palette: ${assets.palette.slice(0, 8).join(', ')}`);
  }
  if (Array.isArray(assets.fonts) && assets.fonts.length) {
    assetBullets.push(`Font families: ${assets.fonts.slice(0, 6).join(', ')}`);
  }
  if (assets.favicon) assetBullets.push(`Favicon captured from crawl.`);
  if (Array.isArray(assets.images) && assets.images.length) {
    assetBullets.push(`${assets.images.length} image URL(s) catalogued from crawled pages.`);
  }
  if (assetBullets.length) {
    addSectionSlide(pres, accent, 'Brand assets', 'Visual identity signals extracted from the site.', assetBullets);
  }

  return pres.write({ outputType: 'nodebuffer' });
}

module.exports = {
  renderSlideDeck,
  safeFilename,
};
