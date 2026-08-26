/**
 * Thin HTTP client for AEP Orchestration Lab public /api/* endpoints.
 * Lab functions remain public invoker in Phase 1; MCP key protects this server only.
 */

import { getRequestMcpApiKey } from './requestContext.mjs';
import { buildGeneratorPostBody } from './framework/buildGeneratorPostBody.mjs';

const DEFAULT_ORIGIN = 'https://aep-orchestration-lab.web.app';

export function getLabApiOrigin() {
  return String(process.env.AEP_LAB_API_ORIGIN || DEFAULT_ORIGIN).replace(/\/$/, '');
}

export function getLabFunctionsOrigin() {
  return String(
    process.env.AEP_LAB_FUNCTIONS_ORIGIN
      || 'https://us-central1-aep-orchestration-lab.cloudfunctions.net',
  ).replace(/\/$/, '');
}

// Retried only for network failures (status 0) and these transient statuses.
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
// 3 retries, ~3.1s worst-case added latency — mirrors the commented
// backoff-ms arrays in functions/profileInfraFactory.js.
const DEFAULT_BACKOFF_MS = [400, 900, 1800];
const SAFE_METHODS = new Set(['GET', 'HEAD']);

async function attemptOnce(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url.toString(), { ...init, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    const msg = err && err.name === 'AbortError' ? `Lab API timeout after ${timeoutMs}ms` : String(err.message || err);
    return { ok: false, status: 0, url: url.toString(), error: msg, data: null };
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
    return { ok: false, status: response.status, url: url.toString(), error: String(detail), data };
  }

  return { ok: true, status: response.status, url: url.toString(), data };
}

/**
 * @param {string} path - e.g. /api/sandboxes
 * @param {object} [opts]
 * @param {string} [opts.method]
 * @param {Record<string, string | number | boolean | undefined | null>} [opts.query]
 * @param {unknown} [opts.body]
 * @param {number} [opts.timeoutMs]
 * @param {string} [opts.origin]
 * @param {boolean} [opts.idempotent] - allow retrying a non-GET/HEAD call (e.g. a read-only POST).
 * @param {number} [opts.retries] - set to 0 to force a single attempt regardless of method.
 * @param {number[]} [opts.retryBackoffMs] - override the default backoff schedule.
 */
export async function labApiRequest(path, opts = {}) {
  const origin = String(opts.origin || getLabApiOrigin()).replace(/\/$/, '');
  const method = String(opts.method || 'GET').toUpperCase();
  const url = new URL(path.startsWith('/') ? path : `/${path}`, origin);

  if (opts.query && typeof opts.query === 'object') {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v == null || v === '') continue;
      url.searchParams.set(k, String(v));
    }
  }

  const timeoutMs = opts.timeoutMs ?? 120_000;

  /** @type {RequestInit} */
  const init = {
    method,
    headers: {
      Accept: 'application/json',
      ...(opts.headers && typeof opts.headers === 'object' ? opts.headers : {}),
    },
  };

  if (opts.body !== undefined && opts.body !== null) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }

  // Only retry calls that are safe to repeat: GET/HEAD by default, or a
  // caller-declared idempotent POST. Mutating calls (creates/updates/deletes)
  // get exactly one attempt unless the caller explicitly opts in, so a
  // timeout never risks a double-mutation.
  const allowRetry = opts.retries !== 0 && (SAFE_METHODS.has(method) || opts.idempotent === true);
  const backoff = Array.isArray(opts.retryBackoffMs) ? opts.retryBackoffMs : DEFAULT_BACKOFF_MS;
  const maxAttempts = allowRetry ? backoff.length + 1 : 1;

  let result;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    result = await attemptOnce(url, init, timeoutMs);
    const isLastAttempt = attempt === maxAttempts - 1;
    const isTransient = result.status === 0 || RETRYABLE_STATUSES.has(result.status);
    if (result.ok || isLastAttempt || !isTransient) break;
    console.warn(
      `[labApiClient] retrying ${method} ${url.pathname} after status ${result.status} `
        + `(attempt ${attempt + 1}/${maxAttempts}, waiting ${backoff[attempt]}ms): ${result.error}`,
    );
    await new Promise((resolve) => setTimeout(resolve, backoff[attempt]));
  }
  return result;
}

export async function classifyBrandScrapeImages({ sandbox, scrape_id }) {
  return labApiRequest('/brandScraperClassify', {
    origin: getLabFunctionsOrigin(),
    method: 'POST',
    headers: principalAuthHeaders(),
    body: { sandbox, scrapeId: scrape_id },
    timeoutMs: 330_000,
  });
}

export async function listSandboxes() {
  return labApiRequest('/api/sandboxes');
}

/**
 * Trains the Gemini Brand Concierge override directly from an existing brand scrape
 * record (reuses its crawled page text + classified product images — no re-crawl,
 * no manual CSV upload). See functions/bcGeminiPrepService.js.
 * @param {object} params
 * @param {string} params.sandbox
 * @param {string} params.demo_prefix
 * @param {string} params.scrape_id
 */
export async function bcGeminiPrepTrain({ sandbox, demo_prefix, scrape_id }) {
  return labApiRequest('/api/bc-gemini-prep-train', {
    method: 'POST',
    body: { sandbox, demoPrefix: demo_prefix, scrapeId: scrape_id },
    timeoutMs: 60_000,
  });
}

/**
 * Builds a downloadable ZIP (websites.csv, products.csv, notes.txt) from a brand scrape
 * record for either the Gemini override's Train LLM drop or a direct upload into real
 * Adobe Brand Concierge's admin console. See functions/bcGeminiPrepService.js.
 * @param {object} params
 * @param {string} params.sandbox
 * @param {string} params.scrape_id
 * @param {string} [params.demo_prefix]
 */
