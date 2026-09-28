'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const eventPlace = require('../eventPlaceContext');
const fieldGroup = require('../eventPlaceContextFieldGroup');
const { encodeGeohash } = require('../profilePlaceContext');
const { buildGeneratorEdgeInteractXdm } = require('../eventEdgeService');
const webEventPlace = require(path.resolve(__dirname, '../../web/profile-viewer/event-place-context.js'));

const EMAIL = 'demo+place@adobetest.com';
const RIYADH = {
  latitude: 24.6958,
  longitude: 46.685,
  accuracyMeters: 120,
  neighborhood: 'Al Olaya',
  city: 'Riyadh',
  regionCode: 'SA-01',
  countryCode: 'SA',
};

function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('normalizeEventPlace', () => {
  it('derives the precision-7 geohash and defaults source to event-tool', () => {
    const r = eventPlace.normalizeEventPlace({ ...RIYADH });
    assert.equal(r.ok, true);
    assert.equal(r.value.geohash, encodeGeohash(RIYADH.latitude, RIYADH.longitude, 7));
    assert.equal(r.value.source, 'event-tool');
    assert.equal(r.value.city, 'Riyadh');
  });

  it('keeps an explicit allowed source and a matching geohash', () => {
    const gh = encodeGeohash(RIYADH.latitude, RIYADH.longitude, 7);
    const r = eventPlace.normalizeEventPlace({ ...RIYADH, geohash: gh, source: 'ui-sample', storeId: 'RUH-001', poiId: 'poi-olaya' });
    assert.equal(r.ok, true);
    assert.equal(r.value.source, 'ui-sample');
    assert.equal(r.value.storeId, 'RUH-001');
    assert.equal(r.value.poiId, 'poi-olaya');
  });

  it('requires latitude and longitude', () => {
    const r = eventPlace.normalizeEventPlace({ city: 'Riyadh' });
    assert.equal(r.ok, false);
    assert.equal(r.leaf, 'latitude');
  });

  const bad = [
    [{ latitude: 91, longitude: 46 }, 'latitude'],
    [{ latitude: '24.7', longitude: 46 }, 'latitude'],
    [{ latitude: 24.7, longitude: -181 }, 'longitude'],
    [{ ...RIYADH, accuracyMeters: 12.5 }, 'accuracyMeters'],
    [{ ...RIYADH, accuracyMeters: 100001 }, 'accuracyMeters'],
    [{ ...RIYADH, regionCode: 'sa-01' }, 'regionCode'],
    [{ ...RIYADH, countryCode: 'SAU' }, 'countryCode'],
    [{ ...RIYADH, countryCode: 'AE' }, 'regionCode'],
    [{ ...RIYADH, neighborhood: 'x'.repeat(101) }, 'neighborhood'],
    [{ ...RIYADH, storeId: 'x'.repeat(65) }, 'storeId'],
    [{ ...RIYADH, source: 'profile-update' }, 'source'],
    [{ ...RIYADH, geohash: 'th3aaaa' }, 'geohash'],
    [{ ...RIYADH, city: '' }, 'city'],
    [{ ...RIYADH, lastSeenAt: '2026-01-01T00:00:00Z' }, 'lastSeenAt'],
  ];
  for (const [input, leaf] of bad) {
    it(`rejects invalid ${leaf} (${JSON.stringify(input[leaf] ?? input).slice(0, 40)})`, () => {
      const r = eventPlace.normalizeEventPlace(input);
      assert.equal(r.ok, false);
      assert.equal(r.leaf, leaf);
      assert.match(r.error, new RegExp(`eventPlace\\.${leaf}`));
    });
  }

  it('rejects non-object input', () => {
    for (const v of [null, 'Riyadh', [RIYADH], 42]) {
      assert.equal(eventPlace.normalizeEventPlace(v).ok, false);
    }
  });
});

describe('applyEventPlaceToXdm', () => {
  it('writes standard placeContext.geo plus the tenant supplement', () => {
    const { value } = eventPlace.normalizeEventPlace({ ...RIYADH, poiId: 'poi-olaya' });
    const xdm = { eventType: 'web.webpagedetails.pageViews', _demoemea: { identification: { core: { email: EMAIL } } } };
    eventPlace.applyEventPlaceToXdm(xdm, value, '_demoemea');
    assert.deepEqual(xdm.placeContext.geo, {
      _schema: { latitude: RIYADH.latitude, longitude: RIYADH.longitude },
      city: 'Riyadh',
      countryCode: 'SA',
      stateProvince: 'SA-01',
    });
    assert.deepEqual(xdm.placeContext.POIinteraction, { poiDetail: { poiID: 'poi-olaya' } });
    assert.deepEqual(xdm._demoemea.eventPlaceContext, {
      geohash: value.geohash,
      accuracyMeters: 120,
      neighborhood: 'Al Olaya',
      regionCode: 'SA-01',
      poiId: 'poi-olaya',
      source: 'event-tool',
    });
    assert.deepEqual(xdm._demoemea.identification.core.email, EMAIL);
  });

  it('only writes leaves that exist in the field group or Environment Details', () => {
    const { value } = eventPlace.normalizeEventPlace({ ...RIYADH, storeId: 'RUH-001' });
    const xdm = {};
    eventPlace.applyEventPlaceToXdm(xdm, value, '_demoemea');
    const allowed = Object.keys(fieldGroup.EVENT_PLACE_CONTEXT_V1_PROPERTIES.eventPlaceContext.properties);
    for (const k of Object.keys(xdm._demoemea.eventPlaceContext)) assert.ok(allowed.includes(k), k);
    assert.deepEqual(Object.keys(xdm).sort(), ['_demoemea', 'placeContext']);
  });

  it('mirrors into an existing lowercase tenant alias', () => {
    const { value } = eventPlace.normalizeEventPlace({ ...RIYADH });
    const xdm = { _demoemea: {}, demoemea: {} };
    eventPlace.applyEventPlaceToXdm(xdm, value, '_demoemea');
    assert.deepEqual(xdm.demoemea.eventPlaceContext, xdm._demoemea.eventPlaceContext);
  });

  it('source enum matches the field group spec', () => {
    assert.deepEqual(eventPlace.EVENT_PLACE_SOURCES, fieldGroup.EVENT_PLACE_CONTEXT_SOURCES);
  });
});

