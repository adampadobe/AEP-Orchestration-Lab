'use strict';

const JOURNEY_READ_BASE = 'https://platform.adobe.io/ajo/journey';
const JOURNEY_AUTHORING_BASE = 'https://journey.adobe.io/authoring/journeys';
const CAMPAIGN_BASE = 'https://platform.adobe.io/journey/campaigns/service/campaigns';

function adobeHeaders(token, clientId, orgId, sandbox) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
  };
}

function parseTimestamp(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function firstArray(data, keys) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const key of keys) {
    if (Array.isArray(data[key])) return data[key];
  }
  if (data._embedded && typeof data._embedded === 'object') {
    for (const value of Object.values(data._embedded)) if (Array.isArray(value)) return value;
  }
  return [];
}

function textValue(...values) {
  const value = values.find((candidate) => candidate != null && String(candidate).trim());
  return value == null ? '' : String(value).trim();
}

function normalizeJourney(raw) {
  const item = raw && typeof raw === 'object' ? raw : {};
  const latest = item.latestJourneyVersion && typeof item.latestJourneyVersion === 'object'
    ? item.latestJourneyVersion : {};
  const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const journeyId = textValue(item.journeyID, item.journeyId, item.id, item.uid, item._id);
  const versionId = textValue(item.journeyVersionID, item.journeyVersionId, item.versionId, latest.uid, latest.id);
  return {
    id: versionId || journeyId,
    journeyId,
    versionId,
    name: textValue(item.name, item.itemName, item.title, item.displayName, latest.name, latest.itemName),
    description: textValue(item.description, latest.description),
    status: textValue(item.status, item.state, item.lifecycleState, latest.status, latest.state).toUpperCase(),
    version: item.version ?? item.versionNumber ?? latest.version ?? null,
    createdAt: parseTimestamp(metadata.createdAt ?? item.createdAt ?? item.creationDate),
    updatedAt: parseTimestamp(metadata.lastModifiedAt ?? item.updatedAt ?? item.lastModified),
    createdBy: textValue(metadata.createdBy, item.createdBy, item.author, item.owner),
    updatedBy: textValue(metadata.lastModifiedBy, item.updatedBy, item.lastModifiedBy),
    tags: Array.isArray(item.tags) ? item.tags : [],
  };
}

function normalizeCampaign(raw) {
  const item = raw && typeof raw === 'object' ? raw : {};
  const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  return {
    id: textValue(item.id, item.campaignId, item.uid, item._id),
    name: textValue(item.name, item.title, item.label, item.displayName),
    description: textValue(item.description),
    status: textValue(item.status, item.state, item.lifecycleState).toUpperCase(),
    campaignType: textValue(item.campaignType, item.type, item.actionType),
    createdAt: parseTimestamp(metadata.createdAt ?? item.createdAt ?? item.creationDate),
    updatedAt: parseTimestamp(metadata.lastModifiedAt ?? item.updatedAt ?? item.lastModified),
    createdBy: textValue(metadata.createdBy, item.createdBy, item.author, item.owner),
    updatedBy: textValue(metadata.lastModifiedBy, item.updatedBy, item.lastModifiedBy),
    audienceId: textValue(item.audienceId, item.audience?.id, item.segmentId),
    messageIds: firstArray(item.messages || item.messageIds || [], ['items']).map((entry) =>
      typeof entry === 'string' ? entry : textValue(entry.id, entry.messageId, entry.uid)).filter(Boolean),
  };
}

async function readAdobeResponse(response, label) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text ? { raw: text.slice(0, 20_000) } : null; }
  if (!response.ok) {
    const detail = data && typeof data === 'object'
      ? data.message || data.error || data.detail || data.title
      : '';
    const error = new Error(String(detail || response.statusText || `${label} ${response.status}`));
    error.status = response.status;
    error.platformResponse = data;
    throw error;
  }
  return data;
}

function listUrl(base, { start = 0, limit = 50, name }, pagination) {
  const url = new URL(base);
  const safeStart = Math.max(0, Number(start) || 0);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  if (pagination === 'page') {
    url.searchParams.set('page', String(Math.floor(safeStart / safeLimit)));
    url.searchParams.set('pageSize', String(safeLimit));
  } else {
    url.searchParams.set('start', String(safeStart));
    url.searchParams.set('limit', String(safeLimit));
  }
  if (name) url.searchParams.set('name', String(name).trim().slice(0, 200));
  return { url, start: safeStart, limit: safeLimit };
}