export async function bcGeminiPrepExport({ sandbox, scrape_id, demo_prefix }) {
  return labApiRequest('/api/bc-gemini-prep-export', {
    method: 'POST',
    body: { sandbox, scrapeId: scrape_id, demoPrefix: demo_prefix },
    timeoutMs: 60_000,
  });
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
 * POST body for setupEventInfra — exported for unit tests.
 * @param {object} params
 * @param {string} params.schemaTitle
 * @param {string} params.datasetName
 */
export function buildSetupEventInfraPostBody({ schemaTitle, datasetName }) {
  return {
    step: 'setupEventInfra',
    schemaTitle,
    datasetName,
  };
}

/**
 * POST /api/events/infra/step — setupEventInfra (schema + field groups + dataset).
 * @param {object} params
 * @param {string} params.sandbox
 * @param {string} params.schemaTitle
 * @param {string} params.datasetName
 */
export async function setupEventInfra({ sandbox, schemaTitle, datasetName, enableForProfile = false }) {
  return labApiRequest('/api/events/infra/step', {
    method: 'POST',
    query: { sandbox },
    body: {
      ...buildSetupEventInfraPostBody({ schemaTitle, datasetName }),
      ...(enableForProfile ? { enable_for_profile: true } : {}),
    },
    timeoutMs: 300_000,
  });
}

/**
 * POST /api/events/infra/step — enableForProfile (union + dataset Profile tags).
 * @param {object} params
 * @param {string} params.sandbox
 * @param {string} [params.schemaTitle]
 * @param {string} [params.schemaId]
 * @param {string} [params.datasetName]
 * @param {string} [params.datasetId]
 */
export async function enableEventProfileInfra({ sandbox, schemaTitle, schemaId, datasetName, datasetId }) {
  return labApiRequest('/api/events/infra/step', {
    method: 'POST',
    query: { sandbox },
    body: {
      step: 'enableForProfile',
      ...(schemaTitle ? { schemaTitle } : {}),
      ...(schemaId ? { schemaId } : {}),
      ...(datasetName ? { datasetName } : {}),
      ...(datasetId ? { datasetId } : {}),
    },
    timeoutMs: 300_000,
  });
}

/**
 * GET /api/events/config?sandbox=
 * @param {object} params
 * @param {string} params.sandbox
 */
export async function getEventConfig({ sandbox }) {
  return labApiRequest('/api/events/config', {
    query: { sandbox },
    timeoutMs: 60_000,
  });
}

/**
 * POST /api/events/generator — Event Generator (mirrors Profile Viewer Event tool).
 * @param {object} params
 */
export async function sendProfileEvent(params) {
  const body = buildGeneratorPostBody(params);
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

/**
 * GET /api/decision-lab/config?sandbox=
 * @param {object} params
 * @param {string} params.sandbox
 */
export async function getDecisionLabConfig({ sandbox }) {
  return labApiRequest('/api/decision-lab/config', {
    query: { sandbox },
    timeoutMs: 60_000,
  });
}

/**
 * GET /api/catalog/config?sandbox=
 * @param {object} params
 * @param {string} params.sandbox
 */
export async function getCatalogConfig({ sandbox }) {
  return labApiRequest('/api/catalog/config', {
    query: { sandbox },
    timeoutMs: 60_000,
  });
}

/**
 * POST /api/decisioning/edge-evaluate
 * @param {object} params
 */
export async function decisioningEdgeEvaluate(params) {
  /** @type {Record<string, unknown>} */
  const body = { sandbox: params.sandbox };
  if (params.email) body.email = params.email;
  if (params.ecid) body.ecid = params.ecid;
  if (params.namespace) body.namespace = params.namespace;
  if (params.mode) body.mode = params.mode;
  if (params.datastream_id) body.datastreamId = params.datastream_id;
  if (params.target_page_url) body.targetPageUrl = params.target_page_url;
  if (params.view_url) body.viewUrl = params.view_url;
  if (params.view_name) body.viewName = params.view_name;
  if (Array.isArray(params.decision_scopes)) body.decisionScopes = params.decision_scopes;
  return labApiRequest('/api/decisioning/edge-evaluate', {
    method: 'POST',
    body,
    timeoutMs: 120_000,
  });
}

/**
 * GET /api/decisioning/treatment-name?id=
 * @param {object} params
 * @param {string} params.sandbox
 * @param {string} params.id
 */
export async function resolveDecisioningTreatmentName({ sandbox, id }) {
  return labApiRequest('/api/decisioning/treatment-name', {
    query: { sandbox, id },
    timeoutMs: 60_000,
  });
}

/**
 * POST /api/decisioning/explain
 * @param {object} params
 */
export async function explainDecisionResponse(params) {
  return labApiRequest('/api/decisioning/explain', {
    method: 'POST',
    body: {
      sandbox: params.sandbox,
      propositions: params.propositions,
      placements: params.placements,
      evaluateContext: params.evaluate_context,
      mode: params.mode,
      surfaces: params.surfaces,
      decisionScopes: params.decision_scopes,
      datastreamId: params.datastream_id,
      identityMap: params.identity_map,
    },
    timeoutMs: 120_000,
  });
}

/**
 * POST /api/decisioning/catalog/list
 * @param {object} params
 */
export async function decisioningCatalogList(params) {
  return labApiRequest('/api/decisioning/catalog/list', {
    method: 'POST',
    body: {
      sandbox: params.sandbox,
      entityType: params.entity_type,
      limit: params.limit,
      schemaId: params.schema_id,
      autoDetect: params.auto_detect,
    },
    timeoutMs: 120_000,
  });
}

/**
 * POST /api/decisioning/catalog/get
 * @param {object} params
 */
export async function decisioningCatalogGet(params) {
  return labApiRequest('/api/decisioning/catalog/get', {
    method: 'POST',
    body: {
      sandbox: params.sandbox,
      entityType: params.entity_type,
      id: params.id,
      schemaId: params.schema_id,
      autoDetect: params.auto_detect,
    },
    timeoutMs: 120_000,
  });
}

/**
 * GET /api/decisioning/catalog/schema?sandbox=
 * @param {object} params
 */
export async function decisioningCatalogSchema(params) {
  return labApiRequest('/api/decisioning/catalog/schema', {
    query: {
      sandbox: params.sandbox,
      auto_detect: params.auto_detect === false ? 'false' : undefined,
    },
    timeoutMs: 60_000,
  });
}

/**
 * POST /api/decisioning/catalog/assess
 * @param {object} params
 */
export async function decisioningCatalogAssess(params) {
  return labApiRequest('/api/decisioning/catalog/assess', {
    method: 'POST',
    body: {
      sandbox: params.sandbox,
      schemaId: params.schema_id,
      autoDetect: params.auto_detect,
    },
    timeoutMs: 120_000,
  });
}

/** Read-only AEP audience inventory; requires the caller's user-generated MCP key. */
export async function audienceList(params) {
  return labApiRequest('/api/audience-management', {
    query: {
      sandbox: params.sandbox,
      name: params.name,
      start: params.start,
      limit: params.limit,
      include_inactive: params.include_inactive === false ? 'false' : 'true',
    },
    headers: principalAuthHeaders(),
    timeoutMs: 120_000,
  });
}

/** Required read-only review immediately before an audience delete. */
export async function audienceAudit({ sandbox, audience_id }) {
  return labApiRequest('/api/audience-management', {
    query: { sandbox, audience_id },
    headers: principalAuthHeaders(),
    timeoutMs: 120_000,
  });
}

/** Delete one exact, explicitly confirmed audience. */
export async function audienceDelete({ sandbox, audience_id, expected_name, confirmed }) {
  return labApiRequest('/api/audience-management', {
    method: 'DELETE',
    headers: principalAuthHeaders(),
    body: { sandbox, audience_id, expected_name, confirmed },
    timeoutMs: 120_000,
  });
}

/** Read-only AJO journey or campaign inventory; scoped by the caller's MCP key. */
export async function ajoAssetList({ sandbox, asset_type, name, start, limit }) {
  return labApiRequest('/api/ajo-cleanup', {
    query: { sandbox, asset_type, name, start, limit },
    headers: principalAuthHeaders(),
    timeoutMs: 120_000,
  });
}

/** Required exact-ID review before deleting one AJO journey or campaign. */
export async function ajoAssetAudit({ sandbox, asset_type, asset_id }) {
  return labApiRequest('/api/ajo-cleanup', {
    query: { sandbox, asset_type, asset_id },
    headers: principalAuthHeaders(),
    timeoutMs: 120_000,
  });
}

/** Delete one exact, explicitly confirmed and lifecycle-eligible AJO asset. */
export async function ajoAssetDelete({ sandbox, asset_type, asset_id, expected_name, expected_status, confirmed }) {
  return labApiRequest('/api/ajo-cleanup', {
    method: 'DELETE',
    headers: principalAuthHeaders(),
    body: { sandbox, asset_type, asset_id, expected_name, expected_status, confirmed },
    timeoutMs: 120_000,
  });
}

function generationPrefsAuthHeaders() {
  const key = getRequestMcpApiKey();
  return key ? { 'X-AEP-Lab-Mcp-Key': key } : {};
}

export function principalAuthHeaders() {
  return generationPrefsAuthHeaders();
}

const PDF_API_BASE = '/api/pdf-personalisation';

export async function pdfDraftList({ sandbox }) {
  return labApiRequest(`${PDF_API_BASE}/templates`, {
    query: { sandbox }, headers: principalAuthHeaders(), timeoutMs: 60_000,
  });
}

export async function pdfDraftGet({ sandbox, template_id }) {
  return labApiRequest(`${PDF_API_BASE}/templates/${encodeURIComponent(template_id)}`, {
    query: { sandbox }, headers: principalAuthHeaders(), timeoutMs: 60_000,
  });
}

export async function pdfDraftSave(params) {
  return labApiRequest(`${PDF_API_BASE}/templates`, {
    method: 'POST', headers: principalAuthHeaders(), timeoutMs: 60_000,
    body: {
      sandbox: params.sandbox,
      name: params.name,
      htmlTemplate: params.html_template,
      defaultData: params.default_data || {},
      sourceFileName: params.source_file_name,
    },
  });
}

export async function pdfExtractDocxData({ sandbox, source_file }) {
  return labApiRequest(`${PDF_API_BASE}/convert-data-document`, {
    method: 'POST', headers: principalAuthHeaders(), timeoutMs: 120_000,
    body: { sandbox, sourceDocument: source_file },
  });
}

export async function pdfHtmlPreview(params) {
  return labApiRequest(`${PDF_API_BASE}/preview`, {
    method: 'POST', headers: principalAuthHeaders(), timeoutMs: 60_000,
    body: {
      sandbox: params.sandbox,
      templateId: params.template_id,
      htmlTemplate: params.html_template,
      data: params.data || {},
      options: params.options || {},
    },
  });
}

export async function pdfGenerate(params) {
  return labApiRequest(`${PDF_API_BASE}/generate`, {
    method: 'POST', headers: principalAuthHeaders(), timeoutMs: 330_000,
    body: {
      sandbox: params.sandbox,
      conversionMode: params.conversion_mode,
      templateId: params.template_id,
      htmlTemplate: params.html_template,
      sourceDocument: params.source_file,
      data: params.data || {},
      options: params.options || {},
      documentName: params.document_name,
      idempotencyKey: params.idempotency_key,
    },
  });
}

export async function pdfJobList({ sandbox, limit }) {
  return labApiRequest(`${PDF_API_BASE}/jobs`, {
    query: { sandbox, limit }, headers: principalAuthHeaders(), timeoutMs: 60_000,
  });
}

export async function pdfJobStatus({ sandbox, job_id }) {
  return labApiRequest(`${PDF_API_BASE}/status/${encodeURIComponent(job_id)}`, {
    query: { sandbox }, headers: principalAuthHeaders(), timeoutMs: 60_000,
  });
}

export async function pdfServerTemplateList({ sandbox }) {
  return labApiRequest(`${PDF_API_BASE}/journey-action/template-library`, {
    query: { sandbox }, headers: principalAuthHeaders(), timeoutMs: 60_000,
  });
}

export async function pdfServerTemplateAnalyse({ sandbox, source_file }) {
  return labApiRequest(`${PDF_API_BASE}/journey-action/template-analysis`, {
    method: 'POST', headers: principalAuthHeaders(), timeoutMs: 120_000,
    body: { sandbox, sourceFile: source_file },
  });
}

export async function pdfServerTemplatePublish(params) {
  return labApiRequest(`${PDF_API_BASE}/journey-action/template-library`, {
    method: 'POST', headers: principalAuthHeaders(), timeoutMs: 330_000,
    body: {
      sandbox: params.sandbox,
      templateName: params.template_name,
      label: params.label,
      subject: params.subject,
      documentName: params.document_name,
      sourceFile: params.source_file,
      samplePayload: params.sample_payload || {},
      fieldMappings: params.field_mappings || [],
      expectedPageCount: params.expected_page_count,
      replace: params.replace === true,
    },
  });
}

export async function pdfServerTemplateArchive({ sandbox, template_name }) {
  return labApiRequest(`${PDF_API_BASE}/journey-action/template-library`, {
    method: 'DELETE', query: { sandbox, templateName: template_name },
    headers: principalAuthHeaders(), timeoutMs: 60_000,
  });
}

export async function inspectDemoConfig({ sandbox }) {
  return labApiRequest('/api/lab/demo-config', {
    query: { sandbox },
    headers: principalAuthHeaders(),
    timeoutMs: 30_000,
  });
}

export async function previewDemoConfig({ sandbox, changes, source }) {
  return labApiRequest('/api/lab/demo-config', {
    method: 'POST',
    headers: principalAuthHeaders(),
    body: {
      action: 'preview',
      sandbox,
      changes,
      source,
    },
    timeoutMs: 30_000,
  });
}

export async function applyDemoConfig({ sandbox, preflight_id, confirmed, idempotency_key }) {
  return labApiRequest('/api/lab/demo-config', {
    method: 'POST',
    headers: principalAuthHeaders(),
    body: {
      action: 'apply',
      sandbox,
      preflight_id,
      confirmed,
      idempotency_key,
    },
    timeoutMs: 30_000,
  });
}

export async function previewDemoConfigRestore({ sandbox, revision_id }) {
  return labApiRequest('/api/lab/demo-config', {
    method: 'POST',
    headers: principalAuthHeaders(),
    body: {
      action: 'restore-preview',
      sandbox,
      revision_id,
    },
    timeoutMs: 30_000,
  });
}

export async function inspectDemoAssets({ sandbox }) {
  return labApiRequest('/api/lab/demo-assets', {
    query: { sandbox },
    headers: principalAuthHeaders(),
    timeoutMs: 60_000,
  });
}

export async function previewDemoAssets({ sandbox, scrape_id, asset_pack, overrides }) {
  return labApiRequest('/api/lab/demo-assets', {
    method: 'POST',
    headers: principalAuthHeaders(),
    body: { action: 'preview', sandbox, scrape_id, asset_pack, overrides },
    timeoutMs: 120_000,
  });
}

export async function applyDemoAssets({ sandbox, preflight_id, confirmed, idempotency_key, backup_customer_name }) {
  return labApiRequest('/api/lab/demo-assets', {
    method: 'POST',
    headers: principalAuthHeaders(),
    body: { action: 'apply', sandbox, preflight_id, confirmed, idempotency_key, backup_customer_name },
    timeoutMs: 120_000,
  });
}

export async function previewDemoAssetsRestore({ sandbox, revision_id }) {
  return labApiRequest('/api/lab/demo-assets', {
    method: 'POST',
    headers: principalAuthHeaders(),
    body: { action: 'restore-preview', sandbox, revision_id },
    timeoutMs: 120_000,
  });
}

export async function applyDemoCustomerSwitch({ sandbox, asset_preflight_id, config_preflight_id, confirmed, idempotency_key }) {
  return labApiRequest('/api/lab/demo-assets', {
    method: 'POST',
    headers: principalAuthHeaders(),
    body: {
      action: 'switch-apply',
      sandbox,
      asset_preflight_id,
      config_preflight_id,
      confirmed,
      idempotency_key,
    },
    timeoutMs: 120_000,
  });
}

export function snowflakeAuthHeaders() {
  return generationPrefsAuthHeaders();
}

export const STATIC_EGRESS_IP = '34.58.81.28';

export async function getGenerationPrefs({ sandbox }) {
  return labApiRequest('/api/lab/generation-prefs', {
    query: { sandbox },
    headers: generationPrefsAuthHeaders(),
    timeoutMs: 30_000,
  });
}

/**
 * @param {object} params
 * @param {string} params.sandbox
 * @param {string} [params.baseEmail]
 * @param {string} [params.mobilePhone]
 * @param {number} [params.counterN]
 * @param {boolean} [params.resetCounter]
 * @param {boolean} [params.testProfile]
 */
export async function setGenerationPrefs(params) {
  const body = { sandbox: params.sandbox };
  if (params.baseEmail != null) body.baseEmail = params.baseEmail;
  if (params.mobilePhone != null) body.mobilePhone = params.mobilePhone;
  if (params.counterN != null) body.counterN = params.counterN;
  if (params.resetCounter != null) body.resetCounter = params.resetCounter;
  if (params.testProfile != null) body.testProfile = params.testProfile;
  return labApiRequest('/api/lab/generation-prefs', {
    method: 'PUT',
    body,
    headers: generationPrefsAuthHeaders(),
    timeoutMs: 30_000,
  });
}

export async function reserveGenerationNextEmail({ sandbox }) {
  return labApiRequest('/api/lab/generation-prefs/next-email', {
    method: 'POST',
    body: { sandbox },
    headers: generationPrefsAuthHeaders(),
    timeoutMs: 30_000,
  });
}

export async function liveActivityListTemplates({ sandbox }) {
  return labApiRequest('/api/ajo/live-activity/templates', {
    query: { sandbox },
    headers: principalAuthHeaders(),
    timeoutMs: 60_000,
  });
}

export async function liveActivityGetExecutionState({ sandbox }) {
  return labApiRequest('/api/ajo/live-activity/execution-state', {
    query: { sandbox },
    headers: principalAuthHeaders(),
    timeoutMs: 30_000,
  });
}

export async function liveActivitySaveExecutionState(params) {
  return labApiRequest('/api/ajo/live-activity/execution-state', {
    method: 'POST',
    headers: principalAuthHeaders(),
    body: {
      sandbox: params.sandbox,
      ...(params.campaign_id != null ? { campaignId: params.campaign_id } : {}),
      ...(params.live_activity_id != null ? { liveActivityId: params.live_activity_id } : {}),
    },
    timeoutMs: 30_000,
  });
}

export async function liveActivityUpsertTemplate(params) {
  return labApiRequest('/api/ajo/live-activity/templates', {
    method: 'POST',
    headers: principalAuthHeaders(),
    body: {
      sandbox: params.sandbox,
      templateId: params.template_id,
      customer: params.customer,
      name: params.name,
      description: params.description,
      template: params.template,
      variableDefinitions: params.variable_definitions,
      validateOnly: params.validate_only,
    },
    timeoutMs: 60_000,
  });
}

export async function liveActivityDeleteTemplate(params) {
  return labApiRequest('/api/ajo/live-activity/templates', {
    method: 'DELETE',
    headers: principalAuthHeaders(),
    body: {
      sandbox: params.sandbox,
      templateId: params.template_id,
    },
    timeoutMs: 60_000,
  });
}

export async function liveActivityPreflight(params) {
  return labApiRequest('/api/ajo/live-activity/preflight', {
    method: 'POST',
    headers: principalAuthHeaders(),
    body: {
      sandbox: params.sandbox,
      templateId: params.template_id,
      campaignId: params.campaign_id,
      ecid: params.ecid,
      liveActivityId: params.live_activity_id,
      event: params.event,
      variables: params.variables,
    },
    timeoutMs: 60_000,
  });
}

export async function liveActivitySend(params) {
  return labApiRequest('/api/ajo/live-activity', {
    method: 'POST',
    headers: principalAuthHeaders(),
    body: {
      sandbox: params.sandbox,
      preflightId: params.preflight_id,
      confirmed: params.confirmed,
      idempotencyKey: params.idempotency_key,
    },
    timeoutMs: 120_000,
  });
}

export async function liveActivityListRuns({ sandbox, limit }) {
  return labApiRequest('/api/ajo/live-activity/runs', {
    query: { sandbox, limit },
    headers: principalAuthHeaders(),
    timeoutMs: 60_000,
  });
}

export async function getRecentProfiles({ sandbox }) {
  return labApiRequest('/api/lab/recent-profiles', {
    query: { sandbox },
    headers: generationPrefsAuthHeaders(),
    timeoutMs: 30_000,
  });
}

/**
 * @param {object} body — sandbox, email, ecid, industry, source, attributes, snapshot, summaryLabel, …
 */
export async function appendRecentProfile(body) {
  return labApiRequest('/api/lab/recent-profiles', {
    method: 'POST',
    body,
    headers: generationPrefsAuthHeaders(),
    timeoutMs: 30_000,
  });
}

const COMMAND_CENTRE_BASE = '/api/home-command/mcp';

/** GET /api/home-command/mcp/state — list all customers/tasks/meetings for this MCP key's principal. */
export async function homeCommandGetState() {
  return labApiRequest(`${COMMAND_CENTRE_BASE}/state`, {
    headers: principalAuthHeaders(),
    timeoutMs: 30_000,
  });
}

export async function homeCommandAddCustomer(fields) {
  return labApiRequest(`${COMMAND_CENTRE_BASE}/customers`, {
    method: 'POST',
    body: fields,
    headers: principalAuthHeaders(),
    timeoutMs: 30_000,
  });
}

export async function homeCommandUpdateCustomer({ id, ...patch }) {
  return labApiRequest(`${COMMAND_CENTRE_BASE}/customers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: patch,
    headers: principalAuthHeaders(),
    timeoutMs: 30_000,
  });
}

export async function homeCommandDeleteCustomer({ id }) {
  return labApiRequest(`${COMMAND_CENTRE_BASE}/customers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: principalAuthHeaders(),
    timeoutMs: 30_000,
  });
}

export async function homeCommandAddTask(fields) {
  return labApiRequest(`${COMMAND_CENTRE_BASE}/tasks`, {
    method: 'POST',
    body: fields,
    headers: principalAuthHeaders(),
    timeoutMs: 30_000,
  });
}

export async function homeCommandUpdateTask({ id, ...patch }) {
  return labApiRequest(`${COMMAND_CENTRE_BASE}/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: patch,
    headers: principalAuthHeaders(),
    timeoutMs: 30_000,
  });
}

export async function homeCommandDeleteTask({ id }) {
  return labApiRequest(`${COMMAND_CENTRE_BASE}/tasks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: principalAuthHeaders(),
    timeoutMs: 30_000,
  });
}

