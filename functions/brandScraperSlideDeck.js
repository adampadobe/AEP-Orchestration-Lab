/**
 * Brand Scraper slide deck — PPTX export of scrape results (PptxGenJS).
 */
'use strict';

const ADOBE_RED = 'EB1000';
const INK = '1A1A1A';
const INK_SOFT = '4A5060';
const INK_MUTE = '7D8492';
const DEFAULT_ACCENT = '1473E6';
const SURFACE_ALT = 'F5F7FA';
const BORDER = 'E3E6EB';
const CHIP_SEGMENT_BG = 'EEF4FC';
const PPTX_REMOTE_IMAGE_TIMEOUT_MS = 20000;

function safeFilename(s) {
  return String(s || 'brand-scrape').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}

function truncate(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function crawlOf(record) {
  return record.crawlSummary || record.crawl || {};
}

function analysisOf(record) {
  const a = record.analysis;
  if (!a || a.skipped || a.error) return null;
  return a;
}

function imageUrlFromEntry(entry) {
  if (!entry) return '';
  if (typeof entry === 'string') return entry.trim();
  return String(entry.src || entry.href || entry.signedUrl || entry.url || '').trim();
}

function imageHaystack(entry) {
  if (!entry || typeof entry !== 'object') return String(entry || '').toLowerCase();
  return [
    entry.src,
    entry.href,
    entry.alt,
    entry.url,
    entry.classification && entry.classification.subject,
    entry.classification && entry.classification.category,
  ].filter(Boolean).join(' ').toLowerCase();
}

function scoreLogoCandidate(entry) {
  const hay = imageHaystack(entry);
  let score = 0;
  if (/logo/.test(hay)) score += 10;
  if (entry.classification && entry.classification.category === 'logo') score += 20;
  if (/brandmark|site-logo|header-logo|nav-logo/.test(hay)) score += 6;
  if (/\.svg($|\?)/i.test(imageUrlFromEntry(entry))) score += 2;
  if (/favicon|icon-/.test(hay)) score -= 2;
  if (/banner|hero|product|lifestyle|tracking|pixel|1x1/.test(hay)) score -= 4;
  return score;
}

function pickLogoUrl(assets) {
  if (!assets || typeof assets !== 'object') return '';

  const ranked = [];
  for (const img of assets.imagesV2 || []) {
    if (!img || img.error) continue;
    const url = imageUrlFromEntry(img);
    if (!url) continue;
    ranked.push({ url, score: scoreLogoCandidate(img) });
  }
  for (const img of assets.images || []) {
    const url = imageUrlFromEntry(img);
    if (!url) continue;
    ranked.push({ url, score: scoreLogoCandidate(img) });
  }
  ranked.sort((a, b) => b.score - a.score);
  if (ranked.length && ranked[0].score >= 4) return ranked[0].url;

  if (Array.isArray(assets.favicons) && assets.favicons.length) {
    const fav = assets.favicons.find((f) => imageUrlFromEntry(f)) || assets.favicons[0];
    const url = imageUrlFromEntry(fav);
    if (url) return url;
  }
  if (Array.isArray(assets.ogImages) && assets.ogImages[0]) {
    return imageUrlFromEntry(assets.ogImages[0]);
  }
  return ranked[0] ? ranked[0].url : '';
}

function pickHeroUrls(assets, limit) {
  const out = [];
  const seen = new Set();
  const add = (entry, boost) => {
    const url = imageUrlFromEntry(entry);
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ url, score: boost + scoreLogoCandidate(entry) });
  };

  for (const img of assets.imagesV2 || []) {
    if (!img || img.error) continue;
    const cat = img.classification && img.classification.category;
    if (cat === 'logo' || cat === 'tracking_pixel') continue;
    const boost = cat === 'hero_banner' ? 12 : cat === 'product' ? 8 : cat === 'lifestyle' ? 6 : 2;
    add(img, boost);
  }
  for (const img of assets.images || []) {
    const hay = imageHaystack(img);
    if (/logo|icon|pixel|spacer|1x1|tracking/.test(hay)) continue;
    const boost = /hero|banner|campaign|product|lifestyle/.test(hay) ? 8 : 1;
    add(img, boost);
  }
  for (const url of assets.ogImages || []) add(url, 5);

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit).map((x) => x.url);
}

