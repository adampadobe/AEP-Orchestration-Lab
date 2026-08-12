const test = require('node:test');
const assert = require('node:assert/strict');

const service = require('../labDemoConfigService');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function makeDatabase(initialRoot) {
  const state = clone(initialRoot);
  function parts(path) {
    return String(path || '').split('/').filter(Boolean);
  }
  function read(path) {
    return parts(path).reduce((value, key) => value && value[key], state);
  }
  function write(path, value) {
    const keys = parts(path);
    const leaf = keys.pop();
    let target = state;
    for (const key of keys) {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {};
      target = target[key];
    }
    if (value === null) delete target[leaf];
    else target[leaf] = clone(value);
  }
  return {
    state,
    ref(path) {
      return {
        once: async () => {
          const value = clone(read(path));
          return { val: () => value, exists: () => value !== null && value !== undefined };
        },
        update: async (patch) => {
          for (const [relative, value] of Object.entries(patch || {})) {
            write(`${path}/${relative}`, value);
          }
        },
      };
    },
  };
}

function makeFirestore() {
  const collections = new Map();
  let counter = 0;
  function mapFor(name) {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name);
  }
  return {
    collections,
    collection(name) {
      const map = mapFor(name);
      return {
        doc(id) {
          const docId = id || `auto-${++counter}`;
          return {
            id: docId,
            async get() {
              const value = map.get(docId);
              return { exists: value !== undefined, data: () => clone(value) };
            },
            async set(value, options) {
              const next = options && options.merge
                ? { ...(map.get(docId) || {}), ...clone(value) }
                : clone(value);
              map.set(docId, next);
            },
          };
        },
      };
    },
  };
}

function fixture() {
  const database = makeDatabase({
    ajoLookups: {
      apalmer: {
        CoreDemoData: {
          name: 'Jet2',
          shortName: 'Jet2',
          slogan: 'Friendly low fares',
          url: 'https://www.jet2.com',
          customerLogo: 'https://example.test/jet2.svg',
        },
        StaffPortal: { Colour: '#1473e6', AgentName: 'Adam' },
        AgenticLayer: { agentUrls: { brand: 'https://agent.example.test' } },
        CustomLegacy: { value: 'visible' },
        meta: { adobeEmail: 'apalmer@adobe.com', version: 1 },
      },
    },
  });
  const firestore = makeFirestore();
  let ids = 0;
  const deps = {
    database,
    firestore,
    now: () => new Date('2026-08-04T10:00:00.000Z'),
    randomId: () => `preview-${++ids}`,
  };
  return { database, firestore, deps };
}

test('inspection shows discovered structure but redacts owner email and protects uncatalogued fields', () => {
  const root = {
    CoreDemoData: { name: 'Jet2' },
    CustomLegacy: { value: 'visible' },
    meta: { adobeEmail: 'apalmer@adobe.com' },
  };
  const result = service.buildInspection(root, 'apalmer', 'apalmer');
  const core = result.sections.find((section) => section.name === 'CoreDemoData');
  const legacy = result.sections.find((section) => section.name === 'CustomLegacy');
  const meta = result.sections.find((section) => section.name === 'meta');
  assert.equal(core.fields.find((field) => field.path === 'CoreDemoData.name').editable, true);
  assert.equal(legacy.fields[0].editable, false);
  assert.equal(meta.fields.find((field) => field.field === 'adobeEmail').value, '[REDACTED]');
});

test('validation rejects protected paths, malformed URLs and malformed colours', () => {
  assert.throws(
    () => service.normalizeChanges([{ path: 'meta.adobeEmail', value: 'other@adobe.com' }]),
    /not MCP-editable/,
  );
  assert.throws(
    () => service.normalizeChanges([{ path: 'CoreDemoData.url', value: 'javascript:alert(1)' }]),
    /http\(s\) URL/,
  );
  assert.throws(
    () => service.normalizeChanges([{ path: 'StaffPortal.Colour', value: '#fff' }]),
    /six-digit hex colour/,
  );
});

