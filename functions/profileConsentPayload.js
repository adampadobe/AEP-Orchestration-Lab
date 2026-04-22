/**
 * GET /api/profile/consent response shape (mirrors Express server.js).
 */
const {
  flattenEntityToTableRows,
  get,
  getProfileEmail,
  getProfileEcid,
  getFirstEcidFromRows,
  ensureSingleEcid,
  toEcidString,
  ECID_PATH_DEMOEMEA,
} = require('./profileTableHelpers');

const OPTINOUT_CHANNELS = [
  'email',
  'sms',
  'push',
  'phone',
  'directMail',
  'whatsapp',
  'facebookFeed',
  'web',
  'mobileApp',
  'twitterFeed',
];

const MARKETING_CHANNEL_ALIASES = {
  phone: ['phone', 'call'],
  directMail: ['directMail', 'direct_mail', 'postalMail', 'postal_mail'],
  mobileApp: ['mobileApp', 'mobile_app'],
  facebookFeed: ['facebookFeed', 'facebook_feed'],
  twitterFeed: ['twitterFeed', 'twitter_feed'],
  whatsapp: ['whatsApp', 'whatsapp'],
};

function getEntityFromProfileResponse(response) {
  if (response?.entity != null && typeof response.entity === 'object') return response.entity;
  const keys = Object.keys(response || {}).filter((k) => !k.startsWith('_'));
  for (const k of keys) {
    const v = response[k];
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      if (v.entity != null && typeof v.entity === 'object') return v.entity;
      if (v.optInOut != null || v.consents?.marketing != null) return v;
      if (v.attributes?.consents != null || v.attributes?.optInOut != null) return v;
    }
  }
  return keys.length ? response[keys[0]] : null;
}

function getProfileForConsent(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (obj.optInOut != null || obj.consents?.marketing != null) return obj;
  if (obj.attributes && typeof obj.attributes === 'object') {
    const att = obj.attributes;
    if (att.consents != null || att.optInOut != null) {
      return {
        consents: att.consents ?? obj.consents,
        optInOut: att.optInOut ?? obj.optInOut,
      };
    }
    for (const v of Object.values(att)) {
      if (v && typeof v === 'object' && (v.optInOut != null || v.consents?.marketing != null)) {
        return v;
      }
    }
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && (v.optInOut != null || v.consents?.marketing != null)) {
      return v;
    }
  }
  return obj;
}

function normalizeChannelValue(raw) {
  if (raw == null || typeof raw !== 'string') return 'not_provided';
  const v = raw.toLowerCase().trim();
  if (v === 'in' || v === 'y' || v === 'yes' || v === 'vi') return 'in';
  if (v === 'out' || v === 'n' || v === 'no') return 'out';
  if (v === 'not_provided') return 'not_provided';
  return 'not_provided';
}

function getPreferredMarketingChannel(entity) {
  if (!entity || typeof entity !== 'object') return null;
  const from = (obj) => {
    const p = obj?.consents?.marketing?.preferred;
    return p != null && typeof p === 'string' ? String(p).toLowerCase().trim() : null;
  };
  let v = from(entity);
  if (v) return v;
  if (entity.attributes && typeof entity.attributes === 'object') {
    for (const att of Object.values(entity.attributes)) {
      if (att && typeof att === 'object') {
        v = from(att);
        if (v) return v;
      }
    }
  }
  for (const val of Object.values(entity)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      v = from(val);
      if (v) return v;
    }
  }
  return null;
}

/** BCP-47 style codes matching EMEA presales consent-manager preferred language list. */
function getPreferredLanguage(entity) {
  if (!entity || typeof entity !== 'object') return null;
  const from = (obj) => {
    if (!obj || typeof obj !== 'object') return null;
    const root = obj.preferredLanguage;
    if (typeof root === 'string' && root.trim()) return root.trim();
    const pl = obj.consents?.marketing?.preferredLanguage;
    if (typeof pl === 'string' && pl.trim()) return pl.trim();
    return null;
  };
  let v = from(entity);
  if (v) return v;
  v = from(entity._demoemea);
  if (v) return v;
  if (entity.attributes && typeof entity.attributes === 'object') {
    for (const att of Object.values(entity.attributes)) {
      if (att && typeof att === 'object') {
        v = from(att);
        if (v) return v;
      }
    }
  }
  for (const val of Object.values(entity)) {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      v = from(val);
      if (v) return v;
    }
  }
  return null;
}