async function fetchUrlAsPptxImageData(url) {
  const resp = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(PPTX_REMOTE_IMAGE_TIMEOUT_MS),
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; AEP-Orchestration-Lab-brand-scraper-pptx/1.0)',
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const ct = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  let mime = ct.startsWith('image/') ? ct : '';
  if (!mime && buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) mime = 'image/jpeg';
  if (!mime && buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50) mime = 'image/png';
  if (!mime && buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') mime = 'image/webp';
  if (!mime && /svg/.test(url)) mime = 'image/svg+xml';
  if (!mime) mime = 'image/jpeg';
  return `${mime};base64,${buf.toString('base64')}`;
}

async function fetchImageSafe(url) {
  if (!url) return null;
  try {
    return await fetchUrlAsPptxImageData(url);
  } catch (e) {
    console.warn('[brandScraperSlideDeck] image fetch failed', url, String(e && e.message || e));
    return null;
  }
}

async function resolveDeckImages(record) {
  const assets = crawlOf(record).assets || {};
  const logoUrl = pickLogoUrl(assets);
  const heroUrls = pickHeroUrls(assets, 4);
  const logoData = await fetchImageSafe(logoUrl);
  const heroData = [];
  for (const url of heroUrls) {
    const data = await fetchImageSafe(url);
    if (data) heroData.push({ url, data });
  }
  return { logoData, heroData, logoUrl };
}

function accentHex(record) {
  const assets = crawlOf(record).assets || {};
  if (Array.isArray(assets.colours)) {
    for (const c of assets.colours) {
      const raw = String((c && c.value) || c || '').replace(/^#/, '').trim();
      if (/^[0-9A-Fa-f]{6}$/.test(raw)) return raw.toUpperCase();
    }
  }
  return DEFAULT_ACCENT;
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

function addLogoWatermark(slide, logoData) {
  if (!logoData) return;
  slide.addImage({
    data: logoData,
    x: 11.2, y: 0.18, w: 1.75, h: 0.62,
    sizing: { type: 'contain', w: 1.75, h: 0.62 },
  });
}

function addDeckHeader(slide, pres, accent, deckImages, title, subtitle) {
  slide.background = { color: 'FFFFFF' };
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 13.333, h: 0.12,
    fill: { color: accent }, line: { color: accent, width: 0 },
  });
  addLogoWatermark(slide, deckImages.logoData);
  slide.addText(title, {
    x: 0.55, y: 0.35, w: deckImages.logoData ? 10.4 : 12.2, h: 0.55,
    fontSize: 24, bold: true, color: INK,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.55, y: 0.88, w: deckImages.logoData ? 10.4 : 12.2, h: 0.28,
      fontSize: 10, color: INK_MUTE,
    });
  }
}

function addSectionLabel(slide, label, hint, y) {
  slide.addText(String(label || '').toUpperCase(), {
    x: 0.55, y, w: 8.5, h: 0.22,
    fontSize: 9, bold: true, color: INK_MUTE,
  });
  if (hint) {
    slide.addText(hint, {
      x: 8.8, y, w: 4.0, h: 0.22,
      fontSize: 9, color: INK_MUTE, align: 'right',
    });
  }
}

function addFilledChip(slide, pres, text, x, y, accent, opts) {
  const label = truncate(text, 34);
  const w = Math.min(opts && opts.maxW ? opts.maxW : 1.85, 0.2 + label.length * 0.052);
  slide.addShape(pres.ShapeType.roundRect, {
    x, y, w, h: 0.22,
    fill: { color: (opts && opts.muted) ? 'FFFFFF' : CHIP_SEGMENT_BG },
    line: { color: (opts && opts.muted) ? BORDER : accent, width: 0.75 },
    rectRadius: 0.11,
  });
  slide.addText(label, {
    x, y, w, h: 0.22,
    fontSize: 7, color: (opts && opts.muted) ? INK_SOFT : accent,
    align: 'center', valign: 'middle',
  });
  return w + 0.06;
}

function addCtaPill(slide, pres, text, x, y, accent) {
  const label = truncate(text, 36);
  const w = Math.min(2.55, 0.26 + label.length * 0.058);
  slide.addShape(pres.ShapeType.roundRect, {
    x, y, w, h: 0.24,
    fill: { color: accent },
    line: { color: accent, width: 0 },
    rectRadius: 0.12,
  });
  slide.addText(label, {
    x, y, w, h: 0.24,
    fontSize: 8, bold: true, color: 'FFFFFF',
    align: 'center', valign: 'middle',
  });
}

