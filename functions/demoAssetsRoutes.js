'use strict';

/**
 * HTTP surface for the Demo Asset Library.
 *
 *   GET    /api/demo-assets                    list (Adobe sign-in)
 *   POST   /api/demo-assets                    upload { html, filename, folderPath, force }
 *   GET    /api/demo-assets/:id                metadata
 *   PATCH  /api/demo-assets/:id                edit metadata / confirm classification
 *   DELETE /api/demo-assets/:id                delete asset + versions
 *   POST   /api/demo-assets/:id/render-token   short-lived preview link
 *   GET    /api/demo-assets/:id/export         download rehydrated HTML
 *   GET    /api/demo-assets/render/:token      sandboxed render (token only)
 */

function errorStatus(error, fallback = 500) {
  const status = Number(error && error.status);
  return status >= 400 && status <= 599 ? status : fallback;
}

function parseRoute(req) {
  const full = String(req.originalUrl || req.url || req.path || '').split('?')[0].replace(/\/+$/, '');
  const rest = full.replace(/^.*?\/api\/demo-assets/, '');
  const parts = rest.split('/').filter(Boolean).map((p) => decodeURIComponent(p));
  return parts;
}

function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = req.rawBody ? req.rawBody.toString('utf8') : '';
  return raw ? JSON.parse(raw) : {};
}

function registerDemoAssetsRoutes(deps) {
  const { onRequest, fnOpts, setCors, verifyClaims, service, callGemini } = deps;

  async function requireUser(req) {
    const claims = await verifyClaims(req);
    return service.assertAllowedUser(claims);
  }

  const demoAssetsApi = onRequest(fnOpts, async (req, res) => {
    const parts = parseRoute(req);

    if (parts[0] === 'render') {
      if (req.method !== 'GET') return res.status(405).send('Method not allowed');
      try {
        const assetId = await service.resolveRenderToken(parts[1]);
        const { html } = await service.loadRenderedHtml(assetId);
        res.set(service.RENDER_HEADERS);
        return res.status(200).send(html);
      } catch (e) {
        res.set({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.status(errorStatus(e)).send(errorStatus(e) < 500 ? e.message : 'Unable to render asset');
      }
    }

    setCors(res, 'GET, POST, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).send('');
    res.set('Cache-Control', 'private, no-store');

    let user;
    try {
      user = await requireUser(req);
    } catch (e) {
      return res.status(errorStatus(e, 401)).json({ ok: false, error: e.message });
    }

    try {
      const [id, action] = parts;
      if (!id) {
        if (req.method === 'GET') {
          const assets = await service.listAssets();
          return res.json({ ok: true, assets, conversationTypes: service.CONVERSATION_TYPES, user: { email: user.email } });
        }
        if (req.method === 'POST') {
          const body = readBody(req);
          const result = await service.createAsset({
            html: body.html,
            filename: body.filename,
            folderPath: body.folderPath,
            force: body.force === true,
          }, user, { callGemini });
          if (result.duplicate) return res.status(409).json({ ok: false, duplicate: true, asset: result.asset, error: 'This exact file is already in the library.' });
          return res.status(201).json({ ok: true, asset: result.asset });
        }
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
      }

      if (!action) {
        if (req.method === 'GET') return res.json({ ok: true, asset: await service.getAsset(id) });
        if (req.method === 'PATCH') return res.json({ ok: true, asset: await service.updateAsset(id, readBody(req), user) });
        if (req.method === 'DELETE') return res.json(await service.deleteAsset(id));
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
      }

      if (action === 'render-token' && req.method === 'POST') {
        return res.json({ ok: true, ...(await service.createRenderToken(id, user)) });
      }
      if (action === 'export' && req.method === 'GET') {
        const { html, asset } = await service.loadRenderedHtml(id);
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('Content-Disposition', `attachment; filename="${service.safeDownloadName(asset)}"`);
        res.set('X-Content-Type-Options', 'nosniff');
        return res.status(200).send(html);
      }
      return res.status(404).json({ ok: false, error: 'Not found' });
    } catch (e) {
      const status = errorStatus(e);
      if (status >= 500) console.error('[demoAssetsApi]', e);
      return res.status(status).json({ ok: false, error: status >= 500 && !e.status ? 'Demo asset request failed' : e.message });
    }
  });

  return { demoAssetsApi };
}

module.exports = { registerDemoAssetsRoutes, parseRoute };
