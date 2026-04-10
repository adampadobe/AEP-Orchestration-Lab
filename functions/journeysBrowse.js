/**
 * Journey browse — list AJO journeys via journey.adobe.io authoring API
 * with fallback to platform.adobe.io/ajo/journey, plus per-journey detail
 * enrichment for entry counts, dates, and author info.
 */

const { enrichJourneyRowsWithCja } = require('./cjaJourneyMetrics');

const CJM_JOURNEY_BASE =
  process.env.CJM_JOURNEY_BASE || 'https://journey.adobe.io/authoring/journeys';
const PLATFORM_AJO_JOURNEY_BASE =
  process.env.PLATFORM_AJO_JOURNEY_BASE || 'https://platform.adobe.io/ajo/journey';
const AJO_PAGE_SIZE = 100;
const DETAIL_CONCURRENCY = 6;

function authoringHeaders(token, clientId, orgId, sandbox) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
  };
}

function platformHeaders(token, clientId, orgId, sandbox) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
  };
}

function extractListArray(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const k of ['results', 'data', 'journeys', 'items', 'content', 'records', 'value']) {
    if (Array.isArray(data[k])) return data[k];
  }
  if (data._embedded && typeof data._embedded === 'object') {
    for (const v of Object.values(data._embedded)) {
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

async function fetchFromAuthoring(start, limit, headers) {
  const base = CJM_JOURNEY_BASE.replace(/\/$/, '');
  const urls = [
    `${base}?start=${start}&limit=${limit}`,
    `${base}?page=${Math.floor(start / AJO_PAGE_SIZE)}&pageSize=${Math.min(AJO_PAGE_SIZE, limit)}`,
    base,
  ];
  let lastData = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'GET', headers });
      const data = await res.json().catch(() => ({}));
      lastData = data;
      if (!res.ok) continue;
      let list = extractListArray(data);
      if (Array.isArray(data) && list.length === 0) list = data;
      if (list.length === 0 && url !== base) continue;
      if (url === base) list = list.slice(start, start + limit);
      return { ok: true, list, meta: data, source: 'journey.authoring' };
    } catch {
      continue;
    }
  }
  return { ok: false, list: [], meta: lastData, source: 'journey.authoring' };
}

async function fetchFromPlatform(start, limit, headers) {
  const startPage = Math.floor(start / AJO_PAGE_SIZE);
  const endPage = Math.floor((start + limit - 1) / AJO_PAGE_SIZE);
  const base = PLATFORM_AJO_JOURNEY_BASE.replace(/\/$/, '');
  const combined = [];
  let lastMeta = null;
  for (let p = startPage; p <= endPage; p++) {
    const url = `${base}?page=${p}&pageSize=${AJO_PAGE_SIZE}`;
    try {
      const res = await fetch(url, { method: 'GET', headers });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, list: [], meta: data, source: 'platform.ajo' };
      lastMeta = data;
      const batch = extractListArray(data);
      combined.push(...batch);
      if (!batch.length || (data.pages != null && p >= data.pages - 1)) break;
    } catch {
      break;
    }
  }
  const offset = start - startPage * AJO_PAGE_SIZE;
  const list = combined.slice(offset, offset + limit);
  return { ok: true, list, meta: lastMeta, source: 'platform.ajo' };
}

function coalesceEntryTotal(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const nested = obj._experience?.journeyOrchestration?.journey;
  const candidates = [
    obj.totalEntryCount,
    obj.totalEntries,
    obj.entryCount,
    obj.entriesCount,
    obj.numberOfEntries,
    obj.profileEntryCount,
    obj.profileEntries,
    obj.metrics?.totalEntries,
    obj.metrics?.entryCount,
    obj.metrics?.entries,
    obj.metrics?.totalProfileEntries,
    obj.statistics?.totalEntries,
    obj.statistics?.entryCount,
    obj.statistics?.totalProfileEntries,
    obj.reporting?.totalEntries,
    obj.reporting?.totalProfileEntries,
    nested?.totalEntryCount,
    nested?.entryCount,
    nested?.statistics?.totalEntries,
    nested?.statistics?.totalProfileEntries,
  ];
  for (const c of candidates) {
    if (c != null && Number.isFinite(Number(c))) return Number(c);
  }
  return null;
}

function normalizeRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const md = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : null;
  const nested = raw._experience?.journeyOrchestration?.journey;

  const latestVer = raw.latestJourneyVersion && typeof raw.latestJourneyVersion === 'object'
    ? raw.latestJourneyVersion : null;
  const journeyVersionID =
    raw.journeyVersionID ?? raw.journeyVersionId ?? raw.versionId ??
    latestVer?.uid ?? latestVer?.journeyVersionID ?? latestVer?.journeyVersionId ?? latestVer?.id ??
    raw.journeyVersion?.id ?? raw.journeyVersion?.journeyVersionID ?? null;
  const journeyID = raw.journeyID ?? raw.journeyId ?? raw.id ?? raw._id ?? raw.uid ?? raw.journey?.id ?? null;

  const name =
    raw.itemName ?? raw.name ?? nested?.itemName ?? nested?.name ??
    latestVer?.name ?? latestVer?.itemName ??
    raw.label ?? raw.title ?? raw.journeyName ?? raw.displayName ?? null;

  const tags = raw.tags ?? raw.tagList ?? raw.labels;
  const tagArray = Array.isArray(tags)
    ? tags.map((t) => (typeof t === 'string' ? t : t?.name ?? t?.label ?? String(t))).filter(Boolean)
    : [];

  const status = raw.status ?? raw.state ?? latestVer?.status ?? latestVer?.state ??
    raw.lifecycleState ?? raw.journeyStatus ?? null;

  const versionRaw = raw.version ?? raw.versionNumber ??
    latestVer?.journeyVersion ?? latestVer?.version ?? latestVer?.authoringFormatVersion ??
    (typeof raw.journeyVersion === 'number' ? raw.journeyVersion : raw.journeyVersion?.version) ??
    raw.currentVersion?.version ?? raw.authoringFormatVersion ?? null;
  const versionNum = versionRaw != null && Number.isFinite(Number(versionRaw))
    ? Number(versionRaw) : null;

  const createdAt =
    md?.createdAt ?? raw.createdAt ?? raw.creationDate ?? raw.createdDate ??
    raw.created ?? raw.dateCreated ?? null;
  const updatedAt =
    md?.lastModifiedAt ?? raw.updatedAt ?? raw.lastUpdateDate ?? raw.lastModified ??
    raw.modifiedAt ?? raw.updatedDate ?? raw.dateModified ?? raw.modified ?? null;
  const createdBy =
    md?.createdBy ?? raw.createdBy ?? raw.createdByUser ?? raw.createdByName ??
    raw.author ?? raw.owner ?? null;
  const updatedBy =
    md?.lastModifiedBy ?? raw.updatedBy ?? raw.lastModifiedBy ?? raw.lastUpdatedBy ??
    raw.modifiedBy ?? raw.updatedByName ?? raw.editor ?? null;
  const lvMd = latestVer?.metadata && typeof latestVer.metadata === 'object' ? latestVer.metadata : null;
  const publishedAt =
    md?.firstDeployedAt ?? md?.lastDeployedAt ??
    lvMd?.firstDeployedAt ?? lvMd?.lastDeployedAt ??
    latestVer?.publishedAt ?? latestVer?.goLiveDate ?? latestVer?.deployedAt ??
    raw.publishedAt ?? raw.publishDate ?? raw.publishedDate ?? raw.datePublished ?? raw.goLiveDate ?? null;
  const publishedBy =
    md?.firstDeployedBy ?? md?.lastDeployedBy ??
    lvMd?.firstDeployedBy ?? lvMd?.lastDeployedBy ??
    latestVer?.publishedBy ??
    raw.publishedBy ?? raw.publishedByUser ?? raw.publishedByName ?? raw.publisher ?? null;

  const entryTotal = coalesceEntryTotal(raw);

  return {
    journeyID,
    journeyVersionID,
    name: name != null ? String(name).trim() || null : null,
    version: versionNum,
    status: status != null ? String(status) : null,
    tags: tagArray,
    entryTotal,
    createdAt,
    updatedAt,
    createdBy: createdBy != null ? String(createdBy) : null,
    updatedBy: updatedBy != null ? String(updatedBy) : null,
    publishedAt,
    publishedBy: publishedBy != null ? String(publishedBy) : null,
  };
}

async function fetchJourneyDetail(id, authHdrs, platHdrs) {
  if (!id) return null;
  const trimmed = String(id).trim();
  const authoringUrl = `${CJM_JOURNEY_BASE.replace(/\/$/, '')}/${encodeURIComponent(trimmed)}`;
  let authoringData = null;
  try {
    const res = await fetch(authoringUrl, { method: 'GET', headers: authHdrs });
    authoringData = await res.json().catch(() => ({}));
    if (!res.ok) authoringData = null;
  } catch { /* ignore */ }

  let platformData = null;
  const platformUrl = `${PLATFORM_AJO_JOURNEY_BASE.replace(/\/$/, '')}/${encodeURIComponent(trimmed)}`;
  try {
    const res = await fetch(platformUrl, { method: 'GET', headers: platHdrs });
    platformData = await res.json().catch(() => ({}));
    if (!res.ok) platformData = null;
  } catch { /* ignore */ }

  if (authoringData && platformData) {
    return { ...platformData, ...authoringData, _platformData: platformData };
  }
  return authoringData || platformData;
}

