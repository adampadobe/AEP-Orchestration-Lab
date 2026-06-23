/**
 * Thin HTTP client for AEP Orchestration Lab public /api/* endpoints.
 * Lab functions remain public invoker in Phase 1; MCP key protects this server only.
 */

const DEFAULT_ORIGIN = 'https://aep-orchestration-lab.web.app';

export function getLabApiOrigin() {
  return String(process.env.AEP_LAB_API_ORIGIN || DEFAULT_ORIGIN).replace(/\/$/, '');
}

/**
 * @param {string} path - e.g. /api/sandboxes
 * @param {object} [opts]
 * @param {string} [opts.method]
 * @param {Record<string, string | number | boolean | undefined | null>} [opts.query]
 * @param {unknown} [opts.body]
 * @param {number} [opts.timeoutMs]
 */
export async function labApiRequest(path, opts = {}) {
  const origin = getLabApiOrigin();
  const method = String(opts.method || 'GET').toUpperCase();
  const url = new URL(path.startsWith('/') ? path : `/${path}`, origin);

  if (opts.query && typeof opts.query === 'object') {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v == null || v === '') continue;
      url.searchParams.set(k, String(v));
    }
  }

  const timeoutMs = opts.timeoutMs ?? 120_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  /** @type {RequestInit} */
  const init = {
    method,
    headers: {
      Accept: 'application/json',
    },
    signal: controller.signal,
  };

  if (opts.body !== undefined && opts.body !== null) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }

  let response;
  try {
    response = await fetch(url.toString(), init);
  } catch (err) {
    clearTimeout(timer);
    const msg = err && err.name === 'AbortError' ? `Lab API timeout after ${timeoutMs}ms` : String(err.message || err);
    return {
      ok: false,
      status: 0,
      url: url.toString(),
      error: msg,
      data: null,
    };
  }
  clearTimeout(timer);

  const contentType = response.headers.get('Content-Type') || '';
  let data;
  if (contentType.toLowerCase().includes('json')) {
    try {
      data = await response.json();
    } catch {
      data = { raw: await response.text() };
    }
  } else {
    data = { raw: (await response.text()).slice(0, 50_000) };
  }

  if (!response.ok) {
    const detail =
      (data && typeof data === 'object' && (data.error || data.detail || data.message)) ||
      response.statusText ||
      `HTTP ${response.status}`;
    return {
      ok: false,
      status: response.status,
      url: url.toString(),
      error: String(detail),
      data,
    };
  }

  return {
    ok: true,
    status: response.status,
    url: url.toString(),
    data,
  };
}

export async function listSandboxes() {
  return labApiRequest('/api/sandboxes');
}

/**
 * @param {object} params
 * @param {string} params.sandbox
 * @param {boolean} [params.refresh]
 */
export async function profileInfraStatusAll({ sandbox, refresh = false }) {
  return labApiRequest('/api/profile-infra/status-all', {
    query: {
      sandbox,
      ...(refresh ? { refresh: '1' } : {}),
    },
    timeoutMs: 180_000,
  });
}

/**
 * @param {object} params
 */
export async function generateProfile(params) {
  const body = {
    email: params.email,
    industry: params.industry,
    sandbox: params.sandbox,
  };
  if (params.attributes && typeof params.attributes === 'object') {
    body.attributes = params.attributes;
  }
  if (params.append_if_existing != null) {
    body.appendIfExisting = params.append_if_existing;
  }
  if (params.test_profile != null) {
    body.testProfile = params.test_profile;
  }
  return labApiRequest('/api/profile/generate', {
    method: 'POST',
    body,
    timeoutMs: 120_000,
  });
}

/**
 * @param {object} params
 */
export async function lookupProfile(params) {
  return labApiRequest('/api/profile/table', {
    query: {
      sandbox: params.sandbox,
      namespace: params.namespace,
      identifier: params.identifier,
    },
    timeoutMs: 120_000,
  });
}

export async function getAttributeOwnership() {
  return labApiRequest('/api/profile/attribute-ownership', {
    timeoutMs: 30_000,
  });
}

/**
 * @param {object} params
 * @param {string} params.industry
 * @param {object} params.body
 */
export async function updateProfile({ industry, body }) {
  const industryKey = String(industry || 'generic').trim().toLowerCase();
  return labApiRequest(`/api/profile/update`, {
    method: 'POST',
    query: { industry: industryKey },
    body,
    timeoutMs: 120_000,
  });
}

/**
 * @param {object} params
 */
