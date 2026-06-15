/**
 * Provision per-user RTDB demo config on lab approval (Admin SDK).
 * Flat workspace only: ajoLookups/{ldapSlug}/{section} — no sandboxes/ nesting.
 */
const admin = require('firebase-admin');
const { ldapSlugFromEmail, normalizeLdapSlug } = require('./labRtdbSlug');

/** Canonical CoreDemoData keys — no airlineName / brand / customerShortName. */
const CANONICAL_CORE_DEMO_KEYS = ['name', 'shortName', 'slogan', 'url', 'customerLogo'];

/** All demo sections live flat at ajoLookups/{ldap}/ — not partitioned by AEP sandbox picker. */
const WORKSPACE_ROOT_SECTIONS = new Set([
  'CoreDemoData',
  'StaffPortal',
  'CallCentre',
  'TravelData',
  'Mobile',
  'CustomerLoyalty',
  'AgenticLayer',
  'ExpAccelerator',
  'ExpVisualiser',
  'ContentDecisionLive',
]);

/** @deprecated — retained for migration scripts; no longer provisioned under sandboxes/. */
const SANDBOX_SECTIONS = [];

/** Legacy composite — not a persisted RTDB path in flat model. */
const LEGACY_NESTED_SECTIONS = ['iPad'];

const DEMO_SECTIONS = [
  ...WORKSPACE_ROOT_SECTIONS,
  ...LEGACY_NESTED_SECTIONS,
];

function getRtdb() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.database();
}

function buildFlatLabStub() {
  const dep = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
  return {
    StaffPortal: {
      AgentName: 'Demo agent',
      AgentID: 'AG-001',
      AgentType: 'Customer Care',
      Colour: '#1473e6',
      TextColourCallCentre: '#ffffff',
      TextColourIpad: '#ffffff',
      FlightTerminalInfo: 'Terminal 3 · Concourse B',
      CaptainName: 'Captain Lee',
      CoPilotName: 'First Officer Jordan',
    },
    CoreDemoData: {
      name: 'Etihad Airways',
    },
    Mobile: {
      StaffName: 'Demo agent',
      StaffId: 'AG-001',
      StaffRole: 'Gate lead',
      Terminal: 'T3',
      Gate: 'B12',
      paxOnBoard: '184',
      CrewManifest: [
        { role: 'Purser', name: 'S. Ahmed' },
        { role: 'Lead', name: 'J. Smith' },
      ],
    },
    TravelData: {
      flightNumber: 'EY455',
      route: 'AUH → LHR',
      origin: 'AUH',
      destination: 'LHR',
      departure: '14:05 local',
      departureIso: dep,
      flightStatus: 'Boarding',
      gate: 'B12',
    },
    CustomerLoyalty: {
      tier: 'Gold',
      miles: '128400',
      balance: '128400',
    },
  };
}

function sanitizeCoreDemoData(partial) {
  const src = partial && typeof partial === 'object' && !Array.isArray(partial) ? partial : {};
  const out = {};
  CANONICAL_CORE_DEMO_KEYS.forEach((key) => {
    out[key] = src[key] != null ? String(src[key]).trim() : '';
  });
  return out;
}

