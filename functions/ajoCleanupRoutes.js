'use strict';

const { resolveMcpAudiencePrincipal } = require('./audienceManagementRoutes');

const JOURNEY_DELETE_STATES = new Set(['DRAFT', 'FINISHED']);
const CAMPAIGN_DELETE_STATES = new Set(['DRAFT']);

function errorStatus(error, fallback = 500) {
  const status = Number(error && error.status);
  return status >= 400 && status <= 599 ? status : fallback;
}

function requestedSandbox(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  return String(body.sandbox || req.query.sandbox || '').trim().toLowerCase();
}

function deletionReview(assetType, asset, sandbox) {
  const allowed = assetType === 'journey' ? JOURNEY_DELETE_STATES : CAMPAIGN_DELETE_STATES;
  const blockers = [];
  if (!allowed.has(asset.status)) {
    blockers.push(assetType === 'journey'
      ? `Journey status ${asset.status || '(unknown)'} is not deletable. Only Draft or Finished journeys are eligible.`
      : `Campaign status ${asset.status || '(unknown)'} is not deletable. Adobe permits campaign deletion only in Draft.`);
  }
  return {
    ok: true,
    sandbox,
    assetType,
    [assetType]: asset,
    review: {
      blockers,
      warnings: [
        'Deletion is permanent and one-at-a-time. The server will re-read the asset and revalidate its exact identity and status immediately before deletion.',
        'The delete operation uses the same AJO authoring surface as the product UI; Adobe can still reject it because of permissions or dependencies.',
      ],
      deleteReviewReady: blockers.length === 0,
    },
    confirmation: {
      [`${assetType}_id`]: asset.id,
      expected_name: asset.name,
      expected_status: asset.status,
      instruction: `Show this exact ${assetType} ID, name, status, and sandbox. Delete only after explicit confirmation of this one ${assetType}.`,
    },
  };
}

function registerAjoCleanupRoutes(deps) {
  const {
    onRequest, profileFnOpts, setCors, getAdobeAccessToken, ADOBE_CLIENT_ID, ADOBE_IMS_ORG,
    mcpApiKeyStore, ajoCleanupService,
  } = deps;

  const ajoCleanupProxy = onRequest(profileFnOpts, async (req, res) => {
    setCors(res, 'GET, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (!['GET', 'DELETE'].includes(req.method)) return res.status(405).json({ ok: false, error: 'Method not allowed' });

    let principal;
    try { principal = await resolveMcpAudiencePrincipal(req, mcpApiKeyStore); }
    catch (error) { return res.status(500).json({ ok: false, error: 'MCP key validation failed.', detail: String(error.message || error) }); }
    if (!principal.ok) return res.status(principal.status).json(principal.body);

    const sandbox = requestedSandbox(req) || String(principal.sandbox).toLowerCase();
    if (sandbox !== String(principal.sandbox).toLowerCase()) {
      return res.status(403).json({ ok: false, error: `This MCP key is scoped to sandbox "${principal.sandbox}", not "${sandbox}".` });
    }

    const assetType = String(req.query.asset_type || req.body?.asset_type || '').trim().toLowerCase();
    if (!['journey', 'campaign'].includes(assetType)) {
      return res.status(400).json({ ok: false, error: 'asset_type must be journey or campaign.' });
    }

    let token;
    try { token = await getAdobeAccessToken(); }
    catch (error) { return res.status(500).json({ ok: false, error: 'Adobe authentication failed.', detail: String(error.message || error) }); }
    const auth = { token, clientId: ADOBE_CLIENT_ID.value(), orgId: ADOBE_IMS_ORG.value(), sandbox };
    const service = ajoCleanupService;

    try {
      if (req.method === 'GET') {
        const assetId = String(req.query.asset_id || '').trim();
        if (assetId) {
          const asset = assetType === 'journey'
            ? await service.getJourney({ ...auth, journeyId: assetId })
            : await service.getCampaign({ ...auth, campaignId: assetId });
          return res.status(200).json(deletionReview(assetType, asset, sandbox));
        }
        const params = { ...auth, start: req.query.start, limit: req.query.limit, name: req.query.name };
        const payload = assetType === 'journey' ? await service.listJourneys(params) : await service.listCampaigns(params);
        return res.status(200).json({ ok: true, assetType, ...payload });
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const assetId = String(body.asset_id || '').trim();
      const expectedName = String(body.expected_name || '');
      const expectedStatus = String(body.expected_status || '').trim().toUpperCase();
      if (body.confirmed !== true || !assetId || !expectedName || !expectedStatus) {
        return res.status(400).json({
          ok: false,
          error: 'asset_id, exact expected_name, expected_status, and confirmed=true are required after explicit colleague confirmation.',
        });
      }

      const asset = assetType === 'journey'
        ? await service.getJourney({ ...auth, journeyId: assetId })
        : await service.getCampaign({ ...auth, campaignId: assetId });
      if (asset.id !== assetId || asset.name !== expectedName || asset.status !== expectedStatus) {
        return res.status(409).json({
          ok: false,
          error: `${assetType} identity or lifecycle changed. Re-run the audit and obtain fresh confirmation.`,
          current: { id: asset.id, name: asset.name, status: asset.status },
        });
      }
      const review = deletionReview(assetType, asset, sandbox);
      if (!review.review.deleteReviewReady) {
        return res.status(409).json({ ok: false, error: review.review.blockers[0], review: review.review });
      }

      if (assetType === 'journey') await service.deleteJourney({ ...auth, journeyId: assetId });
      else await service.deleteCampaign({ ...auth, campaignId: assetId });
      return res.status(200).json({
        ok: true,
        sandbox,
        deleted: { assetType, id: asset.id, name: asset.name, status: asset.status },
        deletedAt: new Date().toISOString(),
      });
    } catch (error) {
      return res.status(errorStatus(error)).json({
        ok: false, error: String(error.message || error), platformStatus: Number(error.status) || null,
        platformResponse: error.platformResponse || null,
      });
    }
  });

  return { ajoCleanupProxy };
}

module.exports = { JOURNEY_DELETE_STATES, CAMPAIGN_DELETE_STATES, deletionReview, registerAjoCleanupRoutes };
