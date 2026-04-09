/**
 * CJA ranked reports for AJO journey metrics on the browse table (Journey Enters, engagement, Delivered, Displays, Clicks).
 * Configure via env: CJA_DATAVIEW_ID, or CJA_DATAVIEW_EXTERNAL_ID / CJA_DATAVIEW_NAME_MATCH, plus optional metric overrides.
 * Requires Customer Journey Analytics API on the Adobe Developer Console project (same IMS org as AEP).
 */
'use strict';

const CJA_BASE = process.env.CJA_BASE || 'https://cja.adobe.io';
/** Optional; echoed in API metadata for documentation. */
const CJA_CONNECTION_ID_DEFAULT = process.env.CJA_CONNECTION_ID || '';
/** Preferred lookup: CJA data view external id (Components → Data view → details). */
const CJA_DATAVIEW_EXTERNAL_ID = process.env.CJA_DATAVIEW_EXTERNAL_ID || '';
/** Comma-separated fragments; data view name must include every fragment (case-insensitive). Fallback if external id returns nothing. */
const CJA_DATAVIEW_NAME_MATCH = process.env.CJA_DATAVIEW_NAME_MATCH || '';
const CJA_DATE_RANGE_ID = process.env.CJA_DATE_RANGE_ID || 'last30Days';
const CJA_METRIC_JOURNEY_ENTERS_DEFAULT_ID = 'adobe_reserved_label.ajo_journeyEnters';
/** AJO journey message metrics (optional CJA columns); override via CJA_METRIC_DELIVERED / DISPLAYS / CLICKS. */
const CJA_METRIC_AJO_DELIVERED_DEFAULT_ID = 'adobe_reserved_label.ajo_delivered';
const CJA_METRIC_AJO_DISPLAYS_DEFAULT_ID = 'adobe_reserved_label.ajo_displays';
const CJA_METRIC_AJO_CLICKS_DEFAULT_ID = 'adobe_reserved_label.ajo_clicks';
const CJA_METRICS_CACHE_MS = Math.min(
  15 * 60 * 1000,
  Math.max(60 * 1000, parseInt(String(process.env.CJA_METRICS_CACHE_MS || '300000'), 10) || 300000),
);
let cjaJourneyMetricsCache = { key: '', expires: 0, payload: null };

function cjaApiHeaders(token, cfg, config) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-api-key': cfg.clientId,
    'x-gw-ims-org-id': config.orgId,
  };
}

function cjaContentArray(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  if (Array.isArray(data.content)) return data.content;
  if (Array.isArray(data.metrics)) return data.metrics;
  if (Array.isArray(data.dimensions)) return data.dimensions;
  return [];
}

/** Every comma-separated fragment must appear in the data view name (case-insensitive). */
function cjaDataViewNameMatches(viewName, patternCsv) {
  const name = String(viewName || '').toLowerCase();
  const parts = String(patternCsv || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return true;
  return parts.every((p) => name.includes(p));
}

/** List/detail payloads may expose the id as id, dataViewId, or reportSuiteId. */
function cjaDataViewRecordId(dv) {
  if (!dv || typeof dv !== 'object') return null;
  const raw = dv.id ?? dv.dataViewId ?? dv.dataviewId ?? dv.reportSuiteId;
  if (raw == null) return null;
  const s = String(raw).trim();
  return s || null;
}

/**
 * POST /reports expects a data view id (docs: rsid / dataId, often `dv_…`).
 * Some responses return a bare UUID; map to `dv_` + hex without dashes.
 */
function normalizeCjaDataViewIdForReports(raw) {
  const s = String(raw ?? '').trim();
  if (!s || s === 'null' || s === 'undefined') return null;
  if (/^dv_/i.test(s)) return s;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return `dv_${s.replace(/-/g, '').toLowerCase()}`;
  }
  return s;
}

