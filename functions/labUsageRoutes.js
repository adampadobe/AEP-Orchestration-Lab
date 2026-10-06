'use strict';

const { requireUsageOwner, getUsageSnapshot } = require('./labUsageService');
const { ROUTES, NOTICE, telemetryEnabled, requireTelemetryUser, collectEvent } = require('./labUsageTelemetry');

function registerLabUsageRoutes({ onRequest, CONSENT_STORE_FN_OPTS, setCors, getServices, logger = console, isTelemetryEnabled = telemetryEnabled }) {
  const cache = new Map();
  function services() {
    if (getServices) return getServices();
    const admin = require('firebase-admin');
    const { getAdminFirestore } = require('./adminFirestore');
    const db = getAdminFirestore();
    return { auth: admin.auth(), db };
  }
  return {
    labUsageEvents: onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
      setCors(res, 'GET, POST, OPTIONS');
      res.set('Cache-Control', 'private, no-store');
      if (req.method === 'OPTIONS') return res.status(204).send('');
      if (!['GET', 'POST'].includes(req.method)) {
        res.set('Allow', 'GET, POST, OPTIONS');
        return res.status(405).json({ ok: false, error: 'Use GET for collection status or POST for an event.' });
      }
      const enabled = isTelemetryEnabled();
      if (req.method === 'GET') return res.status(200).json({ ok: true, enabled, version: 2, routes: ROUTES, notice: NOTICE });
      if (!enabled) return res.status(403).json({ ok: false, error: 'Usage collection is disabled.' });
      if (!/^application\/json(?:;|$)/i.test(String(req.headers?.['content-type'] || ''))) {
        return res.status(415).json({ ok: false, error: 'Use application/json.' });
      }
      if (req.rawBody && req.rawBody.length > 1024) {
        return res.status(413).json({ ok: false, error: 'Usage events must not exceed 1 KB.' });
      }
      try {
        const { auth, db, getAccessStatus } = services();
        const claims = await requireTelemetryUser(req, auth);
        const token = req.headers.authorization.split(/\s+/)[1];
        const access = getAccessStatus
          ? await getAccessStatus(token)
          : await require('./labWorkspaceAuthService').getLabAccessStatusFromIdTokenRequest({ idToken: token });
        // Legacy enabled accounts with no approval document already pass the lab gate.
        if (!['approved', 'missing', 'not_applicable'].includes(access.status)) {
          return res.status(403).json({ ok: false, error: 'Lab access is pending approval.' });
        }
        const result = await collectEvent({ db, claims, body: req.body });
        return res.status(200).json({ ok: true, ...result });
      } catch (error) {
        if ([400, 401, 403, 409, 429].includes(error.status)) {
          if (error.status === 429) res.set('Retry-After', '60');
          return res.status(error.status).json({ ok: false, error: error.message });
        }
        logger.error('[lab-usage] Unable to collect usage event', { code: error.code || 'unknown' });
        return res.status(503).json({ ok: false, error: 'Usage collection is temporarily unavailable.' });
      }
    }),
    labUsageStats: onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
      setCors(res, 'GET, OPTIONS');
      res.set('Cache-Control', 'private, no-store');
      res.set('Vary', 'Authorization');
      if (req.method === 'OPTIONS') return res.status(204).send('');
      if (req.method !== 'GET') {
        res.set('Allow', 'GET, OPTIONS');
        return res.status(405).json({ ok: false, error: 'Use GET for usage statistics.' });
      }
      try {
        const { auth, db } = services();
        const owner = await requireUsageOwner(req, auth);
        if (owner.status) return res.status(owner.status).json({ ok: false, error: owner.error });
        const rawDays = req.query?.days ?? '30';
        if (typeof rawDays !== 'string' || !['7', '30', '90'].includes(rawDays)) {
          return res.status(400).json({ ok: false, error: 'days must be 7, 30 or 90.' });
        }
        const days = Number(rawDays);
        const exclusion = req.query?.excludeOwner ?? 'false';
        if (!['false', 'true'].includes(exclusion)) {
          return res.status(400).json({ ok: false, error: 'excludeOwner must be true or false.' });
        }
        const cacheKey = owner.uid + ':' + days + ':' + exclusion;
        const existing = cache.get(cacheKey);
        if (existing && Date.now() - existing.at < 60000) {
          return res.status(200).json({ ok: true, ...existing.snapshot });
        }
        const snapshot = await getUsageSnapshot({ auth, db, days, telemetryCollectionEnabled: isTelemetryEnabled(),
          excludedUid: exclusion === 'true' ? owner.uid : null });
        cache.set(cacheKey, { at: Date.now(), snapshot });
        return res.status(200).json({ ok: true, ...snapshot });
      } catch (error) {
        logger.error('[lab-usage] Unable to read usage statistics', { code: error.code || 'unknown' });
        return res.status(503).json({ ok: false, error: 'Usage statistics are temporarily unavailable. Retry shortly.' });
      }
    }),
  };
}

module.exports = { registerLabUsageRoutes };