export async function homeCommandAddMeeting(fields) {
  return labApiRequest(`${COMMAND_CENTRE_BASE}/meetings`, {
    method: 'POST',
    body: fields,
    headers: principalAuthHeaders(),
    timeoutMs: 30_000,
  });
}

export async function homeCommandUpdateMeeting({ id, ...patch }) {
  return labApiRequest(`${COMMAND_CENTRE_BASE}/meetings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: patch,
    headers: principalAuthHeaders(),
    timeoutMs: 30_000,
  });
}

export async function homeCommandDeleteMeeting({ id }) {
  return labApiRequest(`${COMMAND_CENTRE_BASE}/meetings/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: principalAuthHeaders(),
    timeoutMs: 30_000,
  });
}

/**
 * GET /api/snowflake/config?sandbox=
 * @param {object} params
 * @param {string} params.sandbox
 */
export async function getSnowflakeConfig({ sandbox }) {
  return labApiRequest('/api/snowflake/config', {
    query: { sandbox },
    headers: snowflakeAuthHeaders(),
    timeoutMs: 60_000,
  });
}

/**
 * POST /api/snowflake/connection-test
 * @param {object} params
 * @param {string} params.sandbox
 */
export async function snowflakeConnectionTest({ sandbox }) {
  return labApiRequest('/api/snowflake/connection-test', {
    method: 'POST',
    body: { sandbox },
    headers: snowflakeAuthHeaders(),
    timeoutMs: 120_000,
  });
}

