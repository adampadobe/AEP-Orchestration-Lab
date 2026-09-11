'use strict';

const { TOKEN_PROFILES, capabilityCatalog } = require('./adobeApiCapabilityRegistry');

const AJO_SUPPRESSION_URL = 'https://platform.adobe.io/ajo/config/suppression/addresses';
const GENSTUDIO_EXPERIENCES_URL = 'https://genstudio.adobe.io/experiences';

function boundedInt(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

async function readJson(response, label) {
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text ? { raw: text.slice(0, 20_000) } : null; }
  if (!response.ok) {
    const detail = data && typeof data === 'object' ? data.message || data.error || data.detail || data.title : '';
    const error = new Error(String(detail || response.statusText || `${label} ${response.status}`));
    error.status = response.status;
    error.platformResponse = data;
    throw error;
  }
  return data;
}

function maskValue(value) {
  const text = String(value || '');
  const at = text.indexOf('@');
  if (at > 0) return `${text.slice(0, 1)}***@${text.slice(at + 1).replace(/^[^.]+/, '***')}`;
  if (text.includes('.')) return text.replace(/^[^.]+/, '***');
  return text ? '***' : text;
}

function redactAddresses(value, key = '') {
  if (Array.isArray(value)) return value.map((item) => redactAddresses(item, key));
  if (!value || typeof value !== 'object') {
    return /address|email|domain/i.test(key) ? maskValue(value) : value;
  }
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redactAddresses(child, childKey)]));
}

function firstArray(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const key of ['items', 'results', 'data', 'experiences', 'content']) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
}

function textValue(...values) {
  const value = values.find((candidate) => candidate != null && String(candidate).trim());
  return value == null ? '' : String(value).trim();
}

function normalizeExperience(raw) {
  const item = raw && typeof raw === 'object' ? raw : {};
  return {
    id: textValue(item.experienceId, item.id, item.uid, item._id),
    title: textValue(item.title, item.name, item.displayName),
    channel: textValue(item.channel, item.channelType, item.type),
    languages: Array.isArray(item.languages) ? item.languages.map(String) : [],
    brands: Array.isArray(item.brands) ? item.brands.map((brand) => textValue(brand?.name, brand)).filter(Boolean) : [],
    campaigns: Array.isArray(item.campaigns) ? item.campaigns.map((campaign) => textValue(campaign?.name, campaign)).filter(Boolean) : [],
    createdAt: item.createdAt || null,
    modifiedAt: item.modifiedAt || item.updatedAt || null,
    selfLink: textValue(item.selfLink, item.links?.self),
  };
}

function createAdobeApiCapabilityService(deps) {
  const { getAccessToken, getClientId, getImsOrg } = deps;
  if (typeof getAccessToken !== 'function' || typeof getClientId !== 'function' || typeof getImsOrg !== 'function') {
    throw new Error('createAdobeApiCapabilityService requires getAccessToken, getClientId, and getImsOrg.');
  }

  function headers(token, sandbox) {
    return {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'x-api-key': getClientId(),
      'x-gw-ims-org-id': getImsOrg(),
      ...(sandbox ? { 'x-sandbox-name': sandbox } : {}),
    };
  }

  async function listAjoAddresses({ sandbox, type = 'client', limit = 20 } = {}) {
    const safeType = String(type).trim().toLowerCase();
    if (!['client', 'allowed'].includes(safeType)) {
      throw Object.assign(new Error('type must be client or allowed.'), { status: 400 });
    }
    if (!sandbox) throw Object.assign(new Error('sandbox is required.'), { status: 400 });
    const safeLimit = boundedInt(limit, 20, 1, 100);
    const token = await getAccessToken(TOKEN_PROFILES.ajoSuppressionRead.join(' '));
    const url = new URL(AJO_SUPPRESSION_URL);
    url.searchParams.set('type', safeType);
    url.searchParams.set('limit', String(safeLimit));
    const response = await fetch(url, { method: 'GET', headers: headers(token, sandbox) });
    const data = await readJson(response, 'AJO suppression API');
    return {
      ok: true,
      evidence: 'operation_verified',
      service: 'journey-optimizer',
      sandbox,
      type: safeType,
      limit: safeLimit,
      count: firstArray(data).length,
      redacted: true,
      data: redactAddresses(data),
    };
  }

  async function listGenstudioExperiences({ limit = 20, cursor, channel, language } = {}) {
    const safeLimit = boundedInt(limit, 20, 1, 50);
    const token = await getAccessToken(TOKEN_PROFILES.genstudioRead.join(' '));
    const url = new URL(GENSTUDIO_EXPERIENCES_URL);
    url.searchParams.set('limit', String(safeLimit));
    if (cursor) url.searchParams.set('cursor', String(cursor).slice(0, 2_000));
    if (channel) url.searchParams.set('channel', String(channel).slice(0, 100));
    if (language) url.searchParams.set('language', String(language).slice(0, 40));
    const response = await fetch(url, { method: 'GET', headers: headers(token) });
    const data = await readJson(response, 'GenStudio Experience API');
    const experiences = firstArray(data).map(normalizeExperience).filter((item) => item.id);
    return {
      ok: true,
      evidence: 'operation_verified',
      service: 'genstudio',
      limit: safeLimit,
      count: experiences.length,
      experiences,
      page: data?._page || data?.page || data?.pagination || null,
      note: 'Only approved Experience summaries are returned. Asset rendition URLs require a separate bounded lookup.',
    };
  }

  return { catalog: capabilityCatalog, listAjoAddresses, listGenstudioExperiences };
}

module.exports = {
  AJO_SUPPRESSION_URL,
  GENSTUDIO_EXPERIENCES_URL,
  boundedInt,
  redactAddresses,
  normalizeExperience,
  createAdobeApiCapabilityService,
};
