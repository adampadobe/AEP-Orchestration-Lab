'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../pdfPersonalisationStore');

function repositoryDeps() {
  const records = new Map();
  const objects = new Map();
  return {
    records,
    objects,
    randomId: () => 'template-1',
    now: () => new Date('2026-08-06T12:00:00Z'),
    firestore: {
      collection() {
        return {
          doc(id) {
            return {
              async set(value) { records.set(id, structuredClone(value)); },
              async get() {
                const value = records.get(id);
                return { exists: !!value, data: () => structuredClone(value) };
              },
            };
          },
          where(field, _operator, expected) {
            return {
              async get() {
                return {
                  docs: Array.from(records.values())
                    .filter((value) => value[field] === expected)
                    .map((value) => ({ data: () => structuredClone(value) })),
                };
              },
            };
          },
        };
      },
    },
    bucket: {
      file(path) {
        return {
          async save(bytes) { objects.set(path, Buffer.from(bytes)); },
          async download() { return [Buffer.from(objects.get(path))]; },
        };
      },
    },
  };
}

test('stores and reloads a private HTML template with its default JSON', async () => {
  const deps = repositoryDeps();
  const saved = await store.saveTemplate({
    ownerUid: 'user-1',
    name: 'Riyadh Air boarding pass',
    sourceFileName: '../Riyadh Air\u0000 template.html',
    htmlTemplate: '<!doctype html><p>{{data.passenger.name}}</p>',
    defaultData: { passenger: { name: 'DARAKHSHAN KHAN' }, imageUrl: 'https://example.com/offer.png' },
  }, deps);

  assert.equal(saved.templateId, 'template-1');
  assert.equal(saved.sourceFileName, '..-Riyadh Air- template.html');
  assert.ok(saved.dataSize > 0);
  assert.equal(saved.dataHash.length, 64);

  const loaded = await store.getTemplate(saved.templateId, deps);
  assert.equal(loaded.htmlTemplate, '<!doctype html><p>{{data.passenger.name}}</p>');
  assert.deepEqual(loaded.defaultData, {
    passenger: { name: 'DARAKHSHAN KHAN' },
    imageUrl: 'https://example.com/offer.png',
  });

  const listed = await store.listTemplates('user-1', deps);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].templateId, 'template-1');
  assert.equal(listed[0].dataSize, saved.dataSize);
  assert.equal('defaultData' in listed[0], false);
  assert.equal('objectPath' in listed[0], false);
  assert.equal('ownerUid' in listed[0], false);
});

test('rejects a non-object default JSON payload before saving the repository record', async () => {
  await assert.rejects(
    store.saveTemplate({
      ownerUid: 'user-1',
      htmlTemplate: '<p>Ready</p>',
      defaultData: ['not', 'an', 'object'],
    }, repositoryDeps()),
    (error) => error && error.code === 'PDF_DATA_INVALID',
  );
});

test('filters private drafts and recent jobs to the MCP sandbox while retaining legacy records', async () => {
  const deps = repositoryDeps();
  deps.records.set('draft-apalmer', {
    templateId: 'draft-apalmer', ownerUid: 'user-1', sandbox: 'apalmer', status: 'active', updatedAt: '2026-08-06T13:00:00Z',
  });
  deps.records.set('draft-other', {
    templateId: 'draft-other', ownerUid: 'user-1', sandbox: 'other', status: 'active', updatedAt: '2026-08-06T14:00:00Z',
  });
  deps.records.set('draft-legacy', {
    templateId: 'draft-legacy', ownerUid: 'user-1', status: 'active', updatedAt: '2026-08-06T12:00:00Z',
  });
  const drafts = await store.listTemplates('user-1', deps, { sandbox: 'apalmer' });
  assert.deepEqual(drafts.map((item) => item.templateId), ['draft-apalmer', 'draft-legacy']);

  deps.records.clear();
  deps.records.set('job-apalmer', {
    jobId: 'job-apalmer', ownerUid: 'user-1', sandbox: 'apalmer', status: 'ready',
    createdAt: '2026-08-06T14:00:00Z', expiresAt: '2026-08-20T12:00:00Z',
  });
  deps.records.set('job-other', {
    jobId: 'job-other', ownerUid: 'user-1', sandbox: 'other', status: 'ready',
    createdAt: '2026-08-06T15:00:00Z', expiresAt: '2026-08-20T12:00:00Z',
  });
  deps.records.set('job-expired', {
    jobId: 'job-expired', ownerUid: 'user-1', sandbox: 'apalmer', status: 'ready',
    createdAt: '2026-07-01T12:00:00Z', expiresAt: '2026-08-01T12:00:00Z',
  });
  const jobs = await store.listReadyJobs('user-1', deps, { sandbox: 'apalmer', limit: 10 });
  assert.deepEqual(jobs.map((item) => item.jobId), ['job-apalmer']);
});
