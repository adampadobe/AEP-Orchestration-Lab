/**
 * Event place context helper for the Event Tool (window.AepEventPlaceContext).
 * Mirrors functions/eventPlaceContext.js applyEventPlaceToXdm so the payload
 * preview matches what the server sends; the server still validates.
 * Reuses Riyadh/Dubai/London/New York presets from profile-place-context.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./profile-place-context.js'));
  } else {
    root.AepEventPlaceContext = factory(root.AepProfilePlaceContext);
  }
})(typeof self !== 'undefined' ? self : this, function (profilePlace) {
  'use strict';

  if (!profilePlace) throw new Error('event-place-context.js requires profile-place-context.js to load first');

  const SOURCES = ['ui-sample', 'event-tool', 'mcp-seed', 'store-poi', 'device-gps', 'edge-ip', 'import'];
  const NUMBER_LEAVES = ['latitude', 'longitude', 'accuracyMeters'];
  const TEXT_LEAVES = ['neighborhood', 'city', 'regionCode', 'countryCode', 'storeId', 'poiId', 'source'];
  const SUPPLEMENT_LEAVES = ['accuracyMeters', 'neighborhood', 'regionCode', 'storeId', 'poiId', 'source'];

  /** Sample event place (no lastSeenAt — the event timestamp is the time). */
  function generateSample(presetKey, opts) {
    const s = profilePlace.generateSample(presetKey, opts);
    if (!s) return null;
    delete s.lastSeenAt;
    s.source = 'ui-sample';
    return s;
  }

  /** Convert raw form strings into an eventPlace body object; null when lat/lon are both empty. */
  function fromFormValues(values) {
    const v = values || {};
    const place = {};
    NUMBER_LEAVES.forEach(function (leaf) {
      const raw = v[leaf] == null ? '' : String(v[leaf]).trim();
      if (!raw) return;
      const n = Number(raw);
      place[leaf] = Number.isFinite(n) ? n : raw;
    });
    TEXT_LEAVES.forEach(function (leaf) {
      const raw = v[leaf] == null ? '' : String(v[leaf]).trim();
      if (raw) place[leaf] = raw;
    });
    if (place.latitude === undefined && place.longitude === undefined) return null;
    return place;
  }

  function plainObject(o) {
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  }

  /** Preview-only mirror of the server placement (assumes already-valid input). */
  function applyToXdm(xdm, place, tenantKey) {
    const geohash = profilePlace.encodeGeohash(place.latitude, place.longitude, 7);
    const geo = { _schema: { latitude: place.latitude, longitude: place.longitude } };
    if (place.city !== undefined) geo.city = place.city;
    if (place.countryCode !== undefined) geo.countryCode = place.countryCode;
    if (place.regionCode !== undefined) geo.stateProvince = place.regionCode;

    const placeContext = plainObject(xdm.placeContext);
    placeContext.geo = Object.assign({}, plainObject(placeContext.geo), geo);
    if (place.poiId !== undefined) {
      const poi = plainObject(placeContext.POIinteraction);
      poi.poiDetail = Object.assign({}, plainObject(poi.poiDetail), { poiID: place.poiId });
      placeContext.POIinteraction = poi;
    }
    xdm.placeContext = placeContext;

    const supplement = { geohash: geohash };
    SUPPLEMENT_LEAVES.forEach(function (leaf) {
      if (leaf === 'source') supplement.source = place.source !== undefined ? place.source : 'event-tool';
      else if (place[leaf] !== undefined) supplement[leaf] = place[leaf];
    });
    xdm[tenantKey] = Object.assign({}, plainObject(xdm[tenantKey]), { eventPlaceContext: supplement });
    const alias = tenantKey.charAt(0) === '_' ? tenantKey.slice(1) : '';
    if (alias && xdm[alias] && typeof xdm[alias] === 'object') {
      xdm[alias] = Object.assign({}, xdm[alias], { eventPlaceContext: Object.assign({}, supplement) });
    }
    return xdm;
  }

  return {
    SOURCES: SOURCES,
    PRESETS: profilePlace.PRESETS,
    encodeGeohash: profilePlace.encodeGeohash,
    generateSample: generateSample,
    fromFormValues: fromFormValues,
    applyToXdm: applyToXdm,
  };
});
