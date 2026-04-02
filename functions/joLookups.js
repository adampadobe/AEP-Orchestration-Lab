/**
 * Journey Optimizer + Decisioning lookups (mirrors server.js GET handlers).
 */
const DPS_BASE = 'https://platform.adobe.io/data/core/dps';
const CJM_CAMPAIGN_BASE = process.env.CJM_CAMPAIGN_BASE || 'https://journey.adobe.io/campaign/campaigns';
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
  const url = `${CJM_JOURNEY_BASE}/${encodeURIComponent(trimmed)}`;
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

module.exports = {
  getTreatmentNameById,
  getCampaignNameById,
  getJourneyNameById,
};
