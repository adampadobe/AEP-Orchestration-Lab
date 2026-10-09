'use strict';

const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const user = { uid: 'user1', email: 'alan@adobe.com', name: 'Alan' };
const html = (title, image = '') => `<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1>${image}</body></html>`;

function storage() {
  const docs = new Map();
  const files = new Map();
  let auto = 0;
  let clock = 0;
  let failSave = false;
  let beforeTransaction = null;
  const snapshot = (ref) => ({ id: ref.id, ref, exists: docs.has(ref.path), data: () => ({ ...(docs.get(ref.path) || {}) }) });
  const reference = (p) => ({
    id: p.split('/').at(-1), path: p,
    collection: (name) => collection(`${p}/${name}`),
    get: async function () { return snapshot(this); },
    set: async (data) => { docs.set(p, { ...data }); },
    update: async (data) => { docs.set(p, { ...docs.get(p), ...data }); },
    delete: async () => { docs.delete(p); },
  });
  const collection = (name, filter = () => true, sort = null, limit = Infinity, after = '') => ({
    doc: (id) => reference(`${name}/${id || `auto${String(++auto).padStart(6, '0')}`}`),
    where: (field, _op, value) => collection(name, (data) => filter(data) && data[field] === value, sort, limit, after),
    orderBy: (field, direction) => collection(name, filter, { field, direction }, limit, after),
    limit: (n) => collection(name, filter, sort, n, after),
    startAfter: (doc) => collection(name, filter, sort, limit, doc.ref.path),
    get: async () => {
      let entries = [...docs.entries()].filter(([p, d]) => p.slice(0, p.lastIndexOf('/')) === name && filter(d));
      if (sort) entries.sort((a, b) => {
        const av = a[1][sort.field]?.toMillis ? a[1][sort.field].toMillis() : a[1][sort.field];
        const bv = b[1][sort.field]?.toMillis ? b[1][sort.field].toMillis() : b[1][sort.field];
        return (av - bv) * (sort.direction === 'desc' ? -1 : 1);
      });
      if (after) entries = entries.slice(entries.findIndex(([p]) => p === after) + 1);
      const result = entries.slice(0, limit).map(([p]) => snapshot(reference(p)));
      return { docs: result, empty: !result.length };
    },
  });
  const writes = () => {
    const pending = [];
    return {
      get: async (ref) => snapshot(ref),
      set: (ref, data) => pending.push(() => docs.set(ref.path, { ...data })),
      update: (ref, data) => pending.push(() => docs.set(ref.path, { ...docs.get(ref.path), ...data })),
      delete: (ref) => pending.push(() => docs.delete(ref.path)),
      commit: async () => pending.forEach((write) => write()),
    };
  };
  const db = {
    collection,
    batch: writes,
    runTransaction: async (fn) => {
      if (beforeTransaction) { beforeTransaction(); beforeTransaction = null; }
      const tx = writes();
      await fn(tx);
      await tx.commit();
    },
  };
  const bucket = { file: (p) => ({
    save: async (bytes, options) => {
      if (failSave) throw new Error('Storage unavailable');
      files.set(p, { bytes: Buffer.from(bytes), metadata: options.metadata });
    },
    exists: async () => [files.has(p)],
    download: async () => [files.get(p).bytes],
    getMetadata: async () => [files.get(p).metadata],
    delete: async () => { files.delete(p); },
  }), deleteFiles: async ({ prefix }) => { for (const p of [...files.keys()]) if (p.startsWith(prefix)) files.delete(p); } };
  const firestore = Object.assign(() => db, {
    FieldValue: { serverTimestamp: () => ++clock },
    Timestamp: { fromDate: (date) => ({ toMillis: () => date.getTime(), toDate: () => date }) },
  });
  const admin = { apps: [{}], firestore, storage: () => ({ bucket: () => bucket }) };
  let base;
  function load(name) {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), {
      module, exports: module.exports, Buffer, URL, process, console,
      require: (id) => id === 'firebase-admin' ? admin : id === './demoAssetsService' ? base : require(id),
    });
    return module.exports;
  }
  base = load('demoAssetsService.js');
  const studio = load('demoStudioService.js');
  return {
    base, studio, docs, files,
    failSave: () => { failSave = true; },
    race: (fn) => { beforeTransaction = fn; },
  };
}

async function initial(s) {
  return (await s.base.createAsset({ html: html('Original'), filename: 'ba-channels-v1.html' }, user)).asset;
}

