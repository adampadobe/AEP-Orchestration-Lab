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

/**
 * Scopes sometimes carry a trailing `#` with no fragment (historical paste
 * artefact). Treat `foo` and `foo#` as the same scope — strip the dangling #
 * before comparison or output so merges are genuinely idempotent.
 */
function normaliseScope(s) {
  if (s == null) return '';
  let v = String(s).trim();
  if (v.endsWith('#')) v = v.slice(0, -1);
  return v;
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
  // Scopes need trailing-# normalisation so `foo` vs `foo#` don't produce a
  // false write. Surfaces keep the raw fragment.
  const currentScopesRaw = Array.isArray(personalization.decisionScopes) ? personalization.decisionScopes.slice() : [];
  const currentScopes = currentScopesRaw.map(normaliseScope);

  const lab = computeLabSurfacesFromPlacements(target, placements);
  const surfacePartition = partitionByTarget(currentSurfaces, target);
  const scopePartition = partitionByTarget(currentScopes, target);
  const proposedSurfaces = dedup([...surfacePartition.theirs, ...lab.surfaces]);
  const proposedScopes = dedup([...scopePartition.theirs, ...lab.scopes.map(normaliseScope)]);

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

function arraysEqualAsSets(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  const sa = new Set(a.map(String));
  for (const v of b) if (!sa.has(String(v))) return false;
  return true;
}

/**
 * Apply the preview's proposed surfaces/decisionScopes back onto the rule
 * component's settings. Will refuse to PATCH if nothing changed (no-op).
 */
async function applyLaunchRuleUpdate(args) {
  const preview = await previewLaunchRuleUpdate(args);
  if (!preview.ok) return preview;

  const samePersonalization = (preview.currentSettingsPreview && typeof preview.currentSettingsPreview === 'object')
    ? preview.currentSettingsPreview
    : {};
  const surfacesChanged = !arraysEqualAsSets(preview.currentSurfaces, preview.proposedSurfaces);
  const scopesChanged = !arraysEqualAsSets(preview.currentScopes, preview.proposedScopes);
  if (!surfacesChanged && !scopesChanged) {
    return {
      ok: true,
      noop: true,
      reason: 'No change — proposed surfaces and scopes match existing state.',
      propertyId: preview.propertyId,
      ruleId: preview.ruleId,
      actionId: preview.actionId,
    };
  }

  // Re-fetch the full component to get the authoritative settings (the preview
  // reads them through the listRuleComponents path which may cache-stringify).
  const current = await tagsReactorService.getRuleComponent(
    args.accessToken, args.clientId, args.orgId, preview.actionId
  );
  if (!current.ok) {
    return { ok: false, error: current.error || 'Could not fetch current component settings.' };
  }

  const baseSettings = (current.item && current.item.settings && typeof current.item.settings === 'object')
    ? current.item.settings
    : {};
  const basePersonalization = (baseSettings.personalization && typeof baseSettings.personalization === 'object')
    ? baseSettings.personalization
    : samePersonalization;

  const newSettings = {
    ...baseSettings,
    personalization: {
      ...basePersonalization,
      surfaces: preview.proposedSurfaces,
      decisionScopes: preview.proposedScopes,
    },
  };

  const patch = await tagsReactorService.updateRuleComponentSettings(
    args.accessToken, args.clientId, args.orgId, preview.actionId, newSettings
  );
  if (!patch.ok) {
    return {
      ok: false,
      error: patch.error || 'Reactor PATCH failed.',
      httpStatus: patch.httpStatus,
      preview,
    };
  }

  return {
    ok: true,
    noop: false,
    propertyId: preview.propertyId,
    propertyName: preview.propertyName,
    ruleId: preview.ruleId,
    ruleName: preview.ruleName,
    actionId: preview.actionId,
    actionName: preview.actionName,
    beforeSurfaces: preview.currentSurfaces,
    afterSurfaces: preview.proposedSurfaces,
    beforeScopes: preview.currentScopes,
    afterScopes: preview.proposedScopes,
    diff: preview.diff,
    publishedToEnvironment: false,
    publishNote: 'Settings updated in Reactor. A build + publish to the Development environment is required before users see it — PR-C wires that up.',
  };
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

/**
 * Resolve the Development environment for a property.
 */
async function findDevelopmentEnvironment({ accessToken, clientId, orgId, propertyId }) {
  const envRes = await tagsReactorService.listEnvironments(accessToken, clientId, orgId, propertyId);
  if (!envRes.ok) return { ok: false, error: envRes.error || 'Could not list environments' };
  const envs = Array.isArray(envRes.items) ? envRes.items : [];
  const dev = envs.find(e => String(e.stage || '').toLowerCase() === 'development');
  if (!dev) {
    return {
      ok: false,
      error: 'No Development environment on property. Create one in Launch → Environments.',
      environments: envs.map(e => ({ name: e.name, stage: e.stage, id: e.environmentId })),
    };
  }
  return { ok: true, environment: dev };
}

/**
 * Publish a rule change to the Development environment.
 *
 * Launch allows only one library per environment. We therefore prefer the
 * library currently bound to Development (commonly 'Main') and add our
 * rule as a resource there. Only if nothing is bound do we create + bind
 * a fresh library.
 *
 * If the bound library isn't in 'development' state (it's been submitted/
 * approved/published and is frozen), we create a new library and bind it —
 * which Launch allows because the previous library has detached.
 */
async function publishRuleToDevelopment({ accessToken, clientId, orgId, propertyId, ruleId, libraryName, buildPollMs = 2000, buildTimeoutMs = 120000 }) {
  // 1) Find Development environment + the library (if any) bound to it.
  const envRes = await findDevelopmentEnvironment({ accessToken, clientId, orgId, propertyId });
  if (!envRes.ok) return envRes;
  const { environment } = envRes;

  const envWithLib = await tagsReactorService.getEnvironment(
    accessToken, clientId, orgId, environment.environmentId, { includeLibrary: true },
  );
  if (!envWithLib.ok) return { ok: false, step: 'getEnvironment', error: envWithLib.error };

  let library = envWithLib.library;
  let libraryReused = false;

  if (library && String(library.state || '').toLowerCase() === 'development') {
    // Reuse the library currently bound to Development.
    libraryReused = true;
  } else {
    // Either nothing bound, or bound library is frozen — create + bind a new one.
    const libRes = await tagsReactorService.createLibrary(
      accessToken, clientId, orgId, propertyId,
      { name: libraryName || `AEP Lab — auto-publish ${new Date().toISOString().slice(0, 19).replace('T', ' ')}` },
    );
    if (!libRes.ok) return { ok: false, step: 'createLibrary', error: libRes.error };
    library = libRes.item;

    const bindRes = await tagsReactorService.setLibraryEnvironment(
      accessToken, clientId, orgId, library.libraryId, environment.environmentId,
    );
    if (!bindRes.ok) return { ok: false, step: 'setLibraryEnvironment', error: bindRes.error, library };
  }

  // 2) Add the rule as a resource. Tolerate "already a resource" —
  //    POST relationships/resources is not idempotent by default and may
  //    error if the rule is already in the library, which is fine.
  const addRes = await tagsReactorService.addLibraryResources(
    accessToken, clientId, orgId, library.libraryId,
    [{ type: 'rules', id: ruleId }],
  );
  if (!addRes.ok) {
    const msg = String(addRes.error || '');
    const isDup = /already|duplicate|conflict/i.test(msg);
    if (!isDup) {
      return { ok: false, step: 'addLibraryResources', error: addRes.error, library, libraryReused };
    }
    // Duplicate resource — proceed.
  }

  // 3) Kick off build.
  const buildRes = await tagsReactorService.createBuild(accessToken, clientId, orgId, library.libraryId);
  if (!buildRes.ok) return { ok: false, step: 'createBuild', error: buildRes.error, library, libraryReused };
  let build = buildRes.build;

  // 6) Poll.
  const started = Date.now();
  while (build && build.status && !['succeeded', 'failed'].includes(String(build.status).toLowerCase())) {
    if (Date.now() - started > buildTimeoutMs) {
      return {
        ok: false,
        step: 'buildPoll',
        error: `Build still in state "${build.status}" after ${Math.round(buildTimeoutMs / 1000)}s. Launch may still finish — check the Tags UI.`,
        library,
        build,
        environment,
      };
    }
    await sleep(buildPollMs);
    const poll = await tagsReactorService.getBuild(accessToken, clientId, orgId, build.buildId);
    if (!poll.ok) {
      return { ok: false, step: 'buildPoll', error: poll.error, library, build, environment };
    }
    build = poll.build;
  }

  const ok = String(build && build.status || '').toLowerCase() === 'succeeded';
  return {
    ok,
    step: ok ? 'published' : 'buildFailed',
    error: ok ? null : `Build ended in state "${build && build.status || 'unknown'}".`,
    library,
    libraryReused,
    build,
    environment,
    elapsedMs: Date.now() - started,
  };
}

async function applyAndPublishLaunchRule(args) {
  const apply = await applyLaunchRuleUpdate(args);
  if (!apply.ok) return apply;

  // If the apply step was a no-op, skip the publish (nothing to push).
  if (apply.noop) return { ...apply, publishedToEnvironment: false, publish: { skipped: true, reason: 'No-op; nothing to build.' } };

  const pub = await publishRuleToDevelopment({
    accessToken: args.accessToken,
    clientId: args.clientId,
    orgId: args.orgId,
    propertyId: apply.propertyId,
    ruleId: apply.ruleId,
  });

  return {
    ...apply,
    publishedToEnvironment: pub.ok === true,
    publish: pub,
  };
}

module.exports = {
  DEFAULT_RULE_NAME,
  resolveProperty,
  previewLaunchRuleUpdate,
  applyLaunchRuleUpdate,
  publishRuleToDevelopment,
  applyAndPublishLaunchRule,
};
