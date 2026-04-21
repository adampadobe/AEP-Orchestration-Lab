/**
 * Image hosting library — per-sandbox curated asset store.
 *
 * Layout:
 *   gs://<BUCKET>/<sandbox>/library/<folder?>/<file>
 *   gs://<BUCKET>/<sandbox>/library_backups/<brandSlug>/<folder?>/<file>
 *
 * Public URLs (rewritten via Firebase Hosting → imageHostingAsset):
 *   https://aep-orchestration-lab.web.app/cdn/<sandbox>/<folder?>/<file>
 *
 * Naming convention (applied automatically, user can override):
 *   classification 'logo'         → logo/logo.<ext>
 *   classification 'hero_banner'  → hero-banner.<ext>   (next: hero-banner-2.<ext>)
 *   everything else               → image-1.<ext>, image-2.<ext>, …
 *
 * SVG uploads are converted to PNG so the public URL can be embedded in
 * <img> tags by external consumers that don't render SVG reliably.
 */

'use strict';

const admin = require('firebase-admin');

const BUCKET_NAME = process.env.BRAND_SCRAPER_BUCKET || 'aep-orchestration-lab-brand-scrapes';
const LIBRARY_PREFIX = 'library';
const BACKUPS_PREFIX = 'library_backups';
const CACHE_SECONDS = 60 * 60 * 24 * 7; // 1 week CDN cache

function getBucket() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.storage().bucket(BUCKET_NAME);
}

function safeSlug(s, fallback) {
  const v = String(s || '').toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return v || (fallback || 'item');
}

function sandboxPrefix(sandbox) {
  return safeSlug(sandbox, 'default');
}

function libraryRoot(sandbox) {
  return `${sandboxPrefix(sandbox)}/${LIBRARY_PREFIX}`;
}

function backupsRoot(sandbox) {
  return `${sandboxPrefix(sandbox)}/${BACKUPS_PREFIX}`;
}

function publicCdnUrl(sandbox, relPath) {
  // relPath excludes the leading '<sandbox>/library/'.
  return `/cdn/${sandboxPrefix(sandbox)}/${relPath}`;
}

function extensionFromContentType(ct) {
  const clean = String(ct || '').split(';')[0].trim().toLowerCase();
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
  };
  return map[clean] || (clean.startsWith('image/') ? clean.split('/')[1] : 'bin');
}

function contentTypeFromExt(ext) {
  const e = String(ext || '').toLowerCase().replace(/^\./, '');
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    avif: 'image/avif',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
  };
  return map[e] || 'application/octet-stream';
}

/**
 * Convert arbitrary image bytes to PNG, capped at 1024px on the
 * longest edge to keep library files small. Sharp is loaded lazily to
 * avoid paying the cold-start cost when we don't need to transcode.
 */
async function toPng(bytes) {
  const sharp = require('sharp');
  return sharp(bytes)
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
}

/**
 * Pick a target file name + folder for a published image given its
 * classification, the sandbox's existing library state, and any
 * user-supplied overrides. Returns { folder, file, contentType, bytes }.
 */
