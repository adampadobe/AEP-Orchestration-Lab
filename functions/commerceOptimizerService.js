'use strict';

const ACO_SCOPE = 'commerce.aco.ingestion';
const MAX_QUERY_LENGTH = 20_000;

function withOptimizerScopes(baseScopes = '') {
  const scopes = new Set(String(baseScopes).split(/[\s,]+/).filter(Boolean));
  for (const scope of ['openid', 'AdobeID', 'profile', 'email', ACO_SCOPE]) scopes.add(scope);
  return [...scopes].join(' ');
}

function parseOptimizerEndpoint(rawEndpoint) {
  const value = String(rawEndpoint || '').trim().replace(/\/+$/, '');
  let url;
  try { url = new URL(value); } catch { throw new Error('Adobe Commerce Optimizer endpoint is invalid.'); }
  const parts = url.pathname.split('/').filter(Boolean);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.api.commerce.adobe.com') || parts.length !== 1) {
    throw new Error('Adobe Commerce Optimizer endpoint is invalid.');
  }
  const regionCode = url.hostname.split('-')[0];
  return {
    baseEndpoint: `${url.origin}/${parts[0]}`,
    graphqlEndpoint: `${url.origin}/${parts[0]}/graphql`,
    catalogEndpoint: `${url.origin}/${parts[0]}/v1/catalog`,
    instanceId: parts[0],
    environment: url.hostname.includes('-sandbox.') ? 'sandbox' : 'production',
    regionCode,
    region: regionCode === 'na1' ? 'North America' : regionCode,
  };
}

function assertReadOnlyGraphql(query) {
  const value = String(query || '').trim();
  if (!value || value.length > MAX_QUERY_LENGTH) throw new Error('GraphQL query must contain 1 to 20,000 characters.');
  const withoutComments = value.replace(/#[^\n\r]*/g, ' ');
  if (/\b(mutation|subscription)\b/i.test(withoutComments)) {
    throw new Error('Commerce Optimizer MCP is read-only; mutations and subscriptions are rejected.');
  }
  return value;
}

function optimizerHeaders({ viewId, priceBookId, locale = 'en-US', policies, instanceId }) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const view = String(viewId || '').trim();
  if (!view) throw new Error('view_id is required for Commerce Optimizer catalog queries.');
  headers['AC-View-Id'] = view;
  headers['AC-Environment-Id'] = instanceId;
  headers['AC-Scope-Locale'] = String(locale || 'en-US').trim();
  if (priceBookId) headers['AC-Price-Book-ID'] = String(priceBookId).trim();
  for (const [name, rawValue] of Object.entries(policies || {})) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) throw new Error(`Invalid policy header name: ${name}`);
    const value = String(rawValue);
    if (!value || value.length > 500) throw new Error(`Invalid policy value for ${name}.`);
    headers[`AC-Policy-${name}`] = value;
  }
  return headers;
}

function createCommerceOptimizerService(deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch;
  const endpoint = () => parseOptimizerEndpoint(deps.getEndpoint());

  async function jsonRequest(url, init) {
    const response = await fetchImpl(url, init);
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
    if (!response.ok) {
      const error = new Error(`Commerce Optimizer API returned HTTP ${response.status}.`);
      error.status = response.status;
      error.details = payload;
      throw error;
    }
    return payload;
  }

  async function accessInfo() {
    const meta = endpoint();
    const org = String(deps.getImsOrg()).trim();
    const token = await deps.getAccessToken(withOptimizerScopes(deps.getBaseScopes()));
    const ownerUrl = `https://ccm.api.commerce.adobe.com/api/v1/tenants/${encodeURIComponent(meta.instanceId)}/owner/${encodeURIComponent(org)}`;
    const tenant = await jsonRequest(ownerUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-api-key': String(deps.getClientId()).trim(),
        'x-gw-ims-org-id': org,
        Accept: 'application/json',
      },
    });
    return {
      ok: true,
      product: 'Adobe Commerce Optimizer',
      organization: org,
      instance: {
        id: meta.instanceId,
        name: tenant.name || null,
        product: tenant.product || null,
        state: tenant.state || null,
        userCanAccess: tenant.userCanAccess === true,
        userCanAdminister: tenant.userCanAdminister === true,
        environment: meta.environment,
        region: meta.region,
      },
      endpoints: { graphql: meta.graphqlEndpoint, catalog: meta.catalogEndpoint },
      catalogViewRequired: true,
    };
  }

  function capabilities() {
    const meta = endpoint();
    return {
      ok: true,
      product: 'Adobe Commerce Optimizer',
      instance: { id: meta.instanceId, environment: meta.environment, region: meta.region },
      endpoints: { graphql: meta.graphqlEndpoint, catalog: meta.catalogEndpoint },
      supportedQueries: ['commerceOptimizer', 'attributeMetadata', 'productSearch', 'products', 'categoryTree', 'navigation', 'recommendationsByUnitIds'],
      requirements: ['Provide AC-View-Id as view_id for every catalog query.', 'The catalog view must be public; private access tokens are not accepted through MCP arguments.'],
      guardrails: ['Read-only GraphQL only.', 'No catalog ingestion, metadata, product, category, price-book, or price mutations.', 'Bounded query and result inputs.'],
    };
  }

  async function graphql({ query, variables = {}, viewId, priceBookId, locale = 'en-US', policies = {} }) {
    const meta = endpoint();
    const payload = await jsonRequest(meta.graphqlEndpoint, {
      method: 'POST',
      headers: optimizerHeaders({ viewId, priceBookId, locale, policies, instanceId: meta.instanceId }),
      body: JSON.stringify({ query: assertReadOnlyGraphql(query), variables }),
    });
    return { ok: !payload.errors, data: payload.data || null, errors: payload.errors || [], viewId };
  }

  return { accessInfo, capabilities, graphql };
}

module.exports = { assertReadOnlyGraphql, createCommerceOptimizerService, optimizerHeaders, parseOptimizerEndpoint, withOptimizerScopes };
