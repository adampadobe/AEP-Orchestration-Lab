/**
 * Scrape confidence scoring and source badges for Brand Scraper.
 */
'use strict';

function totalTextLength(pages) {
  if (!Array.isArray(pages)) return 0;
  return pages.reduce((sum, p) => sum + (Number(p.textLength) || String(p.text || '').length), 0);
}

function countImages(assets) {
  if (!assets) return 0;
  const imgs = Array.isArray(assets.images) ? assets.images.length : 0;
  const og = Array.isArray(assets.ogImages) ? assets.ogImages.length : 0;
  return imgs + og;
}

/**
 * @returns {{ level: 'high'|'medium'|'low', reasons: string[], score: number }}
 */
function computeScrapeConfidence({
  pages = [],
  blockedPages = [],
  uploadedHtmlSummary = null,
  assets = null,
  competitorMode = 'full',
  livePageCount = 0,
  uploadedPageCount = 0,
} = {}) {
  const reasons = [];
  let score = 0;
  const pageCount = pages.length;
  const textLen = totalTextLength(pages);
  const blockedCount = blockedPages.length;
  const uploadedUsed = uploadedPageCount > 0 || (uploadedHtmlSummary && uploadedHtmlSummary.validHtmlFiles > 0);
  const imageCount = countImages(assets);

  if (livePageCount > 0) score += Math.min(30, livePageCount * 10);
  if (uploadedPageCount > 0) score += Math.min(25, uploadedPageCount * 8);
  if (textLen > 8000) score += 25;
  else if (textLen > 2000) score += 15;
  else if (textLen > 500) score += 8;
  if (imageCount >= 4) score += 10;
  else if (imageCount >= 1) score += 5;
  if (blockedCount === 0 && pageCount >= 2) score += 10;
  if (competitorMode === 'full') score += 5;
  else if (competitorMode === 'partial') score += 2;

  if (blockedCount > 0) {
    reasons.push(blockedCount === 1
      ? 'One page was blocked during live crawl'
      : `${blockedCount} pages were blocked during live crawl`);
    score -= Math.min(20, blockedCount * 8);
  }
  if (uploadedUsed) {
    reasons.push('Uploaded HTML was used as fallback or primary source');
  }
  if (livePageCount > 0 && blockedCount > 0) {
    reasons.push(`${livePageCount} live page(s) were successfully parsed`);
  }
  if (pageCount === 0) {
    reasons.push('No usable page content was extracted');
    score = 0;
  } else if (textLen < 500) {
    reasons.push('Limited text content available — outputs may rely on inference');
    score -= 10;
  }
  if (competitorMode === 'skipped') {
    reasons.push('Competitor analysis skipped — insufficient brand context');
    score -= 5;
  } else if (competitorMode === 'partial') {
    reasons.push('Competitor analysis ran in partial mode');
  }

  score = Math.max(0, Math.min(100, score));
  let level = 'low';
  if (score >= 65) level = 'high';
  else if (score >= 35) level = 'medium';

  return { level, reasons: reasons.slice(0, 8), score };
}

function computeSourceBadges({
  pages = [],
  blockedPages = [],
  uploadedHtmlSummary = null,
  scrapeConfidence = null,
  competitorMode = 'full',
} = {}) {
  const badges = [];
  const hasLive = pages.some((p) => p.sourceType === 'live_url' || !p.sourceType);
  const hasUploaded = pages.some((p) => p.sourceType === 'uploaded_html')
    || (uploadedHtmlSummary && uploadedHtmlSummary.validHtmlFiles > 0);
  if (hasLive) badges.push('Live URL');
  if (hasUploaded) badges.push('Uploaded HTML');
  if (blockedPages.length > 0) badges.push('Blocked');
  if (scrapeConfidence && scrapeConfidence.level !== 'high') badges.push('Partial');
  if (competitorMode === 'partial') badges.push('AI inferred');
  if (!hasLive && !hasUploaded && pages.length) badges.push('AI inferred');
  return Array.from(new Set(badges));
}

module.exports = {
  computeScrapeConfidence,
  computeSourceBadges,
};