/**
 * POST /api/snowflake/generate-base-profiles
 * @param {object} params
 */
export async function snowflakeGenerateBaseProfiles({ sandbox, count, table, batch_size, start_index, use_generation_prefs }) {
  return labApiRequest('/api/snowflake/generate-base-profiles', {
    method: 'POST',
    body: {
      sandbox,
      ...(count != null ? { count } : {}),
      ...(table ? { table } : {}),
      ...(batch_size != null ? { batchSize: batch_size } : {}),
      ...(start_index != null ? { startIndex: start_index } : {}),
      ...(use_generation_prefs === false ? { use_generation_prefs: false } : {}),
    },
    headers: snowflakeAuthHeaders(),
    timeoutMs: 300_000,
  });
}

/**
 * POST /api/snowflake/insert-profile-from-aep — dual-load mirror row
 * @param {object} params
 */
export async function snowflakeInsertProfileFromAep({ sandbox, email, ecid, attributes, industry, table, mode }) {
  return labApiRequest('/api/snowflake/insert-profile-from-aep', {
    method: 'POST',
    body: {
      sandbox,
      email,
      ecid,
      ...(industry ? { industry } : {}),
      ...(attributes ? { attributes } : {}),
      ...(table ? { table } : {}),
      ...(mode ? { mode } : {}),
    },
    headers: snowflakeAuthHeaders(),
    timeoutMs: 120_000,
  });
}