async function resolveTargetName(sandbox, opts) {
  const {
    classification, srcName, contentType, bytes,
    overrideFolder, overrideFile,
    // When false, skip the sharp PNG transcode and keep bytes in the
    // source format. Defaults to true — the longstanding behaviour.
    convertToPng = true,
  } = opts;
  let ct = contentType || '';
  let ext = extensionFromContentType(ct) || 'bin';
  let body = bytes;

  if (convertToPng) {
    // Standardise every uploaded image to PNG for consumer consistency.
    // GIFs are the exception — re-encoding to PNG would flatten the
    // animation — so we keep them as-is. Anything else (JPG/JPEG, SVG,
    // WEBP, AVIF, BMP, ICO) is transcoded via sharp.
    if (ext !== 'gif' && ext !== 'png' && ext !== 'bin') {
      try {
        body = await toPng(bytes);
        ct = 'image/png';
        ext = 'png';
      } catch (e) {
        console.warn('[imageHostingLibrary] toPng failed, keeping original', ext, String((e && e.message) || e));
      }
    } else if (ext === 'png') {
      // Existing PNGs still get run through sharp so the 1024px cap
      // applies uniformly — cheap and keeps the library small.
      try { body = await toPng(bytes); }
      catch (_e) { /* keep original bytes on failure */ }
    }
  }
  // convertToPng=false: keep the bytes exactly as uploaded (preserves
  // JPG/WEBP/SVG originals for demos that need format fidelity).

  const cat = (classification && classification.category) || '';

  let folder = '';
  let baseName = '';
  if (overrideFile) {
    // User provided an explicit name. Respect it but derive folder from slashes.
    const parts = String(overrideFile).replace(/^\/+|\/+$/g, '').split('/');
    baseName = safeSlug(parts.pop().replace(/\.[a-z0-9]+$/i, ''), 'image');
    folder = parts.map(p => safeSlug(p, '')).filter(Boolean).join('/');
    if (overrideFolder) folder = String(overrideFolder).split('/').map(p => safeSlug(p, '')).filter(Boolean).join('/');
  } else if (cat === 'logo') {
    folder = 'logo';
    baseName = 'logo';
  } else if (cat === 'hero_banner') {
    folder = '';
    baseName = 'hero-banner';
  } else if (cat === 'product') {
    folder = 'products';
    baseName = safeSlug(srcName || (classification && classification.subject) || 'product', 'product');
  } else {
    folder = '';
    baseName = 'image';
  }
  if (overrideFolder && !overrideFile) {
    folder = String(overrideFolder).split('/').map(p => safeSlug(p, '')).filter(Boolean).join('/');
  }

  const prefix = `${libraryRoot(sandbox)}/${folder ? folder + '/' : ''}`;
  // Avoid collisions for non-logo entries by appending -2, -3, … if the
  // candidate already exists. Logos always overwrite the single slot.
  const candidates = [baseName].concat(
    Array.from({ length: 50 }, (_, i) => `${baseName}-${i + 2}`)
  );
  const bucket = getBucket();
  for (const c of candidates) {
    const key = `${prefix}${c}.${ext}`;
    if (cat === 'logo') {
      // Always write to logo.<ext>; if a different extension is already
      // there (e.g. legacy logo.svg), delete it so there's exactly one.
      await deleteSiblings(key, prefix + c);
      return { folder, file: `${c}.${ext}`, key, contentType: ct || contentTypeFromExt(ext), bytes: body };
    }
    const [exists] = await bucket.file(key).exists();
    if (!exists) {
      return { folder, file: `${c}.${ext}`, key, contentType: ct || contentTypeFromExt(ext), bytes: body };
    }
  }
  // Fallback: timestamp-suffix.
  const ts = Date.now().toString(36);
  const key = `${prefix}${baseName}-${ts}.${ext}`;
  return { folder, file: `${baseName}-${ts}.${ext}`, key, contentType: ct || contentTypeFromExt(ext), bytes: body };
}

async function deleteSiblings(keepKey, prefixWithoutExt) {
  try {
    const [files] = await getBucket().getFiles({ prefix: prefixWithoutExt });
    await Promise.all(files.map(async (f) => {
      if (f.name === keepKey) return;
      // Only delete siblings whose name is exactly <prefixWithoutExt>.<ext>
      if (f.name.startsWith(prefixWithoutExt + '.')) {
        try { await f.delete({ ignoreNotFound: true }); }
        catch (_e) {}
      }
    }));
  } catch (_e) { /* best-effort */ }
}

/**
 * Upload bytes to the library at the resolved path, make public, and
 * return the record the UI needs.
 */
