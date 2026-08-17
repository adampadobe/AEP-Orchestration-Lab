/**
 * Governed customer-swappable demo assets.
 *
 * Active assets remain at the existing public, stable Image Hosting paths.
 * Preflights, immutable customer revisions, and idempotency records are
 * user+sandbox scoped. Backup bytes live in the Firebase project's private
 * default Storage bucket (or LAB_DEMO_ASSET_BACKUP_BUCKET when configured).
 */
'use strict';

const { createHash, randomUUID } = require('node:crypto');
const admin = require('firebase-admin');

const PREFLIGHT_COLLECTION = 'labDemoAssetPreflights';
const REVISION_COLLECTION = 'labDemoAssetRevisions';
const IDEMPOTENCY_COLLECTION = 'labDemoAssetIdempotency';
const ACTIVE_COLLECTION = 'labDemoAssetActive';
const PREFLIGHT_TTL_MS = 15 * 60 * 1000;

const SLOT_CATALOG = Object.freeze({
  logo: { relPath: 'logo/logo.png', width: 1024, height: 1024, fit: 'inside', source: 'logo' },
  hero_banner: { relPath: 'hero-banner.png', width: 1920, height: 800, fit: 'cover', source: 'hero' },
  mobile_entry: { relPath: 'mobile/location_entry.png', width: 1200, height: 900, fit: 'cover', source: 'hero' },
  mobile_exit: { relPath: 'mobile/location_exit.png', width: 1200, height: 900, fit: 'cover', source: 'hero' },
  push_inapp: { relPath: 'mobile/push-inapp.png', width: 1024, height: 1024, fit: 'cover', source: 'hero' },
});

const PACKS = Object.freeze({
  core: ['logo', 'hero_banner'],
  core_and_mobile: ['logo', 'hero_banner', 'mobile_entry', 'mobile_exit', 'push_inapp'],
});

class DemoAssetError extends Error {
  constructor(message, status = 400, code = 'DEMO_ASSET_INVALID') {
    super(message);
    this.name = 'DemoAssetError';
    this.status = status;
    this.code = code;
  }
}

function ensureAdmin() {
  if (!admin.apps.length) admin.initializeApp();
}

function getFirestore() {
  ensureAdmin();
  return admin.firestore();
}

function getActiveBucket(deps = {}) {
  if (deps.activeBucket) return deps.activeBucket;
  ensureAdmin();
  return admin.storage().bucket(
    process.env.BRAND_SCRAPER_BUCKET || 'aep-orchestration-lab-brand-scrapes',
  );
}

function getBackupBucket(deps = {}) {
  if (deps.backupBucket) return deps.backupBucket;
  ensureAdmin();
  const configured = String(process.env.LAB_DEMO_ASSET_BACKUP_BUCKET || '').trim();
  return configured ? admin.storage().bucket(configured) : admin.storage().bucket();
}

function safeSlug(value, fallback = 'customer') {
  const slug = String(value || '').toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return slug || fallback;
}

function scopeId(uid, sandbox) {
  return createHash('sha256').update(`${uid}\n${sandbox}`).digest('hex').slice(0, 32);
}

