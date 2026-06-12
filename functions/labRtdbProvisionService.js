/**
 * Provision per-user RTDB demo config on lab approval (Admin SDK).
 * Path: ajoLookups/{ldapSlug}/sandboxes/{sandboxSlug}/…
 */
const admin = require('firebase-admin');
const { ldapSlugFromEmail, normalizeLdapSlug } = require('./labRtdbSlug');

const DEMO_SECTIONS = ['iPad', 'CallCentre', 'AgenticLayer', 'ExpAccelerator', 'ExpVisualiser', 'ContentDecisionLive'];

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
      FlightTerminalInfo: 'Terminal 3 · Concourse B',
      CaptainName: 'Captain Lee',
      CoPilotName: 'First Officer Jordan',
    },
    CoreDemoData: {
      name: 'Etihad Airways',
      airlineName: 'Etihad Airways',
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

function splitStubIntoSections(flat) {
  const src = flat && typeof flat === 'object' ? flat : buildFlatLabStub();
  return {
    iPad: {
      StaffPortal: src.StaffPortal || {},
      CoreDemoData: src.CoreDemoData || {},
      Mobile: src.Mobile || {},
      TravelData: src.TravelData || {},
      CustomerLoyalty: src.CustomerLoyalty || {},
    },
    CallCentre: {
      StaffPortal: src.StaffPortal || {},
      CoreDemoData: src.CoreDemoData || {},
      Mobile: src.Mobile || {},
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
    sandboxes: {},
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
    if (!existing.sandboxes) patch.sandboxes = {};
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

  const defaultSandbox = normalizeLdapSlug(input.defaultSandbox || ldapSlug);
  if (defaultSandbox) {
    await ensureSandboxStub(db, ldapSlug, defaultSandbox, { mergeDefaults: true });
  }

  return { ok: true, ldapSlug, uid, defaultSandbox: defaultSandbox || null };
}

/**
 * Merge default demo sections under sandboxes/{sandboxSlug} if missing.
 */
async function ensureSandboxStub(db, ldapSlug, sandboxSlug, opts) {
  const sb = normalizeLdapSlug(sandboxSlug);
  const ldap = normalizeLdapSlug(ldapSlug);
  if (!ldap || !sb) return { ok: false, reason: 'invalid_slug' };

  const database = db || getRtdb();
  const sbRef = database.ref(`ajoLookups/${ldap}/sandboxes/${sb}`);
  const snap = await sbRef.once('value');
  const existing = snap.val() || {};
  const defaults = splitStubIntoSections(buildFlatLabStub());
  const patch = {};

  DEMO_SECTIONS.forEach((section) => {
    if (!existing[section] && opts && opts.mergeDefaults) {
      patch[section] = defaults[section] || {};
    }
  });

  if (Object.keys(patch).length) {
    await sbRef.update(patch);
  }

  return { ok: true, ldapSlug: ldap, sandboxSlug: sb, merged: Object.keys(patch) };
}

module.exports = {
  DEMO_SECTIONS,
  buildFlatLabStub,
  splitStubIntoSections,
  buildSandboxStub,
  buildEmptyRootMeta,
  provisionUserRtdbWorkspace,
  ensureSandboxStub,
  claimWorkspaceSlugTransaction,
};