function splitStubIntoSections(flat) {
  const src = flat && typeof flat === 'object' ? flat : buildFlatLabStub();
  const coreSrc = src.CoreDemoData && typeof src.CoreDemoData === 'object' ? src.CoreDemoData : {};
  return {
    CoreDemoData: sanitizeCoreDemoData(coreSrc),
    StaffPortal: Object.assign(
      {
        AgentName: 'Demo agent',
        AgentID: 'AG-001',
        AgentType: 'Customer Care',
        Colour: '#1473e6',
        TextColourCallCentre: '#ffffff',
        TextColourIpad: '#ffffff',
        FlightTerminalInfo: 'Terminal 3 · Concourse B',
      },
      src.StaffPortal || {},
    ),
    iPad: {
      Mobile: src.Mobile || {},
      TravelData: src.TravelData || {},
      CustomerLoyalty: src.CustomerLoyalty || {},
    },
    CallCentre: {
      industryId: 'travel',
    },
    AgenticLayer: {
      agentUrls: {
        brand: '',
        product: '',
        operational: '',
        field: '',
        audience: '',
        journey: '',
        data: '',
        support: '',
      },
    },
    ExpAccelerator: {
      displayNameOverride: '',
      opportunityIndustry: 'general',
      useIndustrySamplePack: true,
    },
    ExpVisualiser: {
      treatmentA: 'https://contenthosting.web.app/experiments/treatmenta.png',
      treatmentB: 'https://contenthosting.web.app/experiments/treatmentb.png',
      treatmentC: 'https://contenthosting.web.app/experiments/treatmentc.png',
      emailA: 'https://contenthosting.web.app/experiments/emailsubjecta.png',
      emailB: 'https://contenthosting.web.app/experiments/emailsubjectb.png',
    },
    ContentDecisionLive: {
      edgeConfigId: '',
      decisionScopes: '',
      edgeForceConfigure: false,
      edgeConfigBySandbox: {},
    },
  };
}

function buildSandboxStub(sandboxSlug) {
  const sections = splitStubIntoSections(buildFlatLabStub());
  return { sandboxSlug, sections };
}

function buildEmptyRootMeta(adobeEmail) {
  return {
    meta: {
      version: 1,
      provisionedAt: new Date().toISOString(),
      adobeEmail: String(adobeEmail || '').trim().toLowerCase(),
    },
  };
}

async function claimWorkspaceSlugTransaction(db, uid, ldapSlug) {
  const refClaim = db.ref(`workspaceClaims/${ldapSlug}`);
  const result = await refClaim.transaction((current) => {
    if (current === null || current === undefined) return uid;
    if (current === uid) return uid;
    return undefined;
  });
  if (!result.committed || result.snapshot.val() !== uid) {
    const err = new Error(`Workspace slug "${ldapSlug}" is already claimed by another user.`);
    err.code = 'slug_taken';
    throw err;
  }
  await db.ref(`userWorkspaceOwners/${uid}`).set(ldapSlug);
  return ldapSlug;
}

/**
 * Idempotent RTDB provision for a lab user.
 * @param {{ uid: string, adobeEmail: string, firstName?: string, lastName?: string, workspaceSlug?: string, defaultSandbox?: string }} input
 */
async function provisionUserRtdbWorkspace(input) {
  const uid = String(input.uid || '').trim();
  if (!uid) throw new Error('uid is required');

  const adobeEmail = String(input.adobeEmail || '').trim().toLowerCase();
  const ldapSlug = normalizeLdapSlug(input.workspaceSlug)
    || ldapSlugFromEmail(adobeEmail, input.firstName, input.lastName);
  if (!ldapSlug) throw new Error('Could not derive LDAP workspace slug');

  const db = getRtdb();
  await claimWorkspaceSlugTransaction(db, uid, ldapSlug);

  const rootRef = db.ref(`ajoLookups/${ldapSlug}`);
  const rootSnap = await rootRef.once('value');
  if (!rootSnap.exists()) {
    await rootRef.set(buildEmptyRootMeta(adobeEmail));
  } else {
    const existing = rootSnap.val() || {};
    const patch = {};
    if (!existing.meta) {
      patch.meta = buildEmptyRootMeta(adobeEmail).meta;
    } else if (adobeEmail && !existing.meta.adobeEmail) {
      patch['meta/adobeEmail'] = adobeEmail;
    }
    if (Object.keys(patch).length) await rootRef.update(patch);
  }

  const wsRef = db.ref(`userWorkspaces/${ldapSlug}`);
  const wsSnap = await wsRef.once('value');
  if (!wsSnap.exists()) {
    await wsRef.set({
      meta: { ldapSlug, adobeEmail, uid },
      sandboxes: {},
    });
  }

  await ensureWorkspaceStub(db, ldapSlug, { mergeDefaults: true });

  return { ok: true, ldapSlug, uid };
}

