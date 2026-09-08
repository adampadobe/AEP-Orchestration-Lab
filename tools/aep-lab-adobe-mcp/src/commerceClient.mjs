import { getAdobeAccessToken, loadAdobeCredentials } from './imsAuth.mjs';

export const COMMERCE_REQUIRED_SCOPES = Object.freeze([
  'AdobeID',
  'openid',
  'email',
  'profile',
  'additional_info.roles',
  'additional_info.projectedProductContext',
  'commerce.accs',
  'org.read',
]);

const COMMERCE_HOST = /^[a-z0-9-]+\.api\.commerce\.adobe\.com$/i;
const REGION_LABELS = Object.freeze({
  na1: 'North America',
  eu1: 'Europe',
});

export function withCommerceScopes(scopes) {
  const merged = new Set(
    String(scopes || '')
      .split(/[\s,]+/)
      .map((scope) => scope.trim())
      .filter(Boolean),
  );
  for (const scope of COMMERCE_REQUIRED_SCOPES) merged.add(scope);
  return [...merged].join(' ');
}

export function parseCommerceEndpoint(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) throw new Error('Missing ADOBE_COMMERCE_REST_ENDPOINT');

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('ADOBE_COMMERCE_REST_ENDPOINT must be a valid HTTPS URL');
  }
  if (url.protocol !== 'https:' || !COMMERCE_HOST.test(url.hostname)) {
    throw new Error('Commerce endpoint must use https://*.api.commerce.adobe.com');
  }
  if (url.search || url.hash) {
    throw new Error('Commerce endpoint must not include a query string or fragment');
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 1) {
    throw new Error('Commerce REST endpoint must end with exactly one tenant/instance ID');
  }
  const instanceId = parts[0];
  const hostPrefix = url.hostname.split('.')[0];
  const sandbox = hostPrefix.endsWith('-sandbox');
  const regionCode = hostPrefix.replace(/-sandbox$/, '');
  const restEndpoint = `${url.origin}/${instanceId}`;

  return {
    restEndpoint,
    graphqlEndpoint: `${restEndpoint}/graphql`,
    instanceId,
    environment: sandbox ? 'sandbox' : 'production',
    regionCode,
    region: REGION_LABELS[regionCode] || regionCode,
  };
}

export function loadCommerceConfig(env = process.env) {
  const parsed = parseCommerceEndpoint(env.ADOBE_COMMERCE_REST_ENDPOINT);
  const configuredGraphql = String(env.ADOBE_COMMERCE_GRAPHQL_ENDPOINT || '').trim();
  if (configuredGraphql) {
    const expected = parsed.graphqlEndpoint;
    if (configuredGraphql.replace(/\/+$/, '') !== expected) {
      throw new Error(`ADOBE_COMMERCE_GRAPHQL_ENDPOINT must match ${expected}`);
    }
  }
  return {
    ...parsed,
    graphqlEndpoint: configuredGraphql.replace(/\/+$/, '') || parsed.graphqlEndpoint,
    defaultStore: String(env.ADOBE_COMMERCE_STORE || 'default').trim() || 'default',
  };
}

function appendParams(url, params) {
  if (!params || typeof params !== 'object') return;
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.append(key, String(value));
    }
  }
}

async function readResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.toLowerCase().includes('json')) {
    return response.json().catch(() => ({}));
  }
  return { raw: (await response.text()).slice(0, 50000) };
}

export async function commerceRestGet(
  { path, params, store },
  {
    fetchImpl = fetch,
    credentialsProvider = loadAdobeCredentials,
    tokenProvider = getAdobeAccessToken,
    config = loadCommerceConfig(),
  } = {},
) {
  const requestPath = String(path || '');
  if (!requestPath.startsWith('/V1/')) {
    throw new Error('Commerce REST path must start with /V1/');
  }

  const credentials = credentialsProvider();
  const token = await tokenProvider({
    ...credentials,
    scopes: withCommerceScopes(credentials.scopes),
  });
  const url = new URL(`${config.restEndpoint}${requestPath}`);
  appendParams(url, params);

  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-api-key': credentials.clientId,
      'x-gw-ims-org-id': credentials.orgId,
      Accept: 'application/json',
      Store: String(store || config.defaultStore),
    },
  });
  const data = await readResponse(response);
  if (!response.ok) {
    const error = new Error(`Commerce REST ${response.status}`);
    error.status = response.status;
    error.detail = data;
    throw error;
  }
  return { status: response.status, requestUrl: url.toString(), data };
}

export function assertReadOnlyGraphql(query) {
  const text = String(query || '').trim();
  if (!text) throw new Error('GraphQL query is required');
  const withoutComments = text.replace(/#[^\n\r]*/g, ' ');
  if (/\bmutation\b/i.test(withoutComments) || /\bsubscription\b/i.test(withoutComments)) {
    throw new Error('Only read-only GraphQL queries are allowed');
  }
  return text;
}

export async function commerceGraphqlQuery(
  { query, variables, store },
  { fetchImpl = fetch, config = loadCommerceConfig() } = {},
) {
  const safeQuery = assertReadOnlyGraphql(query);
  const response = await fetchImpl(config.graphqlEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Store: String(store || config.defaultStore),
    },
    body: JSON.stringify({ query: safeQuery, variables: variables || {} }),
  });
  const data = await readResponse(response);
  if (!response.ok) {
    const error = new Error(`Commerce GraphQL HTTP ${response.status}`);
    error.status = response.status;
    error.detail = data;
    throw error;
  }
  return { status: response.status, requestUrl: config.graphqlEndpoint, data };
}
