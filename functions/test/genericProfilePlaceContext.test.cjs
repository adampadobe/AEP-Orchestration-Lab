const test = require('node:test');
const assert = require('node:assert/strict');

const generic = require('../genericProfileInfraService');
const { buildTenantFieldGroupCreateBody, resolveIndustryFgEntry } = require('../profileInfraFactory');
const manifest = require('../profileCoreV2Manifest');
const ensure = require('../../scripts/ensure-generic-place-context-fieldgroup.cjs');

const EXPECTED_LEAVES = [
  'accuracyMeters',
  'city',
  'countryCode',
  'geohash',
  'lastSeenAt',
  'latitude',
  'longitude',
  'neighborhood',
  'regionCode',
  'source',
];

test('place-context field group spec declares the ten additive leaves with XDM types and constraints', () => {
  assert.equal(generic.PROFILE_PLACE_CONTEXT_FIELD_GROUP_TITLE, 'AEP Lab - Profile Place Context v1');
  const root = generic.PROFILE_PLACE_CONTEXT_V1_PROPERTIES.profilePlaceContext;
  assert.equal(root.type, 'object');
  const props = root.properties;
  assert.deepEqual(Object.keys(props).sort(), EXPECTED_LEAVES);

  assert.deepEqual(props.latitude, { type: 'number', title: 'Latitude', description: props.latitude.description, minimum: -90, maximum: 90 });
  assert.deepEqual(props.longitude, { type: 'number', title: 'Longitude', description: props.longitude.description, minimum: -180, maximum: 180 });
  assert.equal(props.geohash.type, 'string');
  assert.equal(props.geohash.pattern, '^[0-9b-hjkmnp-z]{7}$');
  assert.equal(props.accuracyMeters.type, 'integer');
  assert.equal(props.accuracyMeters.minimum, 0);
  assert.equal(props.accuracyMeters.maximum, 100000);
  assert.equal(props.neighborhood.maxLength, 100);
  assert.equal(props.city.maxLength, 100);
  assert.equal(props.regionCode.pattern, '^[A-Z]{2}-[A-Z0-9]{1,3}$');
  assert.equal(props.countryCode.pattern, '^[A-Z]{2}$');
  assert.deepEqual(props.lastSeenAt, { type: 'string', format: 'date-time', title: 'Last seen at', description: props.lastSeenAt.description });
  assert.deepEqual(props.source.enum, ['ui-sample', 'ui-manual', 'profile-update', 'mcp-persona', 'mcp-seed', 'import']);
  assert.deepEqual(Object.keys(props.source['meta:enum']), props.source.enum);

  for (const leaf of EXPECTED_LEAVES) {
    assert.ok(props[leaf].title, `${leaf} has a title`);
    assert.ok(props[leaf].description, `${leaf} has a description`);
  }
  assert.deepEqual(generic.PROFILE_PLACE_CONTEXT_LEAF_PATHS, EXPECTED_LEAVES.map((leaf) => `profilePlaceContext.${leaf}`).sort());
});

test('place-context create body wraps the subtree under the tenant namespace on the Profile class', () => {
  const body = buildTenantFieldGroupCreateBody('demoemea', generic.PROFILE_PLACE_CONTEXT_FIELD_GROUP_SPEC);
  assert.equal(body.title, 'AEP Lab - Profile Place Context v1');
  assert.deepEqual(body['meta:intendedToExtend'], ['https://ns.adobe.com/xdm/context/profile']);
  assert.deepEqual(body.allOf, [{ $ref: '#/definitions/customFields', type: 'object', 'meta:xdmType': 'object' }]);
  assert.equal(
    body.definitions.customFields.properties._demoemea.properties.profilePlaceContext,
    generic.PROFILE_PLACE_CONTEXT_V1_PROPERTIES.profilePlaceContext
  );
  assert.deepEqual(Object.keys(body.definitions.customFields.properties._demoemea.properties), ['profilePlaceContext']);
});