async function resolveCjaDataViewIdDetailed(token, cfg, config) {
  const explicit = (process.env.CJA_DATAVIEW_ID || '').trim();
  if (explicit) {
    const id = normalizeCjaDataViewIdForReports(explicit);
    return id ? { id, matchedBy: 'env' } : { id: null, error: 'CJA_DATAVIEW_ID is empty or invalid after trim.' };
  }
  const headers = cjaApiHeaders(token, cfg, config);
  const externalId = (CJA_DATAVIEW_EXTERNAL_ID || '').trim();
  if (externalId) {
    const extUrl = `${CJA_BASE}/data/dataviews?externalIds=${encodeURIComponent(externalId)}&expansion=name&limit=20&page=0`;
    const extRes = await fetch(extUrl, { method: 'GET', headers });
    const extData = await extRes.json().catch(() => ({}));
    if (!extRes.ok) {
      const hint = extData?.message || extData?.error || extData?.reason || JSON.stringify(extData).slice(0, 200);
      return {
        id: null,
        error: `CJA data views by externalIds failed (HTTP ${extRes.status}): ${hint}`,
      };
    }
    const extContent = cjaContentArray(extData);
    if (extContent.length > 0) {
      const dv = extContent[0];
      const rawId = cjaDataViewRecordId(dv);
      const id = normalizeCjaDataViewIdForReports(rawId);
      if (id) {
        return {
          id,
          matchedName: dv?.name,
          matchedBy: 'externalId',
        };
      }
      return {
        id: null,
        error: `CJA data view matched external id but had no usable id field (got ${JSON.stringify(rawId)}).`,
      };
    }
  }
  const patternRaw = CJA_DATAVIEW_NAME_MATCH.trim();
  if (!patternRaw) {
    return {
      id: null,
      error:
        'Set CJA_DATAVIEW_ID, or CJA_DATAVIEW_EXTERNAL_ID (or fix name in CJA), or CJA_DATAVIEW_NAME_MATCH in .env.',
    };
  }
  for (let page = 0; page < 60; page++) {
    const url = `${CJA_BASE}/data/dataviews?expansion=name&limit=100&page=${page}`;
    const res = await fetch(url, { method: 'GET', headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const hint = data?.message || data?.error || data?.reason || JSON.stringify(data).slice(0, 200);
      return {
        id: null,
        error: `CJA list data views failed (HTTP ${res.status}): ${hint}. In Adobe Developer Console, add the Customer Journey Analytics API to this project and ensure ADOBE_CLIENT_ID matches that project.`,
      };
    }
    const content = cjaContentArray(data);
    for (const dv of content) {
      const name = dv?.name || '';
      if (cjaDataViewNameMatches(name, patternRaw)) {
        const rawId = cjaDataViewRecordId(dv);
        const id = normalizeCjaDataViewIdForReports(rawId);
        if (id) return { id, matchedName: name, matchedBy: 'name' };
      }
    }
    const pageSize = content.length;
    if (pageSize === 0 || pageSize < 100 || data.lastPage === true) break;
  }
  const extHint = externalId ? ` External id tried: ${externalId}.` : '';
  return {
    id: null,
    error: `No data view matched.${extHint} Name fragments: ${patternRaw.replace(/,/g, ' + ')}. Set CJA_DATAVIEW_ID=dv_… or correct CJA_DATAVIEW_EXTERNAL_ID.`,
  };
}

async function fetchCjaDataViewMetricsAndDimensions(dataViewId, token, cfg, config) {
  const headers = cjaApiHeaders(token, cfg, config);
  const [mRes, dRes] = await Promise.all([
    fetch(`${CJA_BASE}/data/dataviews/${encodeURIComponent(dataViewId)}/metrics?limit=1000`, {
      method: 'GET',
      headers,
    }),
    fetch(
      `${CJA_BASE}/data/dataviews/${encodeURIComponent(dataViewId)}/dimensions?includeType=shared&limit=1000`,
      { method: 'GET', headers },
    ),
  ]);
  const metricsJson = await mRes.json().catch(() => ({}));
  const dimensionsJson = await dRes.json().catch(() => ({}));
  const metrics = cjaContentArray(metricsJson);
  const dimensions = cjaContentArray(dimensionsJson);
  return { metrics, dimensions, metricsOk: mRes.ok, dimensionsOk: dRes.ok };
}

function dimensionLabel(d) {
  return `${d.name || ''} ${d.title || ''} ${d.description || ''}`;
}

function pickJourneyDimensionId(dimensions) {
  const forced = (process.env.CJA_DIMENSION_JOURNEY || '').trim();
  if (forced) return forced;
  for (const d of dimensions) {
    const id = String(d.id || d.dimensionId || '');
    const label = dimensionLabel(d);
    if (/journey\s*name(\s+and\s+version)?/i.test(label)) return id;
  }
  for (const d of dimensions) {
    const id = String(d.id || d.dimensionId || '');
    if (/journeyName/i.test(id) || /ajo_.*journey.*name/i.test(id)) return id;
  }
  for (const d of dimensions) {
    const id = String(d.id || d.dimensionId || '');
    const name = String(d.name || d.title || '');
    if (/ajo.*journey.*id/i.test(id) || /journey\s*id/i.test(name)) return id;
  }
  for (const d of dimensions) {
    const id = String(d.id || d.dimensionId || '');
    if (/ajo/i.test(id) && /journey/i.test(id)) return id;
  }
  return null;
}

function pickMetricIdByLabel(metrics, re) {
  for (const m of metrics) {
    const label = `${m.name || ''} ${m.title || ''} ${m.description || ''}`;
    if (re.test(label)) return m.id || m.metricId || null;
  }
  return null;
}

function pickMetricIdByIdContains(metrics, needle) {
  if (!needle) return null;
  const n = String(needle).toLowerCase();
  for (const m of metrics) {
    const id = String(m.id || m.metricId || '').toLowerCase();
    if (id.includes(n)) return m.id || m.metricId || null;
  }
  return null;
}

/** CJA POST /reports expects metric ids like metrics/adobe_reserved_label.… when the list API omits the prefix. */
function normalizeCjaMetricIdForReport(mid) {
  const s = String(mid || '').trim();
  if (!s) return s;
  if (/^(metrics|cm|calc)\//i.test(s)) return s;
  if (/^adobe_reserved_label\./i.test(s)) return `metrics/${s}`;
  if (/\.ajo_journey/i.test(s) && s.includes('.')) return `metrics/${s}`;
  return s;
}

/**
 * Dimension for journey UUID / version id (merge with Journey Name report so rows match authoring).
 */
function pickJourneyIdDimensionId(dimensions) {
  const forced = (process.env.CJA_DIMENSION_JOURNEY_ID || '').trim();
  if (forced) return forced;
  for (const d of dimensions) {
    const id = String(d.id || d.dimensionId || '');
    const name = String(d.name || d.title || '');
    if (/journey\s*version\s*id/i.test(name) || /journeyversionid/i.test(id)) return id;
  }
  for (const d of dimensions) {
    const id = String(d.id || d.dimensionId || '');
    const name = String(d.name || d.title || '');
    if (/ajo.*journey.*id/i.test(id) || (/journey/i.test(name) && /id/i.test(name) && !/name/i.test(name))) return id;
  }
  for (const d of dimensions) {
    const id = String(d.id || d.dimensionId || '');
    if (/ajo/i.test(id) && /journey/i.test(id) && /id/i.test(id)) return id;
  }
  return null;
}

function pickCjaJourneyMetrics(dimensions, metrics) {
  const dimId = pickJourneyDimensionId(dimensions);
  let entriesId = (process.env.CJA_METRIC_JOURNEY_ENTERS || '').trim() || null;
  let secondId =
    (process.env.CJA_METRIC_JOURNEY_ENGAGEMENT || '').trim() ||
    (process.env.CJA_METRIC_MESSAGES_SENT || '').trim() ||
    null;
  if (!entriesId) {
    entriesId =
      pickMetricIdByIdContains(metrics, CJA_METRIC_JOURNEY_ENTERS_DEFAULT_ID) ||
      pickMetricIdByIdContains(metrics, 'ajo_journeyEnters') ||
      pickMetricIdByLabel(metrics, /journey\s*enters/i) ||
      pickMetricIdByLabel(metrics, /unique\s*journey\s*enters/i);
  }
  if (!secondId) {
    secondId =
      pickMetricIdByIdContains(metrics, 'ajo_journeyEngagement') ||
      pickMetricIdByIdContains(metrics, 'ajo_journey_engagement') ||
      pickMetricIdByLabel(metrics, /journey\s*engagement/i);
  }
  if (!secondId) {
    secondId =
      pickMetricIdByIdContains(metrics, 'ajo_journeyExits') ||
      pickMetricIdByLabel(metrics, /journey\s*exits/i) ||
      pickMetricIdByLabel(metrics, /messages?\s+sent/i) ||
      pickMetricIdByLabel(metrics, /message\s+sends?/i);
  }

  let deliveredId = (process.env.CJA_METRIC_DELIVERED || '').trim() || null;
  let displaysId = (process.env.CJA_METRIC_DISPLAYS || '').trim() || null;
  let clicksId = (process.env.CJA_METRIC_CLICKS || '').trim() || null;
  if (!deliveredId) {
    deliveredId =
      pickMetricIdByIdContains(metrics, 'ajo_delivered') ||
      pickMetricIdByLabel(metrics, /delivered/i) ||
      CJA_METRIC_AJO_DELIVERED_DEFAULT_ID;
  }
  if (!displaysId) {
    displaysId =
      pickMetricIdByIdContains(metrics, 'ajo_displays') || CJA_METRIC_AJO_DISPLAYS_DEFAULT_ID;
  }
  if (!clicksId) {
    clicksId = pickMetricIdByIdContains(metrics, 'ajo_clicks') || CJA_METRIC_AJO_CLICKS_DEFAULT_ID;
  }

  return {
    dimensionId: dimId,
    metricJourneyEnters: entriesId,
    metricMessagesSent: secondId,
    metricDelivered: deliveredId,
    metricDisplays: displaysId,
    metricClicks: clicksId,
  };
}

/** CJA POST /reports often requires both dateRange (ISO span) and dateRangeId. */
function cjaDateRangeGlobalFilter(dateRangeId) {
  const id = dateRangeId || 'last30Days';
  const end = new Date();
  const start = new Date(end.getTime());
  if (id === 'last7Days') start.setDate(start.getDate() - 7);
  else if (id === 'last30Days' || id === 'lastMonth') start.setDate(start.getDate() - 30);
  else if (id === 'last90Days') start.setDate(start.getDate() - 90);
  else if (id === 'thisMonth') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else start.setDate(start.getDate() - 30);
  const fmt = (d) => {
    const iso = d.toISOString();
    return `${iso.slice(0, 19)}.000`;
  };
  return {
    type: 'dateRange',
    dateRange: `${fmt(start)}/${fmt(end)}`,
    dateRangeId: id,
  };
}

function cjaFormatReportError(data, status) {
  const parts = [
    data?.message,
    data?.errorDescription,
    data?.reason,
    data?.error,
    data?.title,
    data?.errorCode && data?.errorDescription ? `${data.errorCode}: ${data.errorDescription}` : null,
    typeof data?.errors === 'string' ? data.errors : null,
  ].filter(Boolean);
  if (parts.length) return `CJA report HTTP ${status}: ${parts.join(' — ')}`;
  try {
    const s = JSON.stringify(data);
    if (s && s !== '{}') return `CJA report HTTP ${status}: ${s.slice(0, 500)}`;
  } catch {
    /* ignore */
  }
  return `CJA report HTTP ${status}`;
}

async function postCjaJourneyReport(dataViewId, dimensionId, metricIdsIn, token, cfg, config) {
  const headers = cjaApiHeaders(token, cfg, config);
  const metricIds = [...new Set((metricIdsIn || []).filter(Boolean))].map((id) => normalizeCjaMetricIdForReport(id));
  const metrics = [];
  for (let i = 0; i < metricIds.length; i++) {
    const m = { columnId: String(i), id: metricIds[i] };
    if (i === 0) m.sort = 'desc';
    metrics.push(m);
  }
  if (!dimensionId || metrics.length === 0) return { ok: false, status: 400, data: { reason: 'missing dimension or metrics' } };
  const rid = normalizeCjaDataViewIdForReports(dataViewId);
  if (!rid) {
    return {
      ok: false,
      status: 400,
      data: { errorCode: 'invalid_data', errorDescription: 'DataId was null', reason: 'missing or invalid CJA data view id' },
    };
  }
  const body = {
    dataId: rid,
    globalFilters: [cjaDateRangeGlobalFilter(CJA_DATE_RANGE_ID)],
    metricContainer: { metrics },
    dimension: dimensionId,
    settings: {
      countRepeatInstances: true,
      includeAnnotations: false,
      limit: 1000,
      page: 0,
      nonesBehavior: 'exclude-nones',
    },
  };
  const res = await fetch(`${CJA_BASE}/reports`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * If the full metric set 400s (e.g. too many columns), retry with enters+second only, then enters only.
 */
async function postCjaJourneyReportWithFallback(dataViewId, dimensionId, metricIds, token, cfg, config) {
  const ids = [...new Set((metricIds || []).filter(Boolean))];
  if (ids.length === 0) {
    return { ok: false, status: 400, data: { reason: 'no metric ids' } };
  }
  let last = await postCjaJourneyReport(dataViewId, dimensionId, ids, token, cfg, config);
  if (last.ok) return last;
  if (last.status !== 400) return last;
  if (ids.length > 2) {
    last = await postCjaJourneyReport(dataViewId, dimensionId, ids.slice(0, 2), token, cfg, config);
    if (last.ok) {
      last.usedMetricsFallback = 'two';
      return last;
    }
    if (last.status !== 400) return last;
  }
  if (ids.length > 1) {
    last = await postCjaJourneyReport(dataViewId, dimensionId, [ids[0]], token, cfg, config);
    if (last.ok) last.usedMetricsFallback = true;
  }
  return last;
}

function cjaNormalizeNameKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function cjaCoerceNumber(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

function cjaExtractMetricValues(row) {
  const d = row?.data;
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') {
    return Object.keys(d)
      .sort()
      .map((k) => d[k]);
  }
  return [];
}

/** Labels CJA may use for the dimension breakdown (value is most common). */
function cjaRowDimensionLabels(row) {
  const raw = row.value ?? row.name ?? row.label ?? row.title ?? row.dimensionValue ?? '';
  const s = String(raw ?? '').trim();
  if (s) return [s];
  if (row.itemId != null && String(row.itemId).trim()) return [String(row.itemId).trim()];
  return [];
}

function cjaIndexDimensionKeys(raw) {
  const out = new Set();
  const s = String(raw || '').trim();
  if (!s) return out;
  const lower = s.toLowerCase();
  const norm = cjaNormalizeNameKey(s);
  out.add(lower);
  out.add(norm);
  const pipe = s.split('|')[0].trim();
  if (pipe && pipe !== s) {
    out.add(pipe.toLowerCase());
    out.add(cjaNormalizeNameKey(pipe));
  }
  const paren = s.replace(/\s*\([^)]*\)\s*$/g, '').trim();
  if (paren && paren !== s) {
    out.add(paren.toLowerCase());
    out.add(cjaNormalizeNameKey(paren));
  }
  return out;
}

function buildCjaMetricLookup(reportData) {
  const byName = new Map();
  const byId = new Map();
  const rows = reportData?.rows || [];
  for (const row of rows) {
    const vals = cjaExtractMetricValues(row);
    const labels = cjaRowDimensionLabels(row);
    if (labels.length === 0) continue;
    for (const label of labels) {
      const keys = cjaIndexDimensionKeys(label);
      for (const k of keys) {
        if (k) byName.set(k, vals);
      }
      const raw = String(label).trim();
      if (/^[0-9a-f-]{36}$/i.test(raw)) {
        byId.set(raw.toLowerCase(), vals);
      }
    }
  }
  return { byName, byId };
}

function lookupCjaVals(lookup, row) {
  const gid = (id) => (id ? lookup.byId.get(String(id).trim().toLowerCase()) : null);
  let vals = gid(row.journeyID) || gid(row.journeyVersionID) || null;
  if (vals && vals.length) return vals;

  const nameKey = row.name ? cjaNormalizeNameKey(row.name) : '';
  const nameLower = row.name ? String(row.name).trim().toLowerCase() : '';
  vals =
    (nameKey && lookup.byName.get(nameKey)) ||
    (nameLower && lookup.byName.get(nameLower)) ||
    (nameKey && lookup.byName.get(nameKey.split('|')[0].trim())) ||
    null;
  if (vals && vals.length) return vals;

  if (nameKey && nameKey.length >= 3) {
    let best = null;
    let bestLen = 0;
    for (const [k, v] of lookup.byName) {
      if (!k || k.length < 3 || !v || v.length === 0) continue;
      if (nameKey === k) continue;
      if (nameKey.includes(k) || k.includes(nameKey)) {
        const len = Math.min(k.length, nameKey.length);
        if (len > bestLen) {
          bestLen = len;
          best = v;
        }
      }
    }
    if (best) return best;
  }
  return null;
}

function applyCjaMetricsToRow(row, lookup, fieldNames) {
  const vals = lookupCjaVals(lookup, row);
  if (!vals || vals.length === 0) return row;
  const names = Array.isArray(fieldNames) && fieldNames.length ? fieldNames : ['cjaJourneyEnters', 'cjaMessagesSent'];
  const next = { ...row };
  for (let i = 0; i < names.length && i < vals.length; i++) {
    const n = cjaCoerceNumber(vals[i]);
    if (Number.isFinite(n)) next[names[i]] = n;
  }
  return next;
}

async function enrichJourneyRowsWithCja(rows, token, cfg, config) {
  if (process.env.CJA_ENABLE_METRICS === '0' || process.env.CJA_ENABLE_METRICS === 'false') {
    return { applied: false, dataViewId: null, message: 'CJA metrics disabled (CJA_ENABLE_METRICS).' };
  }
  let resolved;
  try {
    resolved = await resolveCjaDataViewIdDetailed(token, cfg, config);
  } catch (e) {
    return { applied: false, dataViewId: null, message: e?.message || String(e) };
  }
  const dataViewId = resolved?.id;
  if (!dataViewId) {
    return {
      applied: false,
      dataViewId: null,
      message: resolved?.error || 'Could not resolve CJA data view.',
    };
  }
  const { metrics, dimensions } = await fetchCjaDataViewMetricsAndDimensions(dataViewId, token, cfg, config);
  const picked = pickCjaJourneyMetrics(dimensions, metrics);
  if (!picked.dimensionId || !picked.metricJourneyEnters) {
    return {
      applied: false,
      dataViewId,
      message:
        'CJA data view found but could not resolve journey dimension or Journey enters metric. Set CJA_DIMENSION_JOURNEY, CJA_METRIC_JOURNEY_ENTERS in .env.',
    };
  }
  const fieldNames = [];
  const metricIds = [];
  if (picked.metricJourneyEnters) {
    metricIds.push(picked.metricJourneyEnters);
    fieldNames.push('cjaJourneyEnters');
  }
  if (picked.metricMessagesSent) {
    metricIds.push(picked.metricMessagesSent);
    fieldNames.push('cjaMessagesSent');
  }
  if (picked.metricDelivered) {
    metricIds.push(picked.metricDelivered);
    fieldNames.push('cjaDelivered');
  }
  if (picked.metricDisplays) {
    metricIds.push(picked.metricDisplays);
    fieldNames.push('cjaDisplays');
  }
  if (picked.metricClicks) {
    metricIds.push(picked.metricClicks);
    fieldNames.push('cjaClicks');
  }
  const mergeIdDim =
    process.env.CJA_MERGE_JOURNEY_ID_DIMENSION === '0' || process.env.CJA_MERGE_JOURNEY_ID_DIMENSION === 'false'
      ? null
      : pickJourneyIdDimensionId(dimensions);
  const idMergeKey =
    mergeIdDim && mergeIdDim !== picked.dimensionId ? mergeIdDim : '';
  const cacheKeyBase = `${dataViewId}|${CJA_DATE_RANGE_ID}|${picked.dimensionId}|${metricIds.join('|')}|id:${idMergeKey}`;
  const now = Date.now();
  let reportData = null;
  /** null = full metric set; 'two' = enters+second only; true = enters only */
  let metricsFallbackMode = null;
  const cacheHit = cjaJourneyMetricsCache.key === cacheKeyBase && cjaJourneyMetricsCache.expires > now;
  if (cacheHit) {
    reportData = cjaJourneyMetricsCache.payload;
    metricsFallbackMode =
      cjaJourneyMetricsCache.metricsFallbackMode ??
      (cjaJourneyMetricsCache.metricsFallback ? true : null);
  } else {
    const rep = await postCjaJourneyReportWithFallback(
      dataViewId,
      picked.dimensionId,
      metricIds,
      token,
      cfg,
      config,
    );
    if (!rep.ok) {
      return {
        applied: false,
        dataViewId,
        message: cjaFormatReportError(rep.data, rep.status),
      };
    }
    reportData = rep.data;
    metricsFallbackMode = rep.usedMetricsFallback === 'two' ? 'two' : rep.usedMetricsFallback ? true : null;
    if (idMergeKey && mergeIdDim) {
      const rep2 = await postCjaJourneyReportWithFallback(dataViewId, mergeIdDim, metricIds, token, cfg, config);
      if (rep2.ok) {
        const r1 = reportData?.rows || [];
        const r2 = rep2.data?.rows || [];
        reportData = { ...reportData, rows: [...r1, ...r2] };
      }
    }
    cjaJourneyMetricsCache = {
      key: cacheKeyBase,
      expires: now + CJA_METRICS_CACHE_MS,
      payload: reportData,
      metricsFallbackMode,
    };
  }
  const lookup = buildCjaMetricLookup(reportData);
  for (let i = 0; i < rows.length; i++) {
    rows[i] = applyCjaMetricsToRow(rows[i], lookup, fieldNames);
  }
  const messagesSentSkipped = metricsFallbackMode === true;
  const ajoChannelMetricsSkipped = metricsFallbackMode === 'two';
  return {
    applied: true,
    dataViewId,
    dataViewName: resolved?.matchedName,
    dataViewMatchedBy: resolved?.matchedBy,
    dateRangeId: CJA_DATE_RANGE_ID,
    connectionId: CJA_CONNECTION_ID_DEFAULT,
    dimensionId: picked.dimensionId,
    metricJourneyEnters: picked.metricJourneyEnters,
    metricMessagesSent: messagesSentSkipped ? null : picked.metricMessagesSent || null,
    messagesSentSkipped,
    ajoChannelMetricsSkipped,
    metricDelivered: ajoChannelMetricsSkipped || messagesSentSkipped ? null : picked.metricDelivered || null,
    metricDisplays: ajoChannelMetricsSkipped || messagesSentSkipped ? null : picked.metricDisplays || null,
    metricClicks: ajoChannelMetricsSkipped || messagesSentSkipped ? null : picked.metricClicks || null,
  };
}

module.exports = { enrichJourneyRowsWithCja };
