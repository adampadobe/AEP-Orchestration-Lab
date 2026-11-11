/**
 * Journey Optimizer + Decisioning lookups (mirrors server.js GET handlers).
 */
const DPS_BASE = 'https://platform.adobe.io/data/core/dps';
const CJM_CAMPAIGN_BASE = process.env.CJM_CAMPAIGN_BASE || 'https://journey.adobe.io/campaign/campaigns';
const AJO_JOURNEY_BASE = process.env.AJO_JOURNEY_BASE || 'https://platform.adobe.io/ajo/journey';
const CJM_JOURNEY_BASE = process.env.CJM_JOURNEY_BASE || 'https://journey.adobe.io/journey/journeys';
const CAMPAIGN_QUERY_URL = 'https://platform.adobe.io/data/foundation/query/accelerated-queries';
const CAMPAIGN_NAME_TTL_MS = 5 * 60 * 1000;
const campaignNameCache = new Map();
const CAMPAIGN_ACTIVITY_ID = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:#[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/i;

async function getAcceleratedCampaignNameById(id, sandboxName, token, clientId, orgId) {
  const activityId = CAMPAIGN_ACTIVITY_ID.exec(id);
  if (!activityId) {
    const error = new Error('Campaign id must be a UUID or a UUID#UUID activity id.');
    error.status = 400;
    throw error;
  }
  // Edge activity IDs may include a version UUID; the lookup table keys the campaign UUID only.
  const campaignId = activityId[1].toLowerCase();
  const key = JSON.stringify([orgId, clientId, sandboxName, campaignId]);
  const cached = campaignNameCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.name;
  campaignNameCache.delete(key);
  const res = await fetch(CAMPAIGN_QUERY_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-api-key': clientId,
      'x-gw-ims-org-id': orgId,
      'x-sandbox-name': sandboxName,
    },
    body: JSON.stringify({
      dbName: 'kirkham:qsaccel',
      sql: `SELECT DISTINCT campaign_id, campaign_name FROM qsaccel.ajo_lookup.ajo_campaign_names WHERE campaign_id = '${campaignId}' ORDER BY campaign_name`,
      name: 'AJO Campaign Name Lookup',
      description: 'Resolve a campaign name for profile event attribution',
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Campaign name query failed (HTTP ${res.status}).`);
  const data = await res.json();
  if (!Array.isArray(data.results) || data.results.some(row =>
    !row || row.campaign_id !== campaignId || typeof row.campaign_name !== 'string' || !row.campaign_name.trim())) {
    throw new Error('Campaign name query returned invalid results.');
  }
  const names = [...new Set(data.results.map(row => row.campaign_name.trim()))];
  if (names.length > 1) throw new Error('Campaign name query returned conflicting names for this id.');
  const name = names[0] || null;
  if (name) {
    if (campaignNameCache.size >= 200) campaignNameCache.delete(campaignNameCache.keys().next().value);
    campaignNameCache.set(key, { name, expires: Date.now() + CAMPAIGN_NAME_TTL_MS });
  }
  return name;
}

async function getTreatmentNameById(id, sandboxName, token, clientId, orgId) {
  const trimmed = String(id || '').trim();
  if (!trimmed) return null;
  const url = `${DPS_BASE}/offer-items/${encodeURIComponent(trimmed)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'x-api-key': clientId,
      'x-gw-ims-org-id': orgId,
      'x-sandbox-name': sandboxName,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  const item = data['_experience']?.decisioning?.decisionitem ?? data?.decisionitem ?? data;
  return item?.itemName ?? item?.name ?? null;
}

async function getCampaignNameById(id, sandboxName, token, clientId, orgId) {
  const trimmed = String(id || '').trim();
  if (!trimmed) return null;
  // Only kirkham has the verified accelerated-store campaign lookup table.
  if (sandboxName === 'kirkham') {
    return getAcceleratedCampaignNameById(trimmed, sandboxName, token, clientId, orgId);
  }
  const url = `${CJM_CAMPAIGN_BASE}/${encodeURIComponent(trimmed)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'x-api-key': clientId,
      'x-gw-ims-org-id': orgId,
      'x-sandbox-name': sandboxName,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  return data.name ?? data.label ?? data.title ?? data['@id'] ?? null;
}

async function getJourneyNameById(id, sandboxName, token, clientId, orgId) {
  const trimmed = String(id || '').trim();
  if (!trimmed) return null;
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandboxName,
  };

  // Direct lookup via AJO Journey API (platform.adobe.io/ajo/journey/{id})
  const directUrl = `${AJO_JOURNEY_BASE}/${encodeURIComponent(trimmed)}`;
  const directRes = await fetch(directUrl, { method: 'GET', headers });
  const directData = await directRes.json().catch(() => ({}));
  if (directRes.ok) {
    const name = directData.name ?? directData.label ?? directData.title ?? null;
    if (name) return name;
  }

  // Fallback: list all journeys and match by ID or version
  const map = await listJourneyVersionMap(sandboxName, token, clientId, orgId);
  return map.get(trimmed) ?? null;
}

/**
 * Fetches all journeys and builds a Map<id|version, journeyName>.
 * In-memory cache per function invocation (cold starts refresh automatically).
 */
let versionMapCache = null;
let versionMapSandbox = null;

async function listJourneyVersionMap(sandboxName, token, clientId, orgId) {
  if (versionMapCache && versionMapSandbox === sandboxName) return versionMapCache;
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandboxName,
  };
  const map = new Map();
  let page = 0;
  const maxPages = 20;

  while (page < maxPages) {
    const url = `${AJO_JOURNEY_BASE}?page=${page}&pageSize=100`;
    const res = await fetch(url, { method: 'GET', headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) break;

    const journeys = Array.isArray(data) ? data : (data.results || data.data || data.journeys || []);
    if (!Array.isArray(journeys) || journeys.length === 0) break;

    for (const j of journeys) {
      const name = j.name ?? j.label ?? j.title ?? null;
      if (!name) continue;
      if (j.id) map.set(j.id, name);
      if (j.uid) map.set(j.uid, name);
      if (j.version) map.set(j.version, name);
      const cv = j.currentVersion;
      if (cv && cv.id) map.set(cv.id, name);
      if (Array.isArray(j.versions)) {
        for (const v of j.versions) {
          if (v && v.id) map.set(v.id, name);
        }
      }
    }

    const totalPages = data.pages ?? data.totalPages ?? null;
    if (totalPages != null && page + 1 >= totalPages) break;
    if (journeys.length < 100) break;
    page++;
  }

  versionMapCache = map;
  versionMapSandbox = sandboxName;
  return map;
}

module.exports = {
  getTreatmentNameById,
  getCampaignNameById,
  getJourneyNameById,
  listJourneyVersionMap,
};
