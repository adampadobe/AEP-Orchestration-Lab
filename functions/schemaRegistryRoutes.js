/**
 * Schema Registry provisioning routes — extracted from index.js (Phase B).
 */

/**
 * Forward selected Schema Registry list query params (Adobe supports start, limit, etc.).
 * @param {Record<string, unknown>} [q]
 */
function pickSchemaListQuery(q) {
  if (!q || typeof q !== 'object') return {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const key of ['start', 'limit', 'orderBy', 'orderby', 'properties', 'property']) {
    const v = q[key];
    if (v != null && String(v).trim() !== '') out[key === 'orderby' ? 'orderBy' : key] = String(v);
  }
  return out;
}

/**
 * @param {object} deps
 * @returns {Record<string, import('firebase-functions/v2/https').HttpsFunction>}
 */
function registerSchemaRegistryRoutes(deps) {
  const {
    onRequest,
    profileFnOpts,
    setCors,
    resolveSandboxFromQuery,
    getAdobeAccessToken,
    ADOBE_CLIENT_ID,
    ADOBE_IMS_ORG,
    schemaRegistryService,
  } = deps;

  const routes = {};

  /** GET list / GET one ?altId= / POST create → /api/provisioning/tenant-schemas */
  routes.provisioningTenantSchemas = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  const sandbox = resolveSandboxFromQuery(req);
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }
  const clientId = ADOBE_CLIENT_ID.value();
  const orgId = ADOBE_IMS_ORG.value();

  if (req.method === 'GET') {
    const altId = String(req.query.altId || req.query.metaAltId || '').trim();
    try {
      if (altId) {
        const schema = await schemaRegistryService.getTenantSchema(accessToken, clientId, orgId, sandbox, altId);
        res.status(200).json({ sandbox, schema });
        return;
      }
      const query = pickSchemaListQuery(req.query);
      const result = await schemaRegistryService.listTenantSchemas(accessToken, clientId, orgId, sandbox, query);
      res.status(200).json({ sandbox, result });
    } catch (e) {
      const status = e.status && Number(e.status) >= 400 && Number(e.status) < 600 ? e.status : 500;
      res.status(status).json({
        error: String(e.message || e),
        sandbox,
        adobe: e.body || null,
      });
    }
    return;
  }

  if (req.method === 'POST') {
    const body = req.body;
    const descriptor =
      body && typeof body === 'object' && body.descriptor && typeof body.descriptor === 'object'
        ? body.descriptor
        : body;
    if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
      res.status(400).json({
        error: 'JSON body must be a schema descriptor object, or { descriptor: { ... } }',
      });
      return;
    }
    try {
      const schema = await schemaRegistryService.createTenantSchema(accessToken, clientId, orgId, sandbox, descriptor);
      res.status(201).json({ sandbox, schema });
    } catch (e) {
      const status = e.status && Number(e.status) >= 400 && Number(e.status) < 600 ? e.status : 500;
      res.status(status).json({
        error: String(e.message || e),
        sandbox,
        adobe: e.body || null,
      });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed. Use GET (list or ?altId=) or POST (create).' });
});

  /** GET /api/provisioning/field-groups */
  routes.provisioningFieldGroups = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const sandbox = resolveSandboxFromQuery(req);
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }
  const query = pickSchemaListQuery(req.query);
  const classUrl = String(req.query.class || '').trim();
  if (classUrl) query.class = classUrl;

  try {
    const result = await schemaRegistryService.listGlobalFieldGroups(
      accessToken,
      ADOBE_CLIENT_ID.value(),
      ADOBE_IMS_ORG.value(),
      sandbox,
      query
    );
    res.status(200).json({ sandbox, result });
  } catch (e) {
    const status = e.status && Number(e.status) >= 400 && Number(e.status) < 600 ? e.status : 500;
    res.status(status).json({
      error: String(e.message || e),
      sandbox,
      adobe: e.body || null,
    });
  }
});

  /**
   * POST /api/provisioning/tenant-schema/patch
   * Body: { metaAltId, operations, ifMatch? } — operations forwarded as PATCH body to Adobe.
 */
  routes.provisioningTenantSchemaPatch = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }
  const sandbox = resolveSandboxFromQuery(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const metaAltId = String(body.metaAltId || body.altId || '').trim();
  const ifMatch = body.ifMatch != null ? String(body.ifMatch) : '';
  const operations = body.operations != null ? body.operations : body.patch;
  if (!metaAltId) {
    res.status(400).json({ error: 'Missing metaAltId (or altId) in JSON body' });
    return;
  }
  if (operations === undefined || operations === null) {
    res.status(400).json({ error: 'Missing operations (JSON Patch array or Adobe patch payload) in body' });
    return;
  }
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }
  try {
    const schema = await schemaRegistryService.patchTenantSchema(
      accessToken,
      ADOBE_CLIENT_ID.value(),
      ADOBE_IMS_ORG.value(),
      sandbox,
      metaAltId,
      operations,
      ifMatch || undefined
    );
    res.status(200).json({ sandbox, schema });
  } catch (e) {
    const status = e.status && Number(e.status) >= 400 && Number(e.status) < 600 ? e.status : 500;
    res.status(status).json({
      error: String(e.message || e),
      sandbox,
      adobe: e.body || null,
    });
  }
});

  return routes;
}

module.exports = { registerSchemaRegistryRoutes, pickSchemaListQuery };