async function putLibraryObject(sandbox, target) {
  const bucket = getBucket();
  const file = bucket.file(target.key);
  await file.save(target.bytes, {
    contentType: target.contentType,
    resumable: false,
    metadata: {
      cacheControl: `public, max-age=${CACHE_SECONDS}, immutable`,
      metadata: { sandbox: sandboxPrefix(sandbox) },
    },
  });
  try { await file.makePublic(); } catch (_e) { /* uniform access — still accessible via cdn proxy */ }
  const [metadata] = await file.getMetadata().catch(() => [null]);
  return {
    sandbox: sandboxPrefix(sandbox),
    folder: target.folder,
    file: target.file,
    path: target.key,
    relPath: target.key.slice(libraryRoot(sandbox).length + 1),
    contentType: target.contentType,
    size: (metadata && Number(metadata.size)) || target.bytes.length,
    cdnUrl: publicCdnUrl(sandbox, target.key.slice(libraryRoot(sandbox).length + 1)),
    publicUrl: `https://storage.googleapis.com/${BUCKET_NAME}/${target.key.split('/').map(encodeURIComponent).join('/')}`,
    updatedAt: (metadata && metadata.updated) || new Date().toISOString(),
  };
}

/** List every object under <sandbox>/library/ */
async function listLibrary(sandbox) {
  const prefix = libraryRoot(sandbox) + '/';
  const [files] = await getBucket().getFiles({ prefix });
  return files.map((f) => {
    const rel = f.name.slice(prefix.length);
    const parts = rel.split('/');
    const file = parts.pop();
    const folder = parts.join('/');
    const md = f.metadata || {};
    const custom = md.metadata || {};
    return {
      sandbox: sandboxPrefix(sandbox),
      folder,
      file,
      path: f.name,
      relPath: rel,
      contentType: md.contentType,
      size: Number(md.size) || 0,
      cdnUrl: publicCdnUrl(sandbox, rel),
      publicUrl: `https://storage.googleapis.com/${BUCKET_NAME}/${f.name.split('/').map(encodeURIComponent).join('/')}`,
      updatedAt: md.updated || null,
      aiGenerated: custom.aiGenerated === 'true',
      aiModel: custom.aiModel || '',
      aiPrompt: custom.aiPrompt || '',
    };
  }).sort((a, b) => a.relPath.localeCompare(b.relPath));
}

/**
 * Replace the bytes behind an existing library file while keeping the
 * exact path (and therefore the /cdn URL). If the incoming source
 * format doesn't match the target extension, sharp converts it so the
 * object on disk always matches its extension + Content-Type.
 */
async function replaceLibraryObject(sandbox, relPath, bytes, sourceContentType) {
  if (!relPath || relPath.indexOf('..') !== -1) throw new Error('bad path');
  const key = libraryRoot(sandbox) + '/' + relPath.replace(/^\/+/, '');
  const bucket = getBucket();
  const targetExt = (relPath.split('.').pop() || '').toLowerCase();
  const targetCt = contentTypeFromExt(targetExt);
  const sourceExt = (extensionFromContentType(sourceContentType) || '').toLowerCase();

  let body = bytes;
  const sharp = (() => { try { return require('sharp'); } catch (_e) { return null; } })();

  // Convert when the incoming bytes don't match the target extension.
  // Special-cases: don't try to re-encode GIF (animation would be
  // flattened) or SVG targets (raster→vector isn't a thing); reject
  // those mismatches outright.
  if (sourceExt && sourceExt !== targetExt) {
    if (targetExt === 'svg' || sourceExt === 'gif') {
      throw new Error('cannot convert ' + sourceExt + ' → ' + targetExt);
    }
    if (!sharp) throw new Error('image conversion library unavailable');
    const pipeline = sharp(body);
    if (targetExt === 'png') body = await pipeline.png().toBuffer();
    else if (targetExt === 'jpg' || targetExt === 'jpeg') body = await pipeline.jpeg({ quality: 90 }).toBuffer();
    else if (targetExt === 'webp') body = await pipeline.webp({ quality: 90 }).toBuffer();
    else if (targetExt === 'avif') body = await pipeline.avif({ quality: 60 }).toBuffer();
    else throw new Error('unsupported target extension: ' + targetExt);
  }

  const file = bucket.file(key);
  await file.save(body, {
    contentType: targetCt,
    resumable: false,
    metadata: {
      cacheControl: `public, max-age=${CACHE_SECONDS}, immutable`,
      metadata: { sandbox: sandboxPrefix(sandbox) },
    },
  });
  try { await file.makePublic(); } catch (_e) {}
  const [md] = await file.getMetadata().catch(() => [null]);
  return {
    sandbox: sandboxPrefix(sandbox),
    path: key,
    relPath,
    contentType: targetCt,
    size: (md && Number(md.size)) || body.length,
    cdnUrl: publicCdnUrl(sandbox, relPath),
    publicUrl: `https://storage.googleapis.com/${BUCKET_NAME}/${key.split('/').map(encodeURIComponent).join('/')}`,
    updatedAt: (md && md.updated) || new Date().toISOString(),
    converted: sourceExt && sourceExt !== targetExt,
  };
}

