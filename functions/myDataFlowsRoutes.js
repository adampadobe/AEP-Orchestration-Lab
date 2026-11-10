'use strict';

const { requireUsageOwner } = require('./labUsageService');
const { reference } = require('./myDataFlowsReference');

function registerMyDataFlowsRoutes({ onRequest, fnOpts, setCors, getServices, logger = console }) {
  let cached = null;
  let inFlight = null;
  return {
    myDataFlows: onRequest(fnOpts, async (req, res) => {
      setCors(res, 'GET, OPTIONS');
      res.set('Cache-Control', 'private, no-store');
      res.set('Vary', 'Authorization');
      if (req.method === 'OPTIONS') return res.status(204).send('');
      if (req.method !== 'GET') {
        res.set('Allow', 'GET, OPTIONS');
        return res.status(405).json({ ok: false, error: 'Use GET for the read-only architecture page.' });
      }
      try {
        const services = getServices();
        const owner = await requireUsageOwner(req, services.auth);
        if (owner.status) return res.status(owner.status).json({
          ok: false, error: owner.status === 401 ? owner.error : 'This architecture is available only to the lab owner.',
        });
        const query = req.query || {};
        if (Object.keys(query).some((key) => !['sandbox', 'refresh'].includes(key))
          || (query.sandbox !== undefined && query.sandbox !== 'apalmer')
          || (query.refresh !== undefined && !['true', 'false'].includes(query.refresh))) {
          return res.status(400).json({ ok: false, error: 'Only sandbox=apalmer and refresh=true|false are supported.' });
        }
        let live = null;
        if (query.refresh === 'true') {
          if (cached?.uid === owner.uid && Date.now() - cached.at < 60_000) {
            live = cached.value;
          } else {
            if (!inFlight || inFlight.uid !== owner.uid) {
              const promise = (async () => {
                const auth = await services.getAdobeAuth();
                return services.service.snapshot(auth);
              })();
              inFlight = { uid: owner.uid, promise };
            }
            const current = inFlight;
            try {
              live = await current.promise;
              if (!live.complete) logger.warn('[my-data-flows] Live refresh is incomplete', { issueCount: live.limitations.length });
              // Never cache partial metadata as a complete refresh.
              if (live.complete) cached = { uid: owner.uid, at: Date.now(), value: live };
            } finally {
              if (inFlight === current) inFlight = null;
            }
          }
        }
        return res.status(200).json({ ok: true, sandbox: 'apalmer', reference, live });
      } catch (error) {
        logger.error('[my-data-flows] Unable to read architecture', { code: error.code || 'unavailable' });
        return res.status(503).json({ ok: false, error: 'Architecture data is unavailable. Retry without refresh to read the reference.' });
      }
    }),
  };
}

module.exports = { registerMyDataFlowsRoutes };