test('generic wizard auto-creates the optional place-context field group in other sandboxes', () => {
  const entries = generic.GENERIC_PROFILE_INDUSTRY_FIELD_GROUPS;
  assert.equal(entries.length, 1);
  const [entry] = entries;
  assert.equal(entry.source, 'tenantTitlePattern');
  assert.equal(entry.optional, true);
  assert.equal(entry.createIfMissing, generic.PROFILE_PLACE_CONTEXT_FIELD_GROUP_SPEC);
  assert.ok(entry.match.test('AEP Lab - Profile Place Context v1'));
  assert.ok(entry.match.test('AEP Lab - Profile Place Context v2'));
  assert.ok(!entry.match.test('AEP Lab - Customer Analytics'));

  const missing = resolveIndustryFgEntry(entry, [{ title: 'AEP Lab - Customer Analytics', $id: 'x' }], []);
  assert.equal(missing.resolved, false);
  assert.equal(missing.needsCreate.spec, generic.PROFILE_PLACE_CONTEXT_FIELD_GROUP_SPEC);

  const present = resolveIndustryFgEntry(entry, [{ title: 'AEP Lab - Profile Place Context v1', $id: 'https://ns.adobe.com/demoemea/mixins/abc' }], []);
  assert.equal(present.resolved, true);
  assert.equal(present.ref, 'https://ns.adobe.com/demoemea/mixins/abc');
});

test('Profile Core v2 manifest never carries place-context leaves (dedicated field group owns them)', () => {
  for (const industry of manifest.KNOWN_INDUSTRIES) {
    const leaves = Object.keys(manifest.getManifestForIndustry(industry));
    const offenders = leaves.filter((p) => p === 'profilePlaceContext' || p.startsWith('profilePlaceContext.'));
    assert.deepEqual(offenders, [], `${industry} manifest must not include profilePlaceContext`);
  }
});

/* ------------------------ ensure script (mocked registry) ------------------------ */

const SR = 'https://platform.adobe.io/data/foundation/schemaregistry';
const SCHEMA_ID = 'https://ns.adobe.com/demoemea/schemas/c34132f5';
const SCHEMA_ALT = '_demoemea.schemas.c34132f5';
const FG_ID = 'https://ns.adobe.com/demoemea/mixins/place1';
const FG_ALT = '_demoemea.mixins.place1';

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: (k) => headers[String(k).toLowerCase()] || null },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