async function deleteLibraryObject(sandbox, relPath) {
  const prefix = libraryRoot(sandbox) + '/';
  if (!relPath || relPath.indexOf('..') !== -1) throw new Error('bad path');
  const key = prefix + relPath;
  await getBucket().file(key).delete({ ignoreNotFound: true });
  return { deleted: key };
}

async function renameLibraryObject(sandbox, relPath, newRelPath) {
  const prefix = libraryRoot(sandbox) + '/';
  if (!relPath || !newRelPath || relPath.indexOf('..') !== -1 || newRelPath.indexOf('..') !== -1) {
    throw new Error('bad path');
  }
  const src = prefix + relPath;
  const dst = prefix + newRelPath;
  const bucket = getBucket();
  await bucket.file(src).copy(bucket.file(dst));
  try { await bucket.file(dst).makePublic(); } catch (_e) {}
  await bucket.file(src).delete({ ignoreNotFound: true });
  return { src, dst };
}

/**
 * Publish one classified image from a scrape into the library.
 * Fetches bytes from the existing scrape path (in the same bucket) and
 * re-uploads under the curated name. No re-download from the customer.
 */
/**
 * Publish an image into the library. Source precedence:
 *   1. Raw bytes provided by the client (browser already fetched the
 *      image successfully — most reliable path when the origin blocks
 *      server-side requests).
 *   2. A scrape storage path in the same bucket (classified image).
 *   3. A direct URL — last-resort server fetch with a realistic UA.
 */
/**
 * Generate an AI-made substitute image when the real bytes are
 * unreachable (Cloudflare-protected CDNs etc.). Uses Vertex AI's
 * Gemini 2.5 Flash Image model to synthesise a plausible
 * brand-context image from the scrape's classification + metadata.
 *
 * Returns raw bytes ready for upload. The caller is responsible for
 * marking the stored object as `aiGenerated` so the UI can label it.
 */
async function aiGenerateReplacement(opts) {
  const { classification, brandName, subject, sourceUrl, alt } = opts || {};
  const { VertexAI } = require('@google-cloud/vertexai');
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'aep-orchestration-lab';
  const location = process.env.VERTEX_LOCATION || 'us-central1';
  const modelName = process.env.VERTEX_GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image-preview';

  const vertex = new VertexAI({ project, location });
  const model = vertex.getGenerativeModel({
    model: modelName,
    // Flash Image returns both IMAGE and TEXT parts; we only use the image.
    generationConfig: { temperature: 0.3, responseModalities: ['IMAGE', 'TEXT'] },
  });

  const cat = (classification && classification.category) || '';
  const brand = String(brandName || '').trim();
  const descBits = [subject, alt].filter(Boolean).join(' — ');
  const siteHost = (function () {
    try { return new URL(sourceUrl).hostname; } catch (_e) { return ''; }
  })();

  let prompt;
  if (cat === 'logo') {
    prompt = `Create a clean, professional logo mark` +
      (brand ? ` suitable for the brand "${brand}"` : '') +
      `. ${descBits}. Flat, high-contrast, centred on a transparent or white background, no extra text, suitable for use at small sizes.`;
  } else if (cat === 'hero_banner') {
    prompt = `Create a wide marketing hero banner` +
      (brand ? ` for ${brand}` : '') +
      `. ${descBits}. Professional photography style, clean composition, brand-appropriate colours.`;
  } else if (cat === 'product') {
    prompt = `Create a clean product photo. ${descBits || 'A product from this brand.'} White background, soft studio lighting, centred subject.`;
  } else if (cat === 'portrait') {
    prompt = `Create a professional business portrait headshot. ${descBits}. Neutral background, friendly expression.`;
  } else {
    prompt = `Create a brand-appropriate image` +
      (brand ? ` for ${brand}` : '') +
      `. ${descBits || cat || 'Marketing imagery.'}. Professional quality.`;
  }
  if (siteHost && brand && !prompt.includes(siteHost)) {
    prompt += ` (Source reference: ${siteHost}.)`;
  }

  const resp = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  const cand = resp && resp.response && resp.response.candidates && resp.response.candidates[0];
  if (!cand) throw new Error('Gemini image: no candidate returned');
  const parts = (cand.content && cand.content.parts) || [];
  const imagePart = parts.find(p => p && p.inlineData && p.inlineData.data);
  if (!imagePart) {
    const finish = cand.finishReason || 'unknown';
    const text = parts.map(p => p.text || '').join('').slice(0, 200);
    throw new Error('Gemini image: no image in response (finish=' + finish + (text ? ', text="' + text + '"' : '') + ')');
  }
  return {
    bytes: Buffer.from(imagePart.inlineData.data, 'base64'),
    contentType: imagePart.inlineData.mimeType || 'image/png',
    prompt,
  };
}

