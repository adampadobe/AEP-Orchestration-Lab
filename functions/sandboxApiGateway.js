'use strict';

/**
 * Single public BFF for sandbox Hosting: forwards /api/* to private Gen2 backends
 * using the hosting-invoker service account identity (ID token).
 */
const { GoogleAuth } = require('google-auth-library');
const buildInfo = require('./buildInfo');

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
]);

/** @type {{ routes: Array<{ source: string, functionId: string, region: string }>, projectId: string, defaultRegion: string }} */
let routeTable = null;

function loadRouteTable() {
  if (routeTable) return routeTable;
  // eslint-disable-next-line global-require, import/no-dynamic-require
  routeTable = require('./sandboxApiGatewayRoutes.json');
  return routeTable;
}

function pathMatchesSource(requestPath, source) {
  const path = requestPath.split('?')[0];
  if (source.endsWith('/**')) {
    const prefix = source.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  if (source.includes('*')) {
    const re = new RegExp(
      `^${source
        .split('/')
        .map((seg) => {
          if (seg === '**') return '.*';
          if (seg === '*') return '[^/]+';
          return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('/')}$`,
    );
    return re.test(path);
  }
  return path === source;
}

function resolveRoute(requestPath) {
  const table = loadRouteTable();
  for (const route of table.routes) {
    if (pathMatchesSource(requestPath, route.source)) {
      return route;
    }
  }
  return null;
}

function backendBaseUrl(projectId, region, functionId) {
  return `https://${region}-${projectId}.cloudfunctions.net/${functionId}`;
}

function setCors(res, methods = 'GET, POST, PUT, PATCH, DELETE, OPTIONS') {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', methods);
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  buildInfo.setBuildHeaders(res);
}

function pickForwardHeaders(incoming) {
  const out = {};
  for (const [key, value] of Object.entries(incoming || {})) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    if (lower.startsWith('x-cloud-trace-context')) continue;
    if (value == null) continue;
    const v = Array.isArray(value) ? value.join(', ') : String(value);
    if (!v) continue;
    out[key] = v;
  }
  return out;
}

function requestPathFromReq(req) {
  const raw = String(req.url || req.path || '/');
  try {
    const u = new URL(raw, 'https://gateway.local');
    return u.pathname || '/';
  } catch {
    return raw.split('?')[0] || '/';
  }
}

function queryStringFromReq(req) {
  const raw = String(req.url || '');
  const q = raw.includes('?') ? raw.slice(raw.indexOf('?')) : '';
  if (q) return q;
  const keys = Object.keys(req.query || {});
  if (!keys.length) return '';
  const params = new URLSearchParams();
  for (const k of keys) {
    const v = req.query[k];
    if (Array.isArray(v)) v.forEach((item) => params.append(k, String(item)));
    else if (v != null) params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

async function forwardToBackend(req, res) {
  const table = loadRouteTable();
  const pathOnly = requestPathFromReq(req);
  const route = resolveRoute(pathOnly);
  if (!route) {
    res.status(404).json({
      ok: false,
      error: 'No sandbox API route',
      path: pathOnly,
    });
    return;
  }

  const projectId = table.projectId || process.env.GCLOUD_PROJECT || 'adbe-gcp0819';
  const region = route.region || table.defaultRegion || 'us-east4';
  const targetBase = backendBaseUrl(projectId, region, route.functionId);
  const qs = queryStringFromReq(req);
  const targetUrl = `${targetBase}${pathOnly}${qs}`;

  const auth = new GoogleAuth();
  const client = await auth.getIdTokenClient(targetBase);

  const headers = pickForwardHeaders(req.headers);
  const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  let body;
  if (hasBody) {
    if (Buffer.isBuffer(req.rawBody)) {
      body = req.rawBody;
    } else if (req.rawBody != null) {
      body = Buffer.from(String(req.rawBody));
    } else if (req.body != null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      body = Buffer.from(JSON.stringify(req.body));
      if (!headers['content-type'] && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
    } else if (req.body != null) {
      body = Buffer.from(String(req.body));
    }
  }

  const upstream = await client.request({
    url: targetUrl,
    method: req.method,
    headers,
    data: body,
    responseType: 'arraybuffer',
    validateStatus: () => true,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  const respHeaders = upstream.headers || {};
  for (const [key, value] of Object.entries(respHeaders)) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    if (lower === 'content-encoding') continue;
    if (value == null) continue;
    res.set(key, Array.isArray(value) ? value.join(', ') : String(value));
  }
  buildInfo.setBuildHeaders(res);

  const buf = Buffer.isBuffer(upstream.data)
    ? upstream.data
    : Buffer.from(upstream.data || '');
  res.status(upstream.status || 502);
  if (buf.length) res.send(buf);
  else res.end();
}

function createHandler() {
  return async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    try {
      await forwardToBackend(req, res);
    } catch (err) {
      console.error('[sandboxApiGateway]', String(err && err.message ? err.message : err));
      res.status(502).json({
        ok: false,
        error: 'Gateway upstream failed',
        detail: String(err && err.message ? err.message : err).slice(0, 500),
      });
    }
  };
}

module.exports = {
  createHandler,
  resolveRoute,
  pathMatchesSource,
  backendBaseUrl,
};