it('matches version suffixes, browser copy names and reordered filename words but not other customers', () => {
  const s = storage();
  const assets = [{ id: 'assetAA1', originalFilename: 'British-Airways-decisioning-channels_3.html' }];
  for (const name of ['British Airways decisioning channels v4.htm', 'british-airways-decisioning-channels-v4 (1).html', 'british-airways-channels-decisioning.html']) {
    assert.equal(s.base.findFilenameMatches(name, assets)[0].id, 'assetAA1');
  }
  assert.equal(s.base.findFilenameMatches('Emirates-decisioning-channels.html', assets).length, 0);
  assert.equal(s.base.findFilenameMatches('', assets).length, 0);
});

it('prompts before storing or classifying a similar-name upload and supports a separate asset', async () => {
  const s = storage();
  const asset = await initial(s);
  const input = { html: html('Revised'), filename: 'ba-channels-v2.html' };
  const filesBefore = s.files.size;
  const out = await s.base.createAsset(input, user, { callGemini: () => { throw new Error('Should not classify a pending decision'); } });
  assert.equal(out.versionCandidates[0].id, asset.id);
  assert.equal(s.files.size, filesBefore);
  assert.equal(s.docs.size, 2);
  const separate = await s.base.createAsset({ ...input, force: true }, user);
  assert.notEqual(separate.asset.id, asset.id);
  assert.equal((await s.base.listAssets()).length, 2);
});

it('keeps exact duplicate detection before filename suggestions', async () => {
  const s = storage();
  const asset = await initial(s);
  const duplicate = await s.base.createAsset({ html: html('Original'), filename: 'anything.html' }, user);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.asset.id, asset.id);
  assert.equal(s.docs.size, 2);
});

it('archives older uploads, retains metadata and media, and restores by copying forward', async () => {
  const s = storage();
  const asset = await initial(s);
  const image = `<img src="data:image/png;base64,${Buffer.alloc(4000, 7).toString('base64')}">`;
  const revisedHtml = html('Revised', image);
  const upload = await s.studio.uploadVersion(asset.id, {
    html: revisedHtml, filename: 'ba-channels-v2.html', folderPath: 'Event Demos', expectedVersionId: asset.currentVersionId,
  }, user);
  assert.equal(upload.asset.id, asset.id);
  assert.equal(upload.asset.title, asset.title);
  assert.equal(upload.asset.status, asset.status);
  assert.equal(upload.asset.sizes.htmlBytes, Buffer.byteLength(revisedHtml));
  assert.equal(upload.asset.sizes.mediaCount, 1);
  assert.equal((await s.base.loadRenderedHtml(asset.id)).html, revisedHtml);
  assert.equal((await s.base.loadRenderedHtml(asset.id, { versionId: asset.currentVersionId })).html, html('Original'));
  const history = await s.studio.listVersions(asset.id);
  assert.equal(history.length, 2);
  assert.equal(history[0].current, true);
  assert.equal(history[0].originalFilename, 'ba-channels-v2.html');
  assert.equal(history[1].current, false);
  const restored = await s.studio.restoreVersion(asset.id, asset.currentVersionId, user);
  assert.notEqual(restored.versionId, asset.currentVersionId);
  assert.equal(restored.asset.originalFilename, 'ba-channels-v1.html');
  assert.equal(restored.asset.sizes.htmlBytes, Buffer.byteLength(html('Original')));
  assert.equal(restored.asset.sizes.mediaCount, 0);
  assert.equal(restored.asset.sha256, asset.sha256);
  assert.equal((await s.studio.listVersions(asset.id)).length, 3);
  assert.equal((await s.base.loadRenderedHtml(asset.id)).html, html('Original'));
  assert.equal((await s.base.loadRenderedHtml(asset.id, { versionId: upload.versionId })).html, revisedHtml);
});

it('rejects invalid, identical and stale uploads without changing history', async () => {
  const s = storage();
  const asset = await initial(s);
  const upload = { html: html('New'), filename: 'new.html', expectedVersionId: asset.currentVersionId };
  await assert.rejects(s.studio.uploadVersion(asset.id, { ...upload, expectedVersionId: null }, user), /expectedVersionId/);
  await assert.rejects(s.studio.uploadVersion(asset.id, { ...upload, html: 'plain text' }, user), /HTML document/);
  await assert.rejects(s.studio.uploadVersion(asset.id, { ...upload, html: 'x'.repeat(25 * 1024 * 1024 + 1) }, user), (e) => e.status === 413);
  await assert.rejects(s.studio.uploadVersion(asset.id, { ...upload, html: html('Original') }, user), /already the current version/);
  await assert.rejects(s.studio.uploadVersion(asset.id, { ...upload, expectedVersionId: 'staleVersion' }, user), (e) => e.status === 409);
  assert.equal(s.docs.size, 2);
});