describe('buildGeneratorEdgeInteractXdm with eventPlace', () => {
  it('minimal style adds place context and keeps the minimal shape otherwise', () => {
    const xdm = buildGeneratorEdgeInteractXdm(
      { email: EMAIL, eventType: 'transaction', _id: '1', timestamp: '2026-07-20T10:00:00Z', eventPlace: { ...RIYADH } },
      { xdmStyle: 'minimal' },
    );
    assert.deepEqual(Object.keys(xdm).sort(), ['_demoemea', '_id', 'eventType', 'identityMap', 'placeContext', 'timestamp']);
    assert.equal(xdm.placeContext.geo._schema.latitude, RIYADH.latitude);
    assert.deepEqual(Object.keys(xdm._demoemea), ['eventPlaceContext']);
    assert.equal(xdm._demoemea.eventPlaceContext.geohash, encodeGeohash(RIYADH.latitude, RIYADH.longitude, 7));
  });

  it('full style merges place context into the tenant node and its alias', () => {
    const xdm = buildGeneratorEdgeInteractXdm(
      {
        email: EMAIL,
        eventType: 'commerce.productViews',
        xdmStyle: 'full',
        public: { retail: { productName: 'Tent', productCategory: 'camping-gear' } },
        eventPlace: { ...RIYADH, source: 'ui-sample' },
      },
      { xdmStyle: 'minimal' },
    );
    assert.equal(xdm._demoemea.public.retail.productCategory, 'camping-gear');
    assert.equal(xdm._demoemea.eventPlaceContext.source, 'ui-sample');
    assert.equal(xdm.placeContext.geo.city, 'Riyadh');
    assert.deepEqual(xdm.demoemea.eventPlaceContext, xdm._demoemea.eventPlaceContext);
  });

  it('omitting eventPlace leaves the payload unchanged', () => {
    const xdm = buildGeneratorEdgeInteractXdm({ email: EMAIL, eventType: 'transaction' }, { xdmStyle: 'minimal' });
    assert.equal(xdm.placeContext, undefined);
    assert.equal(xdm._demoemea, undefined);
  });

  it('invalid eventPlace throws a 400-tagged error', () => {
    assert.throws(
      () => buildGeneratorEdgeInteractXdm({ email: EMAIL, eventPlace: { latitude: 200, longitude: 1 } }, { xdmStyle: 'minimal' }),
      (e) => e.statusCode === 400 && /eventPlace\.latitude/.test(e.message),
    );
  });
});

describe('web event-place-context helper', () => {
  const NOW = new Date('2026-07-20T10:00:00Z');

  it('sample places validate on the server with source ui-sample', () => {
    for (const key of Object.keys(webEventPlace.PRESETS)) {
      for (let seed = 1; seed <= 20; seed++) {
        const s = webEventPlace.generateSample(key, { rng: seededRng(seed), now: NOW });
        const r = eventPlace.normalizeEventPlace(s);
        assert.equal(r.ok, true, `${key}/${seed}: ${r.error}`);
        assert.equal(r.value.source, 'ui-sample');
        assert.equal(s.lastSeenAt, undefined);
      }
    }
    assert.equal(webEventPlace.generateSample('none'), null);
    assert.throws(() => webEventPlace.generateSample('atlantis'), /Unknown place preset/);
  });

  it('client preview XDM is identical to the server builder output', () => {
    const inputs = [{ ...RIYADH }, { ...RIYADH, source: 'ui-sample', storeId: 'RUH-001', poiId: 'poi-olaya' },
      { latitude: 51.5265, longitude: -0.0786 }];
    for (const input of inputs) {
      const server = {};
      eventPlace.applyEventPlaceToXdm(server, eventPlace.normalizeEventPlace(input).value, '_demoemea');
      const client = {};
      webEventPlace.applyToXdm(client, input, '_demoemea');
      assert.deepEqual(client, server);
    }
  });

  it('readForm drops empty inputs and parses numbers', () => {
    const place = webEventPlace.fromFormValues({
      latitude: '24.6958', longitude: '46.685', accuracyMeters: '120', neighborhood: ' Al Olaya ', city: '',
      regionCode: 'SA-01', countryCode: 'SA', storeId: '', poiId: '', source: 'ui-sample',
    });
    assert.deepEqual(place, {
      latitude: 24.6958, longitude: 46.685, accuracyMeters: 120, neighborhood: 'Al Olaya', regionCode: 'SA-01',
      countryCode: 'SA', source: 'ui-sample',
    });
    assert.equal(webEventPlace.fromFormValues({ latitude: '', longitude: '' }), null);
  });

  it('source list matches the field group spec', () => {
    assert.deepEqual(webEventPlace.SOURCES, fieldGroup.EVENT_PLACE_CONTEXT_SOURCES);
  });
});