/**
 * Upload an AI-generated image into the library using the existing
 * naming pipeline, adding `aiGenerated: true` + the source prompt to
 * the object's custom metadata so the UI can render an "AI" badge.
 */
async function publishAiImage(sandbox, opts) {
  const generated = await aiGenerateReplacement(opts);
  const target = await resolveTargetName(sandbox, {
    classification: opts.classification || {},
    srcName: (opts.classification && opts.classification.subject) || opts.alt || '',
    contentType: generated.contentType,
    bytes: generated.bytes,
    overrideFolder: opts.overrideFolder,
    overrideFile: opts.overrideFile,
  });
  const bucket = getBucket();
  const file = bucket.file(target.key);
  await file.save(target.bytes, {
    contentType: target.contentType,
    resumable: false,
    metadata: {
      cacheControl: `public, max-age=${CACHE_SECONDS}, immutable`,
      metadata: {
        sandbox: sandboxPrefix(sandbox),
        aiGenerated: 'true',
        aiModel: process.env.VERTEX_GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image-preview',
        aiPrompt: String(generated.prompt || '').slice(0, 2000),
      },
    },
  });
  try { await file.makePublic(); } catch (_e) {}
  const [md] = await file.getMetadata().catch(() => [null]);
  return {
    sandbox: sandboxPrefix(sandbox),
    folder: target.folder,
    file: target.file,
    path: target.key,
    relPath: target.key.slice(libraryRoot(sandbox).length + 1),
    contentType: target.contentType,
    size: (md && Number(md.size)) || target.bytes.length,
    cdnUrl: publicCdnUrl(sandbox, target.key.slice(libraryRoot(sandbox).length + 1)),
    publicUrl: `https://storage.googleapis.com/${BUCKET_NAME}/${target.key.split('/').map(encodeURIComponent).join('/')}`,
    updatedAt: (md && md.updated) || new Date().toISOString(),
    aiGenerated: true,
    aiPrompt: generated.prompt,
  };
}

async function publishScrapeImage(sandbox, opts) {
  const { scrapeStoragePath, imageUrl, clientBytes, clientContentType,
    classification, srcName, overrideFolder, overrideFile } = opts;
  let buf;
  let contentType = '';
  if (clientBytes && clientBytes.length) {
    buf = clientBytes;
    contentType = clientContentType || '';
  } else if (scrapeStoragePath) {
    const bucket = getBucket();
    const src = bucket.file(scrapeStoragePath);
    const [exists] = await src.exists();
    if (!exists) throw new Error('scrape object missing at ' + scrapeStoragePath);
    [buf] = await src.download();
    const [md] = await src.getMetadata().catch(() => [null]);
    contentType = (md && md.contentType) || '';
  } else if (imageUrl) {
    const resp = await fetch(imageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
        Accept: 'image/*,*/*;q=0.5',
        Referer: new URL(imageUrl).origin,
      },
      redirect: 'follow',
    });
    if (!resp.ok) throw new Error('origin ' + resp.status + ' on ' + imageUrl);
    buf = Buffer.from(await resp.arrayBuffer());
    contentType = resp.headers.get('content-type') || '';
  } else {
    throw new Error('no bytes, scrapeStoragePath, or imageUrl provided');
  }
  const target = await resolveTargetName(sandbox, {
    classification,
    srcName,
    contentType,
    bytes: buf,
    overrideFolder,
    overrideFile,
  });
  return putLibraryObject(sandbox, target);
}

