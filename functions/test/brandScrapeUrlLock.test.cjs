'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const STORE_PATH = require.resolve('../brandScrapeStore');
const ADMIN_PATH = require.resolve('firebase-admin');

function createClaimHarness({ lockExists = false, existingActive = false, forceNew = false } = {}) {
  const txOps = [];
  const docs = new Map();

  function docRef(id) {
    return {
      id,
      path: id,
    };
  }

  const lockRef = docRef('lock-doc');
  const scrapeRef = docRef('scrape-doc');
  const existingRef = docRef('existing-scrape-doc');

  if (lockExists) {
    docs.set('lock-doc', { scrapeId: 'existing-run', createdAt: { _type: 'ts' } });
  }
  if (existingActive) {
    docs.set('existing-scrape-doc', { scrapeStatus: 'running', scrapeId: 'existing-run' });
  }

  function makeSnap(ref) {
    const data = docs.get(ref.id);
    return {
      exists: !!data,
      data: () => (data ? { ...data } : undefined),
    };
  }

  const tx = {
    get: async (ref) => {
      txOps.push({ op: 'get', id: ref.id });
      return makeSnap(ref);
    },
    set: (ref, patch) => {
      txOps.push({ op: 'set', id: ref.id });
      const prev = docs.get(ref.id) || {};
      docs.set(ref.id, { ...prev, ...patch });
    },
    delete: (ref) => {
      txOps.push({ op: 'delete', id: ref.id });
      docs.delete(ref.id);
    },
  };

  const adminMock = {
    apps: [{ name: 'test' }],
    initializeApp: () => {},
    firestore: Object.assign(
      () => ({
        collection: (name) => ({
          doc: (id) => {
            if (name === 'brandScrapeUrlLocks') return lockRef;
            if (id.includes('existing-run')) return existingRef;
            return scrapeRef;
          },
        }),
        runTransaction: async (fn) => fn(tx),
      }),
      {
        FieldValue: {
          serverTimestamp: () => ({ _type: 'serverTimestamp' }),
          delete: () => ({ _type: 'delete' }),
        },
        Timestamp: {
          fromMillis: (ms) => ({ _type: 'timestamp', ms }),
        },
      },
    ),
    storage: () => ({
      bucket: () => ({
        file: () => ({
          save: async () => {},
          setMetadata: async () => {},
        }),
      }),
    }),
  };

  return {
    adminMock,
    txOps,
    forceNew,
    scrapeRef,
    lockRef,
  };
}

function loadStoreWithMock(adminMock) {
  const originals = {
    admin: require.cache[ADMIN_PATH],
    store: require.cache[STORE_PATH],
  };

  require.cache[ADMIN_PATH] = {
    id: ADMIN_PATH,
    filename: ADMIN_PATH,
    loaded: true,
    exports: adminMock,
  };
  delete require.cache[STORE_PATH];
  const store = require('../brandScrapeStore');

  return {
    store,
    restore: () => {
      if (originals.admin) require.cache[ADMIN_PATH] = originals.admin;
      else delete require.cache[ADMIN_PATH];
      if (originals.store) require.cache[STORE_PATH] = originals.store;
      else delete require.cache[STORE_PATH];
    },
  };
}

function assertReadsBeforeWrites(txOps) {
  let sawWrite = false;
  for (const step of txOps) {
    if (step.op === 'get') {
      assert.equal(sawWrite, false, `read after write at ${JSON.stringify(step)}`);
    } else {
      sawWrite = true;
    }
  }
}

describe('claimUrlScrapeSlot transaction', () => {
  /** @type {(() => void) | null} */
  let restore = null;

  afterEach(() => {
    if (restore) {
      restore();
      restore = null;
    }
  });

  it('executes all reads before writes when claiming a new slot', async () => {
    const harness = createClaimHarness();
    const loaded = loadStoreWithMock(harness.adminMock);
    restore = loaded.restore;

    const result = await loaded.store.claimUrlScrapeSlot(
      'apalmer',
      'nike.com/',
      'new-run',
      { url: 'https://nike.com', baseUrl: 'https://nike.com', brandName: 'Nike' },
    );

    assert.equal(result.claimed, true);
    assert.equal(result.scrapeId, 'new-run');
    assertReadsBeforeWrites(harness.txOps);
    assert.deepEqual(
      harness.txOps.map((o) => o.op),
      ['get', 'get', 'set', 'set'],
    );
  });

  it('executes all reads before writes when reusing an in-flight scrape', async () => {
    const harness = createClaimHarness({ lockExists: true, existingActive: true });
    const loaded = loadStoreWithMock(harness.adminMock);
    restore = loaded.restore;

    const result = await loaded.store.claimUrlScrapeSlot(
      'apalmer',
      'nike.com/',
      'new-run',
      { url: 'https://nike.com', baseUrl: 'https://nike.com', brandName: 'Nike' },
    );

    assert.equal(result.claimed, false);
    assert.equal(result.scrapeId, 'existing-run');
    assert.equal(result.reused, true);
    assertReadsBeforeWrites(harness.txOps);
    assert.deepEqual(
      harness.txOps.map((o) => o.op),
      ['get', 'get'],
    );
  });

  it('executes all reads before writes with forceNew', async () => {
    const harness = createClaimHarness({ lockExists: true, existingActive: true });
    const loaded = loadStoreWithMock(harness.adminMock);
    restore = loaded.restore;

    const result = await loaded.store.claimUrlScrapeSlot(
      'apalmer',
      'nike.com/',
      'forced-run',
      { url: 'https://nike.com', baseUrl: 'https://nike.com', brandName: 'Nike' },
      { forceNew: true },
    );

    assert.equal(result.claimed, true);
    assert.equal(result.scrapeId, 'forced-run');
    assertReadsBeforeWrites(harness.txOps);
    assert.deepEqual(
      harness.txOps.map((o) => o.op),
      ['get', 'get', 'set', 'set'],
    );
  });
});