function demoSectionPath(ldapSlug, sandboxSlug, section) {
  return `ajoLookups/${ldapSlug}/sandboxes/${sandboxSlug}/${section}`;
}

function legacyRootPath(ldapSlug) {
  return `ajoLookups/${ldapSlug}`;
}

function workspaceSectionPath(ldapSlug, section) {
  return `${legacyRootPath(ldapSlug)}/${section}`;
}

/**
 * Admin SDK write for customise panels — flat workspace root or nested sandbox path.
 * @param {import('firebase-admin/database').Database} db
 */
async function saveDemoSection(db, ldapSlug, _sandboxSlug, section, partial) {
  const ldap = normalizeLdapSlug(ldapSlug);
  const sec = String(section || '').trim();
  if (!ldap || !sec) {
    throw new Error('ldapSlug and section are required');
  }
  if (!partial || typeof partial !== 'object' || Array.isArray(partial)) {
    throw new Error('partial must be a plain object');
  }
  if (!WORKSPACE_ROOT_SECTIONS.has(sec) && !LEGACY_NESTED_SECTIONS.includes(sec)) {
    throw new Error(`Unknown demo section: ${sec}`);
  }
  const database = db || getRtdb();
  const payload = sec === 'CoreDemoData' ? sanitizeCoreDemoData(partial) : partial;
  const flatPath = workspaceSectionPath(ldap, sec);
  await database.ref(flatPath).update(payload);
  return {
    ok: true,
    ldapSlug: ldap,
    section: sec,
    flatPath,
  };
}

async function userOwnsWorkspace(db, uid, ldapSlug) {
  const ldap = normalizeLdapSlug(ldapSlug);
  if (!uid || !ldap) return false;
  const database = db || getRtdb();
  const claim = (await database.ref(`workspaceClaims/${ldap}`).once('value')).val();
  if (claim === uid) return true;
  const owner = (await database.ref(`userWorkspaceOwners/${uid}`).once('value')).val();
  return owner === ldap;
}

async function ensureWorkspaceStub(db, ldapSlug, opts) {
  const ldap = normalizeLdapSlug(ldapSlug);
  if (!ldap) return { ok: false, reason: 'invalid_slug' };

  const database = db || getRtdb();
  const rootRef = database.ref(legacyRootPath(ldap));
  const snap = await rootRef.once('value');
  const existing = snap.val() || {};
  const defaults = splitStubIntoSections(buildFlatLabStub());
  const patch = {};

  WORKSPACE_ROOT_SECTIONS.forEach((section) => {
    if (!existing[section] && opts && opts.mergeDefaults) {
      patch[section] = defaults[section] || {};
    }
  });

  if (Object.keys(patch).length) {
    await rootRef.update(patch);
  }

  return { ok: true, ldapSlug: ldap, merged: Object.keys(patch) };
}

/** @deprecated No-op — demo sections are flat at workspace root only. */
async function ensureSandboxStub() {
  return { ok: true, skipped: true, reason: 'flat_workspace_only' };
}

module.exports = {
  CANONICAL_CORE_DEMO_KEYS,
  DEMO_SECTIONS,
  WORKSPACE_ROOT_SECTIONS,
  SANDBOX_SECTIONS,
  LEGACY_NESTED_SECTIONS,
  buildFlatLabStub,
  splitStubIntoSections,
  sanitizeCoreDemoData,
  buildSandboxStub,
  buildEmptyRootMeta,
  provisionUserRtdbWorkspace,
  ensureWorkspaceStub,
  ensureSandboxStub,
  claimWorkspaceSlugTransaction,
  demoSectionPath,
  workspaceSectionPath,
  legacyRootPath,
  saveDemoSection,
  userOwnsWorkspace,
};
