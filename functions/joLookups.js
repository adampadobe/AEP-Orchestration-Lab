/**
 * Journey Optimizer + Decisioning lookups (mirrors server.js GET handlers).
 */
const DPS_BASE = 'https://platform.adobe.io/data/core/dps';
const CJM_CAMPAIGN_BASE = process.env.CJM_CAMPAIGN_BASE || 'https://journey.adobe.io/campaign/campaigns';
const AJO_JOURNEY_BASE = process.env.AJO_JOURNEY_BASE || 'https://platform.adobe.io/ajo/journey';
const CJM_JOURNEY_BASE = process.env.CJM_JOURNEY_BASE || 'https://journey.adobe.io/journey/journeys';

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