/**
 * Resolve a `/cdn/<sandbox>/<relPath>` request to a file reference.
 * Used by the public asset proxy.
 */
function resolveAsset(sandbox, relPath) {
  const key = libraryRoot(sandbox) + '/' + relPath.replace(/^\/+/, '');
  return { bucket: getBucket(), file: getBucket().file(key), key };
}

/**
 * Guess a target folder + base-name from an incoming filename using
 * simple keyword heuristics. Matches the UX promise: drop a file called
 * `flynas-logo.svg` → land at logo/logo.png; drop `hero-banner-1.jpg`
 * → land at hero-banner.jpg.
 */
function classifyFromFilename(name) {
  const base = String(name || '').toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  if (/(^|[^a-z])(logo)([^a-z]|$)/.test(base)) return { category: 'logo' };
  if (/(hero|banner)/.test(base)) return { category: 'hero_banner' };
  if (/(product)/.test(base)) return { category: 'product' };
  return {};
}

/**
 * Decode a single uploaded file → bytes + content type. Supports data
 * URLs and raw base64.
 */
function decodeBase64File(name, base64, contentType) {
  const b = String(base64 || '');
  const commaIx = b.indexOf(',');
  const body = (b.startsWith('data:') && commaIx !== -1) ? b.slice(commaIx + 1) : b;
  const bytes = Buffer.from(body, 'base64');
  let ct = String(contentType || '');
  if (!ct && b.startsWith('data:')) {
    const m = /^data:([^;]+)[;,]/.exec(b);
    if (m) ct = m[1];
  }
  if (!ct) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    ct = contentTypeFromExt(ext);
  }
  return { bytes, contentType: ct };
}

/**
 * Upload a single in-memory image into the library with auto-naming.
 * Shared code path for loose images and ZIP entries.
 */
async function uploadSingleFile(sandbox, fileName, bytes, contentType, opts) {
  const keepFilename = !!(opts && opts.keepFilename);
  const convertToPng = opts && opts.convertToPng !== undefined ? !!opts.convertToPng : true;

  // In "keep filename" mode we bypass the classification heuristic and
  // use the incoming filename as-is (sanitised) for the target path.
  const tgtOpts = keepFilename
    ? {
        srcName: fileName.replace(/\.[a-z0-9]+$/i, ''),
        contentType,
        bytes,
        overrideFile: fileName,
        convertToPng,
      }
    : {
        classification: classifyFromFilename(fileName),
        srcName: fileName.replace(/\.[a-z0-9]+$/i, ''),
        contentType,
        bytes,
        convertToPng,
      };
  const target = await resolveTargetName(sandbox, tgtOpts);
  return putLibraryObject(sandbox, target);
}

/**
 * Batch upload. Each entry is either a raw image or a ZIP.
 *   entries: [{ name, base64, contentType }]
 *   opts: { replace }
 * Returns { uploaded: [publishedObj, …], errors: [{ name, error }, …] }.
 */
