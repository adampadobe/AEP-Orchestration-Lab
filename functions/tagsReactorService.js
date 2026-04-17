/**
 * Adobe Experience Platform Tags — Reactor API (reactor.adobe.io).
 * JSON:API resources: companies, properties, etc.
 */

const REACTOR_BASE = 'https://reactor.adobe.io';

function reactorHeaders(token, clientId, orgId) {
  return {
    Accept: 'application/vnd.api+json;revision=1',
    'Content-Type': 'application/vnd.api+json',
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
  };
}

function extractReactorError(data, text) {
  if (data && Array.isArray(data.errors) && data.errors[0]) {
    return JSON.stringify(data.errors[0]).slice(0, 800);
  }
  if (data && data.detail) return String(data.detail).slice(0, 800);
  if (data && data.title) return String(data.title).slice(0, 800);
  return String(text || '').slice(0, 800);
}

/**
 * Follow JSON:API pagination via links.next (absolute URLs).
 */
async function reactorPaginate(token, clientId, orgId, relativePath) {
  let url = relativePath.startsWith('http')
    ? relativePath
    : `${REACTOR_BASE}${relativePath.startsWith('/') ? '' : '/'}${relativePath}`;
  const aggregated = [];
  let pagesFetched = 0;
  let lastMeta = null;
  const maxPages = 30;

  while (url && pagesFetched < maxPages) {
    pagesFetched += 1;
    const resp = await fetch(url, { method: 'GET', headers: reactorHeaders(token, clientId, orgId) });
    const text = await resp.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      data = { _parseError: String(e.message || e) };
    }
    if (!resp.ok) {
      return {
        ok: false,
        httpStatus: resp.status,
        error: extractReactorError(data, text),
        items: aggregated,
        pagesFetched,
      };
    }
    if (Array.isArray(data.data)) aggregated.push(...data.data);
    lastMeta = data.meta || null;
    const next = data.links && data.links.next;
    url = typeof next === 'string' && next.startsWith('http') ? next : null;
  }

  return {
    ok: true,
    items: aggregated,
    meta: lastMeta,
    pagesFetched,
  };
}

async function listCompanies(token, clientId, orgId) {
  return reactorPaginate(token, clientId, orgId, '/companies?page[size]=100');
}

async function listProperties(token, clientId, orgId, companyId) {
  const enc = encodeURIComponent(String(companyId || '').trim());
  return reactorPaginate(token, clientId, orgId, `/companies/${enc}/properties?page[size]=100`);
}

/**
 * All Tags “properties” across every company visible to the credentials (may be slow).
 */
async function listAllPropertiesAcrossCompanies(token, clientId, orgId) {
  const companiesResult = await listCompanies(token, clientId, orgId);
  if (!companiesResult.ok) return companiesResult;

  const rows = [];
  const failures = [];

  for (const c of companiesResult.items) {
    const cid = c.id;
    const pr = await listProperties(token, clientId, orgId, cid);
    if (!pr.ok) {
      failures.push({ companyId: cid, httpStatus: pr.httpStatus, error: pr.error });
      continue;
    }
    const cname = (c.attributes && (c.attributes.name || c.attributes.title)) || cid;
    for (const p of pr.items) {
      rows.push({
        companyId: cid,
        companyName: String(cname),
        propertyId: p.id,
        propertyName: (p.attributes && p.attributes.name) || p.id,
      });
    }
  }

  return {
    ok: true,
    rows,
    companiesCount: companiesResult.items.length,
    propertiesCount: rows.length,
    companyPagesFetched: companiesResult.pagesFetched,
    failures,
  };
}

async function probeTagsApiAccess(token, clientId, orgId) {
  const url = `${REACTOR_BASE}/companies?page[size]=1`;
  const resp = await fetch(url, { method: 'GET', headers: reactorHeaders(token, clientId, orgId) });
  const text = await resp.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    data = { _parseError: String(e.message || e) };
  }

  if (resp.status === 401 || resp.status === 403) {
    return {
      ok: false,
      authorized: false,
      httpStatus: resp.status,
      hint:
        'Token cannot access Reactor (Tags). Add the Adobe Experience Platform Launch API product to your Adobe I/O project and extend ADOBE_SCOPES with the Launch/reactor scopes your org requires, then redeploy functions.',
      detail: text.slice(0, 400),
    };
  }

  if (!resp.ok) {
    return {
      ok: false,
      authorized: false,
      httpStatus: resp.status,
      detail: text.slice(0, 500),
    };
  }

  const list = Array.isArray(data.data) ? data.data : [];
  return {
    ok: true,
    authorized: true,
    companiesCount: list.length,
    hint:
      'Tags API is reachable. Create a property in Tags, add the AEP Web SDK extension, set the Edge Configuration ID to your datastream, then copy the Development environment embed code.',
  };
}

module.exports = {
  listCompanies,
  listProperties,
  listAllPropertiesAcrossCompanies,
  probeTagsApiAccess,
};