function getChannelRawValue(entity, key) {
  const marketing = entity.consents?.marketing;
  if (marketing && typeof marketing === 'object') {
    const keysToTry = MARKETING_CHANNEL_ALIASES[key] || [key];
    for (const k of keysToTry) {
      const ch = marketing[k];
      if (ch != null) {
        const val = typeof ch === 'object' ? (ch.val ?? ch.consentValue) : ch;
        if (val != null && typeof val === 'string') return val;
      }
    }
  }
  const fromChannels = entity.optInOut?._channels?.[key];
  if (fromChannels != null && typeof fromChannels === 'string') return fromChannels;
  return null;
}

function toConsentRadio(val) {
  if (val == null || typeof val !== 'string') return 'na';
  const v = val.toLowerCase().trim();
  if (v === 'y' || v === 'yes') return 'y';
  if (v === 'n' || v === 'no' || v === 'dn') return 'n';
  return 'na';
}

function extractConsents(entity) {
  const result = {
    marketingConsent: null,
    channelOptInOut: null,
    channels: {},
    dataCollection: 'na',
    dataSharing: 'na',
    contentPersonalization: 'na',
  };
  if (!entity || typeof entity !== 'object') return result;

  const profile = getProfileForConsent(entity);
  const c = profile?.consents;
  if (c) {
    const collectVal = c.collect?.val ?? c.collect?.consentValue;
    result.dataCollection = toConsentRadio(collectVal != null ? String(collectVal) : null);
    const shareVal = c.share?.val ?? c.share?.consentValue;
    result.dataSharing = toConsentRadio(shareVal != null ? String(shareVal) : null);
    const personalizeVal = c.personalize?.content?.val ?? c.personalize?.val ?? c.personalize?.consentValue;
    result.contentPersonalization = toConsentRadio(personalizeVal != null ? String(personalizeVal) : null);
  }

  const marketing = profile?.consents?.marketing ?? c?.marketing;
  if (marketing && typeof marketing === 'object') {
    const rawVal = marketing.val ?? marketing.consentValue ?? marketing.any?.val;
    if (rawVal != null && typeof rawVal === 'string') {
      const v = rawVal.toLowerCase();
      result.marketingConsent = v === 'y' || v === 'yes' ? 'Y' : v === 'n' || v === 'no' ? 'N' : null;
    }
  }

  const channelVals = [];
  for (const key of OPTINOUT_CHANNELS) {
    const raw = getChannelRawValue(profile || entity, key);
    const normalized = normalizeChannelValue(raw);
    result.channels[key] = normalized;
    channelVals.push(normalized);
  }
  if (channelVals.length > 0) {
    const allIn = channelVals.every((v) => v === 'in');
    const allOut = channelVals.every((v) => v === 'out');
    if (allIn) result.channelOptInOut = 'In';
    else if (allOut) result.channelOptInOut = 'Out';
  }

  return result;
}

function getProfileNamesFromObject(obj) {
  if (!obj || typeof obj !== 'object') return { firstName: '', lastName: '' };
  const paths = [
    'person.name.firstName',
    'person.name.lastName',
    'name.firstName',
    'name.lastName',
    'name.givenName',
    'name.familyName',
    '_demoemea.person.name.firstName',
    '_demoemea.person.name.lastName',
    'identification.core.firstName',
    'identification.core.lastName',
    '_demoemea.identification.core.firstName',
    '_demoemea.identification.core.lastName',
  ];
  let firstName = '';
  let lastName = '';
  for (const p of paths) {
    const val = get(obj, p);
    if (val && typeof val === 'string') {
      if (p.includes('firstName') || p.includes('givenName')) firstName = val;
      else if (p.includes('lastName') || p.includes('familyName')) lastName = val;
    }
  }
  if (!firstName && get(obj, 'person.name.fullName')) {
    const parts = String(get(obj, 'person.name.fullName')).trim().split(/\s+/);
    if (parts.length >= 1) firstName = parts[0];
    if (parts.length >= 2) lastName = parts.slice(1).join(' ');
  }
  return { firstName, lastName };
}

