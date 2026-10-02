'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createFakeFirestore } = require('./fakeFirestore.cjs');
const {
  PLACE_COLLECTION,
  SIGNAL_COLLECTION,
  PLACE_TTL_DAYS,
  SIGNAL_TTL_DAYS,
  createGeoAudienceMirror,
  hashIdentity,
  interestKeysFromGeneratorBody,
  isGeoMirrorEnabled,
  normalizeInterestKey,
  interestKeyVariants,
} = require('../geoAudienceMirror');

const NOW = Date.parse('2026-09-27T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const PLACE = {
  latitude: 24.690812,
  longitude: 46.685347,
  accuracyMeters: 40,
  neighborhood: 'Olaya',
  city: 'Riyadh',
  regionCode: 'SA-01',
  countryCode: 'SA',
  lastSeenAt: '2026-09-27T10:00:00Z',
  source: 'mcp-seed',
  geohash: 'th3jxzz',
};

function mirror(overrides = {}) {
  const fake = createFakeFirestore();
  const service = createGeoAudienceMirror({ getDb: () => fake.db, now: () => NOW, env: {}, ...overrides });
  return { fake, service };
}

function sha(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

test('identity hashes are sandbox-scoped sha256 of the lowercased email', () => {
  assert.equal(hashIdentity('apalmer', 'Adamp.AdobeDemo+1@Gmail.com'), sha('apalmer|adamp.adobedemo+1@gmail.com'));
  assert.notEqual(hashIdentity('apalmer', 'a@b.co'), hashIdentity('kirkham', 'a@b.co'));
  assert.equal(hashIdentity('apalmer', '  '), '');
});

test('interest keys normalize case, hyphens and whitespace so "Camping-Gear" matches "camping gear"', () => {
  assert.equal(normalizeInterestKey('  Camping-Gear '), 'camping gear');
  assert.equal(normalizeInterestKey('camping__gear'), 'camping gear');
  assert.equal(normalizeInterestKey('Tents  &  Shelters'), 'tents & shelters');
  assert.equal(normalizeInterestKey(''), '');
  assert.equal(normalizeInterestKey(null), '');
});

test('generator bodies yield deduplicated interest keys from any public industry slice', () => {
  assert.deepEqual(
    interestKeysFromGeneratorBody({
      public: { retail: { productName: 'Camping Gear', productCategory: 'camping-gear', sku: 'X1' } },
    }),
    ['camping gear'],
  );
  assert.deepEqual(
    interestKeysFromGeneratorBody({ public: { retail: { productName: 'Trail Tent', productCategory: 'Camping Gear' } } }),
    ['trail tent', 'camping gear'],
  );
  assert.deepEqual(interestKeysFromGeneratorBody({}), []);
  assert.deepEqual(interestKeysFromGeneratorBody({ public: 'nope' }), []);
});

test('the kill switch defaults on and rejects ambiguous values explicitly', () => {
  assert.equal(isGeoMirrorEnabled({}), true);
  assert.equal(isGeoMirrorEnabled({ GEO_MIRROR_ENABLED: 'false' }), false);
  assert.equal(isGeoMirrorEnabled({ GEO_MIRROR_ENABLED: 'TRUE' }), true);
  assert.throws(() => isGeoMirrorEnabled({ GEO_MIRROR_ENABLED: 'maybe' }), /GEO_MIRROR_ENABLED/);
});

test('recordProfilePlace writes a hashed, PII-free place doc with a 30-day expiry', async () => {
  const { fake, service } = mirror();
  const result = await service.recordProfilePlace({
    sandbox: 'apalmer',
    email: 'Adamp.AdobeDemo+50@gmail.com',
    ecid: '62722406001178632594092146103219305888',
    place: PLACE,
  });
  const identityHash = sha('apalmer|adamp.adobedemo+50@gmail.com');
  assert.deepEqual(result, {
    written: true,
    collection: PLACE_COLLECTION,
    docId: `apalmer__${identityHash}`,
  });
  const entry = fake.store.get(`${PLACE_COLLECTION}/apalmer__${identityHash}`);
  assert.ok(entry, 'place doc written');
  const doc = entry.data;
  assert.deepEqual(Object.keys(doc).sort(), [
    'city', 'countryCode', 'ecidHash', 'expireAt', 'geohash7', 'identityHash', 'lastSeenAt',
    'lat', 'lon', 'neighborhood', 'sandbox', 'source', 'updatedAt',
  ]);
  assert.equal(doc.sandbox, 'apalmer');
  assert.equal(doc.identityHash, identityHash);
  assert.equal(doc.ecidHash, sha('apalmer|62722406001178632594092146103219305888'));
  assert.equal(doc.lat, 24.69081);
  assert.equal(doc.lon, 46.68535);
  assert.equal(doc.geohash7, 'th3jxzz');
  assert.equal(doc.city, 'Riyadh');
  assert.equal(doc.neighborhood, 'Olaya');
  assert.equal(doc.countryCode, 'SA');
  assert.equal(doc.source, 'mcp-seed');
  assert.equal(doc.lastSeenAt.toISOString(), '2026-09-27T10:00:00.000Z');
  assert.equal(doc.updatedAt.getTime(), NOW);
  assert.equal(doc.expireAt.getTime(), NOW + PLACE_TTL_DAYS * DAY_MS);
  const serialized = JSON.stringify(doc);
  assert.doesNotMatch(serialized, /adobedemo|@gmail|62722406001178632594092146103219305888/);
});

test('recordProfilePlace skips explicitly when there is nothing to mirror', async () => {
  const { fake, service } = mirror();
  assert.deepEqual(
    await service.recordProfilePlace({ sandbox: 'apalmer', email: 'a@b.co', place: undefined }),
    { written: false, reason: 'no_place' },
  );
  assert.deepEqual(
    await service.recordProfilePlace({ sandbox: 'apalmer', email: 'a@b.co', place: { city: 'Riyadh' } }),
    { written: false, reason: 'incomplete_place' },
  );
  assert.deepEqual(
    await service.recordProfilePlace({ sandbox: 'apalmer', email: '', place: PLACE }),
    { written: false, reason: 'no_email' },
  );
  assert.deepEqual(
    await service.recordProfilePlace({ sandbox: '', email: 'a@b.co', place: PLACE }),
    { written: false, reason: 'no_sandbox' },
  );
  assert.equal(fake.calls.sets, 0);
});

test('the kill switch disables every write without touching Firestore', async () => {
  let dbCalls = 0;
  const service = createGeoAudienceMirror({
    getDb: () => { dbCalls += 1; throw new Error('must not open Firestore'); },
    now: () => NOW,
    env: { GEO_MIRROR_ENABLED: 'false' },
  });
  assert.deepEqual(
    await service.recordProfilePlace({ sandbox: 'apalmer', email: 'a@b.co', place: PLACE }),
    { written: false, reason: 'disabled' },
  );
  assert.deepEqual(
    await service.recordInterestSignal({
      sandbox: 'apalmer', email: 'a@b.co', eventType: 'commerce.productViews', interests: ['camping gear'],
    }),
    { written: false, reason: 'disabled' },
  );
  assert.equal(dbCalls, 0);
});

test('Firestore failures are surfaced as written:false with the error, never thrown or hidden', async () => {
  const service = createGeoAudienceMirror({
    getDb: () => ({ collection: () => ({ doc: () => ({ set: async () => { throw new Error('PERMISSION_DENIED'); } }) }) }),
    now: () => NOW,
    env: {},
  });
  const result = await service.recordProfilePlace({ sandbox: 'apalmer', email: 'a@b.co', place: PLACE });
  assert.deepEqual(result, { written: false, error: 'PERMISSION_DENIED' });
});

test('recordInterestSignal writes a hashed product-view signal with a 7-day expiry', async () => {
  const { fake, service } = mirror();
  const result = await service.recordInterestSignal({
    sandbox: 'apalmer',
    email: 'Buyer@Example.com',
    ecid: '62722406001178632594092146103219305888',
    eventType: 'commerce.productViews',
    interests: ['Camping Gear', 'camping-gear'],
    timestamp: '2026-09-27T11:00:00.000Z',
  });
  assert.equal(result.written, true);
  assert.equal(result.collection, SIGNAL_COLLECTION);
  const [entry] = [...fake.store.values()];
  assert.deepEqual(entry.data.interestKeys, ['camping gear']);
  assert.equal(entry.data.sandbox, 'apalmer');
  assert.equal(entry.data.identityHash, sha('apalmer|buyer@example.com'));
  assert.equal(entry.data.ecidHash, sha('apalmer|62722406001178632594092146103219305888'));
  assert.equal(entry.data.eventType, 'commerce.productViews');
  assert.equal(entry.data.ts.toISOString(), '2026-09-27T11:00:00.000Z');
  assert.equal(entry.data.expireAt.getTime(), NOW + SIGNAL_TTL_DAYS * DAY_MS);
  assert.doesNotMatch(JSON.stringify(entry.data), /buyer@example\.com|62722406001178632594092146103219305888/i);
});

test('recordInterestSignal clamps future or invalid timestamps to now', async () => {
  const { fake, service } = mirror();
  await service.recordInterestSignal({
    sandbox: 'apalmer', email: 'a@b.co', eventType: 'commerce.productViews', interests: ['tents'],
    timestamp: '2027-01-01T00:00:00Z',
  });
  await service.recordInterestSignal({
    sandbox: 'apalmer', email: 'a@b.co', eventType: 'commerce.productViews', interests: ['tents'],
    timestamp: 'not-a-date',
  });
  for (const entry of fake.store.values()) assert.equal(entry.data.ts.getTime(), NOW);
});

test('recordInterestSignal only mirrors product views that carry an interest and an identity', async () => {
  const { fake, service } = mirror();
  assert.deepEqual(
    await service.recordInterestSignal({ sandbox: 'apalmer', email: 'a@b.co', eventType: 'commerce.order', interests: ['tents'] }),
    { written: false, reason: 'event_type_not_mirrored' },
  );
  assert.deepEqual(
    await service.recordInterestSignal({ sandbox: 'apalmer', email: 'a@b.co', eventType: 'commerce.productViews', interests: [] }),
    { written: false, reason: 'no_interest' },
  );
  assert.deepEqual(
    await service.recordInterestSignal({ sandbox: 'apalmer', eventType: 'commerce.productViews', interests: ['tents'] }),
    { written: false, reason: 'no_identity' },
  );
  assert.equal(fake.calls.adds, 0);
});

test('listInterestIdentityHashes queries by sandbox, exact interest key and window, reading only hashes', async () => {
  const { fake, service } = mirror();
  const add = (email, interests, timestamp, sandbox = 'apalmer') => service.recordInterestSignal({
    sandbox, email, eventType: 'commerce.productViews', interests, timestamp,
  });
  await add('a@x.co', ['Camping Gear'], '2026-09-27T11:00:00Z');
  await add('a@x.co', ['camping gear'], '2026-09-27T11:30:00Z');
  await add('b@x.co', ['camping gear'], '2026-09-27T10:00:00Z');
  await add('c@x.co', ['camping gear'], '2026-09-25T10:00:00Z');
  await add('d@x.co', ['surf boards'], '2026-09-27T11:00:00Z');
  await add('e@x.co', ['camping gear'], '2026-09-27T11:00:00Z', 'kirkham');
  await service.recordInterestSignal({
    sandbox: 'apalmer', ecid: '62722406001178632594092146103219305888', eventType: 'commerce.productViews',
    interests: ['camping gear'], timestamp: '2026-09-27T11:00:00Z',
  });

  const result = await service.listInterestIdentityHashes({
    sandbox: 'apalmer', interest: 'Camping-Gear', startMs: NOW - DAY_MS, endMs: NOW, maxSignals: 100,
  });
  assert.deepEqual([...result.identityHashes].sort(), [
    hashIdentity('apalmer', 'a@x.co'), hashIdentity('apalmer', 'b@x.co'),
  ].sort());
  assert.equal(result.signals, 4);
  assert.equal(result.ecidOnlySignals, 1);
  const q = fake.calls.queries.at(-1);
  assert.equal(q.collection, SIGNAL_COLLECTION);
  assert.deepEqual(q.selected, ['identityHash']);
  assert.equal(q.limit, 101);
  assert.deepEqual(q.filters.map(({ field, op }) => `${field} ${op}`), [
    'sandbox ==', 'interestKeys array-contains-any', 'ts >=', 'ts <=',
  ]);
});

test('interest key variants cover the singular and plural forms of the last word', () => {
  assert.deepEqual(interestKeyVariants('umbrella'), ['umbrella', 'umbrellas']);
  assert.deepEqual(interestKeyVariants('umbrellas'), ['umbrellas', 'umbrella']);
  assert.deepEqual(interestKeyVariants('running shoe'), ['running shoe', 'running shoes']);
  assert.deepEqual(interestKeyVariants('rain jackets'), ['rain jackets', 'rain jacket']);
  assert.deepEqual(interestKeyVariants('battery'), ['battery', 'batteries']);
  assert.deepEqual(interestKeyVariants('batteries'), ['batteries', 'battery', 'batterie']);
  assert.deepEqual(interestKeyVariants('watch'), ['watch', 'watches']);
  assert.deepEqual(interestKeyVariants('watches'), ['watches', 'watch', 'watche']);
  assert.deepEqual(interestKeyVariants('glass'), ['glass', 'glasses']);
  assert.deepEqual(interestKeyVariants('camping gear'), ['camping gear', 'camping gears']);
  assert.deepEqual(interestKeyVariants('Camping-Gear'), ['camping gear', 'camping gears']);
  assert.deepEqual(interestKeyVariants(''), []);
});

test('interestKeyVariants maps everyday retail wording onto the catalog category', () => {
  const cases = {
    perfume: 'fragrances',
    Perfumes: 'fragrances',
    cologne: 'fragrances',
    oud: 'fragrances',
    trainers: 'running shoes',
    sneaker: 'running shoes',
    'sun cream': 'sunscreen',
    sunblock: 'sunscreen',
    SPF: 'sunscreen',
    AC: 'air conditioners',
    'air con': 'air conditioners',
    'air conditioning': 'air conditioners',
    earbuds: 'headphones',
    earphone: 'headphones',
    raincoat: 'rain jackets',
    'rain coats': 'rain jackets',
    'waterproof jacket': 'rain jackets',
    brolly: 'umbrellas',
    tent: 'camping gear',
    tents: 'camping gear',
    'camping equipment': 'camping gear',
    swimsuit: 'swimwear',
    'bathing suits': 'swimwear',
    shades: 'sunglasses',
    'coffee maker': 'coffee machines',
    'espresso machines': 'coffee machines',
    puffer: 'winter jackets',
    'winter coat': 'winter jackets',
    parkas: 'winter jackets',
  };
  for (const [query, category] of Object.entries(cases)) {
    assert.ok(interestKeyVariants(query).includes(category), `${query} -> ${category}`);
    assert.ok(interestKeyVariants(query).length <= 30, query);
  }
  assert.deepEqual(interestKeyVariants('umbrellas'), ['umbrellas', 'umbrella']);
  assert.ok(!interestKeyVariants('coffee table').includes('coffee machines'));
});

test('a synonym query finds profiles recorded under the catalog category', async () => {
  const { service } = mirror();
  await service.recordInterestSignal({
    sandbox: 'apalmer', email: 'a@x.co', eventType: 'commerce.productViews', interests: ['Oud Eau de Parfum', 'fragrances'], timestamp: '2026-09-27T11:00:00Z',
  });
  await service.recordInterestSignal({
    sandbox: 'apalmer', email: 'b@x.co', eventType: 'commerce.productViews', interests: ['running shoes'], timestamp: '2026-09-27T11:00:00Z',
  });
  const result = await service.listInterestIdentityHashes({ sandbox: 'apalmer', interest: 'perfume', startMs: NOW - DAY_MS, endMs: NOW, maxSignals: 100 });
  assert.deepEqual([...result.identityHashes], [hashIdentity('apalmer', 'a@x.co')]);
});

test('a singular interest finds signals recorded under the plural category, and vice versa', async () => {
  const { service } = mirror();
  const add = (email, interests) => service.recordInterestSignal({
    sandbox: 'apalmer', email, eventType: 'commerce.productViews', interests, timestamp: '2026-09-27T11:00:00Z',
  });
  await add('a@x.co', ['Compact Folding Umbrella', 'umbrellas']);
  await add('b@x.co', ['umbrellas']);
  await add('c@x.co', ['umbrella']);
  await add('d@x.co', ['umbrella stands']);
  const window = { sandbox: 'apalmer', startMs: NOW - DAY_MS, endMs: NOW, maxSignals: 100 };
  const expected = ['a@x.co', 'b@x.co', 'c@x.co'].map((e) => hashIdentity('apalmer', e)).sort();
  for (const interest of ['umbrella', 'Umbrellas']) {
    const result = await service.listInterestIdentityHashes({ ...window, interest });
    assert.deepEqual([...result.identityHashes].sort(), expected, interest);
    assert.equal(result.signals, 3, interest);
  }
});

test('listInterestIdentityHashes refuses to silently truncate past the signal cap', async () => {
  const { service } = mirror();
  for (const email of ['a@x.co', 'b@x.co', 'c@x.co']) {
    await service.recordInterestSignal({
      sandbox: 'apalmer', email, eventType: 'commerce.productViews', interests: ['tents'], timestamp: '2026-09-27T11:00:00Z',
    });
  }
  await assert.rejects(
    service.listInterestIdentityHashes({ sandbox: 'apalmer', interest: 'tents', startMs: NOW - DAY_MS, endMs: NOW, maxSignals: 2 }),
    /more than 2 matching signals/i,
  );
});

test('getProfilePlaces batch-reads place docs for the given hashes and skips unknown identities', async () => {
  const { fake, service } = mirror();
  await service.recordProfilePlace({ sandbox: 'apalmer', email: 'a@x.co', place: PLACE });
  await service.recordProfilePlace({ sandbox: 'apalmer', email: 'b@x.co', place: { ...PLACE, latitude: 24.7, longitude: 46.7 } });
  const places = await service.getProfilePlaces({
    sandbox: 'apalmer',
    identityHashes: [hashIdentity('apalmer', 'a@x.co'), hashIdentity('apalmer', 'b@x.co'), hashIdentity('apalmer', 'zzz@x.co')],
  });
  assert.equal(places.length, 2);
  assert.deepEqual(places.map((p) => [p.lat, p.lon]).sort(), [[24.69081, 46.68535], [24.7, 46.7]]);
  assert.deepEqual(places.map((p) => p.neighborhood), ['Olaya', 'Olaya']);
  assert.equal(fake.calls.getAll, 1);
});

test('recordProfilePlace stores a missing neighborhood as null and caps long names', async () => {
  const { fake, service } = mirror();
  const noName = { ...PLACE };
  delete noName.neighborhood;
  await service.recordProfilePlace({ sandbox: 'apalmer', email: 'a@x.co', place: noName });
  await service.recordProfilePlace({ sandbox: 'apalmer', email: 'b@x.co', place: { ...PLACE, neighborhood: `  ${'K'.repeat(200)}  ` } });
  const docA = fake.store.get(`${PLACE_COLLECTION}/apalmer__${hashIdentity('apalmer', 'a@x.co')}`).data;
  const docB = fake.store.get(`${PLACE_COLLECTION}/apalmer__${hashIdentity('apalmer', 'b@x.co')}`).data;
  assert.equal(docA.neighborhood, null);
  assert.equal(docB.neighborhood, 'K'.repeat(80));
});

test('generatorSignalFromBody maps an Event Generator request to a mirror signal input', () => {
  const { generatorSignalFromBody } = require('../geoAudienceMirror');
  assert.deepEqual(
    generatorSignalFromBody('apalmer', {
      email: ' Shopper@Example.com ',
      ecid: '12345678901234567890',
      eventType: ' commerce.productViews ',
      timestamp: '2026-09-27T10:00:00.000Z',
      public: { retail: { productName: 'Trail Tent', productCategory: 'Camping-Gear' } },
    }),
    {
      sandbox: 'apalmer',
      email: 'Shopper@Example.com',
      ecid: '12345678901234567890',
      eventType: 'commerce.productViews',
      interests: ['trail tent', 'camping gear'],
      timestamp: '2026-09-27T10:00:00.000Z',
    },
  );
  const bare = generatorSignalFromBody('apalmer', { ecid: 'not-an-ecid' });
  assert.equal(bare.email, '');
  assert.equal(bare.ecid, '');
  assert.equal(bare.eventType, '');
  assert.deepEqual(bare.interests, []);
  assert.equal(bare.timestamp, undefined);
});