test('preview and apply update only requested fields, verify readback and support idempotent replay', async () => {
  const { database, deps } = fixture();
  const preview = await service.createPreview({
    uid: 'uid-apalmer',
    workspaceSlug: 'apalmer',
    sandbox: 'apalmer',
    changes: [{ path: 'CoreDemoData.name', value: 'Qatar Investment Authority' }],
  }, deps);
  assert.equal(preview.diff.length, 1);
  assert.equal(preview.diff[0].before, 'Jet2');

  const applied = await service.applyPreview({
    uid: 'uid-apalmer',
    workspaceSlug: 'apalmer',
    sandbox: 'apalmer',
    preflightId: preview.preflightId,
    confirmed: true,
    idempotencyKey: 'demo-qia-20260804',
  }, deps);
  assert.equal(applied.verified, true);
  assert.ok(applied.revisionId);
  const core = database.state.ajoLookups.apalmer.CoreDemoData;
  assert.equal(core.name, 'Qatar Investment Authority');
  assert.equal(core.shortName, 'Jet2');
  assert.equal(core.slogan, 'Friendly low fares');
  assert.equal(core.url, 'https://www.jet2.com');
  assert.equal(core.customerLogo, 'https://example.test/jet2.svg');

  const replay = await service.applyPreview({
    uid: 'uid-apalmer',
    workspaceSlug: 'apalmer',
    sandbox: 'apalmer',
    preflightId: preview.preflightId,
    confirmed: true,
    idempotencyKey: 'demo-qia-20260804',
  }, deps);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.revisionId, applied.revisionId);
});

test('apply rejects a stale preview instead of overwriting a newer value', async () => {
  const { database, deps } = fixture();
  const preview = await service.createPreview({
    uid: 'uid-apalmer',
    workspaceSlug: 'apalmer',
    sandbox: 'apalmer',
    changes: [{ path: 'CoreDemoData.name', value: 'Customer A' }],
  }, deps);
  database.state.ajoLookups.apalmer.CoreDemoData.name = 'Customer B';
  await assert.rejects(
    service.applyPreview({
      uid: 'uid-apalmer',
      workspaceSlug: 'apalmer',
      sandbox: 'apalmer',
      preflightId: preview.preflightId,
      confirmed: true,
      idempotencyKey: 'conflict-20260804',
    }, deps),
    (error) => error.code === 'DEMO_CONFIG_PREVIEW_CONFLICT' && error.status === 409,
  );
});

test('a revision can be previewed and applied to restore the prior values', async () => {
  const { database, deps } = fixture();
  const preview = await service.createPreview({
    uid: 'uid-apalmer',
    workspaceSlug: 'apalmer',
    sandbox: 'apalmer',
    changes: [{ path: 'CoreDemoData.name', value: 'Customer A' }],
  }, deps);
  const applied = await service.applyPreview({
    uid: 'uid-apalmer',
    workspaceSlug: 'apalmer',
    sandbox: 'apalmer',
    preflightId: preview.preflightId,
    confirmed: true,
    idempotencyKey: 'apply-customer-a',
  }, deps);

  const restorePreview = await service.createRestorePreview({
    uid: 'uid-apalmer',
    workspaceSlug: 'apalmer',
    sandbox: 'apalmer',
    revisionId: applied.revisionId,
  }, deps);
  assert.equal(restorePreview.diff[0].after, 'Jet2');
  await service.applyPreview({
    uid: 'uid-apalmer',
    workspaceSlug: 'apalmer',
    sandbox: 'apalmer',
    preflightId: restorePreview.preflightId,
    confirmed: true,
    idempotencyKey: 'restore-jet2-20260804',
  }, deps);
  assert.equal(database.state.ajoLookups.apalmer.CoreDemoData.name, 'Jet2');
});