function makeRegistry({ fgExists = false, attached = false, unionHasPath = false, schemaCount = 1, staleResolvedReads = 0 } = {}) {
  const state = { fgExists, attached, version: '1.3', fgVisibleAfter: 1, staleResolvedReads };
  const calls = [];
  const schemaRow = { title: generic.GENERIC_PROFILE_SCHEMA_TITLE, $id: SCHEMA_ID, 'meta:altId': SCHEMA_ALT, version: state.version };
  const baseRefs = ['https://ns.adobe.com/xdm/context/profile', 'https://ns.adobe.com/demoemea/mixins/core'];
  const leafProps = () =>
    Object.fromEntries(EXPECTED_LEAVES.map((leaf) => [leaf, generic.PROFILE_PLACE_CONTEXT_V1_PROPERTIES.profilePlaceContext.properties[leaf]]));
  const fgRow = () => ({ title: generic.PROFILE_PLACE_CONTEXT_FIELD_GROUP_TITLE, $id: FG_ID, 'meta:altId': FG_ALT, version: '1.0' });
  let fgListCalls = 0;

  async function fetchImpl(url, init = {}) {
    const method = init.method || 'GET';
    calls.push({ method, url, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    if (method === 'GET' && url === `${SR}/stats`) return jsonResponse(200, { tenantId: 'demoemea' });
    if (method === 'GET' && url.startsWith(`${SR}/tenant/schemas?`)) {
      return jsonResponse(200, { results: Array.from({ length: schemaCount }, () => schemaRow) });
    }
    if (method === 'GET' && url === `${SR}/tenant/schemas/${encodeURIComponent(SCHEMA_ALT)}`) {
      const accept = init.headers.Accept;
      const refs = state.attached ? [...baseRefs, FG_ID] : baseRefs;
      if (/xed-full/.test(accept)) {
        const tenantProps = { identification: { type: 'object' } };
        // Schema Registry serves a cached resolved view for a while after PATCH.
        const stale = state.attached && state.staleResolvedReads > 0;
        if (stale) state.staleResolvedReads -= 1;
        if (state.attached && !stale) tenantProps.profilePlaceContext = { type: 'object', properties: leafProps() };
        return jsonResponse(200, { $id: SCHEMA_ID, version: state.version, properties: { _demoemea: { type: 'object', properties: tenantProps } } });
      }
      return jsonResponse(200, {
        $id: SCHEMA_ID,
        'meta:altId': SCHEMA_ALT,
        version: state.version,
        'meta:extends': refs,
        allOf: refs.map(($ref) => ({ $ref })),
        'meta:immutableTags': ['union'],
      });
    }
    if (method === 'GET' && url.startsWith(`${SR}/tenant/fieldgroups?`)) {
      fgListCalls += 1;
      const visible = state.fgExists && (state.fgCreatedAtCall == null || fgListCalls > state.fgCreatedAtCall + state.fgVisibleAfter);
      return jsonResponse(200, { results: visible ? [fgRow()] : [] });
    }
    if (method === 'GET' && url === `${SR}/tenant/fieldgroups/${encodeURIComponent(FG_ALT)}`) {
      return jsonResponse(200, {
        ...fgRow(),
        definitions: { customFields: { properties: { _demoemea: { properties: { profilePlaceContext: { type: 'object', properties: leafProps() } } } } } },
      });
    }
    if (method === 'GET' && url === `${SR}/tenant/schemas/${encodeURIComponent('_xdm.context.profile__union')}`) {
      const tenantProps = { identification: { type: 'object' } };
      if (unionHasPath || state.attached) tenantProps.profilePlaceContext = { type: 'object' };
      return jsonResponse(200, { properties: { _demoemea: { type: 'object', properties: tenantProps } } });
    }
    if (method === 'POST' && url === `${SR}/tenant/fieldgroups`) {
      state.fgExists = true;
      state.fgCreatedAtCall = fgListCalls;
      return jsonResponse(201, fgRow());
    }
    if (method === 'PATCH' && url === `${SR}/tenant/schemas/${encodeURIComponent(SCHEMA_ALT)}`) {
      state.attached = true;
      state.version = '1.4';
      return jsonResponse(200, { $id: SCHEMA_ID, version: state.version });
    }
    throw new Error(`unexpected ${method} ${url}`);
  }
  return { fetchImpl, calls, state };
}

const baseArgs = (registry, extra = {}) => ({
  fetchImpl: registry.fetchImpl,
  token: 'test-token',
  clientId: 'client',
  orgId: 'org@AdobeOrg',
  sandbox: 'apalmer',
  sleep: async () => {},
  ...extra,
});

test('ensure script dry-run plans create + attach and performs zero writes', async () => {
  const registry = makeRegistry();
  const result = await ensure.runEnsure(baseArgs(registry));
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.action, 'create-and-attach');
  assert.equal(result.schema.metaAltId, SCHEMA_ALT);
  assert.deepEqual(result.planned.createFieldGroup.body, buildTenantFieldGroupCreateBody('demoemea', generic.PROFILE_PLACE_CONTEXT_FIELD_GROUP_SPEC));
  assert.deepEqual(result.planned.patchSchema.operations, [
    { op: 'add', path: '/meta:extends/-', value: '<created field group $id>' },
    { op: 'add', path: '/allOf/-', value: { $ref: '<created field group $id>' } },
  ]);
  assert.equal(registry.calls.filter((c) => c.method !== 'GET').length, 0);
  for (const call of registry.calls) assert.equal(call.headers['x-sandbox-name'], 'apalmer');
});

test('ensure script apply creates, waits for listing, attaches with If-Match and verifies all leaves', async () => {
  const registry = makeRegistry();
  const result = await ensure.runEnsure(baseArgs(registry, { apply: true }));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.mode, 'apply');
  assert.equal(result.created.$id, FG_ID);
  const writes = registry.calls.filter((c) => c.method !== 'GET');
  assert.deepEqual(writes.map((c) => c.method), ['POST', 'PATCH']);
  assert.deepEqual(writes[1].body, [
    { op: 'add', path: '/meta:extends/-', value: FG_ID },
    { op: 'add', path: '/allOf/-', value: { $ref: FG_ID } },
  ]);
  assert.equal(writes[1].headers['If-Match'], '1.3');
  assert.deepEqual(result.verified.leaves, EXPECTED_LEAVES);
  assert.equal(result.verified.schemaVersion, '1.4');
  assert.equal(result.verified.unionHasPath, true);
});

test('ensure script verify retries a stale resolved schema view with the notext Accept', async () => {
  const registry = makeRegistry({ staleResolvedReads: 2 });
  const sleeps = [];
  const result = await ensure.runEnsure(baseArgs(registry, { apply: true, sleep: async (ms) => sleeps.push(ms) }));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.verified.leaves, EXPECTED_LEAVES);
  const resolvedReads = registry.calls.filter(
    (c) => c.method === 'GET' && c.url.endsWith(encodeURIComponent(SCHEMA_ALT)) && /xed-full/.test(c.headers.Accept)
  );
  assert.equal(resolvedReads.length, 3);
  for (const c of resolvedReads) assert.equal(c.headers.Accept, 'application/vnd.adobe.xed-full-notext+json; version=1');
  assert.equal(sleeps.length >= 2, true);
});