/**
 * POST /api/snowflake/agentic/query-profiles
 * @param {object} params
 */
export async function snowflakeQueryProfiles({ sandbox, industry, filter_type, time_period, limit, email, ecid }) {
  return labApiRequest('/api/snowflake/agentic/query-profiles', {
    method: 'POST',
    body: {
      sandbox,
      ...(industry ? { industry } : {}),
      ...(filter_type ? { filterType: filter_type } : {}),
      ...(time_period ? { timePeriod: time_period } : {}),
      ...(limit != null ? { limit } : {}),
      ...(email ? { email } : {}),
      ...(ecid ? { ecid } : {}),
    },
    headers: snowflakeAuthHeaders(),
    timeoutMs: 120_000,
  });
}

/**
 * GET/POST /api/snowflake/industry-catalog
 * @param {object} params
 */
export async function snowflakeIndustryCatalog({ sandbox, industry, check_tables }) {
  return labApiRequest('/api/snowflake/industry-catalog', {
    method: 'POST',
    body: {
      sandbox,
      ...(industry ? { industry } : {}),
      ...(check_tables === false ? { checkTables: false } : {}),
    },
    headers: snowflakeAuthHeaders(),
    timeoutMs: 120_000,
  });
}

/**
 * POST /api/snowflake/agentic/table-structure
 * @param {object} params
 */
