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
        if (Object.keys(query).some((key) => !['sandbox', 'refresh', 'scheduler', 'scheduledProfiles', 'day', 'slot', 'profile'].includes(key))
          || (query.sandbox !== undefined && query.sandbox !== 'apalmer')
          || (query.refresh !== undefined && !['true', 'false'].includes(query.refresh))
          || (query.scheduler !== undefined && !['true', 'false'].includes(query.scheduler))
          || (query.scheduledProfiles !== undefined && !['list', 'verify'].includes(query.scheduledProfiles))
          || (query.day !== undefined && (typeof query.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(query.day)))
          || (query.slot !== undefined && (typeof query.slot !== 'string' || !/^\d{2}$/.test(query.slot)))
          || (query.profile !== undefined && (typeof query.profile !== 'string' || !/^(?:0|[1-4]?\d)$/.test(query.profile)))
          || (!query.scheduledProfiles && ['day', 'slot', 'profile'].some((key) => query[key] !== undefined))
          || (query.scheduledProfiles && (query.refresh !== undefined || query.scheduler !== undefined))
          || (query.scheduledProfiles === 'list' && (query.slot !== undefined || query.profile !== undefined))
          || (query.scheduledProfiles === 'verify' && [query.day, query.slot, query.profile].some((value) => value === undefined))) {
          return res.status(400).json({ ok: false, error: 'Use the fixed apalmer scope and one supported architecture, scheduler, or scheduled-profile read.' });
        }
        if (query.scheduledProfiles) {
          if (typeof services.getScheduledProfiles !== 'function') {
            return res.status(503).json({ ok: false, error: 'Scheduled profile readback is unavailable.' });
          }
          try {
            const schedulerProfiles = await services.getScheduledProfiles({
              principalUid: owner.uid, sandbox: 'apalmer', day: query.day,
              slot: query.slot, profile: query.profile === undefined ? undefined : Number(query.profile),
              verify: query.scheduledProfiles === 'verify',
            });
            return res.status(200).json({ ok: true, sandbox: 'apalmer', schedulerProfiles });
          } catch (error) {
            logger.error('[my-data-flows] Scheduled profile read failed', { code: error.code || 'unavailable' });
            const status = [400, 403, 404].includes(error.status) ? error.status : 503;
            return res.status(status).json({ ok: false, error: status === 400
              ? 'Choose a valid date and saved profile within the last seven days.'
              : status === 403 ? 'Scheduled profiles are available only to the schedule owner.'
                : status === 404 ? 'The saved scheduled profile is not available.'
                  : 'Scheduled profile readback is unavailable. No data was created or replayed.' });
          }
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
        let scheduler = null;
        if (query.scheduler === 'true') {
          if (typeof services.getSchedulerDiagnostics !== 'function') {
            return res.status(503).json({ ok: false, error: 'Scheduler diagnostics are unavailable.' });
          }
          try {
            scheduler = await services.getSchedulerDiagnostics({ principalUid: owner.uid, sandbox: 'apalmer' });
          } catch (error) {
            logger.error('[my-data-flows] Scheduler diagnostics unavailable', { code: error.code || 'unavailable' });
            return res.status(503).json({ ok: false, error: 'Scheduler diagnostics are unavailable. Retry the scheduler health read.' });
          }
        }
        return res.status(200).json({ ok: true, sandbox: 'apalmer', reference, live, scheduler });
      } catch (error) {
        logger.error('[my-data-flows] Unable to read architecture', { code: error.code || 'unavailable' });
        return res.status(503).json({ ok: false, error: 'Architecture data is unavailable. Retry without refresh to read the reference.' });
      }
    }),
  };
}

module.exports = { registerMyDataFlowsRoutes };
