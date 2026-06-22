'use strict';

const LEGACY_ALLOWED_HOST = 'fake-loyalty-provider-a5xduykcsq-uc.a.run.app';
const DEFAULT_ALLOWED_HOST = 'loyalty-reward-provider-a5xduykcsq-uc.a.run.app';
const DEFAULT_PROVIDER_BASE_URL = `https://${DEFAULT_ALLOWED_HOST}`;
const DEFAULT_SANDBOX = 'apalmer';

const ALLOWED_HOSTS = new Set([DEFAULT_ALLOWED_HOST, LEGACY_ALLOWED_HOST]);

/**
 * @returns {string | null}
 */
function resolveProviderOrigin() {
  const raw = String(
    process.env.LOYALTY_PROVIDER_URL
    || process.env.FAKE_LOYALTY_PROVIDER_URL
    || DEFAULT_PROVIDER_BASE_URL,
  ).trim();
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) {
    return null;
  }
  return u.origin;
}

/**
 * @param {import('express').Request} req
 * @returns {{ apiPrefix: string, subPath: string }}
 */
function resolveRoute(req) {
  const path = String(req.path || req.url || '').split('?')[0];
  const prefixes = ['/api/loyalty-provider/', '/api/fake-loyalty/'];
  let apiPrefix = '';
  let subPath = path.replace(/\/$/, '');
  for (const prefix of prefixes) {
    if (subPath.startsWith(prefix)) {
      apiPrefix = prefix;
      subPath = subPath.slice(prefix.length).replace(/\/$/, '');
      break;
    }
  }
  if (!apiPrefix) {
    subPath = subPath.replace(/^\/api\/(loyalty-provider|fake-loyalty)\/?/, '').replace(/\/$/, '');
  }
  return { apiPrefix, subPath };
}

/**
 * @param {string} subPath
 * @returns {{ kind: 'health' | 'ledger', sandbox: string } | null}
 */
function parseSubPath(subPath) {
  const trimmed = String(subPath || '').replace(/\/$/, '');
  if (trimmed === 'health' || trimmed === '') {
    return { kind: 'health', sandbox: DEFAULT_SANDBOX };
  }
  const ledgerMatch = trimmed.match(/^([a-z0-9][a-z0-9-]{0,62})\/ledger$/);
  if (ledgerMatch) {
    return { kind: 'ledger', sandbox: ledgerMatch[1] };
  }
  if (trimmed === 'ledger') {
    return { kind: 'ledger', sandbox: DEFAULT_SANDBOX };
  }
  const sandboxHealth = trimmed.match(/^([a-z0-9][a-z0-9-]{0,62})\/health$/);
  if (sandboxHealth) {
    return { kind: 'health', sandbox: sandboxHealth[1] };
  }
  return null;
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{
 *   setCors: (res: import('express').Response, methods?: string) => void;
 *   LOYALTY_PROVIDER_API_KEY: { value: () => string };
 * }} deps
 */
async function handleLoyaltyRewardProviderRequest(req, res, deps) {
  const { setCors, LOYALTY_PROVIDER_API_KEY } = deps;
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'GET only' });
    return;
  }

  const origin = resolveProviderOrigin();
  if (!origin) {
    res.status(403).json({
      ok: false,
      error: 'Loyalty provider host not allowlisted',
      allowed_hosts: [...ALLOWED_HOSTS],
    });
    return;
  }

  const { subPath } = resolveRoute(req);
  const route = parseSubPath(subPath);
  if (!route) {
    res.status(404).json({ ok: false, error: 'Not found' });
    return;
  }

  const sandbox = String(req.query.sandbox || route.sandbox || DEFAULT_SANDBOX).trim().toLowerCase();

  if (route.kind === 'health') {
    const healthPath = subPath.includes('/') ? `/${sandbox}/health` : '/health';
    let upstream;
    try {
      upstream = await fetch(`${origin}${healthPath}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'aep-orchestration-lab-loyalty-provider-proxy' },
      });
    } catch (e) {
      res.status(502).json({ ok: false, error: String(e.message || e), reachable: false });
      return;
    }

    let payload = {};
    try {
      payload = await upstream.json();
    } catch {
      payload = {};
    }

    res.status(upstream.ok ? 200 : 502).json({
      ok: upstream.ok,
      reachable: upstream.ok,
      upstream_status: upstream.status,
      sandbox,
      provider_url: `${origin}${healthPath}`,
      data: payload,
    });
    return;
  }

  const apiKey = String(LOYALTY_PROVIDER_API_KEY.value() || '').trim();
  if (!apiKey) {
    res.status(503).json({
      ok: false,
      error: 'LOYALTY_PROVIDER_API_KEY is not configured on lab functions',
    });
    return;
  }

  const limit = String(req.query.limit || '50').trim() || '50';
  const ledgerUrl = `${origin}/${encodeURIComponent(sandbox)}/v1/ledger?limit=${encodeURIComponent(limit)}`;
  let upstream;
  try {
    upstream = await fetch(ledgerUrl, {
      headers: {
        Accept: 'application/json',
        'X-API-Key': apiKey,
        'User-Agent': 'aep-orchestration-lab-loyalty-provider-proxy',
      },
    });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e.message || e) });
    return;
  }

  const ct = upstream.headers.get('Content-Type') || '';
  if (!ct.toLowerCase().includes('json')) {
    const snippet = (await upstream.text()).slice(0, 500);
    res.status(502).json({
      ok: false,
      error: 'Upstream did not return JSON',
      upstream_status: upstream.status,
      snippet,
    });
    return;
  }

  let payload;
  try {
    payload = await upstream.json();
  } catch {
    res.status(502).json({
      ok: false,
      error: 'Invalid JSON from loyalty provider',
      upstream_status: upstream.status,
    });
    return;
  }

  res.status(upstream.ok ? 200 : upstream.status).json({
    ok: upstream.ok,
    upstream_status: upstream.status,
    sandbox,
    provider_url: ledgerUrl.replace(/\?.*$/, ''),
    ...payload,
  });
}

module.exports = {
  handleLoyaltyRewardProviderRequest,
  DEFAULT_ALLOWED_HOST,
  LEGACY_ALLOWED_HOST,
  DEFAULT_PROVIDER_BASE_URL,
};