async function enrichFromDetailApi(rows, authHdrs, platHdrs) {
  const needIdx = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const id = r.journeyVersionID || r.journeyID;
    if (!id) continue;
    if (!r.name || r.entryTotal == null || !r.createdAt || !r.updatedAt || !r.publishedAt || r.version == null) {
      needIdx.push(i);
    }
  }
  for (let i = 0; i < needIdx.length; i += DETAIL_CONCURRENCY) {
    const slice = needIdx.slice(i, i + DETAIL_CONCURRENCY);
    await Promise.all(
      slice.map(async (idx) => {
        const r = rows[idx];
        const id = r.journeyVersionID || r.journeyID;
        const payload = await fetchJourneyDetail(id, authHdrs, platHdrs);
        if (!payload) return;
        const detail = normalizeRow(payload);
        if (!detail) return;
        const next = { ...r };
        if (!next.name && detail.name) next.name = detail.name;
        if (next.entryTotal == null && detail.entryTotal != null) next.entryTotal = detail.entryTotal;
        if (next.version == null && detail.version != null) next.version = detail.version;
        if (!next.createdAt && detail.createdAt) next.createdAt = detail.createdAt;
        if (!next.updatedAt && detail.updatedAt) next.updatedAt = detail.updatedAt;
        if (!next.createdBy && detail.createdBy) next.createdBy = detail.createdBy;
        if (!next.updatedBy && detail.updatedBy) next.updatedBy = detail.updatedBy;
        if (!next.publishedAt && detail.publishedAt) next.publishedAt = detail.publishedAt;
        if (!next.publishedBy && detail.publishedBy) next.publishedBy = detail.publishedBy;
        if (payload._platformData) {
          const pd = payload._platformData;
          const pdMd = pd.metadata && typeof pd.metadata === 'object' ? pd.metadata : null;
          if (!next.publishedAt) {
            next.publishedAt = pdMd?.firstDeployedAt ?? pdMd?.lastDeployedAt ??
              pd.publishedAt ?? pd.publishDate ?? pd.goLiveDate ?? pd.deployedAt ?? null;
          }
          if (!next.publishedBy) {
            next.publishedBy = pdMd?.firstDeployedBy ?? pdMd?.lastDeployedBy ??
              pd.publishedBy ?? null;
          }
          if (next.entryTotal == null) {
            const et = coalesceEntryTotal(pd);
            if (et != null) next.entryTotal = et;
          }
        }
        rows[idx] = next;
      }),
    );
  }
}

async function buildBrowseResponse(sandbox, token, clientId, orgId, start, limit, cjaDataViewId) {
  const authHdrs = authoringHeaders(token, clientId, orgId, sandbox);
  const platHdrs = platformHeaders(token, clientId, orgId, sandbox);

  let result = await fetchFromAuthoring(start, limit, authHdrs);
  if (!result.ok) {
    result = await fetchFromPlatform(start, limit, platHdrs);
  }
  if (!result.ok) {
    const m = result.meta || {};
    const msg = m.message || m.error || m.title || m.reason || 'Journey API error';
    return { ok: false, error: String(msg), journeys: [], source: result.source };
  }

  const rows = result.list.map(normalizeRow).filter(Boolean);

  await enrichFromDetailApi(rows, authHdrs, platHdrs);

  const cjaOpts = cjaDataViewId && String(cjaDataViewId).trim() ? { dataViewId: String(cjaDataViewId).trim() } : {};
  let cjaMeta = { applied: false };
  try {
    cjaMeta = await enrichJourneyRowsWithCja(rows, token, { clientId }, { orgId }, cjaOpts);
  } catch (e) {
    cjaMeta = { applied: false, message: e?.message || String(e) };
  }

  let total = rows.length;
  const meta = result.meta;
  if (meta && typeof meta === 'object' && meta.pages != null && meta.limit != null) {
    total = Number(meta.pages) * Number(meta.limit);
  }

  return {
    ok: true,
    journeys: rows,
    start,
    limit,
    total: Number.isFinite(total) ? total : rows.length,
    source: result.source,
    cja: cjaMeta,
  };
}

module.exports = { buildBrowseResponse };
