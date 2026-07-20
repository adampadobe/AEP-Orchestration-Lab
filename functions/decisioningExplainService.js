/**
 * Explain Edge decisioning propositions — scope→mount mapping, content summaries,
 * treatment name resolution (joLookups).
 */

const { DEFAULT_PLACEMENTS, sanitizePlacements } = require('./decisionLabConfigStore');
const joLookups = require('./joLookups');

function collectScopeStrings(p) {
  /** @type {string[]} */
  const out = [];
  if (!p || typeof p !== 'object') return out;
  if (p.scope) out.push(String(p.scope));
  const sd = p.scopeDetails;
  if (sd && typeof sd === 'object') {
    if (sd.scope) out.push(String(sd.scope));
    if (sd.name) out.push(String(sd.name));
    if (sd.activity && sd.activity.id) out.push(String(sd.activity.id));
    if (sd.characteristics && sd.characteristics.surface) out.push(String(sd.characteristics.surface));
  }
  return out;
}

function scopeMatchesFragment(scopeStr, fragment) {
  if (!scopeStr || !fragment) return false;
  const s = String(scopeStr).toLowerCase();
  const f = String(fragment).toLowerCase();
  return s.includes(`#${f}`) || s.includes(f);
}

/**
 * Map proposition scope strings to placement keys (content-decision-edge-mounts.js).
 * @param {Record<string, unknown>} proposition
 * @param {Array<{ key: string, fragment: string, label?: string }>} placements
 */
function resolvePlacementForProposition(proposition, placements) {
  const list = Array.isArray(placements) && placements.length ? placements : DEFAULT_PLACEMENTS;
  const scopes = collectScopeStrings(proposition);
  for (const p of list) {
    for (const scope of scopes) {
      if (scopeMatchesFragment(scope, p.fragment)) {
        return { key: p.key, fragment: p.fragment, label: p.label || p.fragment };
      }
    }
  }
  return null;
}

function getItemData(item) {
  if (!item) return null;
  return item.data || item.characteristics || item;
}

function pickText(val) {
  if (val == null) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'object' && val.content != null) return String(val.content).trim();
  return String(val).trim();
}

function summarizeItemContent(item) {
  const data = getItemData(item);
  if (!data || typeof data !== 'object') {
    return { schema: item?.schema || null, title: '', description: '', imageUrl: '', url: '' };
  }
  const schema = item?.schema || data.schema || null;
  let title = '';
  let description = '';
  let imageUrl = '';
  let url = '';

  if (data.content && typeof data.content === 'object') {
    title = pickText(data.content.title);
    description = pickText(data.content.body || data.content.text || data.content.description);
    if (data.content.image && typeof data.content.image === 'object') {
      imageUrl = String(data.content.image.url || data.content.image.src || '').trim();
    } else if (typeof data.content.image === 'string') {
      imageUrl = data.content.image.trim();
    }
  }

  if (!title && data.title != null) title = String(data.title).trim();
  if (!description) {
    if (data.fullDescription != null) description = String(data.fullDescription).trim();
    else if (data.text != null) description = String(data.text).trim();
    else if (data.description != null) description = String(data.description).trim();
  }
  if (!imageUrl) {
    if (data.imageURL != null) imageUrl = String(data.imageURL).trim();
    else if (data.imageUrl != null) imageUrl = String(data.imageUrl).trim();
    else if (data.image != null && typeof data.image === 'string') imageUrl = data.image.trim();
  }
  if (data.url != null) url = String(data.url).trim();
  else if (data.link != null) url = String(data.link).trim();

  if (typeof data.content === 'string' && data.content.length > 0 && data.content.length < 500) {
    description = description || data.content.trim();
  }

  return { schema, title, description, imageUrl, url };
}

/**
 * Extract offer-item / treatment ids from a proposition.
 * @param {Record<string, unknown>} proposition
 */
function extractTreatmentIds(proposition) {
  /** @type {Set<string>} */
  const ids = new Set();
  if (!proposition || typeof proposition !== 'object') return [];

  const sd = proposition.scopeDetails;
  if (sd && typeof sd === 'object' && Array.isArray(sd.strategies)) {
    for (const st of sd.strategies) {
      if (st && st.treatmentID) ids.add(String(st.treatmentID).trim());
      if (st && st.treatmentId) ids.add(String(st.treatmentId).trim());
    }
  }

  const items = Array.isArray(proposition.items) ? proposition.items : [];
  for (const item of items) {
    if (item && item.id) ids.add(String(item.id).trim());
    const data = getItemData(item);
    if (data && data.id) ids.add(String(data.id).trim());
    if (data && data.offerId) ids.add(String(data.offerId).trim());
  }

  return [...ids].filter(Boolean);
}