function addBlockLabel(slide, text, x, y, w) {
  slide.addText(String(text || '').toUpperCase(), {
    x, y, w, h: 0.16,
    fontSize: 7.5, bold: true, color: INK_MUTE,
  });
}

function addCampaignCard(slide, pres, cp, x, y, w, h, accent) {
  slide.addShape(pres.ShapeType.roundRect, {
    x, y, w, h,
    fill: { color: SURFACE_ALT },
    line: { color: BORDER, width: 1 },
    rectRadius: 0.1,
  });

  const pad = 0.12;
  let cy = y + pad;
  slide.addText(String(cp.type || 'Campaign').toUpperCase(), {
    x: x + pad, y: cy, w: w - pad * 2 - 0.95, h: 0.18,
    fontSize: 8, bold: true, color: accent,
  });
  if (cp.channel) {
    addFilledChip(slide, pres, cp.channel, x + w - pad - 0.82, cy - 0.01, accent, { maxW: 0.82 });
  }

  cy += 0.22;
  slide.addText(cp.name || 'Untitled', {
    x: x + pad, y: cy, w: w - pad * 2, h: 0.28,
    fontSize: 11, bold: true, color: INK, valign: 'top',
  });

  cy += 0.3;
  if (cp.summary) {
    slide.addText(truncate(cp.summary, 280), {
      x: x + pad, y: cy, w: w - pad * 2, h: 0.95,
      fontSize: 8.5, color: INK, valign: 'top',
    });
    cy += 1.0;
  }

  const headlines = Array.isArray(cp.headlines) ? cp.headlines.slice(0, 3) : [];
  if (headlines.length) {
    addBlockLabel(slide, 'Headlines', x + pad, cy, w - pad * 2);
    cy += 0.18;
    slide.addText(
      headlines.map((t) => ({ text: truncate(t, 90), options: { bullet: true, breakLine: true } })),
      {
        x: x + pad, y: cy, w: w - pad * 2, h: 0.62,
        fontSize: 7.5, color: INK, valign: 'top',
      },
    );
    cy += 0.66;
  }

  if (cp.cta) {
    addCtaPill(slide, pres, cp.cta, x + pad, cy, accent);
    cy += 0.3;
  }

  const meta = [cp.time_context, cp.season].filter(Boolean);
  if (meta.length) {
    let mx = x + pad;
    for (const m of meta.slice(0, 2)) {
      mx += addFilledChip(slide, pres, m, mx, cy, accent, { muted: true, maxW: 1.1 });
    }
    cy += 0.28;
  }

  const segments = Array.isArray(cp.target_segments) ? cp.target_segments : [];
  if (segments.length) {
    addBlockLabel(slide, 'Target segments', x + pad, cy, w - pad * 2);
    cy += 0.18;
    let sx = x + pad;
    let placed = 0;
    for (const seg of segments.slice(0, 4)) {
      const remaining = w - pad * 2 - (sx - x - pad);
      if (remaining < 0.55) {
        sx = x + pad;
        cy += 0.24;
      }
      const chipW = addFilledChip(slide, pres, seg, sx, cy, accent, { maxW: Math.min(1.85, w - pad * 2) });
      sx += chipW;
      placed += 1;
    }
    if (placed) cy += 0.28;
  }

  const sources = Array.isArray(cp.source_urls) ? cp.source_urls : [];
  if (sources.length) {
    addBlockLabel(slide, 'Evidence', x + pad, cy, w - pad * 2);
    cy += 0.16;
    slide.addText(
      sources.slice(0, 2).map((u) => ({ text: truncate(u, 70), options: { bullet: true, breakLine: true } })),
      {
        x: x + pad, y: cy, w: w - pad * 2, h: 0.42,
        fontSize: 6.5, color: accent, valign: 'top',
      },
    );
  }
}

function addCampaignSectionSlide(pres, accent, deckImages, opts) {
  const slide = pres.addSlide();
  addDeckHeader(slide, pres, accent, deckImages, opts.mainTitle || 'Campaigns', opts.mainSubtitle || '');
  addSectionLabel(slide, opts.sectionTitle, opts.sectionHint, 1.08);

  const cards = (opts.campaigns || []).slice(0, 3);
  const n = cards.length || 1;
  const gap = 0.12;
  const cardW = (13.333 - 1.1 - gap * (n - 1)) / n;
  const cardH = 5.55;
  const cardY = 1.35;
  cards.forEach((cp, i) => {
    addCampaignCard(slide, pres, cp, 0.55 + i * (cardW + gap), cardY, cardW, cardH, accent);
  });
  addFooter(slide);
}

