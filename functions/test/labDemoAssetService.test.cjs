'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const service = require('../labDemoAssetService');

class FakeFile {
  constructor(bucket, name) {
    this.bucket = bucket;
    this.name = name;
  }
  async exists() { return [this.bucket.objects.has(this.name)]; }
  async download() {
    const item = this.bucket.objects.get(this.name);
    if (!item) throw new Error(`missing ${this.name}`);
    return [Buffer.from(item.bytes)];
  }
  async save(bytes, opts = {}) {
    this.bucket.objects.set(this.name, {
      bytes: Buffer.from(bytes),
      contentType: opts.contentType || opts.metadata && opts.metadata.contentType || 'application/octet-stream',
      updated: new Date().toISOString(),
      metadata: opts.metadata || {},
    });
  }
  async getMetadata() {
    const item = this.bucket.objects.get(this.name);
    if (!item) throw new Error(`missing ${this.name}`);
    return [{ contentType: item.contentType, size: String(item.bytes.length), updated: item.updated }];
  }
  async getSignedUrl() { return [`https://signed.example/${encodeURIComponent(this.name)}`]; }
  async delete() { this.bucket.objects.delete(this.name); }
}

class FakeBucket {
  constructor() { this.objects = new Map(); }
  file(name) { return new FakeFile(this, name); }
}

class FakeDocRef {
  constructor(store, collection, id) {
    this.store = store;
    this.collection = collection;
    this.id = id;
  }
  async get() {
    const data = this.store.get(this.collection).get(this.id);
    return { exists: data !== undefined, data: () => data, ref: this };
  }
  async set(value, opts = {}) {
    const collection = this.store.get(this.collection);
    const current = collection.get(this.id) || {};
    collection.set(this.id, opts.merge ? { ...current, ...value } : value);
  }
}

class FakeFirestore {
  constructor() { this.collections = new Map(); }
  collection(name) {
    if (!this.collections.has(name)) this.collections.set(name, new Map());
    const store = this.collections;
    return {
      doc(id) { return new FakeDocRef(store, name, id); },
      where(field, _op, value) {
        return {
          limit() {
            return {
              async get() {
                const docs = [...store.get(name).entries()]
                  .filter(([, data]) => data[field] === value)
                  .map(([id, data]) => ({ id, data: () => data }));
                return { docs };
              },
            };
          },
        };
      },
    };
  }
}

async function png(color) {
  return sharp({ create: { width: 40, height: 30, channels: 4, background: color } }).png().toBuffer();
}

function deps(activeBucket, backupBucket, firestore) {
  const ids = ['preview-1', 'revision-old', 'restore-preview', 'revision-new'];
  return {
    activeBucket,
    backupBucket,
    firestore,
    sharp,
    randomId: () => ids.shift(),
    now: () => new Date(),
  };
}

test('selectSources prefers persisted customer logo and highest-confidence hero', () => {
  const selected = service.selectSources({
    customerLogo: { storedPath: 'scrapes/s/id/customer-logo.png', source: 'crawl-assets' },
    crawlSummary: { assets: { imagesV2: [
      { storagePath: 'cache/low.png', classification: { category: 'hero_banner', confidence: 'low' } },
      { storagePath: 'cache/high.png', classification: { category: 'hero_banner', confidence: 'high' } },
    ] } },
  });
  assert.equal(selected.logo.storagePath, 'scrapes/s/id/customer-logo.png');
  assert.equal(selected.hero.storagePath, 'cache/high.png');
});

