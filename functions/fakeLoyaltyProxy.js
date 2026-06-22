'use strict';

const FAKE_LOYALTY_ALLOWED_HOST = 'fake-loyalty-provider-a5xduykcsq-uc.a.run.app';
const DEFAULT_FAKE_LOYALTY_BASE_URL = 'https://fake-loyalty-provider-a5xduykcsq-uc.a.run.app';

/**
 * @returns {string | null}
 */
function resolveProviderOrigin() {
  const raw = String(process.env.FAKE_LOYALTY_PROVIDER_URL || DEFAULT_FAKE_LOYALTY_BASE_URL).trim();
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.hostname !== FAKE_LOYALTY_ALLOWED_HOST) {
    return null;
  }
  return u.origin;
}

/**
 * @param {import('express').Request} req
 * @returns {string}
 */
function resolveSubPath(req) {
  const fromPath = String(req.path || '')
    .replace(/^\/api\/fake-loyalty\/?/, '')
    .split('?')[0]
    .replace(/\/$/, '');
  if (fromPath) return fromPath;
  const fromUrl = String(req.url || '')
    .replace(/^\/api\/fake-loyalty\/?/, '')
    .split('?')[0]
    .replace(/\/$/, '');
  return fromUrl;
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{
 *   setCors: (res: import('express').Response, methods?: string) => void;
 *   FAKE_LOYALTY_API_KEY: { value: () => string };
 * }} deps
 */
async function handleFakeLoyaltyRequest(req, res, deps) {
  const { setCors, FAKE_LOYALTY_API_KEY } = deps;
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
      error: 'Fake loyalty provider host not allowlisted',
      allowed_host: FAKE_LOYALTY_ALLOWED_HOST,
    });
    return;
  }

  const subPath = resolveSubPath(req);

  if (subPath === 'health') {
    let upstream;
    try {
      upstream = await fetch(`${origin}/health`, {
        headers: { Accept: 'application/json', 'User-Agent': 'aep-orchestration-lab-fake-loyalty-proxy' },
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
      provider_url: `${origin}/health`,
      data: payload,
    });
    return;
  }

  if (subPath === 'ledger') {
    const apiKey = String(FAKE_LOYALTY_API_KEY.value() || '').trim();
    if (!apiKey) {
      res.status(503).json({
        ok: false,
        error: 'FAKE_LOYALTY_API_KEY is not configured on lab functions',
      });
      return;
    }

    const limit = String(req.query.limit || '50').trim() || '50';
    const ledgerUrl = `${origin}/v1/ledger?limit=${encodeURIComponent(limit)}`;
    let upstream;
    try {
      upstream = await fetch(ledgerUrl, {
        headers: {
          Accept: 'application/json',
          'X-API-Key': apiKey,
          'User-Agent': 'aep-orchestration-lab-fake-loyalty-proxy',
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
        error: 'Invalid JSON from fake loyalty provider',
        upstream_status: upstream.status,
      });
      return;
    }

    res.status(upstream.ok ? 200 : upstream.status).json({
      ok: upstream.ok,
      upstream_status: upstream.status,
      provider_url: ledgerUrl.replace(/\?.*$/, ''),
      ...payload,
    });
    return;
  }

  res.status(404).json({ ok: false, error: 'Not found' });
}

module.exports = {
  handleFakeLoyaltyRequest,
  FAKE_LOYALTY_ALLOWED_HOST,
  DEFAULT_FAKE_LOYALTY_BASE_URL,
};