/**
 * @param {Record<string, unknown>[]} propositions
 * @param {Array<{ key: string, fragment: string, label?: string }>} [placements]
 */
function summarizePropositions(propositions, placements) {
  const list = sanitizePlacements(placements);
  const props = Array.isArray(propositions) ? propositions : [];
  return props.map((p, index) => {
    const placement = resolvePlacementForProposition(p, list);
    const items = Array.isArray(p.items) ? p.items : [];
    const itemSummaries = items.slice(0, 5).map((item) => summarizeItemContent(item));
    return {
      index,
      id: p.id || null,
      scope: p.scope || (p.scopeDetails && p.scopeDetails.scope) || null,
      placement: placement || null,
      itemCount: items.length,
      items: itemSummaries,
      treatmentIds: extractTreatmentIds(p),
    };
  });
}

/**
 * Validation checklist when zero or partial propositions return.
 * @param {object} ctx
 */
function buildZeroPropositionChecklist(ctx) {
  const propositions = Array.isArray(ctx.propositions) ? ctx.propositions : [];
  const count = propositions.length;
  /** @type {string[]} */
  const checklist = [];

  if (count === 0) {
    checklist.push('Zero propositions — verify profile qualifies for active AJO/decision policies on this sandbox.');
    checklist.push('Confirm Decision lab datastream includes Adobe Journey Optimizer / personalization service.');
    checklist.push('Surfaces/decisionScopes must match channel configuration fragments in AJO (placement fragment names).');
    checklist.push('Identity: pass email + ecid from lab profile; ECID must be primary when both are present.');
    checklist.push('targetPageUrl in Decision lab config should match web://host/path#fragment surface URIs sent to Edge.');
  } else {
    checklist.push(`${count} proposition(s) returned — map scopes to mounts via placement fragments.`);
  }

  if (ctx.mode === 'surfaces' && Array.isArray(ctx.surfaces) && !ctx.surfaces.length) {
    checklist.push('Surfaces mode but surfaces array is empty — check targetPageUrl and placements.');
  }
  if (ctx.mode === 'decisionScopes' && Array.isArray(ctx.decisionScopes) && !ctx.decisionScopes.length) {
    checklist.push('decisionScopes mode but scopes array is empty — set placements or pass decisionScopes.');
  }
  if (!ctx.datastreamId) {
    checklist.push('Missing datastreamId in Decision lab config.');
  }
  if (!ctx.identityMap || !Object.keys(ctx.identityMap).length) {
    checklist.push('identityMap empty — provide email and/or valid ecid.');
  }

  return checklist;
}

/**
 * @param {object} opts
 * @param {Record<string, unknown>[]} opts.propositions
 * @param {Array<{ key: string, fragment: string }>} [opts.placements]
 * @param {string} opts.sandbox
 * @param {string} opts.accessToken
 * @param {string} opts.clientId
 * @param {string} opts.orgId
 * @param {Record<string, unknown>} [opts.evaluateContext]
 */
async function explainDecisionResponse(opts) {
  const propositions = Array.isArray(opts.propositions) ? opts.propositions : [];
  const placements = sanitizePlacements(opts.placements);
  const summaries = summarizePropositions(propositions, placements);

  /** @type {Set<string>} */
  const allIds = new Set();
  for (const s of summaries) {
    for (const id of s.treatmentIds) allIds.add(id);
  }

  /** @type {Record<string, string | null>} */
  const treatmentNames = {};
  await Promise.all(
    [...allIds].map(async (id) => {
      try {
        const name = await joLookups.getTreatmentNameById(
          id,
          opts.sandbox,
          opts.accessToken,
          opts.clientId,
          opts.orgId,
        );
        treatmentNames[id] = name;
      } catch {
        treatmentNames[id] = null;
      }
    }),
  );

  const enriched = summaries.map((s) => ({
    ...s,
    treatments: s.treatmentIds.map((id) => ({ id, name: treatmentNames[id] || null })),
  }));

  const ctx = opts.evaluateContext && typeof opts.evaluateContext === 'object' ? opts.evaluateContext : {};
  const checklist = buildZeroPropositionChecklist({
    propositions,
    mode: ctx.mode,
    surfaces: ctx.surfaces,
    decisionScopes: ctx.decisionScopes,
    datastreamId: ctx.datastreamId,
    identityMap: ctx.identityMap,
  });

  return {
    ok: true,
    propositionCount: propositions.length,
    summaries: enriched,
    checklist,
    treatmentNames,
  };
}

module.exports = {
  collectScopeStrings,
  scopeMatchesFragment,
  resolvePlacementForProposition,
  summarizeItemContent,
  extractTreatmentIds,
  summarizePropositions,
  buildZeroPropositionChecklist,
  explainDecisionResponse,
};