test('preview, apply, inspect and restore preserve stable slots and named revisions', async () => {
  const activeBucket = new FakeBucket();
  const backupBucket = new FakeBucket();
  const firestore = new FakeFirestore();
  const d = deps(activeBucket, backupBucket, firestore);
  const oldLogo = await png('#111111');
  const oldHero = await png('#222222');
  const oldMobileEntry = await png('#333333');
  const oldMobileExit = await png('#444444');
  const oldPush = await png('#555555');
  const newLogo = await png('#ff0000');
  const newHero = await png('#00ff00');
  await activeBucket.file('apalmer/library/logo/logo.png').save(oldLogo, { contentType: 'image/png' });
  await activeBucket.file('apalmer/library/hero-banner.png').save(oldHero, { contentType: 'image/png' });
  await activeBucket.file('apalmer/library/mobile/location_entry.png').save(oldMobileEntry, { contentType: 'image/png' });
  await activeBucket.file('apalmer/library/mobile/location_exit.png').save(oldMobileExit, { contentType: 'image/png' });
  await activeBucket.file('apalmer/library/mobile/push-inapp.png').save(oldPush, { contentType: 'image/png' });
  await activeBucket.file('scrapes/apalmer/scrape-1/customer-logo.png').save(newLogo, { contentType: 'image/png' });
  await activeBucket.file('scrape-cache-images/apalmer/scrape-1/hero.png').save(newHero, { contentType: 'image/png' });

  const record = {
    scrapeStatus: 'complete',
    brandName: 'New Brand',
    customerLogo: { storedPath: 'scrapes/apalmer/scrape-1/customer-logo.png' },
    crawlSummary: { assets: { imagesV2: [{
      storagePath: 'scrape-cache-images/apalmer/scrape-1/hero.png',
      classification: { category: 'hero_banner', confidence: 'high' },
    }] } },
  };
  const preview = await service.createPreview({
    uid: 'user-1', workspaceSlug: 'apalmer', sandbox: 'apalmer', record,
    scrapeId: 'scrape-1', currentCustomerName: 'Old Brand',
  }, d);
  assert.equal(preview.preflightId, 'preview-1');
  assert.deepEqual(preview.proposed.map((item) => item.relPath), [
    'logo/logo.png', 'hero-banner.png', 'mobile/location_entry.png',
    'mobile/location_exit.png', 'mobile/push-inapp.png',
  ]);
  assert.ok(preview.proposed.every((item) => item.previewUrl.startsWith('https://signed.example/')));

  const imageHostingLibrary = {
    async replaceLibraryObject(sandbox, relPath, bytes, contentType) {
      await activeBucket.file(`${sandbox}/library/${relPath}`).save(bytes, { contentType });
      return { updatedAt: new Date().toISOString() };
    },
    async deleteLibraryObject(sandbox, relPath) {
      await activeBucket.file(`${sandbox}/library/${relPath}`).delete();
    },
  };
  const applied = await service.applyPreview({
    uid: 'user-1', workspaceSlug: 'apalmer', sandbox: 'apalmer',
    preflightId: preview.preflightId, confirmed: true,
    idempotencyKey: 'activate-new-brand', imageHostingLibrary,
  }, d);
  assert.equal(applied.backedUpCustomerName, 'Old Brand');
  assert.equal(applied.backupRevisionId, 'revision-old');
  assert.equal(applied.verified, true);
  assert.notDeepEqual((await activeBucket.file('apalmer/library/logo/logo.png').download())[0], oldLogo);

  const inventory = await service.inspect({ uid: 'user-1', sandbox: 'apalmer' }, d);
  assert.equal(inventory.activeCustomer, 'New Brand');
  assert.equal(inventory.revisions[0].customerName, 'Old Brand');

  const restore = await service.createRestorePreview({
    uid: 'user-1', workspaceSlug: 'apalmer', sandbox: 'apalmer',
    revisionId: 'revision-old', currentCustomerName: 'New Brand',
  }, d);
  assert.equal(restore.preflightId, 'restore-preview');
  const restored = await service.applyPreview({
    uid: 'user-1', workspaceSlug: 'apalmer', sandbox: 'apalmer',
    preflightId: restore.preflightId, confirmed: true,
    idempotencyKey: 'restore-old-brand', imageHostingLibrary,
  }, d);
  assert.equal(restored.customerName, 'Old Brand');
  assert.deepEqual((await activeBucket.file('apalmer/library/logo/logo.png').download())[0], oldLogo);
  assert.deepEqual((await activeBucket.file('apalmer/library/hero-banner.png').download())[0], oldHero);
  assert.deepEqual((await activeBucket.file('apalmer/library/mobile/location_entry.png').download())[0], oldMobileEntry);
  assert.deepEqual((await activeBucket.file('apalmer/library/mobile/location_exit.png').download())[0], oldMobileExit);
  assert.deepEqual((await activeBucket.file('apalmer/library/mobile/push-inapp.png').download())[0], oldPush);

  const direct = await service.restoreRevisionDirect({
    uid: 'user-1', workspaceSlug: 'apalmer', sandbox: 'apalmer',
    revisionId: 'revision-new', imageHostingLibrary,
  }, d);
  assert.equal(direct.verified, true);
  assert.equal(direct.customerName, 'New Brand');
  assert.notDeepEqual((await activeBucket.file('apalmer/library/logo/logo.png').download())[0], oldLogo);
});