function addCampaignSlides(pres, accent, deckImages, campaignsObj) {
  const list = Array.isArray(campaignsObj.campaigns) ? campaignsObj.campaigns : [];
  if (!list.length) return;
  const detected = list.filter((c) => !c.is_recommendation);
  const recommended = list.filter((c) => c.is_recommendation);
  const provider = campaignsObj.provider ? ` · ${campaignsObj.provider}` : '';
  const totalSub = `${list.length} total${provider}`;

  if (detected.length) {
    addCampaignSectionSlide(pres, accent, deckImages, {
      mainTitle: 'Campaigns',
      mainSubtitle: totalSub,
      sectionTitle: 'Detected on-site',
      sectionHint: `${detected.length} campaign${detected.length === 1 ? '' : 's'}`,
      campaigns: detected,
    });
  }
  if (recommended.length) {
    addCampaignSectionSlide(pres, accent, deckImages, {
      mainTitle: 'Campaigns',
      mainSubtitle: detected.length ? 'Recommended for demo' : totalSub,
      sectionTitle: 'Recommended for demo',
      sectionHint: `${recommended.length} suggestion${recommended.length === 1 ? '' : 's'}`,
      campaigns: recommended,
    });
  }
}

function addChannelCard(slide, pres, ch, x, y, w, h, accent) {
  slide.addShape(pres.ShapeType.roundRect, {
    x, y, w, h,
    fill: { color: SURFACE_ALT },
    line: { color: BORDER, width: 1 },
    rectRadius: 0.1,
  });
  const pad = 0.12;
  let cy = y + pad;
  slide.addText(String(ch.channel || 'Channel').toUpperCase(), {
    x: x + pad, y: cy, w: w - pad * 2, h: 0.2,
    fontSize: 9, bold: true, color: accent,
  });
  cy += 0.24;

  const fields = [
    ['Subject', ch.subject_line],
    ['Preheader', ch.preheader],
    ['Headline', ch.headline],
  ];
  for (const [label, value] of fields) {
    const val = value ? String(value) : 'N/A';
    slide.addText([
      { text: `${label}: `, options: { bold: true, color: INK_SOFT } },
      { text: truncate(val, 80), options: { color: INK_SOFT } },
    ], {
      x: x + pad, y: cy, w: w - pad * 2, h: 0.18,
      fontSize: 8, valign: 'top',
    });
    cy += 0.2;
  }

  if (ch.body) {
    slide.addText(truncate(ch.body, 220), {
      x: x + pad, y: cy, w: w - pad * 2, h: h - (cy - y) - 0.55,
      fontSize: 8.5, color: INK, valign: 'top',
    });
  }

  if (ch.cta) {
    addCtaPill(slide, pres, ch.cta, x + pad, y + h - pad - 0.24, accent);
  }
}

function addChannelSamplesSlide(pres, accent, deckImages, channels) {
  const slide = pres.addSlide();
  addDeckHeader(slide, pres, accent, deckImages, 'Brand guidelines', 'Channel samples');
  addSectionLabel(slide, 'Channel samples', `${channels.length} channel${channels.length === 1 ? '' : 's'}`, 1.08);

  const list = channels.slice(0, 3);
  const n = list.length || 1;
  const gap = 0.12;
  const cardW = (13.333 - 1.1 - gap * (n - 1)) / n;
  const cardH = 5.55;
  const cardY = 1.35;
  list.forEach((ch, i) => {
    addChannelCard(slide, pres, ch, 0.55 + i * (cardW + gap), cardY, cardW, cardH, accent);
  });
  addFooter(slide);
}

