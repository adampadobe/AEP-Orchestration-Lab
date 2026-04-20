/**
 * Edge Decisioning — Launch (Tags) rule helpers.
 *
 * Preview-only (PR-A): given a property ref (PR… id or name), a rule name,
 * a target page URL, and a placement list, find the rule's "Send Event"
 * action and compute what the updated surfaces / decisionScopes would be.
 *
 * Merge strategy: preserve any surface whose host+path differs from the
 * target page (the 'theirs' partition). Replace only the host+path
 * matching entries with freshly generated ones from the placements.
 */

'use strict';

const tagsReactorService = require('./tagsReactorService');

const DEFAULT_RULE_NAME = 'Page View';
const SEND_EVENT_DELEGATE_HINT = 'send-event';

function parseTarget(urlLike) {
  try {
    const u = new URL(urlLike);
    const path = (u.pathname || '/').replace(/\/+$/, '') || '/';
    return { host: u.host, path, rawUrl: u.toString(), ok: true };
  } catch (_e) {
    return { host: '', path: '', rawUrl: String(urlLike || ''), ok: false };
  }
}

function dedup(arr) {
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    if (v == null) continue;
    const s = String(v);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function surfaceBelongsToTarget(surface, target) {
  if (!surface || !target || !target.host) return false;
  const prefix = `web://${target.host}${target.path}`;
  return surface === prefix || surface.startsWith(prefix + '#');
}

function partitionByTarget(list, target) {
  const ours = [];
  const theirs = [];
  for (const s of list || []) {
    (surfaceBelongsToTarget(s, target) ? ours : theirs).push(s);
  }
  return { ours, theirs };
}

function computeLabSurfacesFromPlacements(target, placements) {
  if (!target || !target.ok) return { surfaces: [], scopes: [] };
  const base = `web://${target.host}${target.path}`;
  const surfaces = [];
  const scopes = [base];
  for (const p of placements || []) {
    const frag = (p && p.fragment ? String(p.fragment) : '').trim().replace(/^#/, '');
    if (!frag) continue;
    surfaces.push(`${base}#${frag}`);
  }
  return { surfaces: dedup(surfaces), scopes: dedup(scopes) };
}

/** Resolve a property reference (PR… id or name) to a canonical property record. */
async function resolveProperty({ accessToken, clientId, orgId, propertyRef }) {
  const ref = String(propertyRef || '').trim();
  if (!ref) return { ok: false, error: 'propertyRef is required' };

  const all = await tagsReactorService.listAllPropertiesAcrossCompanies(accessToken, clientId, orgId);
  if (!all.ok) return { ok: false, error: all.error || 'Could not list properties' };
  const items = Array.isArray(all.items) ? all.items : [];

  // Exact ID match
  if (/^PR[a-f0-9]{16,64}$/i.test(ref)) {
    const byId = items.find(p => (p.propertyId || p.id) === ref);
    if (byId) return { ok: true, propertyId: ref, propertyName: byId.name || '', companyId: byId.companyId || '' };
    // Even if we can't find it in the cross-company list, we trust the ID.
    return { ok: true, propertyId: ref, propertyName: '', companyId: '' };
  }

  // Name matches (exact first, then partial)
  const refLower = ref.toLowerCase();
  const exact = items.find(p => String(p.name || '').toLowerCase() === refLower);
  if (exact) {
    return { ok: true, propertyId: exact.propertyId || exact.id, propertyName: exact.name, companyId: exact.companyId || '' };
  }
  const partials = items.filter(p => String(p.name || '').toLowerCase().includes(refLower));
  if (partials.length === 1) {
    return { ok: true, propertyId: partials[0].propertyId || partials[0].id, propertyName: partials[0].name, companyId: partials[0].companyId || '' };
  }
  if (partials.length > 1) {
    return {
      ok: false,
      error: `"${ref}" matches ${partials.length} properties. Use the full name or the PR… ID.`,
      matches: partials.slice(0, 8).map(p => ({ name: p.name, propertyId: p.propertyId || p.id })),
    };
  }
  return { ok: false, error: `No Tags property matches "${ref}".` };
}

async function previewLaunchRuleUpdate({
  accessToken,
  clientId,
  orgId,
  propertyRef,
  ruleName,
  targetPageUrl,
  placements,
  edgePersonalizationMode,
}) {
  const target = parseTarget(targetPageUrl);
  if (!target.ok || !target.host) {
    return { ok: false, error: 'targetPageUrl is required and must parse as a URL (e.g. https://aep-orchestration-lab.web.app/profile-viewer/race-for-life-demo.html).' };
  }

  const propRes = await resolveProperty({ accessToken, clientId, orgId, propertyRef });
  if (!propRes.ok) return propRes;
  const { propertyId, propertyName } = propRes;

  const rulesRes = await tagsReactorService.listRules(accessToken, clientId, orgId, propertyId);
  if (!rulesRes.ok) return { ok: false, error: rulesRes.error || 'Could not list rules on property', propertyId };
  const wantedRuleName = String(ruleName || DEFAULT_RULE_NAME).trim();
  const wantedLower = wantedRuleName.toLowerCase();
  const rules = Array.isArray(rulesRes.items) ? rulesRes.items : [];
  const rule = rules.find(r => String(r.name || '').toLowerCase() === wantedLower);
  if (!rule) {
    return {
      ok: false,
      error: `No rule named "${wantedRuleName}" on property ${propertyId}.`,
      propertyId,
      availableRules: rules.map(r => r.name).filter(Boolean).slice(0, 40),
    };
  }

  const compsRes = await tagsReactorService.listRuleComponents(accessToken, clientId, orgId, rule.ruleId);
  if (!compsRes.ok) return { ok: false, error: compsRes.error || 'Could not list rule components', propertyId, ruleId: rule.ruleId };
  const components = Array.isArray(compsRes.items) ? compsRes.items : [];
  const action = components.find(c => String(c.delegateDescriptorId || '').includes(SEND_EVENT_DELEGATE_HINT));
  if (!action) {
    return {
      ok: false,
      error: `No "Send Experience Event" action found on rule "${rule.name}".`,
      propertyId,
      ruleId: rule.ruleId,
      availableComponents: components.map(c => ({ name: c.name, delegate: c.delegateDescriptorId })).slice(0, 20),
    };
  }

  const settings = (action.settings && typeof action.settings === 'object') ? action.settings : {};
  const personalization = (settings.personalization && typeof settings.personalization === 'object') ? settings.personalization : {};
  const currentSurfaces = Array.isArray(personalization.surfaces) ? personalization.surfaces.slice() : [];
  const currentScopes = Array.isArray(personalization.decisionScopes) ? personalization.decisionScopes.slice() : [];

  const lab = computeLabSurfacesFromPlacements(target, placements);
  const surfacePartition = partitionByTarget(currentSurfaces, target);
  const scopePartition = partitionByTarget(currentScopes, target);
  const proposedSurfaces = dedup([...surfacePartition.theirs, ...lab.surfaces]);
  const proposedScopes = dedup([...scopePartition.theirs, ...lab.scopes]);

  const surfacesAdded = proposedSurfaces.filter(s => !currentSurfaces.includes(s));
  const surfacesRemoved = currentSurfaces.filter(s => !proposedSurfaces.includes(s));
  const scopesAdded = proposedScopes.filter(s => !currentScopes.includes(s));
  const scopesRemoved = currentScopes.filter(s => !proposedScopes.includes(s));

  return {
    ok: true,
    propertyId,
    propertyName,
    ruleId: rule.ruleId,
    ruleName: rule.name,
    actionId: action.componentId,
    actionName: action.name,
    delegateDescriptorId: action.delegateDescriptorId,
    target: { host: target.host, path: target.path, rawUrl: target.rawUrl },
    placementsCount: Array.isArray(placements) ? placements.length : 0,
    edgePersonalizationMode: edgePersonalizationMode || null,
    currentSettingsPreview: personalization,
    currentSurfaces,
    currentScopes,
    labSurfaces: lab.surfaces,
    labScopes: lab.scopes,
    proposedSurfaces,
    proposedScopes,
    diff: {
      surfacesAdded,
      surfacesRemoved,
      surfacesUnchanged: currentSurfaces.filter(s => proposedSurfaces.includes(s)),
      scopesAdded,
      scopesRemoved,
    },
    writeReady: false, // PR-A is read-only
  };
}

module.exports = {
  DEFAULT_RULE_NAME,
  resolveProperty,
  previewLaunchRuleUpdate,
};