export async function snowflakeTableStructure({ sandbox, phase }) {
  return labApiRequest('/api/snowflake/agentic/table-structure', {
    method: 'POST',
    body: { sandbox, phase },
    headers: snowflakeAuthHeaders(),
    timeoutMs: 120_000,
  });
}

/**
 * POST /api/snowflake/industry-validate-proposal
 * @param {object} params
 */
export async function snowflakeValidateProposal({
  sandbox,
  industry,
  phases,
  event_types,
  count,
  recipe_id,
  proposed_tables,
}) {
  return labApiRequest('/api/snowflake/industry-validate-proposal', {
    method: 'POST',
    body: {
      sandbox,
      ...(industry ? { industry } : {}),
      ...(phases ? { phases } : {}),
      ...(event_types ? { eventTypes: event_types } : {}),
      ...(count != null ? { count } : {}),
      ...(recipe_id ? { recipe_id } : {}),
      ...(proposed_tables ? { proposed_tables } : {}),
    },
    headers: snowflakeAuthHeaders(),
    timeoutMs: 60_000,
  });
}

/**
 * POST /api/snowflake/agentic/generate-full
 * @param {object} params
 */
export async function snowflakeGenerateFull({ sandbox, count }) {
  return labApiRequest('/api/snowflake/agentic/generate-full', {
    method: 'POST',
    body: { sandbox, count },
    headers: snowflakeAuthHeaders(),
    timeoutMs: 540_000,
  });
}

