/**
 * Brand Scraper V2 assets: download crawled image URLs to GCS, classify each
 * with Gemini Flash vision, and return a manifest with signed URLs.
 *
 * Storage layout:
 *   gs://aep-orchestration-lab-brand-scrapes/<sandbox>/<scrapeId>/images/<n>-<hash>.<ext>
 *
 * Bucket lifecycle (set at infra time) deletes objects at age ≥ 3 days.
 */
'use strict';

const admin = require('firebase-admin');
const crypto = require('crypto');

const BUCKET_NAME = process.env.BRAND_SCRAPER_BUCKET || 'aep-orchestration-lab-brand-scrapes';
const MAX_IMAGES_TO_CLASSIFY = 20;
const MAX_DOWNLOAD_BYTES = 4 * 1024 * 1024; // 4MB per image
const DOWNLOAD_TIMEOUT_MS = 8000;
const SIGNED_URL_EXPIRY_MS = 72 * 60 * 60 * 1000; // 72h — matches GCS lifecycle
const CLASSIFY_CONCURRENCY = 4;
const CLASSIFY_SYSTEM = `You are an image classifier for brand-asset triage. For each image you see, respond with valid JSON only:
{
  "category": "logo|product|hero_banner|lifestyle|icon|illustration|infographic|portrait|decorative|tracking_pixel|unknown",
  "subject": "<1-line description of what is shown>",
  "text_detected": "<quoted text if any text is visible, else empty string>",
  "confidence": "low|medium|high"
}

Rules:
- tracking_pixel applies to 1x1 or very tiny images with no visible content.
- logo: brand/company mark.
- product: photo or render of a product.
- hero_banner: wide promotional/marketing imagery with brand messaging.
- lifestyle: people or scenes evoking brand mood, not product-focused.
- icon: small UI glyph.
- illustration: drawn/vector art.
- infographic: chart/diagram/stats.
- portrait: headshot of a person (team, testimonial).
- decorative: background/pattern/texture.
- unknown if genuinely unclassifiable.
- Keep subject short (max 120 chars). No line breaks inside values.`;

function getBucket() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.storage().bucket(BUCKET_NAME);
}

function extensionFromContentType(ct) {
  if (!ct) return 'bin';
  const clean = String(ct).split(';')[0].trim().toLowerCase();
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/avif': 'avif',
    'image/bmp': 'bmp',
    'image/x-icon': 'ico',
    'image/vnd.microsoft.icon': 'ico',
  };
  return map[clean] || (clean.startsWith('image/') ? clean.split('/')[1] : 'bin');
}

