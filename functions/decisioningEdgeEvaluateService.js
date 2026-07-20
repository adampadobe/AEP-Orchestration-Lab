/**
 * Server-side Decisioning lab Edge evaluate — mirrors content-decision-live-edge-inline.js
 * + content-decision-edge-mounts.js (surfaces, decisionScopes, identityMap).
 */

const {
  DEFAULT_PLACEMENTS,
  sanitizePlacements,
  getEffectiveDecisionLabConfig,
} = require('./decisionLabConfigStore');
const {
  PERSONALIZATION_SCHEMAS,
  buildDecisionIdentityMap,
  isValidEdgeEcid,
  sendEdgeDecisionEvent,
} = require('./eventEdgeService');

/**
 * Build personalization surfaces from target page URL + placements (Edge lab parity).
 * @param {string} pageUrl
 * @param {Array<{ key: string, fragment: string }>} placements
 */
function buildSurfacesFromPageUrl(pageUrl, placements) {
  const list = Array.isArray(placements) && placements.length ? placements : DEFAULT_PLACEMENTS;
  let host = '';
  let path = '/';
  const raw = String(pageUrl || '').trim();
  if (!raw) {
    return list.map((p) => `#${String(p.fragment).replace(/^#/, '')}`);
  }
  try {
    if (/^web:\/\//i.test(raw)) {
      const withoutScheme = raw.replace(/^web:\/\//i, '');
      const hashIdx = withoutScheme.indexOf('#');
      const hostPath = hashIdx >= 0 ? withoutScheme.slice(0, hashIdx) : withoutScheme;
      const slashIdx = hostPath.indexOf('/');
      if (slashIdx >= 0) {
        host = hostPath.slice(0, slashIdx);
        path = hostPath.slice(slashIdx) || '/';
      } else {
        host = hostPath;
        path = '/';
      }
    } else {
      const u = new URL(raw);
      host = u.host;
      path = (u.pathname || '/').split('?')[0];
    }
  } catch {
    return list.map((p) => `#${String(p.fragment).replace(/^#/, '')}`);
  }
  path = path.replace(/\/+$/, '') || '/';
  if (!host) {
    return list.map((p) => `#${String(p.fragment).replace(/^#/, '')}`);
  }
  const base = `web://${host}${path}`;
  /** @type {string[]} */
  const out = [];
  for (const p of list) {
    out.push(`${base}#${String(p.fragment).replace(/^#/, '')}`);
  }
  for (const p of list) {
    if (/contentcard/i.test(String(p.fragment))) {
      out.push(`#${String(p.fragment).replace(/^#/, '')}`);
      break;
    }
  }
  return out;
}

/**
 * Decision scopes from placements + optional explicit scopes (inline getEffectiveDecisionScopes).
 * @param {string} pageUrl
 * @param {Array<{ fragment: string }>} placements
 * @param {string[]} [extraScopes]
 */
function buildDecisionScopes(pageUrl, placements, extraScopes) {
  const extra = Array.isArray(extraScopes)
    ? extraScopes.map((s) => String(s || '').trim()).filter(Boolean)
    : [];
  if (extra.length) return extra;
  return buildSurfacesFromPageUrl(pageUrl, placements);
}

function resolveViewUrl(config, override) {
  const o = String(override || '').trim();
  if (o) return o;
  const target = String(config?.targetPageUrl || '').trim();
  if (target && !/^web:\/\//i.test(target)) return target;
  if (target) {
    try {
      const without = target.replace(/^web:\/\//i, '');
      const slash = without.indexOf('/');
      if (slash >= 0) return `https://${without.slice(0, slash)}${without.slice(slash)}`;
      return `https://${without}/`;
    } catch {
      return target;
    }
  }
  return '';
}

/**
 * @param {Record<string, unknown>} config
 * @param {Record<string, unknown>} params
 */
function buildEdgeDecisionInteractPayload(config, params) {
  const placements = sanitizePlacements(
    params.placements !== undefined ? params.placements : config?.placements,
  );
  const modeRaw = String(params.mode || config?.edgePersonalizationMode || 'surfaces').trim();
  const mode = modeRaw === 'decisionScopes' ? 'decisionScopes' : 'surfaces';
  const pageUrl = String(params.targetPageUrl || config?.targetPageUrl || '').trim();
  const viewUrl = resolveViewUrl(config, params.viewUrl);
  const viewName = String(params.viewName || 'Decisioning lab (Edge)').trim();
  const email = params.email != null ? String(params.email).trim() : '';
  const ecid = params.ecid != null ? String(params.ecid).trim() : '';
  const namespace = params.namespace != null ? String(params.namespace).trim() : 'email';

  if (!email && !isValidEdgeEcid(ecid)) {
    return { ok: false, error: 'At least one identity required: email and/or ecid (10+ digits).' };
  }

  const identityMap = buildDecisionIdentityMap({ email, ecid, namespace });

  if (mode === 'surfaces') {
    const surfaces = buildSurfacesFromPageUrl(pageUrl, placements);
    return {
      ok: true,
      mode,
      surfaces,
      identityMap,
      payload: {
        event: {
          xdm: {
            identityMap,
            web: {
              webPageDetails: {
                URL: viewUrl || pageUrl || '',
                name: viewName,
                viewName,
              },
            },
          },
        },
        query: {
          personalization: {
            surfaces,
            schemas: PERSONALIZATION_SCHEMAS,
          },
        },
      },
    };
  }

  const decisionScopes = buildDecisionScopes(pageUrl, placements, params.decisionScopes);
  return {
    ok: true,
    mode,
    decisionScopes,
    identityMap,
    payload: {
      event: {
        xdm: {
          eventType: 'web.webpagedetails.pageViews',
          identityMap,
          web: {
            webPageDetails: {
              URL: viewUrl || pageUrl || '',
              name: viewName,
            },
          },
        },
      },
      query: {
        personalization: {
          decisionScopes,
        },
      },
    },
  };
}

/**
 * Evaluate Edge personalization for a sandbox profile identity.
 *
 * @param {object} opts
 * @param {string} opts.sandbox
 * @param {string} [opts.uid]
 * @param {string} opts.accessToken
 * @param {string} opts.clientId
 * @param {string} opts.orgId
 * @param {Record<string, unknown>} [opts.body]
 */
async function evaluateDecisioningEdge(opts) {
  const sandbox = String(opts.sandbox || '').trim();
  const body = opts.body && typeof opts.body === 'object' ? opts.body : {};
  const uid = opts.uid != null ? String(opts.uid).trim() : '';

  const config = await getEffectiveDecisionLabConfig(sandbox, uid);
  const datastreamId = String(body.datastreamId || config?.datastreamId || '').trim();
  if (!datastreamId) {
    return {
      ok: false,
      error:
        'Missing datastreamId. Save Decision lab config (datastream + target page + placements) or pass datastreamId in the request body.',
      sandbox,
      hasConfig: !!config,
    };
  }

  const built = buildEdgeDecisionInteractPayload(config || {}, {
    email: body.email,
    ecid: body.ecid,
    namespace: body.namespace,
    mode: body.mode || body.edgePersonalizationMode,
    decisionScopes: body.decisionScopes,
    targetPageUrl: body.targetPageUrl,
    viewUrl: body.viewUrl,
    viewName: body.viewName,
    placements: body.placements,
  });
  if (!built.ok) {
    return { ok: false, error: built.error, sandbox };
  }

  const edgeResult = await sendEdgeDecisionEvent(
    opts.accessToken,
    opts.clientId,
    opts.orgId,
    datastreamId,
    built.payload,
  );

  return {
    ok: true,
    sandbox,
    datastreamId,
    mode: built.mode,
    surfaces: built.surfaces || null,
    decisionScopes: built.decisionScopes || null,
    identityMap: built.identityMap,
    requestId: edgeResult.requestId,
    propositions: edgeResult.propositions,
    rawHandle: edgeResult.rawHandle,
    sentPayload: built.payload,
    configSummary: {
      targetPageUrl: config?.targetPageUrl || null,
      edgePersonalizationMode: config?.edgePersonalizationMode || 'surfaces',
      placementCount: sanitizePlacements(config?.placements).length,
    },
  };
}

module.exports = {
  buildSurfacesFromPageUrl,
  buildDecisionScopes,
  buildEdgeDecisionInteractPayload,
  evaluateDecisioningEdge,
};