/**
 * POST /api/snowflake/agentic/enrich-profiles
 * @param {object} params
 */
export async function snowflakeEnrichProfiles({ sandbox, industry, profiles, event_types }) {
  return labApiRequest('/api/snowflake/agentic/enrich-profiles', {
    method: 'POST',
    body: {
      sandbox,
      ...(industry ? { industry } : {}),
      profiles,
      eventTypes: event_types,
    },
    headers: snowflakeAuthHeaders(),
    timeoutMs: 540_000,
  });
}

/**
 * POST /api/snowflake/agentic/profile-bundle — allowlisted non-travel readback.
 */
export async function snowflakeProfileBundle({
  sandbox,
  industry,
  email,
  ecid,
  crm_id,
  event_limit,
}) {
  return labApiRequest('/api/snowflake/agentic/profile-bundle', {
    method: 'POST',
    body: {
      sandbox,
      industry,
      ...(email ? { email } : {}),
      ...(ecid ? { ecid } : {}),
      ...(crm_id ? { crmId: crm_id } : {}),
      ...(event_limit != null ? { eventLimit: event_limit } : {}),
    },
    headers: snowflakeAuthHeaders(),
    timeoutMs: 120_000,
  });
}

/**
 * POST /api/snowflake/provision — governed allowlisted table recipes
 * @param {{ sandbox: string, industry?: string, recipe_id: string, dry_run?: boolean, approval_id?: string }} params
 */
export async function snowflakeProvision({ sandbox, industry, recipe_id, dry_run, approval_id }) {
  return labApiRequest('/api/snowflake/provision', {
    method: 'POST',
    body: {
      sandbox,
      industry,
      recipe_id,
      dry_run,
      approval_id,
    },
    headers: snowflakeAuthHeaders(),
    timeoutMs: 120_000,
  });
}

/**
 * Brand Scraper analyze runs up to 540s — bypass Firebase Hosting 60s cap via direct Cloud Function URL
 * (same pattern as web/profile-viewer/brand-scraper.js).
 */
export function getBrandScraperCfOrigin() {
  const fromEnv = String(process.env.AEP_LAB_BRAND_SCRAPER_CF_ORIGIN || '').trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const project = String(process.env.GOOGLE_CLOUD_PROJECT || 'aep-orchestration-lab').trim();
  return `https://us-central1-${project}.cloudfunctions.net`;
}

/**
 * POST body for brandScraperAnalyze — exported for unit tests.
 * @param {object} params
 */
export function buildBrandScrapeAnalyzePostBody(params) {
  /** @type {Record<string, unknown>} */
  const body = {
    url: params.url,
    sandbox: params.sandbox,
    scopeType: 'sandbox',
    scopeId: params.sandbox,
    mode: params.mode || 'new',
    businessType: params.business_type || 'b2c',
    country: params.country || '',
    maxPages: params.max_pages ?? 3,
    crawler: params.crawler || 'fetch',
    include: params.include || {
      analysis: true,
      personas: false,
      campaigns: true,
      segments: false,
      stakeholders: false,
      tagAudit: true,
      llmDemoConfig: true,
    },
  };

  if (params.existing_scrape_id) body.existingScrapeId = params.existing_scrape_id;
  if (params.force_new === true) {
    body.forceNew = true;
    body.preferExisting = false;
  } else if (params.prefer_existing === false) {
    body.preferExisting = false;
  } else if (params.prefer_existing !== false) {
    body.preferExisting = true;
  }
  if (params.require_personas === false) body.requirePersonas = false;
  if (params.require_complete === false) body.requireComplete = false;
  if (params.regenerate_demo_website === true) body.regenerateDemoWebsite = true;
  if (params.overwrite_demo_website === true) body.overwriteDemoWebsite = true;
  if (params.customer_name) body.customerName = params.customer_name;
  if (params.sync === true) {
    body.sync = true;
    body.async = false;
  }

  if (params.upload_only === true) {
    body.uploadOnly = true;
    body.crawlMode = 'upload_only';
  }
  if (params.use_as_fallback === true) {
    body.useUploadFallback = true;
  }

  const uploadedHtml = params.uploadedHtml || params.uploaded_html || null;
  if (uploadedHtml && typeof uploadedHtml === 'object') {
    body.uploadedHtml = uploadedHtml;
  }

  if (params.fallback_url) body.fallbackUrl = params.fallback_url;

  return body;
}

/**
 * POST body for demo-build (regenerate site clone) — exported for unit tests.
 * @param {object} params
 */
export function buildBrandScrapeDemoBuildPostBody(params) {
  const scrapeId = String(params.scrape_id || params.scrapeId || '').trim();
  const regenerate =
    params.regenerate === true
    || params.regenerate_demo_website === true;
  const overwrite =
    params.overwrite === true
    || params.overwrite_demo_website === true
    || regenerate;
  return {
    mode: 'demo_build',
    existingScrapeId: scrapeId,
    sandbox: params.sandbox,
    regenerateDemoWebsite: regenerate,
    overwriteDemoWebsite: overwrite,
    ...(params.customer_name ? { customerName: params.customer_name } : {}),
  };
}