async function downloadImage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AEPOrchestrationLab-BrandScraper/1.0)',
        Accept: 'image/*,*/*;q=0.5',
      },
    });
    if (!resp.ok) return { error: `HTTP ${resp.status}` };
    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      // Some CDNs mislabel; still accept known image extensions in URL.
      if (!/\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)(\?|$)/i.test(url)) {
        return { error: `non-image content-type: ${contentType}` };
      }
    }
    const lenHeader = Number(resp.headers.get('content-length') || 0);
    if (lenHeader && lenHeader > MAX_DOWNLOAD_BYTES) {
      return { error: `content-length ${lenHeader} exceeds ${MAX_DOWNLOAD_BYTES}` };
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length > MAX_DOWNLOAD_BYTES) {
      return { error: `body ${buf.length}B exceeds ${MAX_DOWNLOAD_BYTES}` };
    }
    if (buf.length < 100) return { error: 'too small (likely tracking pixel)' };
    return { bytes: buf, contentType, extension: extensionFromContentType(contentType) };
  } catch (e) {
    return { error: String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}

async function uploadBytes(sandbox, scrapeId, index, bytes, contentType, extension) {
  const bucket = getBucket();
  const hash = crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 10);
  const safeScrape = String(scrapeId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeSandbox = String(sandbox || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  const name = `scrapes/${safeSandbox}/${safeScrape}/images/${String(index).padStart(3, '0')}-${hash}.${extension}`;
  const file = bucket.file(name);
  await file.save(bytes, {
    contentType: contentType || 'application/octet-stream',
    resumable: false,
    metadata: {
      cacheControl: 'public, max-age=300',
      metadata: { sandbox: safeSandbox, scrapeId: safeScrape },
    },
  });
  // Best-effort: flip the object to public-read so the Image Hosting page
  // can render it without a fresh signed URL every time. If the bucket has
  // uniform bucket-level access enabled this call throws — we swallow and
  // fall back to the signed URL on the client.
  let publicUrl = '';
  try {
    await file.makePublic();
    publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${name.split('/').map(encodeURIComponent).join('/')}`;
  } catch (_e) {
    publicUrl = '';
  }
  return { path: name, bytes: bytes.length, publicUrl };
}

async function signedUrlFor(path) {
  const bucket = getBucket();
  const [url] = await bucket.file(path).getSignedUrl({
    action: 'read',
    expires: Date.now() + SIGNED_URL_EXPIRY_MS,
    version: 'v4',
  });
  return url;
}

async function classifyWithGemini(bytes, contentType) {
  const { VertexAI } = require('@google-cloud/vertexai');
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'aep-orchestration-lab';
  const location = process.env.VERTEX_LOCATION || 'us-central1';
  const modelName = process.env.VERTEX_GEMINI_VISION_MODEL || 'gemini-2.5-flash';
  const vertex = new VertexAI({ project, location });
  const model = vertex.getGenerativeModel({
    model: modelName,
    systemInstruction: { role: 'system', parts: [{ text: CLASSIFY_SYSTEM }] },
    generationConfig: { temperature: 0.1, maxOutputTokens: 512, responseMimeType: 'application/json' },
  });
  const resp = await model.generateContent({
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { data: bytes.toString('base64'), mimeType: contentType || 'image/png' } },
        { text: 'Classify this image.' },
      ],
    }],
  });
  const candidates = resp && resp.response && resp.response.candidates;
  if (!candidates || !candidates.length) throw new Error('no candidates');
  const finish = candidates[0].finishReason;
  const parts = (candidates[0].content && candidates[0].content.parts) || [];
  const text = parts.map(p => p.text || '').join('').trim();
  if (!text) throw new Error(`empty response (finishReason=${finish})`);
  try {
    const stripped = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    return JSON.parse(stripped);
  } catch (_e) {
    return { category: 'unknown', subject: text.slice(0, 120), text_detected: '', confidence: 'low' };
  }
}

async function processInBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const results = await Promise.all(batch.map((item, j) => fn(item, i + j).catch(e => ({ error: String((e && e.message) || e) }))));
    out.push(...results);
  }
  return out;
}

/**
 * Download the top image URLs for a scrape, classify them, upload to GCS,
 * and return the refreshed assets object with classifications + signed URLs.
 */
async function classifyScrapeAssets(sandbox, scrapeId, record) {
  const assets = (record && record.crawlSummary && record.crawlSummary.assets) || {};
  const images = Array.isArray(assets.images) ? assets.images.slice(0, MAX_IMAGES_TO_CLASSIFY) : [];
  if (!images.length) {
    return { classified: 0, images: [], skipped: 'no images to classify' };
  }

  const results = await processInBatches(images, CLASSIFY_CONCURRENCY, async (img, idx) => {
    const dl = await downloadImage(img.src);
    if (dl.error) return { src: img.src, alt: img.alt || '', error: dl.error };
    let stored;
    try {
      stored = await uploadBytes(sandbox, scrapeId, idx, dl.bytes, dl.contentType, dl.extension);
    } catch (e) {
      return { src: img.src, alt: img.alt || '', error: 'upload failed: ' + ((e && e.message) || e) };
    }
    let classification = null;
    try {
      classification = await classifyWithGemini(dl.bytes, dl.contentType);
    } catch (e) {
      classification = { category: 'unknown', error: String((e && e.message) || e) };
    }
    let signedUrl = '';
    try { signedUrl = await signedUrlFor(stored.path); }
    catch (_e) { /* swallow — we still have the path */ }
    return {
      src: img.src,
      alt: img.alt || '',
      storagePath: stored.path,
      bytes: stored.bytes,
      contentType: dl.contentType,
      signedUrl,
      signedUrlExpiresAt: new Date(Date.now() + SIGNED_URL_EXPIRY_MS).toISOString(),
      publicUrl: stored.publicUrl || '',
      classification,
    };
  });

  const ok = results.filter(r => !r.error);
  return {
    classified: ok.length,
    total: results.length,
    signedUrlExpiresAt: new Date(Date.now() + SIGNED_URL_EXPIRY_MS).toISOString(),
    images: results,
  };
}

module.exports = {
  BUCKET_NAME,
  classifyScrapeAssets,
  signedUrlFor,
  getBucket,
};