function getProfileNames(entity) {
  if (!entity || typeof entity !== 'object') return { firstName: '', lastName: '' };
  let result = getProfileNamesFromObject(entity);
  if (result.firstName || result.lastName) return result;
  if (entity.attributes && typeof entity.attributes === 'object') {
    for (const v of Object.values(entity.attributes)) {
      if (v && typeof v === 'object') {
        result = getProfileNamesFromObject(v);
        if (result.firstName || result.lastName) return result;
      }
    }
  }
  for (const v of Object.values(entity)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && (get(v, 'person.name') || get(v, 'person.name.firstName') || get(v, 'name.firstName'))) {
      result = getProfileNamesFromObject(v);
      if (result.firstName || result.lastName) return result;
    }
  }
  return result;
}

function normalizeProfileGender(raw) {
  if (raw == null || raw === '') return null;
  const g = String(raw).trim().toLowerCase();
  if (!g) return null;
  if (g === 'f' || g === 'female' || g === 'woman' || g === 'w') return 'female';
  if (g === 'm' || g === 'male' || g === 'man') return 'male';
  if (g.includes('female') || g.includes('woman')) return 'female';
  if (g.includes('male') && !g.includes('female')) return 'male';
  return null;
}

function normalizeGenderFromRaw(val) {
  if (val == null) return null;
  if (typeof val === 'string') return normalizeProfileGender(val);
  if (typeof val === 'object' && !Array.isArray(val)) {
    const id = val['@id'];
    if (id != null && typeof id === 'string') {
      const idLower = id.toLowerCase();
      if (idLower.includes('female') || idLower.includes('woman')) return 'female';
      if (idLower.includes('male') && !idLower.includes('female')) return 'male';
    }
    for (const k of ['code', 'value', 'name', 'type', 'key', 'enum', 'gender']) {
      const inner = val[k];
      if (inner != null && typeof inner === 'string') {
        const n = normalizeProfileGender(inner);
        if (n) return n;
      }
    }
  }
  return null;
}

function readGenderFieldFromObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  for (const k of Object.keys(obj)) {
    if (String(k).toLowerCase() === 'gender') {
      return obj[k];
    }
  }
  return null;
}

function getGenderFromPersonContainer(personVal) {
  if (personVal == null) return null;
  const nodes = Array.isArray(personVal) ? personVal : [personVal];
  for (const node of nodes) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
    let raw = readGenderFieldFromObject(node);
    if (raw == null && node.demographics && typeof node.demographics === 'object') {
      raw = readGenderFieldFromObject(node.demographics);
    }
    if (raw == null && node.demographic && typeof node.demographic === 'object') {
      raw = readGenderFieldFromObject(node.demographic);
    }
    const n = normalizeGenderFromRaw(raw);
    if (n) return n;
  }
  return null;
}

function getProfileGenderFromObject(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const fromPerson =
    getGenderFromPersonContainer(obj.person) ||
    getGenderFromPersonContainer(get(obj, '_demoemea.person')) ||
    getGenderFromPersonContainer(get(obj, 'xdm.person')) ||
    (obj.xdm && typeof obj.xdm === 'object' ? getGenderFromPersonContainer(obj.xdm.person) : null);
  if (fromPerson) return fromPerson;

  const paths = [
    'person.gender',
    'person.demographics.gender',
    'person.demographic.gender',
    'demographics.gender',
    'gender',
    'xdm.person.gender',
    '_demoemea.person.gender',
    '_demoemea.person.demographics.gender',
    '_demoemea.demographics.gender',
    '_demoemea.individualCharacteristics.person.gender',
    'individualCharacteristics.gender',
    'individualCharacteristics.person.gender',
  ];
  for (const p of paths) {
    const val = get(obj, p);
    const n = normalizeGenderFromRaw(val);
    if (n) return n;
  }
  return null;
}