it('reports storage errors without advancing the current version', async () => {
  const s = storage();
  const asset = await initial(s);
  s.failSave();
  await assert.rejects(s.studio.uploadVersion(asset.id, {
    html: html('New'), filename: 'new.html', expectedVersionId: asset.currentVersionId,
  }, user), /Storage unavailable/);
  assert.equal((await s.base.getAsset(asset.id)).currentVersionId, asset.currentVersionId);
  assert.equal(s.docs.size, 2);
});

it('rejects a concurrent update at commit and cleans the uncommitted skeleton', async () => {
  const s = storage();
  const asset = await initial(s);
  s.race(() => { s.docs.get(`demoAssets/${asset.id}`).currentVersionId = 'racingVersion'; });
  await assert.rejects(s.studio.uploadVersion(asset.id, {
    html: html('New'), filename: 'new.html', expectedVersionId: asset.currentVersionId,
  }, user), (e) => e.status === 409);
  assert.equal(s.files.size, 1);
  assert.equal(s.docs.size, 2);
  assert.equal((await s.base.getAsset(asset.id)).currentVersionId, 'racingVersion');
});

it('keeps legacy original uploads readable and records their filenames when archiving', async () => {
  const s = storage();
  const asset = await initial(s);
  const version = s.docs.get(`demoAssets/${asset.id}/versions/${asset.currentVersionId}`);
  delete version.originalFilename;
  await s.studio.uploadVersion(asset.id, { html: html('New'), filename: 'ba-v2.html', expectedVersionId: asset.currentVersionId }, user);
  assert.equal(version.originalFilename, undefined);
  const history = await s.studio.listVersions(asset.id);
  assert.equal(history.find((v) => v.id === asset.currentVersionId).originalFilename, 'ba-channels-v1.html');
});

it('pins preview tokens so a subsequent upload does not change an already opened demo', async () => {
  const s = storage();
  const asset = await initial(s);
  const preview = await s.base.createRenderToken(asset.id, user);
  const target = await s.base.resolveRenderTarget(preview.token);
  assert.equal(target.versionId, asset.currentVersionId);
  await s.studio.uploadVersion(asset.id, { html: html('New'), filename: 'new.html', expectedVersionId: asset.currentVersionId }, user);
  assert.equal((await s.base.loadRenderedHtml(asset.id, { versionId: target.versionId })).html, html('Original'));
  await assert.rejects(s.base.createRenderToken(asset.id, user, { versionId: 'missingVersion' }), (e) => e.status === 404);
});

it('exposes older versions beyond the previous 100-version cutoff', async () => {
  const s = storage();
  const asset = await initial(s);
  const original = s.docs.get(`demoAssets/${asset.id}/versions/${asset.currentVersionId}`);
  for (let i = 0; i < 105; i += 1) s.docs.set(`demoAssets/${asset.id}/versions/extra${String(i).padStart(6, '0')}`, { ...original, createdAt: i + 2 });
  assert.equal((await s.studio.listVersions(asset.id)).length, 106);
});

it('paginates versions and preserves the legacy array response', async () => {
  const s = storage();
  const asset = await initial(s);
  const original = s.docs.get(`demoAssets/${asset.id}/versions/${asset.currentVersionId}`);
  for (let i = 0; i < 3; i += 1) {
    s.docs.set(`demoAssets/${asset.id}/versions/page${String(i).padStart(6, '0')}`, { ...original, createdAt: i + 10 });
  }
  const first = await s.studio.listVersions(asset.id, { limit: 2 });
  assert.equal(first.versions.length, 2);
  assert.ok(first.nextCursor);
  const second = await s.studio.listVersions(asset.id, { limit: 2, cursor: first.nextCursor });
  assert.equal(second.versions.length, 2);
  assert.equal(second.nextCursor, null);
  assert.ok(Array.isArray(await s.studio.listVersions(asset.id)));
});

