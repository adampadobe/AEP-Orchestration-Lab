import { classifyBrandScrapeImages, getBrandScrape } from './labApiClient.mjs';

const SUPPORTING_CATEGORIES = new Set(['hero_banner', 'lifestyle', 'product', 'illustration']);

export function summarizeImageClassification(record) {
  const images = Array.isArray(record?.crawlSummary?.assets?.imagesV2)
    ? record.crawlSummary.assets.imagesV2
    : [];
  const usable = images.filter((image) => image?.storagePath && !image?.error);
  const categories = usable.reduce((counts, image) => {
    const category = String(image?.classification?.category || 'unknown').toLowerCase();
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {});
  const hasPersistedLogo = Boolean(
    record?.customerLogo?.storedPath || record?.customerLogo?.cachePath,
  );
  const hasLogo = hasPersistedLogo || usable.some(
    (image) => String(image?.classification?.category || '').toLowerCase() === 'logo',
  );
  const hasSupportingImage = usable.some((image) => SUPPORTING_CATEGORIES.has(
    String(image?.classification?.category || '').toLowerCase(),
  ));
  return {
    total: images.length,
    usable: usable.length,
    categories,
    hasLogo,
    hasSupportingImage,
    readyForDemoAssets: hasLogo && hasSupportingImage,
    inventory: usable.map((image) => ({
      imageIndex: images.indexOf(image),
      category: String(image?.classification?.category || 'unknown').toLowerCase(),
      subject: String(image?.classification?.subject || image?.alt || '').slice(0, 160),
      confidence: String(image?.classification?.confidence || 'low').toLowerCase(),
      storagePath: image.storagePath,
      sourceUrl: String(image?.src || ''),
    })),
  };
}

export async function ensureClassifiedScrapeImages({ sandbox, scrapeId, force = false }, deps = {}) {
  const loadScrape = deps.getBrandScrape || getBrandScrape;
  const classifyImages = deps.classifyBrandScrapeImages || classifyBrandScrapeImages;
  let scrape = await loadScrape({ sandbox, scrapeId });
  if (!scrape.ok) return { ok: false, errorResult: scrape };
  if (String(scrape.data?.scrapeStatus || '').toLowerCase() !== 'complete') {
    return {
      ok: false,
      error: 'Brand scrape must be complete before classifying images.',
      scrapeStatus: scrape.data?.scrapeStatus || null,
    };
  }

  const before = summarizeImageClassification(scrape.data);
  const { inventory: _beforeInventory, ...beforeSummary } = before;
  let classifier = null;
  if (force || !before.readyForDemoAssets) {
    classifier = await classifyImages({ sandbox, scrape_id: scrapeId });
    if (!classifier.ok) return { ok: false, errorResult: classifier, before: beforeSummary };
    scrape = await loadScrape({ sandbox, scrapeId });
    if (!scrape.ok) return { ok: false, errorResult: scrape, before: beforeSummary, classifier: classifier.data };
  }

  const after = summarizeImageClassification(scrape.data);
  return {
    ok: true,
    record: scrape.data,
    classification: {
      ran: Boolean(classifier),
      reason: force ? 'forced' : (classifier ? 'missing_demo_asset_categories' : 'existing_classification_ready'),
      before: beforeSummary,
      after,
      classified: classifier?.data?.classified ?? 0,
      total: classifier?.data?.total ?? after.total,
      elapsedMs: classifier?.data?.elapsedMs ?? 0,
    },
  };
}
