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
 *
 * Demo Studio (Vertex):
 *   GET    /api/demo-assets/:id/outline               section outline (?versionId=)
 *   GET    /api/demo-assets/:id/versions              version history
 *   POST   /api/demo-assets/:id/versions/:vId/restore make an old version current
 *   POST   /api/demo-assets/:id/derive                duplicate for another customer
 *   POST   /api/demo-assets/:id/studio/chat           ask Gemini; returns a proposal
 *   POST   /api/demo-assets/:id/studio/apply          apply a pending proposal
 *   POST   /api/demo-assets/:id/studio/discard        discard a pending proposal
 *   GET    /api/demo-assets/:id/studio/conversations/:cId
 *
 * Demo flows (ordered assets + talk tracks; "flows" is never a Firestore auto-id):
 *   GET    /api/demo-assets/flows                 list flows
 *   POST   /api/demo-assets/flows                 create { title, customer, conversationType, description, steps }
 *   POST   /api/demo-assets/flows/suggest         Gemini order + talk track { assetIds, goal, customer, minutes }
 *   GET    /api/demo-assets/flows/:fId            flow
 *   PATCH  /api/demo-assets/flows/:fId            update
 *   DELETE /api/demo-assets/flows/:fId            delete
 *   POST   /api/demo-assets/flows/:fId/present    flow + per-step render URLs
 *
 * Studio chat can exceed the 60s Hosting rewrite limit, so the browser calls
 * it on the cloudfunctions.net URL (/demoAssetsApi/...). Both prefixes parse.
 */

function errorStatus(error, fallback = 500) {
  const status = Number(error && error.status);
  return status >= 400 && status <= 599 ? status : fallback;
}

function parseRoute(req) {
  const full = String(req.originalUrl || req.url || req.path || '').split('?')[0].replace(/\/+$/, '');
  const rest = /\/api\/demo-assets(\/|$)/.test(full)
    ? full.replace(/^.*?\/api\/demo-assets/, '')
    : full.replace(/^.*?\/demoAssetsApi/, '');
  const parts = rest.split('/').filter(Boolean).map((p) => decodeURIComponent(p));
  return parts;
}

function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = req.rawBody ? req.rawBody.toString('utf8') : '';
  return raw ? JSON.parse(raw) : {};
}

function registerDemoAssetsRoutes(deps) {
  const { onRequest, fnOpts, setCors, verifyClaims, service, studio, flows, callGemini } = deps;

  async function requireUser(req) {
    const claims = await verifyClaims(req);
    return service.assertAllowedUser(claims);
  }

  const demoAssetsApi = onRequest(fnOpts, async (req, res) => {
    const parts = parseRoute(req);

    if (parts[0] === 'render') {
      if (req.method !== 'GET') return res.status(405).send('Method not allowed');
      try {
        const target = await service.resolveRenderTarget(parts[1]);
        const html = target.proposalId
          ? await studio.loadProposalRenderedHtml(target.assetId, target.proposalId)
          : (await service.loadRenderedHtml(target.assetId, { versionId: target.versionId })).html;
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
      if (parts[0] === 'flows') {
        if (!flows) return res.status(404).json({ ok: false, error: 'Not found' });
        const [, fId, fAction] = parts;
        if (!fId) {
          if (req.method === 'GET') return res.json({ ok: true, flows: await flows.listFlows() });
          if (req.method === 'POST') return res.status(201).json({ ok: true, flow: await flows.createFlow(readBody(req), user) });
        } else if (fId === 'suggest' && !fAction) {
          if (req.method === 'POST') return res.json({ ok: true, ...(await flows.suggestFlow(readBody(req), user, { callGemini })) });
        } else if (!fAction) {
          if (req.method === 'GET') return res.json({ ok: true, flow: await flows.getFlow(fId) });
          if (req.method === 'PATCH') return res.json({ ok: true, flow: await flows.updateFlow(fId, readBody(req), user) });
          if (req.method === 'DELETE') return res.json(await flows.deleteFlow(fId));
        } else if (fAction === 'present' && req.method === 'POST') {
          return res.json({ ok: true, ...(await flows.presentFlow(fId, user)) });
        }
        return res.status(404).json({ ok: false, error: 'Not found' });
      }

      const [id, action, sub, subAction] = parts;
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
        const body = readBody(req);
        const versionId = typeof body.versionId === 'string' && body.versionId ? body.versionId : undefined;
        const proposalId = typeof body.proposalId === 'string' && body.proposalId ? body.proposalId : undefined;
        if (proposalId) await studio.loadProposal(id, proposalId, user);
        return res.json({ ok: true, ...(await service.createRenderToken(id, user, { versionId, proposalId })) });
      }
      if (action === 'export' && req.method === 'GET') {
        const versionId = typeof req.query?.versionId === 'string' && req.query.versionId ? req.query.versionId : undefined;
        const { html, asset } = await service.loadRenderedHtml(id, { versionId });
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('Content-Disposition', `attachment; filename="${service.safeDownloadName(asset)}"`);
        res.set('X-Content-Type-Options', 'nosniff');
        return res.status(200).send(html);
      }
      if (action === 'outline' && req.method === 'GET') {
        const versionId = typeof req.query?.versionId === 'string' && req.query.versionId ? req.query.versionId : undefined;
        return res.json({ ok: true, ...(await studio.getOutline(id, versionId)) });
      }
      if (action === 'versions') {
        if (!sub && req.method === 'GET') return res.json({ ok: true, versions: await studio.listVersions(id) });
        if (sub && subAction === 'restore' && req.method === 'POST') {
          return res.json({ ok: true, ...(await studio.restoreVersion(id, sub, user)) });
        }
      }
      if (action === 'derive' && req.method === 'POST') {
        return res.status(201).json({ ok: true, ...(await studio.deriveAsset(id, readBody(req), user)) });
      }
      if (action === 'studio') {
        if (sub === 'chat' && req.method === 'POST') {
          return res.json({ ok: true, ...(await studio.studioChat(id, readBody(req), user, { callGemini })) });
        }
        if (sub === 'apply' && req.method === 'POST') {
          return res.json({ ok: true, ...(await studio.applyProposal(id, readBody(req), user)) });
        }
        if (sub === 'discard' && req.method === 'POST') {
          return res.json({ ok: true, proposal: await studio.discardProposal(id, readBody(req), user) });
        }
        if (sub === 'conversations' && subAction && req.method === 'GET') {
          return res.json({ ok: true, conversation: await studio.getConversation(id, subAction, user) });
        }
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