it('searches beyond the former 1000-asset cutoff and paginates matches', async () => {
  const s = storage();
  const original = await initial(s);
  for (let i = 0; i < 1005; i += 1) {
    s.docs.set(`demoAssets/asset${String(i).padStart(6, '0')}`, {
      title: `Decoy ${i}`, originalFilename: `decoy-${i}.html`, createdAt: 10000 + i,
    });
  }
  s.docs.set('demoAssets/assetneedle1', {
    title: 'Legacy target', originalFilename: 'needle-campaign-v1.html', createdAt: 1,
  });
  const result = await s.base.createAsset({
    html: html('Revised'), filename: 'needle-campaign-v2.html',
  }, user);
  assert.equal(result.versionCandidates[0].id, 'assetneedle1');
  const first = await s.base.listAssets({ limit: 1, q: 'needle' });
  assert.equal(first.assets[0].id, 'assetneedle1');
  assert.equal(first.nextCursor, null);
  assert.equal((await s.base.listAssets({ limit: 100, q: 'original' })).assets.some((asset) => asset.id === original.id), true);
});

it('trashes assets recoverably and keeps revoked links revoked after restore', async () => {
  const s = storage();
  const asset = await initial(s);
  const live = await s.base.createRenderToken(asset.id, user);
  const revoked = await s.base.createRenderToken(asset.id, user);
  const listed = await s.base.listRenderTokens(asset.id, user);
  assert.equal(listed.length, 2);
  assert.ok(listed.every((token) => token.url.includes(token.id)));
  await s.base.revokeRenderToken(asset.id, revoked.tokenId, user);
  assert.equal((await s.base.listRenderTokens(asset.id, user)).find((token) => token.id === revoked.tokenId).revoked, true);

  await s.base.trashAsset(asset.id, user);
  assert.equal((await s.base.listAssets()).some((item) => item.id === asset.id), false);
  assert.equal((await s.base.listAssets({ deleted: true })).assets.some((item) => item.id === asset.id), true);
  await assert.rejects(s.base.resolveRenderTarget(live.token), (error) => error.status === 404);
  await assert.rejects(s.base.getAsset(asset.id), (error) => error.status === 404);

  await s.base.restoreAsset(asset.id, user);
  assert.equal((await s.base.loadRenderedHtml(asset.id)).html, html('Original'));
  await assert.rejects(s.base.resolveRenderTarget(revoked.token), (error) => error.status === 410);
  assert.equal((await s.base.resolveRenderTarget(live.token)).versionId, asset.currentVersionId);
});

it('derives a separate customer copy with a deterministic adaptation brief and old-name scan', async () => {
  const s = storage();
  const source = await s.base.createAsset({
    html: html('British Airways', '<p>British Airways welcomes frequent travellers.</p>'),
    filename: 'ba.html',
  }, user);
  await s.base.updateAsset(source.asset.id, { customer: 'British Airways' }, user);
  const derived = await s.studio.deriveAsset(source.asset.id, {
    versionId: source.asset.currentVersionId,
    customer: 'Emirates',
    audience: 'Loyalty executives',
    objective: 'Explore personalisation',
    brandNotes: 'Use approved sapphire palette',
  }, user);
  assert.equal(derived.asset.adaptationBrief.customer, 'Emirates');
  assert.equal(derived.asset.adaptationBrief.audience, 'Loyalty executives');
  assert.equal(derived.oldNameCheck.count, 3);
  assert.equal(derived.oldNameCheck.passed, false);
  assert.equal(derived.checklist.find((item) => item.label === 'Customer-specific copy reviewed').passed, false);
});

it('bases rebrand checklist results on the proposed HTML text', async () => {
  const s = storage();
  const source = await s.base.createAsset({
    html: html('British Airways', '<p>British Airways welcomes frequent travellers.</p>'),
    filename: 'ba.html',
  }, user);
  await s.base.updateAsset(source.asset.id, { customer: 'British Airways' }, user);
  const result = await s.studio.studioChat(source.asset.id, {
    message: 'Adapt the customer copy',
    intent: 'rebrand',
    adaptationBrief: {
      customer: 'Emirates', audience: 'Loyalty executives', objective: 'Explore personalisation',
      brandNotes: 'Emirates sapphire',
    },
  }, user, {
    callGemini: async () => JSON.stringify({
      reply: 'Updated the customer copy.',
      ops: [{ op: 'replaceText', find: 'British Airways', replace: 'Emirates sapphire', all: true }],
    }),
  });
  assert.ok(result.checklist.every((item) => item.passed), JSON.stringify(result.checklist));

  const unchanged = await s.studio.studioChat(source.asset.id, {
    message: 'Review the rebrand',
    intent: 'rebrand',
    conversationId: result.conversationId,
  }, user, { callGemini: async () => JSON.stringify({ reply: 'Looks ready.', ops: [] }) });
  assert.equal(unchanged.checklist[0].passed, false);
  assert.equal(unchanged.checklist[1].passed, false);
  assert.equal(unchanged.checklist[2].passed, false);
});