async function batchUpload(sandbox, entries, opts) {
  const uploaded = [];
  const errors = [];
  const passOpts = {
    keepFilename: !!(opts && opts.keepFilename),
    convertToPng: opts && opts.convertToPng !== undefined ? !!opts.convertToPng : true,
  };
  if (opts && opts.replace) {
    const bucket = getBucket();
    const prefix = libraryRoot(sandbox) + '/';
    const [existing] = await bucket.getFiles({ prefix });
    await Promise.all(existing.map((f) => f.delete({ ignoreNotFound: true }).catch(() => {})));
  }
  for (const entry of entries || []) {
    try {
      const name = String(entry.name || 'file').trim();
      const isZip = /\.zip$/i.test(name) || /zip/.test(String(entry.contentType || ''));
      const { bytes, contentType } = decodeBase64File(name, entry.base64, entry.contentType);
      if (isZip) {
        const unzipper = require('unzipper');
        const directory = await unzipper.Open.buffer(bytes);
        for (const zEntry of directory.files) {
          if (zEntry.type !== 'File') continue;
          const zName = String(zEntry.path || '').replace(/\\/g, '/').replace(/^\/+/, '');
          if (!zName || zName.indexOf('..') !== -1) continue;
          const base = zName.split('/').pop();
          if (!base || base.startsWith('.')) continue;
          const ext = (base.split('.').pop() || '').toLowerCase();
          if (!/^(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/.test(ext)) continue;
          try {
            const buf = await zEntry.buffer();
            const published = await uploadSingleFile(sandbox, base, buf, contentTypeFromExt(ext), passOpts);
            uploaded.push(published);
          } catch (e) {
            errors.push({ name: zName, error: String((e && e.message) || e) });
          }
        }
      } else {
        const published = await uploadSingleFile(sandbox, name, bytes, contentType, passOpts);
        uploaded.push(published);
      }
    } catch (e) {
      errors.push({ name: entry && entry.name, error: String((e && e.message) || e) });
    }
  }
  return { uploaded, errors };
}

/**
 * Stream a ZIP archive of the current library to the Express response.
 * Flattens the <sandbox>/library/ prefix so the ZIP contents are
 * identical to what a user would upload back to replace the folder.
 */
async function streamLibraryZip(sandbox, res) {
  const prefix = libraryRoot(sandbox) + '/';
  const [files] = await getBucket().getFiles({ prefix });
  const archiver = require('archiver');
  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', (e) => {
    console.error('[imageHostingLibrary] zip error', String((e && e.message) || e));
    try { res.end(); } catch (_e) {}
  });
  archive.pipe(res);
  for (const f of files) {
    const rel = f.name.slice(prefix.length);
    if (!rel) continue;
    archive.append(f.createReadStream(), { name: rel });
  }
  await archive.finalize();
}

/**
 * Replace the current library contents with the files from a ZIP. The
 * old library is deleted first so stale names don't linger.
 */
async function restoreLibraryFromZip(sandbox, zipBytes, opts) {
  const unzipper = require('unzipper');
  const stream = require('stream');
  const bucket = getBucket();
  const prefix = libraryRoot(sandbox) + '/';
  if (opts && opts.replace) {
    const [existing] = await bucket.getFiles({ prefix });
    await Promise.all(existing.map((f) => f.delete({ ignoreNotFound: true }).catch(() => {})));
  }
  const pass = new stream.Readable();
  pass._read = () => {};
  pass.push(zipBytes);
  pass.push(null);
  const directory = await unzipper.Open.buffer(zipBytes);
  const out = [];
  for (const entry of directory.files) {
    if (entry.type !== 'File') continue;
    const name = String(entry.path || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!name || name.indexOf('..') !== -1) continue;
    const buf = await entry.buffer();
    const ext = (name.split('.').pop() || '').toLowerCase();
    const contentType = contentTypeFromExt(ext);
    const key = prefix + name;
    const file = bucket.file(key);
    await file.save(buf, {
      contentType,
      resumable: false,
      metadata: {
        cacheControl: `public, max-age=${CACHE_SECONDS}, immutable`,
        metadata: { sandbox: sandboxPrefix(sandbox) },
      },
    });
    try { await file.makePublic(); } catch (_e) {}
    out.push({ relPath: name, size: buf.length });
  }
  return out;
}

module.exports = {
  BUCKET_NAME,
  listLibrary,
  publishScrapeImage,
  deleteLibraryObject,
  renameLibraryObject,
  resolveAsset,
  libraryRoot,
  backupsRoot,
  sandboxPrefix,
  streamLibraryZip,
  restoreLibraryFromZip,
  batchUpload,
  classifyFromFilename,
  replaceLibraryObject,
  aiGenerateReplacement,
  publishAiImage,
};
