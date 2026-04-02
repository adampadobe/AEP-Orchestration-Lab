/**
 * Resolve HTTP API streaming collection URL + flow id from Flow Service after the user creates the dataflow in AEP.
 */

const FLOW_SERVICE = 'https://platform.adobe.io/data/foundation/flowservice';
const { CONSENT_HTTP_DATAFLOW_NAME } = require('./consentInfraService');

function logFlowLookup(sandbox, phase, detail = {}) {
  try {
    console.log('[consentFlowLookup]', JSON.stringify({ sandbox, phase, ...detail }));
  } catch (_) {
    console.log('[consentFlowLookup]', sandbox, phase);
  }
}

function headers(token, clientId, orgId, sandbox) {
  return {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
    Accept: 'application/json',
  };
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

/** Flow Service often wraps entities in `items[0]`. */
function unwrapEntity(data) {
  if (!data || typeof data !== 'object') return null;
  if (Array.isArray(data.items) && data.items[0]) return data.items[0];
  if (data.id) return data;
  return null;
}

function extractInletUrl(sourceEntity) {
  if (!sourceEntity || typeof sourceEntity !== 'object') return null;
  const direct = [
    sourceEntity.params?.inletUrl,
    sourceEntity.params?.inletURL,
    sourceEntity.data?.inletUrl,
    sourceEntity.data?.inletURL,
  ];
  for (const c of direct) {
    if (typeof c === 'string' && c.includes('dcs.adobedc.net')) return c.trim();
  }
  const seen = new Set();
  function walk(o, depth) {
    if (!o || depth > 14) return null;
    if (typeof o === 'string' && o.includes('dcs.adobedc.net') && o.includes('collection')) return o.trim();
    if (typeof o !== 'object' || seen.has(o)) return null;
    seen.add(o);
    for (const v of Object.values(o)) {
      const w = walk(v, depth + 1);
      if (w) return w;
    }
    return null;
  }
  return walk(sourceEntity, 0);
}

async function getFlow(token, clientId, orgId, sandbox, flowId) {
  const url = `${FLOW_SERVICE}/flows/${encodeURIComponent(flowId)}`;
  return fetchJson(url, { method: 'GET', headers: headers(token, clientId, orgId, sandbox) });
}

async function listFlowsByProperty(token, clientId, orgId, sandbox, propertyExpr) {
  const q = new URLSearchParams({ property: propertyExpr, limit: '50' });
  const url = `${FLOW_SERVICE}/flows?${q.toString()}`;
  return fetchJson(url, { method: 'GET', headers: headers(token, clientId, orgId, sandbox) });
}

async function listFlowsPage(token, clientId, orgId, sandbox, limit = 100) {
  const url = `${FLOW_SERVICE}/flows?limit=${limit}&orderby=-createdAt`;
  return fetchJson(url, { method: 'GET', headers: headers(token, clientId, orgId, sandbox) });
}

async function getSourceConnection(token, clientId, orgId, sandbox, sourceConnectionId) {
  const url = `${FLOW_SERVICE}/sourceConnections/${encodeURIComponent(sourceConnectionId)}`;
  return fetchJson(url, { method: 'GET', headers: headers(token, clientId, orgId, sandbox) });
}

/**
 * @param {string} sandbox
 * @param {string} token
 * @param {string} clientId
 * @param {string} orgId
 * @param {{ flowId?: string, flowName?: string }} opts
 */
async function lookupConsentHttpFlow(sandbox, token, clientId, orgId, opts = {}) {
  const flowName = String(opts.flowName || CONSENT_HTTP_DATAFLOW_NAME).trim();
  const flowIdArg = String(opts.flowId || '').trim();

  logFlowLookup(sandbox, 'lookup.start', { hasFlowId: !!flowIdArg, flowName });

  let flow = null;

  if (flowIdArg) {
    const { res, data } = await getFlow(token, clientId, orgId, sandbox, flowIdArg);
    if (!res.ok) {
      const msg = data.message || data.title || data.detail || res.statusText;
      logFlowLookup(sandbox, 'lookup.flowById.fail', { httpStatus: res.status, msg: String(msg).slice(0, 200) });
      return { ok: false, sandbox, error: `Flow Service GET flow failed: ${msg}` };
    }
    flow = unwrapEntity(data);
    if (!flow || !flow.id) {
      return { ok: false, sandbox, error: 'Unexpected flow response shape from Flow Service.' };
    }
  } else {
    const propertyExpr = `name==${flowName}`;
    let { res, data } = await listFlowsByProperty(token, clientId, orgId, sandbox, propertyExpr);
    let items = Array.isArray(data.items) ? data.items : [];
    if (res.ok && items.length > 0) {
      flow = items.find((f) => f && f.name === flowName) || null;
    }
    if (!flow) {
      logFlowLookup(sandbox, 'lookup.listByName.fallback', {
        httpStatus: res.status,
        propertyOk: res.ok,
        filteredCount: items.length,
      });
      const page = await listFlowsPage(token, clientId, orgId, sandbox, 100);
      if (!page.res.ok) {
        const msg = page.data.message || page.data.title || page.res.statusText;
        return { ok: false, sandbox, error: `Flow Service list flows failed: ${msg}` };
      }
      items = Array.isArray(page.data.items) ? page.data.items : [];
      flow = items.find((f) => f && f.name === flowName) || null;
    }
    if (!flow || !flow.id) {
      return {
        ok: false,
        sandbox,
        error: `No dataflow named "${flowName}" in this sandbox. Create it in Sources → Streaming → HTTP API, or pass ?flowId= if the name differs.`,
      };
    }
  }

  const resolvedFlowId = flow.id;
  const sourceIds = Array.isArray(flow.sourceConnectionIds) ? flow.sourceConnectionIds : [];
  if (sourceIds.length === 0) {
    return {
      ok: false,
      sandbox,
      flowId: resolvedFlowId,
      error: 'Flow has no sourceConnectionIds; cannot resolve DCS collection URL.',
    };
  }

  let inletUrl = null;
  for (const sid of sourceIds) {
    const { res, data } = await getSourceConnection(token, clientId, orgId, sandbox, sid);
    if (!res.ok) continue;
    const src = unwrapEntity(data) || data;
    inletUrl = extractInletUrl(src);
    if (inletUrl) break;
  }

  if (!inletUrl) {
    logFlowLookup(sandbox, 'lookup.inlet.missing', {
      flowId: resolvedFlowId,
      sourceIdsTried: sourceIds.length,
    });
    return {
      ok: false,
      sandbox,
      flowId: resolvedFlowId,
      error:
        'Found the flow but no DCS collection URL on its source connection(s). Check Flow Service / UI for this sandbox.',
    };
  }

  logFlowLookup(sandbox, 'lookup.ok', { flowId: resolvedFlowId, inletHost: 'dcs.adobedc.net' });

  return {
    ok: true,
    sandbox,
    flowId: resolvedFlowId,
    url: inletUrl,
    flowName: flow.name || flowName,
  };
}

module.exports = { lookupConsentHttpFlow };
