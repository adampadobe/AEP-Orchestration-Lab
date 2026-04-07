/**
 * Event Infrastructure — create XDM ExperienceEvent schema + dataset in a sandbox.
 * NOT enabled for Real-Time Customer Profile (no union tag).
 * Follows the same pattern as consentInfraService.js but uses the ExperienceEvent class.
 */

const SCHEMA_REGISTRY = 'https://platform.adobe.io/data/foundation/schemaregistry';
const CATALOG_BASE = 'https://platform.adobe.io/data/foundation/catalog';

const XDM_EXPERIENCE_EVENT_CLASS = 'https://ns.adobe.com/xdm/context/experienceevent';

function log(sandbox, phase, detail = {}) {
  try { console.log('[eventInfra]', JSON.stringify({ sandbox, phase, ...detail })); }
  catch { console.log('[eventInfra]', sandbox, phase); }
}

function headers(token, clientId, orgId, sandbox, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

/* ── Schema operations ── */

async function findSchemaByTitle(token, clientId, orgId, sandbox, title) {
  const url = `${SCHEMA_REGISTRY}/tenant/schemas?limit=100&properties=title,$id,meta:altId,version,meta:class`;
  const h = headers(token, clientId, orgId, sandbox, {
    Accept: 'application/vnd.adobe.xed-id+json',
  });
  const { res, data } = await fetchJson(url, { method: 'GET', headers: h });
  if (!res.ok) return null;
  const results = data.results || [];
  return results.find((s) => String(s.title || '').trim() === title.trim()) || null;
}

async function createEventSchema(token, clientId, orgId, sandbox, schemaTitle) {
  const body = {
    title: schemaTitle,
    type: 'object',
    description: `XDM ExperienceEvent schema for Edge event streaming. Created by AEP Profile Viewer Event Tool. Do NOT enable for Real-Time Customer Profile.`,
    allOf: [{ $ref: XDM_EXPERIENCE_EVENT_CLASS }],
    'meta:class': XDM_EXPERIENCE_EVENT_CLASS,
  };

  const url = `${SCHEMA_REGISTRY}/tenant/schemas`;
  const acceptOrder = [
    'application/vnd.adobe.xed+json',
    'application/vnd.adobe.xed+json;version=1',
    'application/json',
  ];

  let lastErr = 'Unknown';
  for (const accept of acceptOrder) {
    const h = headers(token, clientId, orgId, sandbox, {
      Accept: accept,
    });
    const { res, data } = await fetchJson(url, {
      method: 'POST',
      headers: h,
      body: JSON.stringify(body),
    });
    if (res.ok) {
      log(sandbox, 'createSchema.ok', { title: schemaTitle, schemaId: data.$id });
      return data;
    }
    lastErr = data.message || data.title || data.detail || res.statusText || String(res.status);
    log(sandbox, 'createSchema.try', { httpStatus: res.status, accept, err: String(lastErr).slice(0, 160) });
    if (res.status !== 415 && res.status !== 406) {
      throw new Error(`Create schema failed: ${lastErr}`);
    }
  }
  throw new Error(`Create schema failed: ${lastErr}`);
}

/* ── Dataset operations ── */

function flattenDatasets(pages) {
  const rows = [];
  for (const p of pages) {
    if (!p || typeof p !== 'object') continue;
    if (Array.isArray(p.children)) rows.push(...p.children);
    if (Array.isArray(p.results)) rows.push(...p.results);
    for (const [k, v] of Object.entries(p)) {
      if (k.startsWith('_')) continue;
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      if (/^[0-9a-f]{24}$/i.test(k) || typeof v.name === 'string' || v.schemaRef) {
        rows.push({ ...v, id: v.id || k });
      }
    }
  }
  return rows;
}

async function findDatasetByName(token, clientId, orgId, sandbox, name) {
  const url = `${CATALOG_BASE}/dataSets?limit=50&properties=name,schemaRef,tags&property=${encodeURIComponent(`name==${name}`)}`;
  const { res, data } = await fetchJson(url, { method: 'GET', headers: headers(token, clientId, orgId, sandbox) });
  if (!res.ok) return null;
  const rows = flattenDatasets([data]);
  return rows.find((d) => String(d.name || '') === name) || null;
}

async function createDataset(token, clientId, orgId, sandbox, schemaId, name) {
  const body = {
    name,
    description: 'XDM ExperienceEvent dataset for Edge event streaming. Created by AEP Profile Viewer Event Tool. Do not enable for Real-Time Customer Profile.',
    schemaRef: {
      id: schemaId,
      contentType: 'application/vnd.adobe.xed+json;version=1',
    },
  };
  const url = `${CATALOG_BASE}/dataSets`;
  const { res, data } = await fetchJson(url, {
    method: 'POST',
    headers: {
      ...headers(token, clientId, orgId, sandbox),
      Accept: 'application/vnd.adobe.xdm+json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = data.message || data.title || data.detail || res.statusText;
    throw new Error(`Create dataset failed: ${msg}`);
  }
  if (Array.isArray(data) && data[0] && typeof data[0] === 'string') {
    const m = data[0].match(/@\/dataSets\/([0-9a-fA-F]+)/);
    if (m) return { id: m[1] };
  }
  if (data && data.id) return data;
  return { id: null, raw: data };
}

/* ── Status — check what exists ── */

async function runEventInfraStatus(sandbox, token, clientId, orgId, schemaTitle, datasetName) {
  log(sandbox, 'status.start', { schemaTitle, datasetName });

  const schema = await findSchemaByTitle(token, clientId, orgId, sandbox, schemaTitle);
  const schemaFound = !!schema;
  const schemaId = schema ? schema.$id : null;
  const schemaMetaAltId = schema ? schema['meta:altId'] : null;

  let datasetFound = false;
  let datasetId = null;
  if (datasetName) {
    const ds = await findDatasetByName(token, clientId, orgId, sandbox, datasetName);
    if (ds) { datasetFound = true; datasetId = ds.id; }
  }

  log(sandbox, 'status.complete', { schemaFound, datasetFound });
  return { ok: true, sandbox, schemaFound, schemaId, schemaMetaAltId, datasetFound, datasetId };
}

/* ── Step-based provisioning ── */

async function runEventInfraStep(sandbox, token, clientId, orgId, step, opts = {}) {
  log(sandbox, 'step', { step, opts: Object.keys(opts) });

  if (step === 'createSchema') {
    const title = String(opts.schemaTitle || '').trim();
    if (!title) return { ok: false, error: 'schemaTitle is required.' };

    const existing = await findSchemaByTitle(token, clientId, orgId, sandbox, title);
    if (existing) {
      return {
        ok: true, sandbox, step, skipped: true,
        schemaId: existing.$id,
        schemaMetaAltId: existing['meta:altId'],
        message: `Schema "${title}" already exists.`,
      };
    }
    const created = await createEventSchema(token, clientId, orgId, sandbox, title);
    return {
      ok: true, sandbox, step, schemaCreated: true,
      schemaId: created.$id,
      schemaMetaAltId: created['meta:altId'],
      message: `Schema "${title}" created (ExperienceEvent class, not Profile-enabled).`,
    };
  }

  if (step === 'createDataset') {
    const schemaTitle = String(opts.schemaTitle || '').trim();
    const datasetName = String(opts.datasetName || '').trim();
    if (!schemaTitle) return { ok: false, error: 'schemaTitle is required to find the schema.' };
    if (!datasetName) return { ok: false, error: 'datasetName is required.' };

    const schema = await findSchemaByTitle(token, clientId, orgId, sandbox, schemaTitle);
    if (!schema) {
      return { ok: false, error: `Schema "${schemaTitle}" not found. Create the schema first.` };
    }

    const existing = await findDatasetByName(token, clientId, orgId, sandbox, datasetName);
    if (existing) {
      return {
        ok: true, sandbox, step, skipped: true,
        schemaId: schema.$id,
        datasetId: existing.id,
        message: `Dataset "${datasetName}" already exists.`,
      };
    }

    const dsRes = await createDataset(token, clientId, orgId, sandbox, schema.$id, datasetName);
    return {
      ok: true, sandbox, step, datasetCreated: true,
      schemaId: schema.$id,
      datasetId: dsRes.id,
      message: `Dataset "${datasetName}" created (not Profile-enabled). Now create a Datastream in AEP Data Collection pointing to this dataset.`,
    };
  }

  return { ok: false, error: `Unknown step: ${step}. Use createSchema or createDataset.` };
}

module.exports = { runEventInfraStatus, runEventInfraStep };
