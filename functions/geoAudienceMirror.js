'use strict';

/**
 * Geo audience mirror — the Firestore read model behind /api/geo-hotspots.
 *
 * AEP Query Service cannot return ad-hoc results to Cloud Run in time, so the lab mirrors the two
 * facts hotspots need at the moment it streams them to AEP:
 *   - labGeoProfilePlaces/{sandbox}__{identityHash}: a profile's last-known place
 *     (_demoemea.profilePlaceContext) after /api/profile/generate or /api/profile/update succeeds.
 *   - labGeoInterestSignals/{auto}: one commerce.productViews interest signal after
 *     /api/events/generator succeeds.
 *
 * Identities are stored only as sandbox-scoped SHA-256 hashes; no email, ECID or person name is kept.
 * The place name (profilePlaceContext.neighborhood, e.g. a district or POI) is kept so hotspot
 * cells can be labelled; it is only ever returned for cells that clear k-anonymity.
 * Docs carry expireAt for Firestore TTL (30 days for places, 7 days for signals).
 * Admin SDK only — firestore.rules deny all client access.
 */

const crypto = require('node:crypto');
const { getAdminFirestore } = require('./adminFirestore');

const PLACE_COLLECTION = 'labGeoProfilePlaces';
const SIGNAL_COLLECTION = 'labGeoInterestSignals';
const PLACE_TTL_DAYS = 30;
const SIGNAL_TTL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const MIRRORED_EVENT_TYPES = new Set(['commerce.productViews']);
const INTEREST_FIELDS = ['productName', 'productCategory'];
const MAX_INTEREST_KEYS = 8;
const MAX_INTEREST_KEY_LENGTH = 64;
const MAX_PLACE_NAME_LENGTH = 80;
const GET_ALL_CHUNK = 300;

function isGeoMirrorEnabled(env = process.env) {
  const raw = String(env.GEO_MIRROR_ENABLED == null ? '' : env.GEO_MIRROR_ENABLED).trim().toLowerCase();
  if (!raw || ['true', '1', 'on', 'yes'].includes(raw)) return true;
  if (['false', '0', 'off', 'no'].includes(raw)) return false;
  throw new Error(`GEO_MIRROR_ENABLED must be true or false; received "${raw}".`);
}

function hashIdentity(sandbox, value) {
  const text = String(value == null ? '' : value).trim().toLowerCase();
  if (!text) return '';
  return crypto.createHash('sha256').update(`${sandbox}|${text}`).digest('hex');
}

function normalizeInterestKey(value) {
  if (value == null) return '';
  return String(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_INTEREST_KEY_LENGTH);
}

function normalizeInterestKeys(values) {
  const keys = [];
  for (const value of Array.isArray(values) ? values : []) {
    const key = normalizeInterestKey(value);
    if (key && !keys.includes(key)) keys.push(key);
    if (keys.length >= MAX_INTEREST_KEYS) break;
  }
  return keys;
}

/** Interest values an Event Generator body carries in any `public.{industry}` slice. */
function interestKeysFromGeneratorBody(body) {
  const pub = body && body.public;
  if (!pub || typeof pub !== 'object' || Array.isArray(pub)) return [];
  const values = [];
  for (const slice of Object.values(pub)) {
    if (!slice || typeof slice !== 'object' || Array.isArray(slice)) continue;
    for (const field of INTEREST_FIELDS) {
      if (typeof slice[field] === 'string') values.push(slice[field]);
    }
  }
  return normalizeInterestKeys(values);
}

/** recordInterestSignal input for an accepted /api/events/generator request body. */
function generatorSignalFromBody(sandbox, body) {
  const b = body && typeof body === 'object' ? body : {};
  const ecid = b.ecid != null ? String(b.ecid).trim() : '';
  return {
    sandbox,
    email: typeof b.email === 'string' ? b.email.trim() : '',
    ecid: /^\d{10,}$/.test(ecid) ? ecid : '',
    eventType: typeof b.eventType === 'string' ? b.eventType.trim() : '',
    interests: interestKeysFromGeneratorBody(b),
    timestamp: typeof b.timestamp === 'string' && b.timestamp.trim() ? b.timestamp.trim() : undefined,
  };
}

