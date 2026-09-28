const test = require('node:test');
const assert = require('node:assert/strict');

const spec = require('../eventPlaceContextFieldGroup');
const ensure = require('../../scripts/ensure-event-place-context-fieldgroup.cjs');

const EXPECTED_LEAVES = ['accuracyMeters', 'geohash', 'neighborhood', 'poiId', 'regionCode', 'source', 'storeId'];
const ENV_ID = 'https://ns.adobe.com/xdm/context/experienceevent-environment-details';
const EE_CLASS = 'https://ns.adobe.com/xdm/context/experienceevent';

test('event place-context spec declares the additive tenant leaves with XDM types and constraints', () => {
  assert.equal(spec.EVENT_PLACE_CONTEXT_FIELD_GROUP_TITLE, 'AEP Lab - Event Place Context v1');
  assert.equal(spec.ENVIRONMENT_DETAILS_FIELD_GROUP_ID, ENV_ID);
  assert.deepEqual(spec.EVENT_PLACE_CONTEXT_TARGET_SCHEMA_TITLES, ['AEP Lab - Event Generic - Schema', 'AEP Event Tool - Schema - v1']);
  const root = spec.EVENT_PLACE_CONTEXT_V1_PROPERTIES.eventPlaceContext;
  assert.equal(root.type, 'object');
  const props = root.properties;
  assert.deepEqual(Object.keys(props).sort(), EXPECTED_LEAVES);
  assert.equal(props.geohash.pattern, '^[0-9b-hjkmnp-z]{7}$');
  assert.equal(props.accuracyMeters.type, 'integer');
  assert.equal(props.accuracyMeters.minimum, 0);
  assert.equal(props.accuracyMeters.maximum, 100000);
  assert.equal(props.neighborhood.maxLength, 100);
  assert.equal(props.regionCode.pattern, '^[A-Z]{2}-[A-Z0-9]{1,3}$');
  assert.equal(props.storeId.maxLength, 64);
  assert.equal(props.poiId.maxLength, 64);
  assert.deepEqual(props.source.enum, ['ui-sample', 'event-tool', 'mcp-seed', 'store-poi', 'device-gps', 'edge-ip', 'import']);
  assert.deepEqual(Object.keys(props.source['meta:enum']), props.source.enum);
  for (const leaf of EXPECTED_LEAVES) {
    assert.ok(props[leaf].title, `${leaf} has a title`);
    assert.ok(props[leaf].description, `${leaf} has a description`);
  }
  // Coordinates, city and country live on the standard placeContext.geo path, not in the tenant supplement.
  for (const dup of ['latitude', 'longitude', 'city', 'countryCode']) assert.equal(props[dup], undefined);
  assert.deepEqual(spec.EVENT_PLACE_CONTEXT_LEAF_PATHS, EXPECTED_LEAVES.map((l) => `eventPlaceContext.${l}`));
});

test('event place-context create body extends the ExperienceEvent class under the tenant namespace', () => {
  const body = spec.buildEventPlaceContextFieldGroupCreateBody('demoemea');
  assert.equal(body.title, 'AEP Lab - Event Place Context v1');
  assert.deepEqual(body['meta:intendedToExtend'], [EE_CLASS]);
  assert.deepEqual(body.allOf, [{ $ref: '#/definitions/customFields', type: 'object', 'meta:xdmType': 'object' }]);
  assert.deepEqual(Object.keys(body.definitions.customFields.properties), ['_demoemea']);
  assert.equal(
    body.definitions.customFields.properties._demoemea.properties.eventPlaceContext,
    spec.EVENT_PLACE_CONTEXT_V1_PROPERTIES.eventPlaceContext
  );
});

/* -------------------- governed ensure script (mocked registry) -------------------- */

const SR = 'https://platform.adobe.io/data/foundation/schemaregistry';
const FG_ID = 'https://ns.adobe.com/demoemea/mixins/evplace1';
const FG_ALT = '_demoemea.mixins.evplace1';
const UNION_ALT = '_xdm.context.experienceevent__union';
const SCHEMAS = {
  'AEP Lab - Event Generic - Schema': { $id: 'https://ns.adobe.com/demoemea/schemas/gen', alt: '_demoemea.schemas.gen', version: '1.3' },
  'AEP Event Tool - Schema - v1': { $id: 'https://ns.adobe.com/demoemea/schemas/tool', alt: '_demoemea.schemas.tool', version: '1.15' },
};

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, statusText: String(status), text: async () => JSON.stringify(body) };
}

