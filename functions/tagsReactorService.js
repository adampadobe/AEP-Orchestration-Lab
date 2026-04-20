/**
 * Adobe Experience Platform Tags — Reactor API (reactor.adobe.io).
 * JSON:API resources: companies, properties, etc.
 */

const REACTOR_BASE = 'https://reactor.adobe.io';

/** Best-effort display string if Reactor adds actor fields on the property resource. */
function pickUpdatedBy(attrs) {
  if (!attrs || typeof attrs !== 'object') return '';
  const keys = [
    'updated_by_email',
    'updated_by_name',
    'updated_by_username',
    'last_updated_by_email',
    'last_updated_by_name',
    'revised_by_user_email',
    'revised_by_email',
  ];
  for (const k of keys) {
    const v = attrs[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

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
 * Data elements for a Tag property (Reactor: GET /properties/{id}/data_elements).
 */
function mapDataElementResource(d) {
  const a = d.attributes && typeof d.attributes === 'object' ? d.attributes : {};
  let settingsPreview = '';
  const rawSettings = a.settings;
  if (rawSettings != null) {
    const s = typeof rawSettings === 'string' ? rawSettings : JSON.stringify(rawSettings);
    settingsPreview = s.length > 240 ? `${s.slice(0, 237)}…` : s;
  }
  const rel = d.relationships && typeof d.relationships === 'object' ? d.relationships : {};
  let extensionId = '';
  if (rel.extension && rel.extension.data && rel.extension.data.id) {
    extensionId = String(rel.extension.data.id);
  } else if (rel.extension_package && rel.extension_package.data && rel.extension_package.data.id) {
    extensionId = String(rel.extension_package.data.id);
  }
  return {
    elementId: d.id != null ? String(d.id) : '',
    name: a.name != null ? String(a.name) : '',
    delegateDescriptorId: a.delegate_descriptor_id != null ? String(a.delegate_descriptor_id) : '',
    enabled: a.enabled !== false,
    dirty: a.dirty === true,
    createdAt: a.created_at != null ? String(a.created_at) : '',
    updatedAt: a.updated_at != null ? String(a.updated_at) : '',
    extensionId,
    settingsPreview,
  };
}

async function listDataElements(token, clientId, orgId, propertyId) {
  const id = String(propertyId || '').trim();
  if (!id) {
    return { ok: false, httpStatus: 400, error: 'propertyId is required', items: [], pagesFetched: 0 };
  }
  const enc = encodeURIComponent(id);
  const result = await reactorPaginate(
    token,
    clientId,
    orgId,
    `/properties/${enc}/data_elements?page[size]=100`,
  );
  if (!result.ok) return result;
  return {
    ...result,
    items: Array.isArray(result.items) ? result.items.map(mapDataElementResource) : [],
  };
}

function mapExtensionResource(d) {
  const a = d.attributes && typeof d.attributes === 'object' ? d.attributes : {};
  const rel = d.relationships && typeof d.relationships === 'object' ? d.relationships : {};
  let packageId = '';
  if (rel.extension_package && rel.extension_package.data && rel.extension_package.data.id) {
    packageId = String(rel.extension_package.data.id);
  }
  const name = a.display_name != null ? String(a.display_name) : a.name != null ? String(a.name) : '';
  return {
    extensionId: d.id != null ? String(d.id) : '',
    name,
    delegateDescriptorId: a.delegate_descriptor_id != null ? String(a.delegate_descriptor_id) : '',
    packageId,
    enabled: a.enabled !== false,
    updatedAt: a.updated_at != null ? String(a.updated_at) : '',
  };
}

function mapRuleResource(d) {
  const a = d.attributes && typeof d.attributes === 'object' ? d.attributes : {};
  return {
    ruleId: d.id != null ? String(d.id) : '',
    name: a.name != null ? String(a.name) : '',
    enabled: a.enabled !== false,
    updatedAt: a.updated_at != null ? String(a.updated_at) : '',
  };
}

function mapHostResource(d) {
  const a = d.attributes && typeof d.attributes === 'object' ? d.attributes : {};
  return {
    hostId: d.id != null ? String(d.id) : '',
    name: a.name != null ? String(a.name) : '',
    typeOf: a.type_of != null ? String(a.type_of) : a.type != null ? String(a.type) : '',
    status: a.status != null ? String(a.status) : '',
    updatedAt: a.updated_at != null ? String(a.updated_at) : '',
  };
}

/**
 * CDN script src for embed (see Environments API: path + library_path + library_name).
 */
function buildEnvironmentScriptSrcUrl(attrs) {
  if (!attrs || typeof attrs !== 'object') return '';
  const rawBase = attrs.path != null ? String(attrs.path).trim() : '';
  const lp = attrs.library_path != null ? String(attrs.library_path).replace(/^\/+|\/+$/g, '') : '';
  const ln = attrs.library_name != null ? String(attrs.library_name).trim() : '';
  if (!lp || !ln) return '';
  const base = rawBase.replace(/\/+$/, '');
  if (base) {
    return `${base}/${lp}/${ln}`;
  }
  return `https://assets.adobedtm.com/${lp}/${ln}`;
}

function mapEnvironmentResource(d) {
  const a = d.attributes && typeof d.attributes === 'object' ? d.attributes : {};
  const scriptUrl = buildEnvironmentScriptSrcUrl(a);
  return {
    environmentId: d.id != null ? String(d.id) : '',
    name: a.name != null ? String(a.name) : '',
    stage: a.stage != null ? String(a.stage) : '',
    archive: a.archive === true,
    path: a.path != null ? String(a.path) : '',
    libraryPath: a.library_path != null ? String(a.library_path) : '',
    libraryName: a.library_name != null ? String(a.library_name) : '',
    scriptUrl,
    updatedAt: a.updated_at != null ? String(a.updated_at) : '',
  };
}

function mapLibraryResource(d) {
  const a = d.attributes && typeof d.attributes === 'object' ? d.attributes : {};
  return {
    libraryId: d.id != null ? String(d.id) : '',
    name: a.name != null ? String(a.name) : '',
    state: a.state != null ? String(a.state) : '',
    updatedAt: a.updated_at != null ? String(a.updated_at) : '',
  };
}

function mapRuleComponentResource(d) {
  const a = d.attributes && typeof d.attributes === 'object' ? d.attributes : {};
  // Reactor stores settings as a JSON-encoded string; surface both the raw
  // string and a best-effort parsed object so clients can inspect surfaces,
  // decisionScopes, etc.
  let settingsParsed = null;
  if (typeof a.settings === 'string' && a.settings.trim()) {
    try { settingsParsed = JSON.parse(a.settings); } catch (_e) { settingsParsed = null; }
  } else if (a.settings && typeof a.settings === 'object') {
    settingsParsed = a.settings;
  }
  return {
    componentId: d.id != null ? String(d.id) : '',
    name: a.name != null ? String(a.name) : '',
    delegateDescriptorId: a.delegate_descriptor_id != null ? String(a.delegate_descriptor_id) : '',
    order: a.order != null ? Number(a.order) : null,
    enabled: a.enabled !== false,
    updatedAt: a.updated_at != null ? String(a.updated_at) : '',
    settingsRaw: typeof a.settings === 'string' ? a.settings : null,
    settings: settingsParsed,
  };
}

async function listPropertySubpath(
  token,
  clientId,
  orgId,
  propertyId,
  subpath,
  mapper,
) {
  const id = String(propertyId || '').trim();
  if (!id) {
    return { ok: false, httpStatus: 400, error: 'propertyId is required', items: [], pagesFetched: 0 };
  }
  const enc = encodeURIComponent(id);
  const result = await reactorPaginate(
    token,
    clientId,
    orgId,
    `/properties/${enc}/${subpath}?page[size]=100`,
  );
  if (!result.ok) return result;
  return {
    ...result,
    items: Array.isArray(result.items) ? result.items.map(mapper) : [],
  };
}

async function listExtensions(token, clientId, orgId, propertyId) {
  return listPropertySubpath(token, clientId, orgId, propertyId, 'extensions', mapExtensionResource);
}

async function listRules(token, clientId, orgId, propertyId) {
  return listPropertySubpath(token, clientId, orgId, propertyId, 'rules', mapRuleResource);
}

async function listHosts(token, clientId, orgId, propertyId) {
  return listPropertySubpath(token, clientId, orgId, propertyId, 'hosts', mapHostResource);
}

async function listEnvironments(token, clientId, orgId, propertyId) {
  return listPropertySubpath(token, clientId, orgId, propertyId, 'environments', mapEnvironmentResource);
}

async function listLibraries(token, clientId, orgId, propertyId) {
  return listPropertySubpath(token, clientId, orgId, propertyId, 'libraries', mapLibraryResource);
}

async function listRuleComponents(token, clientId, orgId, ruleId) {
  const id = String(ruleId || '').trim();
  if (!id) {
    return { ok: false, httpStatus: 400, error: 'ruleId is required', items: [], pagesFetched: 0 };
  }
  const enc = encodeURIComponent(id);
  const result = await reactorPaginate(
    token,
    clientId,
    orgId,
    `/rules/${enc}/rule_components?page[size]=100`,
  );
  if (!result.ok) return result;
  return {
    ...result,
    items: Array.isArray(result.items) ? result.items.map(mapRuleComponentResource) : [],
  };
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
      const a = p.attributes && typeof p.attributes === 'object' ? p.attributes : {};
      rows.push({
        companyId: cid,
        companyName: String(cname),
        propertyId: p.id,
        propertyName: a.name || p.id,
        platform: a.platform != null ? String(a.platform) : '',
        development: a.development === true,
        domains: Array.isArray(a.domains) ? a.domains.slice(0) : [],
        createdAt: a.created_at != null ? String(a.created_at) : '',
        updatedAt: a.updated_at != null ? String(a.updated_at) : '',
        updatedBy: pickUpdatedBy(a),
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

/**
 * GET a single rule_component resource, including its current settings
 * string. Needed before a PATCH so we can preserve a current revision
 * pointer and return before/after values.
 */
async function getRuleComponent(token, clientId, orgId, componentId) {
  const id = String(componentId || '').trim();
  if (!id) return { ok: false, httpStatus: 400, error: 'componentId is required' };
  const url = REACTOR_BASE + '/rule_components/' + encodeURIComponent(id);
  let resp;
  try {
    resp = await fetch(url, { method: 'GET', headers: reactorHeaders(token, clientId, orgId) });
  } catch (e) {
    return { ok: false, httpStatus: 0, error: String(e && e.message || e) };
  }
  const text = await resp.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_e) { data = {}; }
  if (!resp.ok) {
    return { ok: false, httpStatus: resp.status, error: extractReactorError(data, text) };
  }
  const d = data && data.data ? data.data : {};
  return { ok: true, httpStatus: resp.status, item: mapRuleComponentResource(d), raw: d };
}

/**
 * PATCH rule_component settings. Reactor stores settings as a JSON-encoded
 * string, so we stringify the object before sending.
 */
async function updateRuleComponentSettings(token, clientId, orgId, componentId, settingsObject, { revision } = {}) {
  const id = String(componentId || '').trim();
  if (!id) return { ok: false, httpStatus: 400, error: 'componentId is required' };
  if (!settingsObject || typeof settingsObject !== 'object') {
    return { ok: false, httpStatus: 400, error: 'settingsObject must be an object' };
  }
  const url = REACTOR_BASE + '/rule_components/' + encodeURIComponent(id);
  const attributes = { settings: JSON.stringify(settingsObject) };
  if (revision) attributes.revision_number = Number(revision);
  const body = {
    data: {
      id,
      type: 'rule_components',
      attributes,
    },
  };
  let resp;
  try {
    resp = await fetch(url, {
      method: 'PATCH',
      headers: reactorHeaders(token, clientId, orgId),
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, httpStatus: 0, error: String(e && e.message || e) };
  }
  const text = await resp.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_e) { data = {}; }
  if (!resp.ok) {
    return { ok: false, httpStatus: resp.status, error: extractReactorError(data, text) };
  }
  const d = data && data.data ? data.data : {};
  return { ok: true, httpStatus: resp.status, item: mapRuleComponentResource(d), raw: d };
}

async function reactorRequest(token, clientId, orgId, method, path, body) {
  const url = REACTOR_BASE + path;
  const init = {
    method,
    headers: reactorHeaders(token, clientId, orgId),
  };
  if (body != null) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  let resp;
  try { resp = await fetch(url, init); }
  catch (e) { return { ok: false, httpStatus: 0, error: String((e && e.message) || e) }; }
  const text = await resp.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_e) { data = {}; }
  if (!resp.ok) {
    return { ok: false, httpStatus: resp.status, error: extractReactorError(data, text), raw: data };
  }
  return { ok: true, httpStatus: resp.status, data };
}

/**
 * POST /properties/:propertyId/libraries — create a new library in
 * `development` state, ready to accept resources.
 */
async function createLibrary(token, clientId, orgId, propertyId, { name }) {
  const pid = String(propertyId || '').trim();
  if (!pid) return { ok: false, httpStatus: 400, error: 'propertyId is required' };
  const body = {
    data: {
      type: 'libraries',
      attributes: { name: String(name || 'AEP Lab auto-build ' + new Date().toISOString().slice(0, 19)) },
    },
  };
  const r = await reactorRequest(token, clientId, orgId, 'POST', '/properties/' + encodeURIComponent(pid) + '/libraries', body);
  if (!r.ok) return r;
  const d = (r.data && r.data.data) || {};
  return { ok: true, httpStatus: r.httpStatus, item: mapLibraryResource(d), raw: d };
}

/**
 * PATCH /libraries/:libraryId/relationships/environment — bind the library
 * to the Development environment so builds deploy there automatically.
 */
async function setLibraryEnvironment(token, clientId, orgId, libraryId, environmentId) {
  const lid = String(libraryId || '').trim();
  const eid = String(environmentId || '').trim();
  if (!lid || !eid) return { ok: false, httpStatus: 400, error: 'libraryId and environmentId are required' };
  const body = { data: { type: 'environments', id: eid } };
  const r = await reactorRequest(token, clientId, orgId, 'PATCH',
    '/libraries/' + encodeURIComponent(lid) + '/relationships/environment', body);
  return r.ok ? { ok: true, httpStatus: r.httpStatus } : r;
}

/**
 * POST /libraries/:libraryId/relationships/resources — add resources
 * (rules, data elements, extensions) to a library. Accepts an array of
 * { type, id }.
 */
async function addLibraryResources(token, clientId, orgId, libraryId, resources) {
  const lid = String(libraryId || '').trim();
  if (!lid) return { ok: false, httpStatus: 400, error: 'libraryId is required' };
  const list = Array.isArray(resources) ? resources.filter(r => r && r.type && r.id) : [];
  if (!list.length) return { ok: false, httpStatus: 400, error: 'at least one resource required' };
  const body = { data: list.map(r => ({ type: String(r.type), id: String(r.id) })) };
  const r = await reactorRequest(token, clientId, orgId, 'POST',
    '/libraries/' + encodeURIComponent(lid) + '/relationships/resources', body);
  return r.ok ? { ok: true, httpStatus: r.httpStatus } : r;
}

/**
 * POST /libraries/:libraryId/builds — kick off a build. Build status is
 * polled via getBuild.
 */
async function createBuild(token, clientId, orgId, libraryId) {
  const lid = String(libraryId || '').trim();
  if (!lid) return { ok: false, httpStatus: 400, error: 'libraryId is required' };
  const r = await reactorRequest(token, clientId, orgId, 'POST', '/libraries/' + encodeURIComponent(lid) + '/builds', null);
  if (!r.ok) return r;
  const d = (r.data && r.data.data) || {};
  const a = (d.attributes && typeof d.attributes === 'object') ? d.attributes : {};
  return {
    ok: true,
    httpStatus: r.httpStatus,
    build: {
      buildId: d.id != null ? String(d.id) : '',
      status: a.status != null ? String(a.status) : '',
      createdAt: a.created_at != null ? String(a.created_at) : '',
    },
  };
}

/**
 * GET /builds/:buildId — poll for build status. Terminal states:
 * 'succeeded', 'failed'. Transient: 'pending', 'running'.
 */
async function getBuild(token, clientId, orgId, buildId) {
  const bid = String(buildId || '').trim();
  if (!bid) return { ok: false, httpStatus: 400, error: 'buildId is required' };
  const r = await reactorRequest(token, clientId, orgId, 'GET', '/builds/' + encodeURIComponent(bid));
  if (!r.ok) return r;
  const d = (r.data && r.data.data) || {};
  const a = (d.attributes && typeof d.attributes === 'object') ? d.attributes : {};
  return {
    ok: true,
    httpStatus: r.httpStatus,
    build: {
      buildId: d.id != null ? String(d.id) : '',
      status: a.status != null ? String(a.status) : '',
      createdAt: a.created_at != null ? String(a.created_at) : '',
      updatedAt: a.updated_at != null ? String(a.updated_at) : '',
      tokenPath: a.token && a.token.path ? String(a.token.path) : '',
    },
  };
}

module.exports = {
  listCompanies,
  listProperties,
  listAllPropertiesAcrossCompanies,
  listDataElements,
  listExtensions,
  listRules,
  listHosts,
  listEnvironments,
  listLibraries,
  listRuleComponents,
  getRuleComponent,
  updateRuleComponentSettings,
  createLibrary,
  setLibraryEnvironment,
  addLibraryResources,
  createBuild,
  getBuild,
  probeTagsApiAccess,
};