function safeSandboxId(sandbox) {
  return String(sandbox).replace(/[:/\s.#$[\]]/g, '_').slice(0, 200);
}

function round5(value) {
  return Math.round(value * 1e5) / 1e5;
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalPlaceName(value) {
  const text = optionalString(value);
  return text ? text.slice(0, MAX_PLACE_NAME_LENGTH) : null;
}

function optionalDate(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

function toMillis(value) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value === 'number') return value;
  return NaN;
}

function createGeoAudienceMirror({ getDb = getAdminFirestore, now = Date.now, env = process.env } = {}) {
  async function guarded(write) {
    try {
      if (!isGeoMirrorEnabled(env)) return { written: false, reason: 'disabled' };
      return await write();
    } catch (error) {
      return { written: false, error: String(error && error.message ? error.message : error) };
    }
  }

  return {
    recordProfilePlace({ sandbox, email, ecid, place }) {
      return guarded(async () => {
        const sb = String(sandbox || '').trim();
        if (!sb) return { written: false, reason: 'no_sandbox' };
        if (!place || typeof place !== 'object') return { written: false, reason: 'no_place' };
        const lat = Number(place.latitude);
        const lon = Number(place.longitude);
        if (typeof place.latitude !== 'number' || typeof place.longitude !== 'number'
          || !Number.isFinite(lat) || !Number.isFinite(lon)) {
          return { written: false, reason: 'incomplete_place' };
        }
        const identityHash = hashIdentity(sb, email);
        if (!identityHash) return { written: false, reason: 'no_email' };
        const ecidHash = hashIdentity(sb, ecid);
        const nowMs = now();
        const docId = `${safeSandboxId(sb)}__${identityHash}`;
        await getDb().collection(PLACE_COLLECTION).doc(docId).set({
          sandbox: sb,
          identityHash,
          ecidHash: ecidHash || null,
          lat: round5(lat),
          lon: round5(lon),
          geohash7: optionalString(place.geohash),
          neighborhood: optionalPlaceName(place.neighborhood),
          city: optionalString(place.city),
          countryCode: optionalString(place.countryCode),
          lastSeenAt: optionalDate(place.lastSeenAt),
          source: optionalString(place.source),
          updatedAt: new Date(nowMs),
          expireAt: new Date(nowMs + PLACE_TTL_DAYS * DAY_MS),
        });
        return { written: true, collection: PLACE_COLLECTION, docId };
      });
    },

    recordInterestSignal({ sandbox, email, ecid, eventType, interests, timestamp }) {
      return guarded(async () => {
        const sb = String(sandbox || '').trim();
        if (!sb) return { written: false, reason: 'no_sandbox' };
        if (!MIRRORED_EVENT_TYPES.has(String(eventType || '').trim())) {
          return { written: false, reason: 'event_type_not_mirrored' };
        }
        const interestKeys = normalizeInterestKeys(interests);
        if (!interestKeys.length) return { written: false, reason: 'no_interest' };
        const identityHash = hashIdentity(sb, email);
        const ecidHash = hashIdentity(sb, ecid);
        if (!identityHash && !ecidHash) return { written: false, reason: 'no_identity' };
        const nowMs = now();
        const eventMs = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN;
        const tsMs = Number.isFinite(eventMs) && eventMs <= nowMs + FUTURE_SKEW_MS ? eventMs : nowMs;
        const ref = await getDb().collection(SIGNAL_COLLECTION).add({
          sandbox: sb,
          identityHash: identityHash || null,
          ecidHash: ecidHash || null,
          interestKeys,
          eventType: String(eventType).trim(),
          ts: new Date(tsMs),
          expireAt: new Date(Math.max(tsMs, nowMs) + SIGNAL_TTL_DAYS * DAY_MS),
        });
        return { written: true, collection: SIGNAL_COLLECTION, docId: ref.id };
      });
    },

    async listInterestIdentityHashes({ sandbox, interest, startMs, endMs, maxSignals }) {
      const key = normalizeInterestKey(interest);
      const snap = await getDb()
        .collection(SIGNAL_COLLECTION)
        .where('sandbox', '==', String(sandbox))
        .where('interestKeys', 'array-contains', key)
        .where('ts', '>=', new Date(startMs))
        .where('ts', '<=', new Date(endMs))
        .select('identityHash')
        .limit(maxSignals + 1)
        .get();
      if (snap.size > maxSignals) {
        throw new Error(
          `The geo mirror has more than ${maxSignals} matching signals for this interest and window; `
          + 'narrow the window or the interest.',
        );
      }
      const identityHashes = new Set();
      let ecidOnlySignals = 0;
      for (const doc of snap.docs) {
        const hash = doc.data().identityHash;
        if (hash) identityHashes.add(hash);
        else ecidOnlySignals += 1;
      }
      return { identityHashes, signals: snap.size, ecidOnlySignals };
    },

    async getProfilePlaces({ sandbox, identityHashes }) {
      const hashes = [...identityHashes];
      if (!hashes.length) return [];
      const db = getDb();
      const collection = db.collection(PLACE_COLLECTION);
      const prefix = safeSandboxId(String(sandbox));
      const places = [];
      for (let i = 0; i < hashes.length; i += GET_ALL_CHUNK) {
        const refs = hashes.slice(i, i + GET_ALL_CHUNK).map((hash) => collection.doc(`${prefix}__${hash}`));
        const snaps = await db.getAll(...refs);
        for (const snap of snaps) {
          if (!snap.exists) continue;
          const data = snap.data();
          if (typeof data.lat !== 'number' || typeof data.lon !== 'number') continue;
          places.push({
            identityHash: data.identityHash,
            lat: data.lat,
            lon: data.lon,
            neighborhood: typeof data.neighborhood === 'string' ? data.neighborhood : null,
            updatedAtMs: toMillis(data.updatedAt),
          });
        }
      }
      return places;
    },
  };
}

module.exports = {
  PLACE_COLLECTION,
  SIGNAL_COLLECTION,
  PLACE_TTL_DAYS,
  SIGNAL_TTL_DAYS,
  createGeoAudienceMirror,
  generatorSignalFromBody,
  hashIdentity,
  interestKeysFromGeneratorBody,
  isGeoMirrorEnabled,
  normalizeInterestKey,
};
