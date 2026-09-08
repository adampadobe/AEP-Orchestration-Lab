'use strict';

const crypto = require('node:crypto');

function safeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (!left || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

async function authorize(req, { internalMcpKey, mcpApiKeyStore }) {
  const provided = String(req.headers['x-aep-lab-mcp-key'] || req.headers['X-AEP-Lab-Mcp-Key'] || '').trim();
  if (!provided) return { ok: false, status: 401, error: 'X-AEP-Lab-Mcp-Key is required.' };
  if (safeEqual(provided, internalMcpKey.value())) return { ok: true, source: 'internal' };
  const user = await mcpApiKeyStore.validateUserApiKey(provided);
  if (!user?.ok) return { ok: false, status: 403, error: 'A valid AEP Lab MCP key is required.' };
  return { ok: true, source: 'user', keyId: user.keyId, principalUid: user.principalUid };
}

function errorStatus(error) {
  const status = Number(error?.status);
  return status >= 400 && status <= 599 ? status : 500;
}

function registerCommerceRoutes(deps) {
  const { onRequest, commerceFnOpts, setCors, internalMcpKey, mcpApiKeyStore, commerceService } = deps;
  const commercePrepProxy = onRequest(commerceFnOpts, async (req, res) => {
    setCors(res, 'GET, POST, OPTIONS');
    res.set('Cache-Control', 'private, no-store, max-age=0');
    if (req.method === 'OPTIONS') return res.status(204).send('');

    let principal;
    try { principal = await authorize(req, { internalMcpKey, mcpApiKeyStore }); }
    catch (error) {
      return res.status(500).json({ ok: false, error: 'MCP key validation failed.', detail: String(error.message || error) });
    }
    if (!principal.ok) return res.status(principal.status).json({ ok: false, error: principal.error });

    const action = String(req.query.action || '').trim().toLowerCase();
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const params = { ...req.query, ...body };
    const handlers = {
      access: { method: 'GET', run: () => commerceService.accessInfo(params) },
      capabilities: { method: 'GET', run: () => commerceService.capabilities() },
      stores: { method: 'GET', run: () => commerceService.storeConfigs(params) },
      catalog_summary: { method: 'GET', run: () => commerceService.catalogSummary(params) },
      product_search: { method: 'GET', run: () => commerceService.productSearch(params) },
      product_get: { method: 'GET', run: () => commerceService.productGet(params) },
      categories: { method: 'GET', run: () => commerceService.categoryTree(params) },
      inventory: { method: 'GET', run: () => commerceService.inventoryStatus(params) },
      graphql: { method: 'POST', run: () => commerceService.graphql(params) },
    };
    const selected = handlers[action];
    if (!selected) return res.status(400).json({ ok: false, error: 'Unknown Commerce action.' });
    if (req.method !== selected.method) {
      return res.status(405).set('Allow', selected.method).json({ ok: false, error: `Use ${selected.method} for ${action}.` });
    }

    try {
      const result = await selected.run();
      return res.status(200).json(result);
    } catch (error) {
      return res.status(errorStatus(error)).json({
        ok: false,
        error: String(error.message || error),
        platformStatus: Number(error.status) || null,
        platformResponse: error.platformResponse || null,
      });
    }
  });
  return { commercePrepProxy };
}

module.exports = { authorize, registerCommerceRoutes, safeEqual };