export async function getProfileEvents(params) {
  return labApiRequest('/api/profile/events', {
    query: {
      sandbox: params.sandbox,
      namespace: params.namespace,
      identifier: params.identifier,
    },
    timeoutMs: 120_000,
  });
}

/**
 * @param {object} params
 */
export async function getProfileConsent(params) {
  return labApiRequest('/api/profile/consent', {
    query: {
      sandbox: params.sandbox,
      namespace: params.namespace,
      identifier: params.identifier,
    },
    timeoutMs: 120_000,
  });
}

/**
 * @param {object} params
 */
export async function getProfileAudiences(params) {
  return labApiRequest('/api/profile/audiences', {
    query: {
      sandbox: params.sandbox,
      namespace: params.namespace,
      identifier: params.identifier,
    },
    timeoutMs: 120_000,
  });
}

/**
 * GET /api/{industry}-profile-connection?sandbox=
 * @param {object} params
 * @param {string} params.path - e.g. /api/travel-profile-connection
 * @param {string} params.sandbox
 */
export async function getProfileConnection({ path, sandbox }) {
  return labApiRequest(path, {
    query: { sandbox },
    timeoutMs: 60_000,
  });
}

/**
 * POST /api/{industry-route-prefix}-infra/step
 * @param {object} params
 * @param {string} params.routePrefix - e.g. travel-profile
 * @param {string} params.sandbox
 * @param {string} params.step
 */
export async function provisionProfileInfraStep({ routePrefix, sandbox, step }) {
  return labApiRequest(`/api/${routePrefix}-infra/step`, {
    method: 'POST',
    query: { sandbox },
    body: { step },
    timeoutMs: 300_000,
  });
}

/**
 * POST /api/{industry-route-prefix}-infra/enable-profile
 * @param {object} params
 * @param {string} params.routePrefix
 * @param {string} params.sandbox
 */
export async function enableProfileInfra({ routePrefix, sandbox }) {
  return labApiRequest(`/api/${routePrefix}-infra/enable-profile`, {
    method: 'POST',
    query: { sandbox },
    body: {},
    timeoutMs: 300_000,
  });
}

/**
 * GET /api/events/generator-targets?sandbox=
 * @param {object} params
 * @param {string} params.sandbox
 */
export async function listEventTargets({ sandbox }) {
  return labApiRequest('/api/events/generator-targets', {
    query: { sandbox },
    timeoutMs: 60_000,
  });
}

/**
 * POST /api/events/generator — Event Generator (mirrors Profile Viewer Event tool).
 * @param {object} params
 */
export async function sendProfileEvent(params) {
  /** @type {Record<string, unknown>} */
  const body = { sandbox: params.sandbox };
  if (params.email) body.email = params.email;
  if (params.ecid) body.ecid = params.ecid;
  if (params.target_id) body.targetId = params.target_id;
  if (params.event_type) body.eventType = params.event_type;
  if (params.view_name) body.viewName = params.view_name;
  if (params.view_url) body.viewUrl = params.view_url;
  if (params.channel) body.channel = params.channel;
  if (params.orchestration_event_id) body.orchestrationEventID = params.orchestration_event_id;
  if (params.event_id) body.eventID = params.event_id;
  if (params.timestamp) body.timestamp = params.timestamp;
  if (params.public && typeof params.public === 'object') body.public = params.public;
  return labApiRequest('/api/events/generator', {
    method: 'POST',
    body,
    timeoutMs: 120_000,
  });
}

/**
 * POST /api/events/edge — direct Edge interact send (advanced).
 * @param {object} params
 */
export async function sendEdgeEvent(params) {
  /** @type {Record<string, unknown>} */
  const body = { datastreamId: params.datastream_id };
  if (params.raw_payload && typeof params.raw_payload === 'object') {
    body.rawPayload = params.raw_payload;
  } else {
    if (params.email) body.email = params.email;
    if (params.ecid) body.ecid = params.ecid;
    if (params.event_type) body.eventType = params.event_type;
    if (params.view_name) body.viewName = params.view_name;
    if (params.view_url) body.viewUrl = params.view_url;
    if (params.channel) body.channel = params.channel;
    if (params.orchestration_event_id) body.orchestrationEventID = params.orchestration_event_id;
    if (params.event_id) body.eventID = params.event_id;
    if (params.timestamp) body.timestamp = params.timestamp;
    if (params.public && typeof params.public === 'object') body.public = params.public;
  }
  return labApiRequest('/api/events/edge', {
    method: 'POST',
    body,
    timeoutMs: 120_000,
  });
}