test('ensure script verify fails with a cache hint when the resolved view never refreshes', async () => {
  const registry = makeRegistry({ staleResolvedReads: 1000 });
  await assert.rejects(
    ensure.runEnsure(baseArgs(registry, { apply: true })),
    /missing profilePlaceContext leaves.*PATCH succeeded/s
  );
  assert.deepEqual(registry.calls.filter((c) => c.method !== 'GET').map((c) => c.method), ['POST', 'PATCH']);
});

test('ensure script create-only creates and waits for listing but never PATCHes the schema', async () => {
  const registry = makeRegistry();
  const result = await ensure.runEnsure(baseArgs(registry, { apply: true, createOnly: true }));
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.mode, 'apply');
  assert.equal(result.action, 'create-only');
  assert.equal(result.created.$id, FG_ID);
  assert.equal(result.created.metaAltId, FG_ALT);
  assert.deepEqual(registry.calls.filter((c) => c.method !== 'GET').map((c) => c.method), ['POST']);
  assert.equal(registry.state.attached, false);
  assert.match(result.note, /NOT attached/);
});

test('ensure script create-only is a no-op when the field group already exists', async () => {
  const registry = makeRegistry({ fgExists: true });
  const result = await ensure.runEnsure(baseArgs(registry, { apply: true, createOnly: true }));
  assert.equal(result.action, 'none');
  assert.equal(result.fieldGroup.$id, FG_ID);
  assert.equal(registry.calls.filter((c) => c.method !== 'GET').length, 0);
});

test('ensure script create-only dry-run plans only the POST', async () => {
  const registry = makeRegistry();
  const result = await ensure.runEnsure(baseArgs(registry, { createOnly: true }));
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.action, 'create-only');
  assert.ok(result.planned.createFieldGroup);
  assert.equal(result.planned.patchSchema, null);
  assert.equal(registry.calls.filter((c) => c.method !== 'GET').length, 0);
});

test('ensure script is a no-op when the field group is already attached', async () => {
  const registry = makeRegistry({ fgExists: true, attached: true });
  const result = await ensure.runEnsure(baseArgs(registry, { apply: true }));
  assert.equal(result.ok, true);
  assert.equal(result.action, 'none');
  assert.equal(registry.calls.filter((c) => c.method !== 'GET').length, 0);
});

test('ensure script attaches an existing unattached field group without re-creating it', async () => {
  const registry = makeRegistry({ fgExists: true });
  const result = await ensure.runEnsure(baseArgs(registry, { apply: true }));
  assert.equal(result.ok, true);
  assert.equal(result.action, 'attach');
  assert.deepEqual(registry.calls.filter((c) => c.method !== 'GET').map((c) => c.method), ['PATCH']);
});

test('ensure script refuses when the union already defines profilePlaceContext from another source', async () => {
  const registry = makeRegistry({ unionHasPath: true });
  await assert.rejects(ensure.runEnsure(baseArgs(registry, { apply: true })), /union already defines _demoemea\.profilePlaceContext/);
  assert.equal(registry.calls.filter((c) => c.method !== 'GET').length, 0);
});

test('ensure script refuses an ambiguous schema title match', async () => {
  const registry = makeRegistry({ schemaCount: 2 });
  await assert.rejects(ensure.runEnsure(baseArgs(registry)), /expected exactly one schema titled/);
});

test('ensure script CLI requires an explicit sandbox', () => {
  assert.throws(() => ensure.parseArgs([]), /--sandbox <name> is required/);
  assert.deepEqual(ensure.parseArgs(['--sandbox', 'apalmer']), { sandbox: 'apalmer', apply: false, createOnly: false });
  assert.deepEqual(ensure.parseArgs(['--sandbox=apalmer', '--apply']), { sandbox: 'apalmer', apply: true, createOnly: false });
  assert.deepEqual(ensure.parseArgs(['--sandbox', 'apalmer', '--apply', '--create-only']), { sandbox: 'apalmer', apply: true, createOnly: true });
  assert.throws(() => ensure.parseArgs(['--sandbox', 'apalmer', '--force']), /Unknown argument: --force/);
});