it('checks the original customer after deriving a target-customer copy', async () => {
  const s = storage();
  const source = await s.base.createAsset({
    html: html('British Airways', '<p>British Airways welcomes frequent travellers.</p>'),
    filename: 'ba.html',
  }, user);
  await s.base.updateAsset(source.asset.id, { customer: 'British Airways' }, user);
  const derived = await s.studio.deriveAsset(source.asset.id, { customer: 'Emirates' }, user);
  assert.equal(derived.asset.customer, 'Emirates');
  assert.equal(derived.asset.derivedFrom.customer, 'British Airways');
  const result = await s.studio.studioChat(derived.asset.id, {
    message: 'Adapt the welcome copy only', intent: 'rebrand', adaptationBrief: derived.asset.adaptationBrief,
  }, user, {
    callGemini: async () => JSON.stringify({
      reply: 'Updated welcome copy.',
      ops: [{ op: 'replaceText', find: 'British Airways welcomes frequent travellers.', replace: 'Emirates welcomes frequent travellers.', all: true }],
    }),
  });
  assert.equal(result.checklist[0].passed, true);
  assert.equal(result.checklist[1].passed, false);
  assert.match(result.checklist[1].detail, /British Airways.*remain/);
  assert.equal(result.checklist[2].passed, false);
  assert.match(result.checklist[2].detail, /Review required/);
});

it('requires review when source customer or searchable brand notes are absent', async () => {
  const s = storage();
  for (const brandNotes of ['', 'Use the brand tone']) {
    const checklist = s.studio.adaptationChecklist({
      html: html('Emirates'), sourceCustomer: '', adaptationBrief: { customer: 'Emirates', brandNotes },
    });
    assert.equal(checklist[1].passed, false);
    assert.match(checklist[1].detail, /Review required/);
    assert.equal(checklist[2].passed, false);
    assert.match(checklist[2].detail, /Review required/);
  }
  const heuristic = s.studio.adaptationChecklist({
    html: html('Emirates sapphire'), sourceCustomer: 'British Airways',
    adaptationBrief: { customer: 'Emirates', brandNotes: 'sapphire' },
  });
  assert.equal(heuristic[2].passed, true);
  assert.match(heuristic[2].label, /heuristic/);
  assert.match(heuristic[2].detail, /does not establish brand approval/);
  const source = await initial(s);
  await s.base.updateAsset(source.id, { customer: '' }, user);
  const derived = await s.studio.deriveAsset(source.id, { customer: 'Emirates' }, user);
  assert.equal(derived.oldNameCheck.passed, false);
  assert.equal(derived.checklist[1].passed, false);
});

it('lists, resumes and renames only the caller-owned Studio conversations', async () => {
  const s = storage();
  const asset = await initial(s);
  s.docs.set('demoStudioConversations/convOwn01', {
    assetId: asset.id, uid: user.uid, title: 'Journey review',
    messages: [{ role: 'user', text: 'Review the journey' }], updatedAt: 3,
  });
  s.docs.set('demoStudioConversations/convOther1', {
    assetId: asset.id, uid: 'another-user', title: 'Private notes', messages: [], updatedAt: 4,
  });
  const list = await s.studio.listConversations(asset.id, user);
  assert.deepEqual(list.map((conversation) => conversation.id), ['convOwn01']);
  assert.equal((await s.studio.getConversation(asset.id, 'convOwn01', user)).messages[0].text, 'Review the journey');
  await assert.rejects(
    s.studio.renameConversation(asset.id, 'convOther1', { title: 'Hijack' }, user),
    (error) => error.status === 403,
  );
  const renamed = await s.studio.renameConversation(asset.id, 'convOwn01', { title: 'Updated title' }, user);
  assert.equal(renamed.title, 'Updated title');
  assert.equal((await s.studio.listConversations(asset.id, user))[0].title, 'Updated title');
});
