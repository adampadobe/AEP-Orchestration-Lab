'use strict';

const { requireUsageOwner } = require('./labUsageService');

function registerMyDataFlowsTraceRoutes({ onRequest, fnOpts, setCors, getServices, logger = console }) {
  return {
    myDataFlowsTrace: onRequest({ ...fnOpts, timeoutSeconds: 300, memory: '1GiB' }, async (req, res) => {
      setCors(res, 'GET, POST, OPTIONS');
      res.set('Cache-Control', 'private, no-store');
      res.set('Vary', 'Authorization');
      if (req.method === 'OPTIONS') return res.status(204).send('');
      if (!['GET', 'POST'].includes(req.method)) {
        res.set('Allow', 'GET, POST, OPTIONS');
        return res.status(405).json({ ok: false, error: 'Use GET to inspect or POST to create one test profile.' });
      }
      try {
        const services = getServices();
        const owner = await requireUsageOwner(req, services.auth);
        if (owner.status) return res.status(owner.status).json({
          ok: false, error: owner.status === 401 ? owner.error : 'This trace is available only to the lab owner.',
        });
        const query = req.query || {};
        if (Object.keys(query).some((key) => !['runId', 'refresh'].includes(key))
          || (query.runId !== undefined && typeof query.runId !== 'string')
          || (query.refresh !== undefined && !['true', 'false'].includes(query.refresh))) {
          return res.status(400).json({ ok: false, error: 'Only runId and refresh=true|false are supported.' });
        }
        if (req.method === 'POST') {
          const body = req.body;
          if (Object.keys(query).length || !body || typeof body !== 'object' || Array.isArray(body)
            || Object.keys(body).some((key) => !['industry', 'requestId'].includes(key))
            || typeof body.industry !== 'string' || typeof body.requestId !== 'string') {
            return res.status(400).json({ ok: false, error: 'Supply only industry and requestId.' });
          }
          const run = await services.trace.create(owner.uid, body.industry, body.requestId);
          return res.status(200).json({ ok: true, run });
        }
        const [prefs, run] = await Promise.all([
          services.trace.prefs(owner.uid),
          services.trace.read(owner.uid, query.runId, query.refresh === 'true'),
        ]);
        if (query.runId && !run) return res.status(404).json({ ok: false, error: 'Trace receipt not found.' });
        return res.status(200).json({ ok: true, prefs, run });
      } catch (error) {
        const status = [400, 404, 409, 429, 503].includes(error.status) ? error.status : 503;
        logger.error('[my-data-flows-trace] Request failed', { code: error.code || 'unavailable', status });
        return res.status(status).json({
          ok: false, error: status === 503
            ? 'Trace service is unavailable. Resume the same receipt; never automatically retry creation.'
            : error.tracePublic ? error.message : 'Trace settings or readiness could not be verified. Check the existing generation and Snowflake settings.',
        });
      }
    }),
  };
}

module.exports = { registerMyDataFlowsTraceRoutes };