async function listJourneys(auth) {
  const { url, start, limit } = listUrl(JOURNEY_READ_BASE, auth, 'page');
  const response = await fetch(url, { method: 'GET', headers: adobeHeaders(auth.token, auth.clientId, auth.orgId, auth.sandbox) });
  const data = await readAdobeResponse(response, 'AJO journey API');
  let journeys = firstArray(data, ['results', 'journeys', 'items', 'content', 'data'])
    .map(normalizeJourney).filter((item) => item.id);
  if (auth.name) {
    const needle = String(auth.name).toLowerCase();
    journeys = journeys.filter((item) => item.name.toLowerCase().includes(needle));
  }
  return { sandbox: auth.sandbox, start, limit, count: journeys.length, page: data?.page || data?._page || null, journeys };
}

async function getJourney(auth) {
  const id = textValue(auth.journeyId);
  if (!id) throw Object.assign(new Error('journeyId is required.'), { status: 400 });
  const response = await fetch(`${JOURNEY_READ_BASE}/${encodeURIComponent(id)}`, {
    method: 'GET', headers: adobeHeaders(auth.token, auth.clientId, auth.orgId, auth.sandbox),
  });
  return normalizeJourney(await readAdobeResponse(response, 'AJO journey API'));
}

async function deleteJourney(auth) {
  const id = textValue(auth.journeyId);
  if (!id) throw Object.assign(new Error('journeyId is required.'), { status: 400 });
  const response = await fetch(`${JOURNEY_AUTHORING_BASE}/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: adobeHeaders(auth.token, auth.clientId, auth.orgId, auth.sandbox),
  });
  await readAdobeResponse(response, 'AJO journey authoring API');
  return { ok: true, status: response.status };
}

async function listCampaigns(auth) {
  const { url, start, limit } = listUrl(CAMPAIGN_BASE, auth, 'offset');
  const response = await fetch(url, { method: 'GET', headers: adobeHeaders(auth.token, auth.clientId, auth.orgId, auth.sandbox) });
  const data = await readAdobeResponse(response, 'AJO campaign API');
  let campaigns = firstArray(data, ['results', 'campaigns', 'items', 'content', 'data'])
    .map(normalizeCampaign).filter((item) => item.id);
  if (auth.name) {
    const needle = String(auth.name).toLowerCase();
    campaigns = campaigns.filter((item) => item.name.toLowerCase().includes(needle));
  }
  return { sandbox: auth.sandbox, start, limit, count: campaigns.length, page: data?.page || data?._page || null, campaigns };
}

async function getCampaign(auth) {
  const id = textValue(auth.campaignId);
  if (!id) throw Object.assign(new Error('campaignId is required.'), { status: 400 });
  const response = await fetch(`${CAMPAIGN_BASE}/${encodeURIComponent(id)}`, {
    method: 'GET', headers: adobeHeaders(auth.token, auth.clientId, auth.orgId, auth.sandbox),
  });
  return normalizeCampaign(await readAdobeResponse(response, 'AJO campaign API'));
}

async function deleteCampaign(auth) {
  const id = textValue(auth.campaignId);
  if (!id) throw Object.assign(new Error('campaignId is required.'), { status: 400 });
  const response = await fetch(`${CAMPAIGN_BASE}/${encodeURIComponent(id)}/delete`, {
    method: 'PUT', headers: { ...adobeHeaders(auth.token, auth.clientId, auth.orgId, auth.sandbox), 'Content-Type': 'application/json' },
    body: '{}',
  });
  await readAdobeResponse(response, 'AJO campaign delete API');
  return { ok: true, status: response.status };
}

module.exports = {
  JOURNEY_READ_BASE,
  JOURNEY_AUTHORING_BASE,
  CAMPAIGN_BASE,
  normalizeJourney,
  normalizeCampaign,
  listJourneys,
  getJourney,
  deleteJourney,
  listCampaigns,
  getCampaign,
  deleteCampaign,
};