function addSectionSlide(pres, accent, deckImages, title, subtitle, bullets, body) {
  const slide = pres.addSlide();
  slide.background = { color: 'FFFFFF' };
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 13.333, h: 0.12,
    fill: { color: accent }, line: { color: accent, width: 0 },
  });
  addLogoWatermark(slide, deckImages.logoData);
  slide.addText(title, {
    x: 0.55, y: 0.35, w: deckImages.logoData ? 10.4 : 12.2, h: 0.65,
    fontSize: 26, bold: true, color: INK,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.55, y: 0.98, w: deckImages.logoData ? 10.4 : 12.2, h: 0.35,
      fontSize: 11, color: INK_MUTE,
    });
  }
  let y = subtitle ? 1.45 : 1.2;
  const textW = deckImages.heroData.length && title === 'Summary' ? 7.2 : (deckImages.logoData ? 10.4 : 12.2);
  if (body) {
    slide.addText(body, {
      x: 0.55, y, w: textW, h: 1.35,
      fontSize: 13, color: INK_SOFT, valign: 'top',
    });
    y += 1.45;
  }
  const list = bulletText(bullets, 12, 220);
  if (list.length) {
    slide.addText(
      list.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })),
      {
        x: 0.55, y, w: textW, h: Math.max(1.5, 6.8 - y),
        fontSize: 12.5, color: INK_SOFT, valign: 'top',
      },
    );
  } else if (!body) {
    slide.addText('Not generated for this scrape.', {
      x: 0.55, y: 1.6, w: textW, h: 0.4,
      fontSize: 12, color: INK_MUTE, italic: true,
    });
  }
  if (title === 'Summary' && deckImages.heroData[0]) {
    slide.addImage({
      data: deckImages.heroData[0].data,
      x: 8.15, y: 1.35, w: 4.55, h: 5.15,
      sizing: { type: 'contain', w: 4.55, h: 5.15 },
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

function buildCompetitorBullets(cfg) {
  const compBullets = [];
  if (!cfg || typeof cfg !== 'object') return compBullets;
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
  return compBullets;
}

function addBrandAssetsSlide(pres, accent, deckImages, record) {
  const assets = crawlOf(record).assets || {};
  const slide = pres.addSlide();
  slide.background = { color: 'FFFFFF' };
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 13.333, h: 0.12,
    fill: { color: accent }, line: { color: accent, width: 0 },
  });
  addLogoWatermark(slide, deckImages.logoData);
  slide.addText('Brand assets', {
    x: 0.55, y: 0.35, w: 10.4, h: 0.65,
    fontSize: 26, bold: true, color: INK,
  });
  slide.addText('Visual identity signals extracted from the site.', {
    x: 0.55, y: 0.98, w: 10.4, h: 0.35,
    fontSize: 11, color: INK_MUTE,
  });

  const bullets = [];
  if (Array.isArray(assets.colours) && assets.colours.length) {
    bullets.push(`Colour palette: ${assets.colours.slice(0, 8).map((c) => (c && c.value) || c).join(', ')}`);
  }
  if (Array.isArray(assets.fonts) && assets.fonts.length) {
    bullets.push(`Font families: ${assets.fonts.slice(0, 6).map((f) => (f && f.value) || f).join(', ')}`);
  }
  if (Array.isArray(assets.images) && assets.images.length) {
    bullets.push(`${assets.images.length} image URL(s) catalogued from crawled pages.`);
  }

  const imgs = deckImages.heroData.slice(0, 4);
  const gridX = imgs.length ? 7.0 : 0.55;
  const textW = imgs.length ? 6.1 : 12.2;
  if (bullets.length) {
    slide.addText(
      bullets.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })),
      { x: 0.55, y: 1.5, w: textW, h: 5.0, fontSize: 12.5, color: INK_SOFT, valign: 'top' },
    );
  }
  imgs.forEach((img, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    slide.addImage({
      data: img.data,
      x: gridX + col * 3.05,
      y: 1.45 + row * 2.55,
      w: 2.85,
      h: 2.35,
      sizing: { type: 'contain', w: 2.85, h: 2.35 },
    });
  });
  if (deckImages.logoData && !imgs.length) {
    slide.addImage({
      data: deckImages.logoData,
      x: 8.0, y: 1.8, w: 4.0, h: 2.5,
      sizing: { type: 'contain', w: 4.0, h: 2.5 },
    });
  }
  addFooter(slide);
}