function idempotencyId(uid, sandbox, key) {
  return createHash('sha256').update(`${uid}\n${sandbox}\n${key}`).digest('hex');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function publicCdnUrl(sandbox, relPath) {
  return `https://aep-orchestration-lab.web.app/cdn/${encodeURIComponent(safeSlug(sandbox, 'default'))}/${relPath.split('/').map(encodeURIComponent).join('/')}`;
}

function activeObjectPath(sandbox, relPath) {
  return `${safeSlug(sandbox, 'default')}/library/${relPath}`;
}

function requestedSlots(assetPack) {
  const pack = String(assetPack || 'core_and_mobile').trim().toLowerCase();
  const slots = PACKS[pack];
  if (!slots) throw new DemoAssetError(`Unknown asset_pack: ${assetPack}`, 400, 'DEMO_ASSET_PACK_INVALID');
  return { pack, slots };
}

function classificationCategory(image) {
  return String(image && image.classification && image.classification.category || '').toLowerCase();
}

function confidenceRank(value) {
  return { high: 3, medium: 2, low: 1 }[String(value || '').toLowerCase()] || 0;
}

function sourceFromImage(image, imageIndex) {
  if (!image || !image.storagePath) return null;
  return {
    storagePath: String(image.storagePath),
    imageIndex,
    originalUrl: String(image.src || ''),
    alt: String(image.alt || ''),
    classification: image.classification || null,
  };
}

function pickClassifiedImage(images, categories, overrideIndex) {
  if (Number.isInteger(overrideIndex)) {
    const selected = images[overrideIndex];
    if (!selected || !selected.storagePath) {
      throw new DemoAssetError(`image index ${overrideIndex} is unavailable or has no stored bytes.`, 400, 'DEMO_ASSET_SOURCE_INVALID');
    }
    return sourceFromImage(selected, overrideIndex);
  }
  const wanted = new Set(categories);
  const ranked = images
    .map((image, imageIndex) => ({ image, imageIndex }))
    .filter(({ image }) => image && image.storagePath && wanted.has(classificationCategory(image)))
    .sort((a, b) => {
      const confidence = confidenceRank(b.image.classification && b.image.classification.confidence)
        - confidenceRank(a.image.classification && a.image.classification.confidence);
      if (confidence) return confidence;
      return Number(b.image.bytes || 0) - Number(a.image.bytes || 0);
    });
  return ranked.length ? sourceFromImage(ranked[0].image, ranked[0].imageIndex) : null;
}

function selectSources(record, overrides = {}) {
  const images = Array.isArray(record && record.crawlSummary && record.crawlSummary.assets && record.crawlSummary.assets.imagesV2)
    ? record.crawlSummary.assets.imagesV2
    : [];
  const logoOverride = overrides && overrides.logo_image_index;
  const heroOverride = overrides && overrides.hero_image_index;

  let logo = null;
  if (!Number.isInteger(logoOverride)) {
    const customerLogo = record && record.customerLogo;
    const storedPath = customerLogo && (customerLogo.storedPath || customerLogo.cachePath);
    if (storedPath) {
      logo = {
        storagePath: String(storedPath),
        imageIndex: null,
        originalUrl: String(customerLogo.originalUrl || customerLogo.sourceUrl || ''),
        alt: `${record.brandName || record.customerName || 'Customer'} logo`,
        classification: { category: 'logo', confidence: 'high', source: customerLogo.source || 'customerLogo' },
      };
    }
  }
  if (!logo) logo = pickClassifiedImage(images, ['logo'], logoOverride);

  let hero = pickClassifiedImage(images, ['hero_banner'], heroOverride);
  if (!hero && !Number.isInteger(heroOverride)) {
    hero = pickClassifiedImage(images, ['lifestyle', 'product', 'illustration'], undefined);
  }
  if (!logo) throw new DemoAssetError('The completed scrape has no stored logo candidate. Re-classify images or pass logo_image_index.', 409, 'DEMO_ASSET_LOGO_MISSING');
  if (!hero) throw new DemoAssetError('The completed scrape has no stored hero/lifestyle candidate. Re-classify images or pass hero_image_index.', 409, 'DEMO_ASSET_HERO_MISSING');
  return { logo, hero };
}

async function downloadSource(source, deps = {}) {
  const file = getActiveBucket(deps).file(source.storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new DemoAssetError(`Stored scrape asset is missing: ${source.storagePath}`, 409, 'DEMO_ASSET_SOURCE_EXPIRED');
  const [bytes] = await file.download();
  const [metadata] = await file.getMetadata().catch(() => [null]);
  return { bytes, contentType: metadata && metadata.contentType || 'application/octet-stream' };
}

async function transformForSlot(sourceBytes, slotName, deps = {}) {
  const spec = SLOT_CATALOG[slotName];
  if (!spec) throw new DemoAssetError(`Unknown slot: ${slotName}`);
  const sharp = deps.sharp || require('sharp');
  const pipeline = sharp(sourceBytes).rotate().resize({
    width: spec.width,
    height: spec.height,
    fit: spec.fit,
    position: spec.fit === 'cover' ? 'attention' : 'centre',
    withoutEnlargement: spec.fit === 'inside',
    background: { r: 255, g: 255, b: 255, alpha: 0 },
  }).png({ compressionLevel: 9 });
  const bytes = await pipeline.toBuffer();
  const metadata = await sharp(bytes).metadata();
  return { bytes, width: metadata.width || spec.width, height: metadata.height || spec.height, contentType: 'image/png' };
}

async function readActiveSlot(sandbox, slotName, deps = {}) {
  const spec = SLOT_CATALOG[slotName];
  const path = activeObjectPath(sandbox, spec.relPath);
  const file = getActiveBucket(deps).file(path);
  const [exists] = await file.exists();
  if (!exists) {
    return { slot: slotName, relPath: spec.relPath, exists: false, sha256: null, cdnUrl: publicCdnUrl(sandbox, spec.relPath) };
  }
  const [bytes] = await file.download();
  const [metadata] = await file.getMetadata().catch(() => [null]);
  return {
    slot: slotName,
    relPath: spec.relPath,
    exists: true,
    sha256: sha256(bytes),
    size: bytes.length,
    contentType: metadata && metadata.contentType || 'application/octet-stream',
    updatedAt: metadata && metadata.updated || null,
    cdnUrl: publicCdnUrl(sandbox, spec.relPath),
  };
}

async function listRevisions(uid, sandbox, deps = {}) {
  const firestore = deps.firestore || getFirestore();
  const snap = await firestore.collection(REVISION_COLLECTION).where('uid', '==', uid).limit(100).get();
  return snap.docs
    .map((doc) => ({ revisionId: doc.id, ...doc.data() }))
    .filter((item) => item.sandbox === sandbox)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .slice(0, 50)
    .map((item) => ({
      revisionId: item.revisionId,
      customerName: item.customerName,
      customerSlug: item.customerSlug,
      createdAt: item.createdAt,
      source: item.source,
      slots: Array.isArray(item.assets) ? item.assets.map((asset) => asset.slot) : [],
    }));
}

async function inspect({ uid, sandbox }, deps = {}) {
  const firestore = deps.firestore || getFirestore();
  const slots = await Promise.all(Object.keys(SLOT_CATALOG).map((slot) => readActiveSlot(sandbox, slot, deps)));
  const activeDoc = await firestore.collection(ACTIVE_COLLECTION).doc(scopeId(uid, sandbox)).get();
  return {
    ok: true,
    sandbox,
    activeCustomer: activeDoc.exists ? activeDoc.data().customerName || null : null,
    slots,
    packs: PACKS,
    revisions: await listRevisions(uid, sandbox, deps),
    guidance: [
      'Preview assets from one completed brand scrape before applying.',
      'Only the allowlisted stable paths above are customer-swappable; shared library files are never included.',
      'Apply and restore require explicit confirmation plus an idempotency key.',
    ],
  };
}

async function saveStageObject(path, bytes, metadata, deps = {}) {
  const file = getBackupBucket(deps).file(path);
  await file.save(bytes, {
    contentType: 'image/png',
    resumable: false,
    metadata: {
      cacheControl: 'private, no-store, max-age=0',
      metadata,
    },
  });
  let previewUrl = '';
  try {
    [previewUrl] = await file.getSignedUrl({ action: 'read', version: 'v4', expires: Date.now() + PREFLIGHT_TTL_MS });
  } catch (_e) {}
  return previewUrl;
}

async function createPreview({ uid, workspaceSlug, sandbox, record, scrapeId, assetPack, overrides, currentCustomerName }, deps = {}) {
  if (!record || String(record.scrapeStatus || '').toLowerCase() !== 'complete') {
    throw new DemoAssetError('A completed brand scrape is required.', 409, 'DEMO_ASSET_SCRAPE_NOT_COMPLETE');
  }
  const { pack, slots } = requestedSlots(assetPack);
  const sources = selectSources(record, overrides || {});
  const current = await Promise.all(slots.map((slot) => readActiveSlot(sandbox, slot, deps)));
  const sourceDownloads = {};
  for (const sourceName of new Set(slots.map((slot) => SLOT_CATALOG[slot].source))) {
    sourceDownloads[sourceName] = await downloadSource(sources[sourceName], deps);
  }

  const now = deps.now ? deps.now() : new Date();
  const preflightId = deps.randomId ? deps.randomId() : randomUUID();
  const proposed = [];
  for (const slot of slots) {
    const sourceName = SLOT_CATALOG[slot].source;
    const transformed = await transformForSlot(sourceDownloads[sourceName].bytes, slot, deps);
    const stagePath = `demo-asset-staging/${safeSlug(uid, 'user')}/${safeSlug(sandbox, 'default')}/${preflightId}/${SLOT_CATALOG[slot].relPath}`;
    const digest = sha256(transformed.bytes);
    const previewUrl = await saveStageObject(stagePath, transformed.bytes, {
      uid,
      sandbox,
      preflightId,
      slot,
      sha256: digest,
    }, deps);
    proposed.push({
      slot,
      relPath: SLOT_CATALOG[slot].relPath,
      stagePath,
      sha256: digest,
      size: transformed.bytes.length,
      contentType: transformed.contentType,
      width: transformed.width,
      height: transformed.height,
      previewUrl,
      cdnUrl: publicCdnUrl(sandbox, SLOT_CATALOG[slot].relPath),
      source: sources[sourceName],
    });
  }

  const customerName = String(record.brandName || record.customerName || '').trim() || 'Customer';
  const expiresAt = new Date(now.getTime() + PREFLIGHT_TTL_MS).toISOString();
  const doc = {
    uid,
    workspaceSlug,
    sandbox,
    kind: 'scrape',
    scrapeId,
    assetPack: pack,
    customerName,
    currentCustomerName: String(currentCustomerName || '').trim() || null,
    current,
    proposed: proposed.map(({ previewUrl, ...item }) => item),
    status: 'pending',
    createdAt: now.toISOString(),
    expiresAt,
  };
  const firestore = deps.firestore || getFirestore();
  await firestore.collection(PREFLIGHT_COLLECTION).doc(preflightId).set(doc);
  return {
    ok: true,
    sandbox,
    preflightId,
    expiresAt,
    customerName,
    currentCustomerName: doc.currentCustomerName,
    assetPack: pack,
    proposed,
    warnings: current.some((item) => !item.exists)
      ? ['One or more active slots do not exist yet; apply will create them and the rollback revision will remember that they were absent.']
      : [],
    confirmation: {
      required: true,
      message: `Back up the current managed slots${doc.currentCustomerName ? ` as ${doc.currentCustomerName}` : ''} and activate ${customerName}?`,
    },
  };
}

async function loadOwnedDoc(collection, id, uid, sandbox, deps = {}) {
  const firestore = deps.firestore || getFirestore();
  const snap = await firestore.collection(collection).doc(id).get();
  if (!snap.exists) throw new DemoAssetError('Record not found.', 404, 'DEMO_ASSET_NOT_FOUND');
  const data = snap.data();
  if (data.uid !== uid || data.sandbox !== sandbox) {
    throw new DemoAssetError('Record does not belong to this user and sandbox.', 403, 'DEMO_ASSET_FORBIDDEN');
  }
  return { firestore, ref: snap.ref, data };
}

async function createRevision({ uid, workspaceSlug, sandbox, customerName, source, current }, deps = {}) {
  const firestore = deps.firestore || getFirestore();
  const backupBucket = getBackupBucket(deps);
  const activeBucket = getActiveBucket(deps);
  const revisionId = deps.randomId ? deps.randomId() : randomUUID();
  const customerSlug = safeSlug(customerName, 'unlabelled-current');
  const root = `demo-customer-backups/${safeSlug(uid, 'user')}/${safeSlug(workspaceSlug, 'workspace')}/${safeSlug(sandbox, 'default')}/${customerSlug}/${revisionId}`;
  const assets = [];
  for (const item of current) {
    if (!item.exists) {
      assets.push({ slot: item.slot, relPath: item.relPath, exists: false, sha256: null, backupPath: null });
      continue;
    }
    const [bytes] = await activeBucket.file(activeObjectPath(sandbox, item.relPath)).download();
    const backupPath = `${root}/${item.relPath}`;
    await backupBucket.file(backupPath).save(bytes, {
      contentType: item.contentType || 'image/png',
      resumable: false,
      metadata: {
        cacheControl: 'private, no-store, max-age=0',
        metadata: { uid, sandbox, revisionId, slot: item.slot, sha256: sha256(bytes) },
      },
    });
    assets.push({ slot: item.slot, relPath: item.relPath, exists: true, sha256: sha256(bytes), backupPath, contentType: item.contentType || 'image/png' });
  }
  const now = deps.now ? deps.now() : new Date();
  const revision = {
    uid,
    workspaceSlug,
    sandbox,
    customerName: customerName || 'Unlabelled current customer',
    customerSlug,
    source,
    assets,
    createdAt: now.toISOString(),
  };
  await firestore.collection(REVISION_COLLECTION).doc(revisionId).set(revision);
  return { revisionId, ...revision };
}

async function assertNoActiveConflict(sandbox, expected, deps = {}) {
  const actual = await Promise.all(expected.map((item) => readActiveSlot(sandbox, item.slot, deps)));
  const changed = actual.filter((item, index) => item.exists !== expected[index].exists || item.sha256 !== expected[index].sha256);
  if (changed.length) {
    throw new DemoAssetError(
      `Active assets changed after preview: ${changed.map((item) => item.relPath).join(', ')}`,
      409,
      'DEMO_ASSET_PREVIEW_CONFLICT',
    );
  }
  return actual;
}

async function rollbackRevision(revision, imageHostingLibrary, deps = {}) {
  const backupBucket = getBackupBucket(deps);
  const outcomes = [];
  for (const asset of revision.assets || []) {
    try {
      if (!asset.exists) {
        await imageHostingLibrary.deleteLibraryObject(revision.sandbox, asset.relPath);
      } else {
        const [bytes] = await backupBucket.file(asset.backupPath).download();
        await imageHostingLibrary.replaceLibraryObject(revision.sandbox, asset.relPath, bytes, asset.contentType || 'image/png');
      }
      outcomes.push({ relPath: asset.relPath, ok: true });
    } catch (e) {
      outcomes.push({ relPath: asset.relPath, ok: false, error: String(e && e.message || e) });
    }
  }
  return outcomes;
}

async function restoreRevisionDirect({ uid, workspaceSlug, sandbox, revisionId, imageHostingLibrary }, deps = {}) {
  if (!imageHostingLibrary) throw new DemoAssetError('Image hosting service is unavailable.', 500, 'DEMO_ASSET_SERVICE_UNAVAILABLE');
  const loaded = await loadOwnedDoc(REVISION_COLLECTION, String(revisionId || '').trim(), uid, sandbox, deps);
  const revision = loaded.data;
  if (revision.workspaceSlug !== workspaceSlug) {
    throw new DemoAssetError('Revision belongs to a different workspace.', 403, 'DEMO_ASSET_FORBIDDEN');
  }
  const outcomes = await rollbackRevision(revision, imageHostingLibrary, deps);
  const failedWrites = outcomes.filter((item) => !item.ok);
  const verified = await Promise.all((revision.assets || []).map((asset) => readActiveSlot(sandbox, asset.slot, deps)));
  const mismatched = verified.filter((item, index) => {
    const expected = revision.assets[index];
    return expected.exists ? item.sha256 !== expected.sha256 : item.exists;
  });
  if (failedWrites.length || mismatched.length) {
    throw new DemoAssetError('Direct asset rollback did not fully verify.', 500, 'DEMO_ASSET_ROLLBACK_VERIFY_FAILED');
  }
  const now = deps.now ? deps.now() : new Date();
  await loaded.firestore.collection(ACTIVE_COLLECTION).doc(scopeId(uid, sandbox)).set({
    uid,
    workspaceSlug,
    sandbox,
    customerName: revision.customerName,
    scrapeId: null,
    restoredFromRevisionId: revisionId,
    updatedAt: now.toISOString(),
    slots: verified,
  });
  return { ok: true, customerName: revision.customerName, revisionId, verified: true, outcomes };
}

async function applyPreview({ uid, workspaceSlug, sandbox, preflightId, confirmed, idempotencyKey, backupCustomerName, imageHostingLibrary }, deps = {}) {
  if (confirmed !== true) throw new DemoAssetError('Explicit confirmation is required.', 400, 'DEMO_ASSET_CONFIRMATION_REQUIRED');
  if (!idempotencyKey || String(idempotencyKey).length < 8) {
    throw new DemoAssetError('idempotency_key must contain at least 8 characters.', 400, 'DEMO_ASSET_IDEMPOTENCY_REQUIRED');
  }
  if (!imageHostingLibrary) throw new DemoAssetError('Image hosting service is unavailable.', 500, 'DEMO_ASSET_SERVICE_UNAVAILABLE');

  const loaded = await loadOwnedDoc(PREFLIGHT_COLLECTION, preflightId, uid, sandbox, deps);
  const { firestore, ref, data } = loaded;
  const idemRef = firestore.collection(IDEMPOTENCY_COLLECTION).doc(idempotencyId(uid, sandbox, idempotencyKey));
  const idemSnap = await idemRef.get();
  if (idemSnap.exists) return { ...idemSnap.data().result, idempotentReplay: true };
  if (data.status === 'applied' && data.result) return { ...data.result, idempotentReplay: true };
  if (Date.parse(data.expiresAt) <= Date.now()) throw new DemoAssetError('Asset preview expired; create a new preview.', 409, 'DEMO_ASSET_PREVIEW_EXPIRED');
  if (data.workspaceSlug !== workspaceSlug) throw new DemoAssetError('Workspace changed after preview.', 409, 'DEMO_ASSET_WORKSPACE_CHANGED');

  const current = await assertNoActiveConflict(sandbox, data.current || [], deps);
  const priorCustomer = String(backupCustomerName || data.currentCustomerName || '').trim() || 'Unlabelled current customer';
  const revision = await createRevision({
    uid,
    workspaceSlug,
    sandbox,
    customerName: priorCustomer,
    source: `preflight:${preflightId}`,
    current,
  }, deps);

  const backupBucket = getBackupBucket(deps);
  const published = [];
  try {
    for (const proposed of data.proposed || []) {
      if (proposed.exists === false) {
        await imageHostingLibrary.deleteLibraryObject(sandbox, proposed.relPath);
        published.push({ slot: proposed.slot, relPath: proposed.relPath, sha256: null, cdnUrl: publicCdnUrl(sandbox, proposed.relPath), deleted: true });
        continue;
      }
      const [bytes] = await backupBucket.file(proposed.stagePath).download();
      const out = await imageHostingLibrary.replaceLibraryObject(sandbox, proposed.relPath, bytes, proposed.contentType || 'image/png');
      published.push({ slot: proposed.slot, relPath: proposed.relPath, sha256: proposed.sha256, cdnUrl: publicCdnUrl(sandbox, proposed.relPath), updatedAt: out.updatedAt || null });
    }
    const verified = await Promise.all((data.proposed || []).map((item) => readActiveSlot(sandbox, item.slot, deps)));
    const failed = verified.filter((item, index) => {
      const expected = data.proposed[index];
      return expected.exists === false ? item.exists : item.sha256 !== expected.sha256;
    });
    if (failed.length) throw new DemoAssetError(`Verification failed for: ${failed.map((item) => item.relPath).join(', ')}`, 500, 'DEMO_ASSET_VERIFY_FAILED');

    const now = deps.now ? deps.now() : new Date();
    const result = {
      ok: true,
      sandbox,
      preflightId,
      customerName: data.customerName,
      backupRevisionId: revision.revisionId,
      backedUpCustomerName: priorCustomer,
      published,
      verified: true,
      appliedAt: now.toISOString(),
    };
    await firestore.collection(ACTIVE_COLLECTION).doc(scopeId(uid, sandbox)).set({
      uid,
      workspaceSlug,
      sandbox,
      customerName: data.customerName,
      scrapeId: data.scrapeId || null,
      updatedAt: now.toISOString(),
      slots: published,
    });
    await ref.set({ status: 'applied', appliedAt: now.toISOString(), result }, { merge: true });
    await idemRef.set({ uid, sandbox, idempotencyKey: String(idempotencyKey), createdAt: now.toISOString(), result });
    return result;
  } catch (e) {
    const rollback = await rollbackRevision(revision, imageHostingLibrary, deps);
    await ref.set({ status: 'failed', failedAt: new Date().toISOString(), error: String(e && e.message || e), rollback }, { merge: true });
    const wrapped = new DemoAssetError(`Asset activation failed and rollback was attempted: ${String(e && e.message || e)}`, Number(e && e.status) || 500, e && e.code || 'DEMO_ASSET_APPLY_FAILED');
    wrapped.rollback = rollback;
    throw wrapped;
  }
}

async function createRestorePreview({ uid, workspaceSlug, sandbox, revisionId, currentCustomerName }, deps = {}) {
  const loaded = await loadOwnedDoc(REVISION_COLLECTION, revisionId, uid, sandbox, deps);
  const revision = loaded.data;
  if (revision.workspaceSlug !== workspaceSlug) throw new DemoAssetError('Revision belongs to a different workspace.', 403, 'DEMO_ASSET_FORBIDDEN');
  const restorable = (revision.assets || []).filter((asset) => asset.exists && asset.backupPath);
  if (!restorable.length) throw new DemoAssetError('Revision contains no restorable assets.', 409, 'DEMO_ASSET_REVISION_EMPTY');
  const current = await Promise.all((revision.assets || []).map((asset) => readActiveSlot(sandbox, asset.slot, deps)));
  const now = deps.now ? deps.now() : new Date();
  const preflightId = deps.randomId ? deps.randomId() : randomUUID();
  const proposed = [];
  for (const asset of revision.assets || []) {
    let previewUrl = '';
    if (asset.exists && asset.backupPath) {
      try {
        [previewUrl] = await getBackupBucket(deps).file(asset.backupPath).getSignedUrl({ action: 'read', version: 'v4', expires: now.getTime() + PREFLIGHT_TTL_MS });
      } catch (_e) {}
    }
    proposed.push({
      slot: asset.slot,
      relPath: asset.relPath,
      stagePath: asset.backupPath,
      exists: asset.exists,
      sha256: asset.sha256,
      contentType: asset.contentType || 'image/png',
      previewUrl,
      cdnUrl: publicCdnUrl(sandbox, asset.relPath),
    });
  }
  const expiresAt = new Date(now.getTime() + PREFLIGHT_TTL_MS).toISOString();
  await loaded.firestore.collection(PREFLIGHT_COLLECTION).doc(preflightId).set({
    uid,
    workspaceSlug,
    sandbox,
    kind: 'restore',
    restoreRevisionId: revisionId,
    customerName: revision.customerName,
    currentCustomerName: String(currentCustomerName || '').trim() || null,
    current,
    proposed: proposed.map(({ previewUrl, ...item }) => item),
    status: 'pending',
    createdAt: now.toISOString(),
    expiresAt,
  });
  return {
    ok: true,
    sandbox,
    preflightId,
    expiresAt,
    restoreRevisionId: revisionId,
    customerName: revision.customerName,
    currentCustomerName: String(currentCustomerName || '').trim() || null,
    proposed,
    confirmation: { required: true, message: `Restore ${revision.customerName} to the stable active asset paths?` },
  };
}

module.exports = {
  ACTIVE_COLLECTION,
  DemoAssetError,
  IDEMPOTENCY_COLLECTION,
  PACKS,
  PREFLIGHT_COLLECTION,
  REVISION_COLLECTION,
  SLOT_CATALOG,
  applyPreview,
  createPreview,
  createRestorePreview,
  inspect,
  publicCdnUrl,
  restoreRevisionDirect,
  selectSources,
};