function makeRegistry({ fgExists = false, attached = {}, envAttached = {}, unionHasPath = false, resolvedHasPlaceContext = {}, missingSchema = null } = {}) {
  const state = { fgExists, attached: { ...attached }, envAttached: { ...envAttached }, versions: {}, fgListed: fgExists };
  for (const [t, s] of Object.entries(SCHEMAS)) state.versions[t] = s.version;
  const calls = [];
  const byAlt = Object.fromEntries(Object.entries(SCHEMAS).map(([t, s]) => [s.alt, t]));
  const fgRow = () => ({ title: spec.EVENT_PLACE_CONTEXT_FIELD_GROUP_TITLE, $id: FG_ID, 'meta:altId': FG_ALT, version: '1.0' });
  const leafProps = () => spec.EVENT_PLACE_CONTEXT_V1_PROPERTIES.eventPlaceContext.properties;

  async function fetchImpl(url, init = {}) {
    const method = init.method || 'GET';
    calls.push({ method, url, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    if (method === 'GET' && url === `${SR}/stats`) return jsonResponse(200, { tenantId: 'demoemea' });
    if (method === 'GET' && url.startsWith(`${SR}/tenant/schemas?`)) {
      const title = decodeURIComponent(url.split('property=')[1].split('&')[0]).replace('title==', '');
      const s = SCHEMAS[title];
      if (!s || title === missingSchema) return jsonResponse(200, { results: [] });
      return jsonResponse(200, { results: [{ title, $id: s.$id, 'meta:altId': s.alt, version: state.versions[title] }] });
    }
    const alt = Object.keys(byAlt).find((a) => url === `${SR}/tenant/schemas/${encodeURIComponent(a)}`);
    if (method === 'GET' && alt) {
      const title = byAlt[alt];
      const refs = [EE_CLASS, 'https://ns.adobe.com/demoemea/mixins/identity'];
      if (state.envAttached[title]) refs.push(ENV_ID);
      if (state.attached[title]) refs.push(FG_ID);
      if (/xed-full/.test(init.headers.Accept)) {
        const props = { _id: { type: 'string' }, _demoemea: { type: 'object', properties: { identification: { type: 'object' } } } };
        if (state.envAttached[title] || resolvedHasPlaceContext[title]) {
          props.placeContext = { properties: { geo: { properties: { _schema: { properties: { latitude: {}, longitude: {} } }, city: {}, countryCode: {} } } } };
        }
        if (state.attached[title]) props._demoemea.properties.eventPlaceContext = { type: 'object', properties: leafProps() };
        return jsonResponse(200, { $id: SCHEMAS[title].$id, version: state.versions[title], properties: props });
      }
      return jsonResponse(200, { $id: SCHEMAS[title].$id, 'meta:altId': alt, version: state.versions[title], 'meta:extends': refs, allOf: refs.map(($ref) => ({ $ref })) });
    }
    if (method === 'GET' && url.startsWith(`${SR}/tenant/fieldgroups?`)) return jsonResponse(200, { results: state.fgListed ? [fgRow()] : [] });
    if (method === 'GET' && url === `${SR}/tenant/fieldgroups/${encodeURIComponent(FG_ALT)}`) {
      return jsonResponse(200, { ...fgRow(), definitions: { customFields: { properties: { _demoemea: { properties: { eventPlaceContext: { properties: leafProps() } } } } } } });
    }
    if (method === 'GET' && url === `${SR}/tenant/schemas/${encodeURIComponent(UNION_ALT)}`) {
      const tenant = { identification: {} };
      if (unionHasPath || Object.values(state.attached).some(Boolean)) tenant.eventPlaceContext = {};
      return jsonResponse(200, { properties: { _demoemea: { properties: tenant } } });
    }
    if (method === 'POST' && url === `${SR}/tenant/fieldgroups`) {
      state.fgExists = true;
      state.fgListed = true;
      return jsonResponse(201, fgRow());
    }
    const patchAlt = Object.keys(byAlt).find((a) => url === `${SR}/tenant/schemas/${encodeURIComponent(a)}`);
    if (method === 'PATCH' && patchAlt) {
      const title = byAlt[patchAlt];
      const values = JSON.parse(init.body).map((op) => (typeof op.value === 'string' ? op.value : op.value.$ref));
      if (values.includes(ENV_ID)) state.envAttached[title] = true;
      if (values.includes(FG_ID)) state.attached[title] = true;
      const [maj, min] = state.versions[title].split('.').map(Number);
      state.versions[title] = `${maj}.${min + 1}`;
      return jsonResponse(200, { version: state.versions[title] });
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

const ops = (id) => [
  { op: 'add', path: '/meta:extends/-', value: id },
  { op: 'add', path: '/allOf/-', value: { $ref: id } },
];

test('parseArgs requires --sandbox and rejects unknown args', () => {
  assert.throws(() => ensure.parseArgs([]), /--sandbox/);
  assert.throws(() => ensure.parseArgs(['--sandbox', 'apalmer', '--force']), /Unknown argument/);
  assert.deepEqual(ensure.parseArgs(['--sandbox=apalmer', '--apply', '--create-only']), { sandbox: 'apalmer', apply: true, createOnly: true });
});

test('event ensure dry-run plans the FG create and both schema attaches with zero writes', async () => {
  const registry = makeRegistry();
  const result = await ensure.runEnsure(baseArgs(registry));
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.action, 'create-and-attach');
  assert.deepEqual(result.planned.createFieldGroup.body, spec.buildEventPlaceContextFieldGroupCreateBody('demoemea'));
  assert.deepEqual(
    result.planned.patchSchemas.map((p) => [p.title, p.ifMatch, p.operations]),
    [
      ['AEP Lab - Event Generic - Schema', '1.3', [...ops(ENV_ID), ...ops('<created field group $id>')]],
      ['AEP Event Tool - Schema - v1', '1.15', [...ops(ENV_ID), ...ops('<created field group $id>')]],
    ]
  );
  assert.equal(registry.calls.filter((c) => c.method !== 'GET').length, 0);
  for (const c of registry.calls) assert.equal(c.headers['x-sandbox-name'], 'apalmer');
});

test('event ensure create-only POSTs the FG and never PATCHes a schema', async () => {
  const registry = makeRegistry();
  const result = await ensure.runEnsure(baseArgs(registry, { apply: true, createOnly: true }));
  assert.equal(result.action, 'create-only');
  assert.equal(result.created.$id, FG_ID);
  assert.deepEqual(registry.calls.filter((c) => c.method !== 'GET').map((c) => c.method), ['POST']);
  assert.match(result.note, /NOT attached/);
  assert.match(result.note, new RegExp(encodeURIComponent(FG_ALT).replace(/[.]/g, '\\.')));
});

test('event ensure apply attaches Environment Details + FG to both schemas with If-Match and verifies', async () => {
  const registry = makeRegistry({ fgExists: true });
  const result = await ensure.runEnsure(baseArgs(registry, { apply: true }));
  assert.equal(result.action, 'attach');
  const patches = registry.calls.filter((c) => c.method === 'PATCH');
  assert.equal(patches.length, 2);
  assert.deepEqual(patches[0].body, [...ops(ENV_ID), ...ops(FG_ID)]);
  assert.equal(patches[0].headers['If-Match'], '1.3');
  assert.equal(patches[1].headers['If-Match'], '1.15');
  assert.deepEqual(
    result.verified.map((v) => [v.title, v.schemaVersion, v.hasGeoLatLon, v.leaves]),
    [
      ['AEP Lab - Event Generic - Schema', '1.4', true, EXPECTED_LEAVES],
      ['AEP Event Tool - Schema - v1', '1.16', true, EXPECTED_LEAVES],
    ]
  );
  assert.equal(result.unionVerified, true);
});

test('event ensure only adds the refs a schema is missing and is a no-op when fully attached', async () => {
  const partial = makeRegistry({ fgExists: true, envAttached: { 'AEP Lab - Event Generic - Schema': true } });
  const r1 = await ensure.runEnsure(baseArgs(partial));
  assert.deepEqual(r1.planned.patchSchemas[0].operations, ops(FG_ID));
  assert.deepEqual(r1.planned.patchSchemas[1].operations, [...ops(ENV_ID), ...ops(FG_ID)]);

  const done = makeRegistry({
    fgExists: true,
    attached: { 'AEP Lab - Event Generic - Schema': true, 'AEP Event Tool - Schema - v1': true },
    envAttached: { 'AEP Lab - Event Generic - Schema': true, 'AEP Event Tool - Schema - v1': true },
  });
  const r2 = await ensure.runEnsure(baseArgs(done, { apply: true }));
  assert.equal(r2.action, 'none');
  assert.equal(done.calls.filter((c) => c.method !== 'GET').length, 0);
});

test('event ensure refuses when a schema already resolves placeContext without Environment Details', async () => {
  const registry = makeRegistry({ resolvedHasPlaceContext: { 'AEP Event Tool - Schema - v1': true } });
  await assert.rejects(ensure.runEnsure(baseArgs(registry)), /already resolves placeContext/);
});

test('event ensure refuses when the ExperienceEvent union defines eventPlaceContext but nothing is attached', async () => {
  const registry = makeRegistry({ unionHasPath: true });
  await assert.rejects(ensure.runEnsure(baseArgs(registry)), /union already defines _demoemea\.eventPlaceContext/);
});

test('event ensure refuses when a target schema is missing', async () => {
  const registry = makeRegistry({ missingSchema: 'AEP Event Tool - Schema - v1' });
  await assert.rejects(ensure.runEnsure(baseArgs(registry)), /exactly one schema titled "AEP Event Tool - Schema - v1"/);
});