function getProfileGender(entity) {
  if (!entity || typeof entity !== 'object') return null;
  let g = getProfileGenderFromObject(entity);
  if (g) return g;
  if (entity.attributes && typeof entity.attributes === 'object') {
    for (const v of Object.values(entity.attributes)) {
      if (v && typeof v === 'object') {
        g = getProfileGenderFromObject(v);
        if (g) return g;
      }
    }
  }
  for (const v of Object.values(entity)) {
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          g = getProfileGenderFromObject(item);
          if (g) return g;
        }
      }
      continue;
    }
    if (v && typeof v === 'object') {
      g = getProfileGenderFromObject(v);
      if (g) return g;
    }
  }
  try {
    const rows = flattenEntityToTableRows(entity);
    for (const row of rows || []) {
      const p = String(row.path || '').toLowerCase();
      if (!p.includes('gender')) continue;
      const n = normalizeGenderFromRaw(row.value);
      if (n) return n;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function extractLinkedIdentitiesFromFlattenedRows(rows) {
  const out = [];
  const seen = new Set();
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    const p = String(row.path || '').toLowerCase();
    if (!p.includes('identitymap')) continue;
    const m = p.match(/identitymap\.([^.]+)/);
    if (!m) continue;
    if (!p.match(/\.(id|xid)$/)) continue;
    const ns = m[1];
    const v = String(row.value ?? '').trim();
    if (!v || v.length > 256) continue;
    const key = `${ns}:${v.slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ namespace: ns, value: v });
  }
  return out;
}

function collectIdentitiesForGraph(entity, flatRows) {
  const map = new Map();
  function add(ns, val) {
    const n = String(ns || '').trim();
    const v = String(val ?? '').trim();
    if (!n || !v || v.length > 256) return;
    const key = `${n}:${v.slice(0, 120)}`;
    if (map.has(key)) return;
    map.set(key, { namespace: n, value: v });
  }
  for (const x of extractLinkedIdentitiesFromFlattenedRows(flatRows)) {
    add(x.namespace, x.value);
  }
  const im = entity?.identityMap;
  if (im && typeof im === 'object' && !Array.isArray(im)) {
    for (const [ns, arr] of Object.entries(im)) {
      const list = Array.isArray(arr) ? arr : [];
      for (const item of list) {
        const id = item?.id ?? item?.ID ?? item?.xid;
        if (id != null && id !== '') add(ns, String(id));
      }
    }
  }
  return [...map.values()].slice(0, 40);
}

function stringifyConsentScalar(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

function collectProfileRootCandidates(response) {
  const roots = [];
  if (!response || typeof response !== 'object') return roots;
  const keys = Object.keys(response).filter((k) => !k.startsWith('_'));
  for (const k of keys) {
    const v = response[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      roots.push(v);
      if (v.entity && typeof v.entity === 'object') roots.push(v.entity);
    }
  }
  return roots;
}

function getDemoemeaScoringForConsent(entity, response) {
  let propensityScore = null;
  let churnPrediction = null;
  const roots = [];
  if (entity && typeof entity === 'object') roots.push(entity);
  for (const r of collectProfileRootCandidates(response)) {
    if (r && !roots.includes(r)) roots.push(r);
  }
  for (const root of roots) {
    if (propensityScore == null) {
      const v =
        get(root, '_demoemea.scoring.core.propensityScore') ??
        root?._demoemea?.scoring?.core?.propensityScore;
      propensityScore = stringifyConsentScalar(v);
    }
    if (churnPrediction == null) {
      const v =
        get(root, '_demoemea.scoring.churn.churnPrediction') ??
        root?._demoemea?.scoring?.churn?.churnPrediction;
      churnPrediction = stringifyConsentScalar(v);
    }
    if (propensityScore != null && churnPrediction != null) break;
  }
  if (propensityScore == null || churnPrediction == null) {
    try {
      const rows = flattenEntityToTableRows(entity);
      for (const row of rows || []) {
        const p = String(row.path || '').toLowerCase();
        if (propensityScore == null && p.includes('propensityscore')) {
          propensityScore = stringifyConsentScalar(row.value);
        }
        if (churnPrediction == null && p.includes('churnprediction')) {
          churnPrediction = stringifyConsentScalar(row.value);
        }
      }
    } catch { /* ignore */ }
  }
  return { propensityScore, churnPrediction };
}

/**
 * Customer lifetime value from profile when present (otherwise null for empty UI).
 */
function getCustomerLifetimeValueForConsent(entity, response) {
  let ltv = null;
  const roots = [];
  if (entity && typeof entity === 'object') roots.push(entity);
  for (const r of collectProfileRootCandidates(response)) {
    if (r && !roots.includes(r)) roots.push(r);
  }
  for (const root of roots) {
    const v =
      get(root, '_demoemea.metrics.customerLifetimeValue') ??
      get(root, 'metrics.customerLifetimeValue') ??
      root?._demoemea?.metrics?.customerLifetimeValue ??
      root?.metrics?.customerLifetimeValue;
    const s = stringifyConsentScalar(v);
    if (s) {
      ltv = s;
      break;
    }
  }
  if (ltv == null) {
    try {
      const rows = flattenEntityToTableRows(entity);
      for (const row of rows || []) {
        const p = String(row.path || '').toLowerCase();
        if (p.includes('customerlifetimevalue') || (p.includes('lifetime') && p.includes('value'))) {
          const s = stringifyConsentScalar(row.value);
          if (s) {
            ltv = s;
            break;
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
  return ltv;
}

function getDemoemeaLoyaltyLevelForConsent(entity, response) {
  let level = null;
  const roots = [];
  if (entity && typeof entity === 'object') roots.push(entity);
  for (const r of collectProfileRootCandidates(response)) {
    if (r && !roots.includes(r)) roots.push(r);
  }
  for (const root of roots) {
    const v =
      get(root, '_demoemea.loyaltyDetails.level') ?? root?._demoemea?.loyaltyDetails?.level;
    const s = stringifyConsentScalar(v);
    if (s) { level = s; break; }
  }
  if (level == null) {
    try {
      const rows = flattenEntityToTableRows(entity);
      for (const row of rows || []) {
        const p = String(row.path || '').toLowerCase();
        if (p.includes('loyaltydetails') && p.endsWith('.level')) {
          level = stringifyConsentScalar(row.value);
          if (level) break;
        }
      }
    } catch { /* ignore */ }
  }
  return level;
}

function getProfileAgeAndHomeCityForConsent(entity, response) {
  let age = null;
  let city = null;
  const roots = [];
  if (entity && typeof entity === 'object') roots.push(entity);
  for (const r of collectProfileRootCandidates(response)) {
    if (r && !roots.includes(r)) roots.push(r);
  }
  for (const root of roots) {
    if (age == null) {
      const v =
        get(root, 'individualCharacteristics.core.age') ??
        root?.individualCharacteristics?.core?.age ??
        get(root, 'person.age') ??
        get(root, '_demoemea.individualCharacteristics.core.age');
      if (v != null && v !== '') {
        const s = stringifyConsentScalar(typeof v === 'number' ? v : v);
        if (s) age = s;
      }
    }
    if (city == null) {
      const v = get(root, 'homeAddress.city') ?? root?.homeAddress?.city;
      const s = stringifyConsentScalar(v);
      if (s) city = s;
    }
    if (age != null && city != null) break;
  }
  if (age == null || city == null) {
    try {
      const rows = flattenEntityToTableRows(entity);
      for (const row of rows || []) {
        const p = String(row.path || '').toLowerCase();
        if (
          age == null &&
          (p.endsWith('.age') || (p.includes('individualcharacteristics') && p.includes('age'))) &&
          !p.includes('average') && !p.includes('passenger') && !p.includes('message')
        ) {
          const s = stringifyConsentScalar(row.value);
          if (s) {
            const n = Number(String(s).replace(/,/g, ''));
            if (Number.isFinite(n) && n >= 0 && n <= 130) age = String(Math.round(n));
          }
        }
        if (city == null && p.includes('homeaddress') && p.endsWith('.city')) {
          city = stringifyConsentScalar(row.value);
        }
      }
    } catch { /* ignore */ }
  }
  return { age, city };
}

/**
 * @param {string} email
 * @param {object} response - raw UPS profile response
 */
function buildConsentGetPayload(email, response) {
  const entity = getEntityFromProfileResponse(response);
  if (!entity || typeof entity !== 'object') {
    return { email: null, found: false };
  }
  const profile = getProfileForConsent(entity);
  const extracted = extractConsents(entity);
  const {
    marketingConsent,
    channelOptInOut,
    channels,
    dataCollection,
    dataSharing,
    contentPersonalization,
  } = extracted;
  const preferredMarketingChannel = getPreferredMarketingChannel(entity);
  const preferredLanguage = getPreferredLanguage(entity);
  const { firstName, lastName } = getProfileNames(entity);
  const gender = getProfileGender(entity);
  const profileEmail = getProfileEmail(entity);
  const keys = Object.keys(response || {}).filter((k) => !k.startsWith('_'));
  const payload = keys.length ? response[keys[0]] : null;
  const demoemeaEcid = entity?._demoemea?.identification?.core?.ecid ?? entity?._demoemea?.identification?.core?.ECID;
  let ecid =
    toEcidString(demoemeaEcid) ||
    toEcidString(get(entity, ECID_PATH_DEMOEMEA)) ||
    (payload?.entity &&
      toEcidString(
        payload.entity._demoemea?.identification?.core?.ecid ?? payload.entity._demoemea?.identification?.core?.ECID
      )) ||
    (payload && toEcidString(get(payload, 'entity._demoemea.identification.core.ecid'))) ||
    getProfileEcid(entity) ||
    getProfileEcid(payload);
  const flatRows = flattenEntityToTableRows(entity);
  if ((ecid == null || ecid === '') && entity) {
    ecid = getFirstEcidFromRows(flatRows);
  }
  ecid = ensureSingleEcid(ecid);
  const identities = collectIdentitiesForGraph(entity, flatRows);
  const { propensityScore, churnPrediction } = getDemoemeaScoringForConsent(entity, response);
  const loyaltyStatus = getDemoemeaLoyaltyLevelForConsent(entity, response);
  const customerLifetimeValue = getCustomerLifetimeValueForConsent(entity, response);
  const { age: profileAge, city: homeCity } = getProfileAgeAndHomeCityForConsent(entity, response);
  const lastModifiedAt = entity?.lastModifiedAt ?? payload?.lastModifiedAt ?? response?.lastModifiedAt ?? null;
  const profileEmailTrim = profileEmail && String(profileEmail).trim() ? String(profileEmail).trim() : null;
  return {
    found: true,
    email: profileEmailTrim,
    firstName: firstName || null,
    lastName: lastName || null,
    gender: gender || null,
    age: profileAge ?? null,
    city: homeCity ?? null,
    propensityScore: propensityScore ?? null,
    churnPrediction: churnPrediction ?? null,
    loyaltyStatus: loyaltyStatus ?? null,
    customerLifetimeValue: customerLifetimeValue ?? null,
    lastModifiedAt: lastModifiedAt ?? null,
    profileSource: 'Adobe Experience Platform',
    ecid: ecid || null,
    identities,
    marketingConsent: marketingConsent ?? null,
    channelOptInOut: channelOptInOut ?? null,
    channels: channels && Object.keys(channels).length ? channels : null,
    preferredMarketingChannel: preferredMarketingChannel || null,
    preferredLanguage: preferredLanguage || null,
    dataCollection: dataCollection || 'na',
    dataSharing: dataSharing || 'na',
    contentPersonalization: contentPersonalization || 'na',
  };
}

module.exports = { buildConsentGetPayload };