/**
 * POST …/brandScraperAnalyze — async by default (202 + scrapeId). Same Firestore/GCS store as Portal.
 * @param {object} params
 */
export async function brandScrapeAnalyze(params) {
  const origin = getBrandScraperCfOrigin();
  const url = new URL('/brandScraperAnalyze', origin);
  url.searchParams.set('sandbox', params.sandbox);

  const body = buildBrandScrapeAnalyzePostBody(params);

  const timeoutMs = params.sync === true ? 540_000 : 120_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url.toString(), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const msg = err && err.name === 'AbortError' ? `Brand scrape analyze timeout after ${timeoutMs}ms` : String(err.message || err);
    return { ok: false, status: 0, url: url.toString(), error: msg, data: null };
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

  const scrapeId = response.headers.get('x-brand-scrape-id') || (data && data.scrapeId) || null;

  if (!response.ok && response.status !== 202) {
    const detail =
      (data && typeof data === 'object' && (data.error || data.detail || data.message)) ||
      response.statusText ||
      `HTTP ${response.status}`;
    return { ok: false, status: response.status, url: url.toString(), error: String(detail), data, scrapeId };
  }

  return {
    ok: true,
    status: response.status,
    url: url.toString(),
    data,
    scrapeId,
    asyncAccepted: response.status === 202,
  };
}

/**
 * GET /api/brand-scraper/scrapes?sandbox=
 * @param {object} params
 * @param {string} params.sandbox
 */
export async function listBrandScrapes({ sandbox }) {
  return labApiRequest('/api/brand-scraper/scrapes', {
    query: { sandbox },
    timeoutMs: 60_000,
  });
}

/**
 * GET /api/brand-scraper/scrapes/{scrapeId}?sandbox=
 * @param {object} params
 * @param {string} params.sandbox
 * @param {string} params.scrapeId
 * @param {string} [params.version]
 */
export async function getBrandScrape({ sandbox, scrapeId, version }) {
  const path = `/api/brand-scraper/scrapes/${encodeURIComponent(scrapeId)}`;
  return labApiRequest(path, {
    query: {
      sandbox,
      ...(version ? { version } : {}),
    },
    timeoutMs: 120_000,
  });
}

/**
 * POST /api/brand-scraper/scrapes/{scrapeId}/cancel?sandbox=
 * @param {object} params
 * @param {string} params.sandbox
 * @param {string} params.scrapeId
 * @param {string} [params.reason]
 */
export async function cancelBrandScrape({ sandbox, scrapeId, reason }) {
  const path = `/api/brand-scraper/scrapes/${encodeURIComponent(scrapeId)}/cancel`;
  return labApiRequest(path, {
    method: 'POST',
    query: { sandbox },
    body: reason ? { reason } : {},
    timeoutMs: 30_000,
  });
}

/**
 * POST …/brandScraperAnalyze with mode demo_build — regenerate Profile Viewer site clone (Portal parity).
 * @param {object} params
 * @param {string} params.sandbox
 * @param {string} params.scrape_id
 * @param {boolean} [params.regenerate]
 * @param {boolean} [params.overwrite]
 * @param {string} [params.customer_name]
 */
export async function brandScrapeDemoBuild(params) {
  const origin = getBrandScraperCfOrigin();
  const url = new URL('/brandScraperAnalyze', origin);
  url.searchParams.set('sandbox', params.sandbox);

  const body = buildBrandScrapeDemoBuildPostBody(params);
  const timeoutMs = 120_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url.toString(), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const msg =
      err && err.name === 'AbortError'
        ? `Brand scrape demo-build timeout after ${timeoutMs}ms`
        : String(err.message || err);
    return { ok: false, status: 0, url: url.toString(), error: msg, data: null };
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

  const scrapeId =
    response.headers.get('x-brand-scrape-id')
    || (data && data.scrapeId)
    || body.existingScrapeId
    || null;

  if (!response.ok && response.status !== 202) {
    const detail =
      (data && typeof data === 'object' && (data.error || data.detail || data.message))
      || response.statusText
      || `HTTP ${response.status}`;
    return { ok: false, status: response.status, url: url.toString(), error: String(detail), data, scrapeId };
  }

  return {
    ok: true,
    status: response.status,
    url: url.toString(),
    data,
    scrapeId,
    asyncAccepted: response.status === 202,
  };
}

/**
 * Direct Cloud Function origin (bypasses Hosting 60s cap for long Vertex calls).
 */
export function getLabCloudFunctionsOrigin() {
  return getBrandScraperCfOrigin();
}

/**
 * GET /api/client-journey-v2/import/profile — CJv2 form prefill from scrape.
 * @param {object} params
 */
export async function clientJourneyV2ImportProfile({ sandbox, scrapeId }) {
  return labApiRequest('/api/client-journey-v2/import/profile', {
    query: { sandbox, scrapeId },
    timeoutMs: 60_000,
  });
}

/**
 * POST …/clientJourneyV2Generate — 60–180s typical; direct CF URL.
 * @param {object} body — client, brandColor, journeyType, personaName, tier, …
 */
export async function clientJourneyV2Generate(body) {
  const origin = getLabCloudFunctionsOrigin();
  const url = `${origin}/clientJourneyV2Generate`;
  const timeoutMs = 540_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const msg =
      err && err.name === 'AbortError'
        ? `Client Journey v2 generate timeout after ${timeoutMs}ms`
        : String(err.message || err);
    return { ok: false, status: 0, url, error: msg, data: null };
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
    return { ok: false, status: response.status, url, error: String(detail), data };
  }

  return { ok: true, status: response.status, url, data };
}
