'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const service = require('../labDemoCustomerService');

const clone = (value) => value === undefined ? undefined : structuredClone(value);

class Firestore {
  constructor() { this.data = new Map(); this.count = 0; this.queue = Promise.resolve(); this.fail = null; }
  collection(path) {
    const db = this;
    const query = (ordering, offset, limit = 20) => ({
      orderBy(field, direction) { return query({ field, direction }, offset, limit); },
      startAfter(snap) { return query(ordering, snap.ref.path, limit); },
      limit(value) { return query(ordering, offset, value); },
      async get() {
        let docs = [...db.data.keys()].filter((key) => key.startsWith(path + '/') && !key.slice(path.length + 1).includes('/'));
        docs.sort((a, b) => {
          const av = db.data.get(a)[ordering?.field || 'createdAt'];
          const bv = db.data.get(b)[ordering?.field || 'createdAt'];
          return ordering?.direction === 'desc' ? String(bv).localeCompare(String(av)) || b.localeCompare(a) : a.localeCompare(b);
        });
        if (offset) docs = docs.slice(docs.indexOf(offset) + 1);
        return { docs: await Promise.all(docs.slice(0, limit).map((key) => db.doc(key).get())) };
      },
    });
    return { ...query(), doc(id = `auto-${++db.count}`) { return db.doc(`${path}/${id}`); } };
  }
  doc(path) {
    const db = this;
    return {
      id: path.split('/').at(-1), path,
      collection(name) { return db.collection(`${path}/${name}`); },
      async get() { return { id: path.split('/').at(-1), ref: this, exists: db.data.has(path), data: () => clone(db.data.get(path)) }; },
      async set(value, opts) {
        if (db.fail && db.fail(path, value)) throw new Error('injected journal persistence failure');
        db.data.set(path, opts?.merge ? { ...clone(db.data.get(path)), ...clone(value) } : clone(value));
      },
      async create(value) {
        if (db.data.has(path)) throw new Error('already exists');
        await this.set(value);
      },
    };
  }
  async runTransaction(work) {
    const run = this.queue.then(async () => {
      const writes = [];
      const result = await work({
        get: (ref) => ref.get(),
        set: (ref, value) => writes.push(() => ref.set(value)),
        create: (ref, value) => writes.push(() => ref.create(value)),
        delete: (ref) => writes.push(() => this.data.delete(ref.path)),
      });
      for (const write of writes) await write();
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }
}

class Bucket {
  constructor() { this.objects = new Map(); this.generation = 0; this.fail = null; }
  async *getFilesStream({ prefix }) {
    for (const path of [...this.objects.keys()].filter((name) => name.startsWith(prefix))) yield this.file(path);
  }
  async getFiles({ prefix }) {
    return [[...this.objects.keys()].filter((path) => path.startsWith(prefix)).map((path) => this.file(path))];
  }
  file(path, options = {}) {
    const bucket = this;
    function value() {
      const item = bucket.objects.get(path);
      if (!item) throw Object.assign(new Error(`missing ${path}`), { code: 404 });
      if (options.generation && options.generation !== item.generation) throw new Error('generation changed');
      return item;
    }
    return {
      name: path,
      async getMetadata() { const item = value(); return [{ generation: item.generation, contentType: item.contentType, size: String(item.bytes.length), timeCreated: item.timeCreated }]; },
      async download() { return [Buffer.from(value().bytes)]; },
      async getSignedUrl() {
        if (bucket.fail?.('sign', path)) throw new Error('signing unavailable');
        return [`https://preview.example/${encodeURIComponent(path)}`];
      },
      async save(bytes, opts = {}) {
        if (bucket.fail?.('save', path)) throw new Error('injected image write failure');
        const existing = bucket.objects.get(path);
        const expected = opts.preconditionOpts?.ifGenerationMatch;
        if (expected !== undefined && String(expected) !== String(existing?.generation || 0)) throw new Error('precondition failed');
        bucket.objects.set(path, { bytes: Buffer.from(bytes), generation: String(++bucket.generation), contentType: opts.contentType || 'image/png', timeCreated: new Date().toISOString() });
      },
      async delete(opts = {}) {
        const existing = value();
        if (opts.ifGenerationMatch && opts.ifGenerationMatch !== existing.generation) throw new Error('delete precondition failed');
        bucket.objects.delete(path);
      },
    };
  }
}

function fixture() {
  const firestore = new Firestore();
  const activeBucket = new Bucket();
  const backupBucket = new Bucket();
  const root = {
    CoreDemoData: { name: 'Customer A', shortName: 'A', slogan: 'A slogan', url: 'https://a.example', customerLogo: 'https://example.test/cdn/demo/logo/logo.png' },
    StaffPortal: { Colour: '#123456', AgentName: 'Not customer branding' },
    meta: { adobeEmail: 'private@example.test' },
    Uncatalogued: { secret: 'must not be snapshotted' },
  };
  const database = {
    root,
    fail: null,
    ref() {
      return {
        async once() { return { val: () => clone(database.root) }; },
        async transaction(update) {
          if (database.fail?.()) throw new Error('injected RTDB failure');
          const next = update(clone(database.root));
          if (next === undefined) return { committed: false };
          database.root = clone(next);
          return { committed: true };
        },
      };
    },
  };
  const context = { uid: 'user', sandbox: 'demo', workspaceSlug: 'owner' };
  const deps = { firestore, activeBucket, backupBucket, database, sharp };
  const setup = async () => {
    await activeBucket.file('demo/library/logo/logo.png').save(Buffer.from('logo A'));
    await activeBucket.file('demo/library/email/extra.png').save(Buffer.from('email A'));
    await activeBucket.file('demo/library/shared/icon.svg').save(Buffer.from('shared bytes'), { contentType: 'image/svg+xml' });
  };
  const scope = { customer_paths: ['logo/logo.png', 'email/extra.png'], shared_paths: ['shared/icon.svg'] };
  const inspect = (input = {}) => service.inspect(context, input, deps);
  const preview = (input) => service.preview(context, { ...scope, ...input }, deps);
  const apply = (preflight, key = `operation-${preflight.preflightId}`) => service.apply(context, { preflight_id: preflight.preflightId, confirmed: true, idempotency_key: key }, deps);
  const png = async (background) => sharp({ create: { width: 20, height: 10, channels: 4, background } }).png().toBuffer();
  const stage = async () => {
    const bytes = await png('red');
    return service.stage(context, { file_name: 'logo.png', content_type: 'image/png', base64: bytes.toString('base64') }, deps);
  };
  const newPreview = async (extra = {}) => {
    const staged = await stage();
    const current = await inspect();
    const changes = current.configuration.map((item) => ({ path: item.path, value: item.path === 'CoreDemoData.name' ? 'Customer B' : item.value }));
    return preview({
      action: 'customer-switch-preview', customer_name: 'Customer B', backup_customer_name: 'Customer A',
      replacements: [{ rel_path: 'logo/logo.png', stage_id: staged.stageId }], changes, ...extra,
    });
  };
  return { ...deps, context, deps, scope, setup, inspect, preview, apply, stage, newPreview };
}

test('cloud save leaves live data unchanged and A -> B -> A restores files/config but never shared or protected fields', async () => {
  const f = fixture();
  await f.setup();
  const original = clone(f.database.root);
  const first = await f.preview({ action: 'customer-save-preview', customer_name: 'Customer A' });
  assert.equal(first.files.length, 2);
  assert.deepEqual(f.database.root, original);
  const saved = await f.apply(first);
  assert.equal(saved.verified, true);
  const before = await f.inspect();
  assert.equal(before.activeCustomer, 'Customer A');
  assert.equal(before.revisions[0].fileCount, 2);
  const snap = [...f.firestore.data.values()].find((item) => item.files && item.customerName === 'Customer A' && item.createdAt);
  assert.deepEqual(snap.configuration.map((item) => item.path), service.BRAND_PATHS);
  assert.ok(!JSON.stringify(snap).includes('must not be snapshotted'));

  const staged = await f.stage();
  const prep = await f.newPreview({
    replacements: [{ rel_path: 'logo/logo.png', stage_id: staged.stageId }, { rel_path: 'email/new.png', stage_id: staged.stageId }],
  });
  const switched = await f.apply(prep);
  assert.equal(switched.customerName, 'Customer B');
  assert.equal(f.database.root.CoreDemoData.name, 'Customer B');
  assert.notEqual(f.activeBucket.objects.get('demo/library/logo/logo.png').bytes.toString(), 'logo A');
  const restore = await f.preview({ action: 'customer-switch-preview', revision_id: saved.revisionId, backup_customer_name: 'Customer B', customer_paths: ['logo/logo.png', 'email/extra.png', 'email/new.png'] });
  assert.ok(restore.files.some((item) => item.relPath === 'email/new.png' && item.action === 'delete'));
  const restored = await f.apply(restore);
  assert.equal(restored.verified, true);
  assert.deepEqual(f.database.root, original);
  assert.equal(f.activeBucket.objects.get('demo/library/logo/logo.png').bytes.toString(), 'logo A');
  assert.equal(f.activeBucket.objects.get('demo/library/email/extra.png').bytes.toString(), 'email A');
  assert.equal(f.activeBucket.objects.get('demo/library/shared/icon.svg').bytes.toString(), 'shared bytes');
  assert.equal(f.activeBucket.objects.has('demo/library/email/new.png'), false);
  const replay = await f.apply(prep);
  assert.equal(replay.status, 'succeeded');
  assert.equal(replay.verified, false, 'historical success must not be presented as current activation');
});

test('unclassified paths, shared replacements, format mismatches, and unresolved branding are blocked', async () => {
  const f = fixture();
  await f.setup();
  await assert.rejects(service.preview(f.context, { action: 'customer-save-preview', customer_name: 'A', customer_paths: ['logo/logo.png'] }, f.deps), /Classify every/);
  await assert.rejects(f.newPreview({ changes: [{ path: 'CoreDemoData.name', value: 'Customer B' }] }), /Explicitly keep/);
  const staged = await f.stage();
  await assert.rejects(f.newPreview({ replacements: [{ rel_path: 'shared/icon.svg', stage_id: staged.stageId }] }), /shared replacement/);
  await assert.rejects(f.newPreview({ replacements: [{ rel_path: 'logo/logo.gif', stage_id: staged.stageId }] }), /must match/);
  await assert.rejects(f.newPreview({ changes: [{ path: 'meta.adobeEmail', value: 'bad' }] }), /Not an approved/);
  assert.equal(f.activeBucket.objects.get('demo/library/logo/logo.png').bytes.toString(), 'logo A');
});

test('failure after the first image write restores the complete outgoing package and cannot replay success', async () => {
  const f = fixture();
  await f.setup();
  const preview = await f.newPreview();
  let failed = false;
  f.database.fail = () => { if (failed) return false; failed = true; return true; };
  let operationId;
  await assert.rejects(f.apply(preview), (error) => { operationId = error.operationId; return /rolled_back/.test(error.message); });
  assert.equal(f.database.root.CoreDemoData.name, 'Customer A');
  assert.equal(f.activeBucket.objects.get('demo/library/logo/logo.png').bytes.toString(), 'logo A');
  assert.equal(f.activeBucket.objects.get('demo/library/email/extra.png').bytes.toString(), 'email A');
  const replay = await f.apply(preview);
  assert.equal(replay.ok, false);
  assert.equal(replay.status, 'rolled_back');
  assert.equal(replay.verified, false);
  assert.equal(replay.operationId, operationId);
});

test('idempotency keys bind exact requests, and concurrent publication is serialized', async () => {
  const f = fixture();
  await f.setup();
  const a = await f.newPreview();
  const b = await f.newPreview();
  const results = await Promise.allSettled([f.apply(a, 'one-operation'), f.apply(b, 'second-operation')]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.match(results.find((result) => result.status === 'rejected').reason.message, /holds this resource/);
  await assert.rejects(f.apply(b, 'one-operation'), /different preview/);
});

test('changed previews fail without overwriting newer library contents', async () => {
  const f = fixture();
  await f.setup();
  const preview = await f.newPreview();
  await f.activeBucket.file('demo/library/logo/logo.png').save(Buffer.from('manual update'));
  await assert.rejects(f.apply(preview), /changed after preview/);
  assert.equal(f.activeBucket.objects.get('demo/library/logo/logo.png').bytes.toString(), 'manual update');
});

test('signing failure never produces an empty image preview or changes live content', async () => {
  const f = fixture();
  await f.setup();
  f.backupBucket.fail = (action) => action === 'sign';
  await assert.rejects(f.preview({ action: 'customer-save-preview', customer_name: 'A' }), /signing unavailable/);
  assert.equal(f.activeBucket.objects.get('demo/library/logo/logo.png').bytes.toString(), 'logo A');
});

test('journal completion failure rolls back RTDB and bytes; unknown external mutations require explicit recovery', async () => {
  const f = fixture();
  await f.setup();
  const preview = await f.newPreview();
  f.firestore.fail = (path, value) => path.startsWith(service.OPERATIONS + '/') && value.status === 'succeeded';
  await assert.rejects(f.apply(preview), /rolled_back/);
  assert.equal(f.database.root.CoreDemoData.name, 'Customer A');
  assert.equal(f.activeBucket.objects.get('demo/library/logo/logo.png').bytes.toString(), 'logo A');

  const retry = await f.newPreview();
  f.database.fail = () => {
    f.activeBucket.objects.set('demo/library/logo/logo.png', { bytes: Buffer.from('external writer'), generation: '900', contentType: 'image/png' });
    return true;
  };
  let operationId;
  await assert.rejects(f.apply(retry), (error) => { operationId = error.operationId; return /recovery_required/.test(error.message); });
  assert.equal(f.activeBucket.objects.get('demo/library/logo/logo.png').bytes.toString(), 'external writer');
  await assert.rejects(service.recover(f.context, { operation_id: operationId, confirmed: true }, f.deps), /Wait five minutes/);
  const lockRefs = [...f.firestore.data.keys()].filter((key) => key.startsWith(service.LOCKS + '/'));
  lockRefs.forEach((key) => { f.firestore.data.get(key).acquiredAt -= 600_000; });
  await assert.rejects(service.recover(f.context, { operation_id: operationId, confirmed: true }, f.deps), /manual reconciliation/);
});

test('staging validates decoded image types and scope ownership', async () => {
  const f = fixture();
  await f.setup();
  await assert.rejects(service.stage(f.context, { base64: 'not base64', content_type: 'image/png' }, f.deps), /valid base64/);
  await assert.rejects(service.stage(f.context, { base64: Buffer.from('not image bytes').toString('base64'), content_type: 'image/png' }, f.deps), /unsupported image format/);
  const staged = await f.stage();
  await assert.rejects(service.preview({ ...f.context, uid: 'different-user' }, {
    ...f.scope, action: 'customer-switch-preview', customer_name: 'Customer B',
    changes: [{ path: 'CoreDemoData.name', value: 'Customer B' }],
    replacements: [{ rel_path: 'logo/logo.png', stage_id: staged.stageId }],
  }, f.deps), /Explicitly keep/);
  const preview = await f.preview({ action: 'customer-save-preview', customer_name: 'A' });
  await assert.rejects(service.apply({ ...f.context, uid: 'other-user' }, { preflight_id: preview.preflightId, confirmed: true, idempotency_key: 'other-user-key' }, f.deps), /Record not found/);
});

test('backup failure and stale configuration never begin publication', async () => {
  const f = fixture();
  await f.setup();
  const preview = await f.newPreview();
  f.backupBucket.fail = (action, path) => action === 'save' && path.startsWith('demo-customer-backups/');
  await assert.rejects(f.apply(preview), /rolled_back/);
  assert.equal(f.activeBucket.objects.get('demo/library/logo/logo.png').bytes.toString(), 'logo A');
  f.backupBucket.fail = null;
  const next = await f.newPreview();
  f.database.root.CoreDemoData.slogan = 'newer external slogan';
  await assert.rejects(f.apply(next), /changed after preview/);
  assert.equal(f.database.root.CoreDemoData.slogan, 'newer external slogan');
  assert.equal(f.activeBucket.objects.get('demo/library/logo/logo.png').bytes.toString(), 'logo A');
});

test('public delivery failure rolls back, and outgoing recovery journal exists before each live write', async () => {
  const f = fixture();
  await f.setup();
  const preview = await f.newPreview();
  let publicationSeen = false;
  f.activeBucket.fail = (action) => {
    if (action !== 'save') return false;
    publicationSeen = true;
    const operation = [...f.firestore.data.entries()].find(([path, item]) => path.startsWith(service.OPERATIONS + '/') && item.status === 'applying')?.[1];
    assert.ok(operation?.before?.revisionId);
    assert.ok([...f.firestore.data.keys()].some((path) => path.endsWith('/revisions/' + operation.before.revisionId)));
    return false;
  };
  f.deps.verifyPublicFile = async () => { throw new Error('CDN mismatch'); };
  await assert.rejects(f.apply(preview), /CDN mismatch/);
  assert.equal(publicationSeen, true);
  assert.equal(f.database.root.CoreDemoData.name, 'Customer A');
  assert.equal(f.activeBucket.objects.get('demo/library/logo/logo.png').bytes.toString(), 'logo A');
});

test('a simulated crashed operation can recover from its durable outgoing snapshot', async () => {
  const f = fixture();
  await f.setup();
  const result = await f.apply(await f.newPreview());
  const operation = f.firestore.data.get(service.OPERATIONS + '/' + result.operationId);
  operation.status = 'applying';
  for (const resource of ['library:demo', 'workspace:owner']) {
    f.firestore.data.set(service.LOCKS + '/' + service.digest(resource), { owner: result.operationId, acquiredAt: Date.now() - 600_000 });
  }
  const recovered = await service.recover(f.context, { operation_id: result.operationId, confirmed: true }, f.deps);
  assert.equal(recovered.status, 'rolled_back');
  assert.equal(f.database.root.CoreDemoData.name, 'Customer A');
  assert.equal(f.activeBucket.objects.get('demo/library/logo/logo.png').bytes.toString(), 'logo A');
  assert.equal([...f.firestore.data.keys()].some((path) => path.startsWith(service.LOCKS + '/')), false);
});

test('saved revision pagination is scoped and does not truncate older customers', async () => {
  const f = fixture();
  await f.setup();
  await f.apply(await f.preview({ action: 'customer-save-preview', customer_name: 'Customer A' }));
  const revisions = `${service.SCOPES}/${service.digest(['user', 'owner', 'demo'])}/revisions`;
  for (let index = 0; index < 25; index++) {
    await f.firestore.collection(revisions).doc(`revision-${index}`).set({
      customerName: `Customer ${index}`, files: [], createdAt: new Date(Date.now() + index * 1000).toISOString(),
    });
  }
  const first = await f.inspect();
  const second = await f.inspect({ cursor: first.nextCursor });
  assert.equal(first.items.length, 3);
  assert.equal(first.revisions.length, 20);
  assert.equal(second.revisions.length, 6);
  assert.equal(new Set([...first.revisions, ...second.revisions].map((item) => item.revisionId)).size, 26);
  assert.equal(second.nextCursor, null);
});

test('temporary cleanup deletes expired staging only, never saved customer snapshots', async () => {
  const f = fixture();
  await f.setup();
  await f.apply(await f.preview({ action: 'customer-save-preview', customer_name: 'Customer A' }));
  for (const item of f.backupBucket.objects.values()) item.timeCreated = new Date(Date.now() - 172_800_000).toISOString();
  const fresh = await f.stage();
  const result = await service.cleanTemporaryObjects(f.deps);
  assert.equal(result.deleted, 2);
  assert.ok(f.backupBucket.objects.size >= 3);
  assert.ok([...f.backupBucket.objects.keys()].some((path) => path.includes(fresh.stageId)));
  assert.ok([...f.backupBucket.objects.keys()].some((path) => path.startsWith('demo-customer-backups/')));
});

test('new files cannot push the resulting library over its inventory limit', async () => {
  const f = fixture(); await f.setup();
  for (let index = 0; index < 197; index++) {
    const relPath = `shared/extra-${index}.png`;
    await f.activeBucket.file('demo/library/' + relPath).save(Buffer.from('shared'));
    f.scope.shared_paths.push(relPath);
  }
  const staged = await f.stage();
  await assert.rejects(f.newPreview({ replacements: [{ rel_path: 'email/new.png', stage_id: staged.stageId }] }), /resulting library/);
  assert.equal(f.activeBucket.objects.has('demo/library/email/new.png'), false);
});

test('branding drift and classification changes invalidate an earlier confirmation', async () => {
  const f = fixture(); await f.setup();
  await f.apply(await f.preview({ action: 'customer-save-preview', customer_name: 'Customer A' }));
  const next = await f.newPreview();
  const scope = `${service.SCOPES}/${service.digest(['user', 'owner', 'demo'])}`;
  f.firestore.data.get(scope).sharedPaths.push('reserved/future.png');
  await assert.rejects(f.apply(next), /classification.*changed after preview/);
  f.database.root.StaffPortal.Colour = '#654321';
  const current = await f.inspect();
  assert.equal(current.drift, true);
  assert.equal(current.operation.verified, false);
});

test('AVIF container detection and multi-frame GIF staging preserve original bytes', async () => {
  const f = fixture(); await f.setup();
  const avif = await sharp({ create: { width: 2, height: 2, channels: 4, background: 'red' } }).avif().toBuffer();
  const pixels = Buffer.from([...Array(4).fill([255, 0, 0, 255]).flat(), ...Array(4).fill([0, 0, 255, 255]).flat()]);
  const gif = await sharp(pixels, { raw: { width: 2, height: 4, channels: 4, pageHeight: 2 } }).gif().toBuffer();
  for (const [bytes, contentType, extension] of [[avif, 'image/avif', 'avif'], [gif, 'image/gif', 'gif']]) {
    const staged = await service.stage(f.context, { base64: bytes.toString('base64'), content_type: contentType, file_name: 'image.' + extension }, f.deps);
    const stored = [...f.backupBucket.objects.entries()].find(([path]) => path.endsWith('/' + staged.stageId))[1];
    assert.deepEqual(stored.bytes, bytes);
    const preview = await f.newPreview({ replacements: [{ rel_path: 'email/animation.' + extension, stage_id: staged.stageId }] });
    await f.apply(preview);
    assert.deepEqual(f.activeBucket.objects.get('demo/library/email/animation.' + extension).bytes, bytes);
    if (extension === 'gif') assert.equal((await sharp(stored.bytes, { animated: true }).metadata()).pages, 2);
    f.scope.customer_paths.push('email/animation.' + extension);
  }
});

test('journal outages retain a recoverable operation ID and lock instead of losing the receipt', async () => {
  const f = fixture(); await f.setup();
  const preview = await f.newPreview();
  f.firestore.fail = (path, value) => path.startsWith(service.OPERATIONS + '/') && ['succeeded', 'rolled_back'].includes(value.status);
  let operationId;
  await assert.rejects(f.apply(preview), (error) => {
    operationId = error.operationId;
    return error.code === 'DEMO_CUSTOMER_JOURNAL_FAILED' && /^[a-f0-9]{64}$/.test(operationId);
  });
  const status = await service.handle(f.context, { action: 'customer-status', operation_id: operationId }, f.deps);
  assert.equal(status.status, 'applying');
  assert.equal(f.database.root.CoreDemoData.name, 'Customer A');
  assert.equal(f.activeBucket.objects.get('demo/library/logo/logo.png').bytes.toString(), 'logo A');
  assert.ok([...f.firestore.data.values()].some((item) => item.owner === operationId));
});