async function renderSlideDeck(record) {
  const PptxGenJS = require('pptxgenjs');
  const competitorCfg = record.llmDemoConfig;
  const deckImages = await resolveDeckImages(record);
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
    record.industry || competitorCfg && competitorCfg.industry || '',
  ].filter(Boolean);

  // ─── Slide 1 — Title ───────────────────────────────────────────────────
  const s1 = pres.addSlide();
  s1.background = { color: 'FFFFFF' };
  s1.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 13.333, h: 0.14,
    fill: { color: accent }, line: { color: accent, width: 0 },
  });
  if (deckImages.logoData) {
    s1.addImage({
      data: deckImages.logoData,
      x: 0.55, y: 0.45, w: 2.4, h: 0.95,
      sizing: { type: 'contain', w: 2.4, h: 0.95 },
    });
  }
  const titleX = deckImages.logoData ? 0.55 : 0.55;
  const titleY = deckImages.logoData ? 1.55 : 1.35;
  const titleW = deckImages.heroData[0] ? 7.4 : 12.2;
  s1.addText(brandName, {
    x: titleX, y: titleY, w: titleW, h: 1.0,
    fontSize: 40, bold: true, color: INK,
  });
  s1.addText('Brand scrape overview', {
    x: titleX, y: titleY + 1.0, w: titleW, h: 0.45,
    fontSize: 16, color: INK_SOFT,
  });
  if (metaParts.length) {
    s1.addText(metaParts.join(' · '), {
      x: titleX, y: titleY + 1.55, w: titleW, h: 0.35,
      fontSize: 11, color: INK_MUTE,
    });
  }
  if (analysis && analysis.about) {
    s1.addText(truncate(analysis.about, 320), {
      x: titleX, y: titleY + 2.05, w: titleW, h: 2.2,
      fontSize: 14, color: INK_SOFT, valign: 'top',
    });
  }
  if (deckImages.heroData[0]) {
    s1.addImage({
      data: deckImages.heroData[0].data,
      x: 8.35, y: 0.55, w: 4.45, h: 5.55,
      sizing: { type: 'contain', w: 4.45, h: 5.55 },
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
    deckImages,
    'Summary',
    metaParts.join(' · ') || undefined,
    summaryBullets,
    analysis && analysis.about ? truncate(analysis.about, 480) : '',
  );

  // ─── Slide 3 — Competitor analysis ─────────────────────────────────────
  const compBullets = buildCompetitorBullets(competitorCfg);
  addSectionSlide(
    pres,
    accent,
    deckImages,
    'Competitor analysis',
    'Direct competitors, site paths, and consumer comparison prompts grounded in crawl + brand analysis.',
    compBullets.length ? compBullets : ['Competitor inference did not return results — re-run Analyse with Competitor analysis enabled.'],
  );

  // ─── Brand guidelines (tone / values — channel samples on own slide) ───
  if (analysis) {
    const guideBullets = [];
    for (const t of (analysis.tone_of_voice || []).slice(0, 4)) {
      guideBullets.push(`${t.rule || 'Tone'}${t.example ? ` — ${t.example}` : ''}`);
    }
    for (const v of (analysis.brand_values || []).slice(0, 4)) {
      guideBullets.push(`${v.value || 'Value'} — ${v.description || ''}`);
    }
    for (const e of (analysis.editorial_guidelines || []).slice(0, 4)) {
      guideBullets.push(`${e.rule || 'Rule'}${e.example ? ` — ${e.example}` : ''}`);
    }
    if (guideBullets.length) {
      addSectionSlide(pres, accent, deckImages, 'Brand guidelines', 'Tone, values, and editorial rules.', guideBullets);
    }
    const channels = Array.isArray(analysis.channel_guidelines) ? analysis.channel_guidelines : [];
    if (channels.length) {
      addChannelSamplesSlide(pres, accent, deckImages, channels);
    }
  }

  // ─── Campaigns (card layout matching brand scraper UI) ─────────────────
  if (record.campaigns && !record.campaigns.error && !record.campaigns.skipped) {
    addCampaignSlides(pres, accent, deckImages, record.campaigns);
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
    addSectionSlide(pres, accent, deckImages, 'Customer personas', `${personaList.length} persona(s) for ${record.country || 'target market'}.`, bullets);
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
    addSectionSlide(pres, accent, deckImages, 'Audience segments', 'Real-Time CDP-style segments grounded in personas and campaigns.', bullets);
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
    addSectionSlide(pres, accent, deckImages, 'Business stakeholders', `${people.length} people identified from leadership / team pages.`, bullets);
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
      addSectionSlide(pres, accent, deckImages, 'Tag & analytics audit', 'Directional martech inventory from the crawl sample.', bullets);
    }
  }

  // ─── Brand assets (with imagery) ─────────────────────────────────────
  const assets = crawl.assets || {};
  const hasAssetContent = (Array.isArray(assets.colours) && assets.colours.length)
    || (Array.isArray(assets.fonts) && assets.fonts.length)
    || (Array.isArray(assets.images) && assets.images.length)
    || deckImages.logoData
    || deckImages.heroData.length;
  if (hasAssetContent) addBrandAssetsSlide(pres, accent, deckImages, record);

  return pres.write({ outputType: 'nodebuffer' });
}

module.exports = {
  renderSlideDeck,
  safeFilename,
  pickLogoUrl,
  pickHeroUrls,
};
