/**
 * Experience-event identity rules — mirrors functions/eventEdgeService.buildXdm and
 * functions/eventGeneratorService.buildEventGeneratorXdm (_demoemea full style).
 * Profile Viewer: web/profile-viewer/event-generator.js, event-tool.js
 */

import { buildGeneratorPostBody } from './buildGeneratorPostBody.mjs';

/** Default Firestore-backed Edge preset id (functions/eventGeneratorService.js). */
export const LAB_EVENT_TOOL_TARGET_ID = 'lab-event-tool-edge';

/** @param {string | undefined | null} ecid */
export function isValidEcid(ecid) {
  const s = ecid != null ? String(ecid).trim() : '';
  return /^\d{10,}$/.test(s);
}

/**
 * @param {{ email?: string | null, ecid?: string | null }}
 * @returns {{ ok: true, email: string, ecid: string } | { ok: false, error: string }}
 */
export function validateEventIdentity({ email, ecid }) {
  const emailTrim = email != null ? String(email).trim() : '';
  const ecidTrim = ecid != null ? String(ecid).trim() : '';
  if (!emailTrim && !isValidEcid(ecidTrim)) {
    return {
      ok: false,
      error:
        'At least one identity required: email and/or ecid (10+ digits, typically from lab_generate_profile response).',
    };
  }
  return { ok: true, email: emailTrim, ecid: isValidEcid(ecidTrim) ? ecidTrim : '' };
}

/**
 * identityMap shape used by eventEdgeService.buildXdm / Event Generator (known profile).
 * ECID primary when present; Email secondary (primary:true only when ecid absent).
 *
 * @param {{ email?: string, ecid?: string }}
 */
export function buildEventIdentityMap({ email, ecid }) {
  /** @type {Record<string, Array<{ id: string, primary: boolean }>>} */
  const identityMap = {};
  const ecidTrim = isValidEcid(ecid) ? String(ecid).trim() : '';
  const emailTrim = email != null ? String(email).trim() : '';
  if (ecidTrim) {
    identityMap.ECID = [{ id: ecidTrim, primary: true }];
  }
  if (emailTrim) {
    identityMap.Email = [{ id: emailTrim, primary: !ecidTrim }];
  }
  return identityMap;
}

/**
 * Tenant stitching block for _demoemea schemas (matches eventEdgeService.buildXdm).
 *
 * @param {{ email?: string, ecid?: string }}
 */
export function buildDemoemeaIdentificationCore({ email, ecid }) {
  const ecidTrim = isValidEcid(ecid) ? String(ecid).trim() : '';
  const emailTrim = email != null ? String(email).trim() : '';
  return {
    ecid: ecidTrim || '',
    email: emailTrim || '',
  };
}

/**
 * @param {unknown} profilePayload - GET /api/profile/table body
 * @returns {string | null}
 */
export function extractEcidFromProfileTable(profilePayload) {
  if (!profilePayload || typeof profilePayload !== 'object') return null;
  const top = /** @type {{ ecid?: unknown, rows?: unknown[] }} */ (profilePayload);
  if (isValidEcid(top.ecid)) return String(top.ecid).trim();
  const rows = Array.isArray(top.rows) ? top.rows : [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const path = String(row.path || '').toLowerCase();
    const attr = String(row.attribute || '').toLowerCase();
    if (
      path.includes('identification.core.ecid') ||
      path.endsWith('.ecid') ||
      attr === 'ecid'
    ) {
      const val = row.value != null ? String(row.value).trim() : '';
      if (isValidEcid(val)) return val;
    }
  }
  return null;
}

/**
 * Resolve identities for event send / preflight.
 *
 * @param {object} opts
 * @param {string} [opts.email]
 * @param {string} [opts.ecid]
 * @param {string | null} [opts.profileEcid] - from UPS when auto-fetching
 * @param {boolean} [opts.autoFetchedEcid]
 * @returns {{ ok: true, email: string, ecid: string, warnings: string[] } | { ok: false, error: string }}
 */
export function resolveEventIdentities({ email, ecid, profileEcid, autoFetchedEcid }) {
  const validated = validateEventIdentity({ email, ecid });
  if (!validated.ok) return validated;

  let resolvedEcid = validated.ecid;
  const warnings = [];

  if (!resolvedEcid && profileEcid && isValidEcid(profileEcid)) {
    resolvedEcid = String(profileEcid).trim();
    warnings.push(
      `ecid omitted — auto-resolved ${resolvedEcid} from profile table (pass ecid from lab_generate_profile to skip lookup).`,
    );
  } else if (autoFetchedEcid && resolvedEcid) {
    warnings.push(`ecid auto-fetched from UPS for email ${validated.email}.`);
  }

  if (validated.email && !resolvedEcid) {
    warnings.push(
      'email-only event: no ecid on profile or in request. Events may not stitch to the generated profile. ' +
        'Run lab_generate_profile first and pass ecid from the response, or wait for UPS to surface ecid then retry.',
    );
  } else if (validated.email && resolvedEcid && !validated.ecid && !autoFetchedEcid && !profileEcid) {
    // ecid was passed explicitly — no warning
  } else if (validated.email && resolvedEcid && validated.ecid) {
    // both provided — ideal
  }

  return {
    ok: true,
    email: validated.email,
    ecid: resolvedEcid,
    warnings,
  };
}

/**
 * Narration for lab_preflight_profile_event / framework docs.
 *
 * @param {object} opts
 * @param {string} opts.sandbox
 * @param {string} opts.email
 * @param {string} opts.ecid
 * @param {string} [opts.target_id]
 * @param {Array<{ id?: string, label?: string, transport?: string, dataStreamId?: string }>} [opts.targets]
 * @param {string[]} [opts.warnings]
 * @param {Record<string, unknown>} [opts.eventFields] — passed to buildGeneratorPostBody for dry-run body
 */
export function buildEventPreflightSummary({ sandbox, email, ecid, target_id, targets, warnings, eventFields }) {
  const identityMap = buildEventIdentityMap({ email, ecid });
  const targetId = String(target_id || LAB_EVENT_TOOL_TARGET_ID).trim();
  const targetList = Array.isArray(targets) ? targets : [];
  const resolvedTarget =
    targetList.find((t) => String(t.id || '') === targetId) ||
    (targetId === LAB_EVENT_TOOL_TARGET_ID
      ? { id: LAB_EVENT_TOOL_TARGET_ID, note: 'Default Event tool preset when Firestore eventConfig has datastreamId' }
      : null);

  const generatorPostBody = buildGeneratorPostBody({
    sandbox,
    ...(eventFields && typeof eventFields === 'object' ? eventFields : {}),
    email,
    ecid,
    target_id: targetId,
  });

  return {
    sandbox,
    identity: {
      email: email || null,
      ecid: ecid || null,
      identityMap,
      tenant_identification_core: {
        _demoemea: {
          identification: {
            core: buildDemoemeaIdentificationCore({ email, ecid }),
          },
        },
      },
      rules: [
        'At least one of email or ecid (10+ digits) required — same as Event Generator UI strip.',
        'When both present: identityMap.ECID primary:true, identityMap.Email primary:false.',
        '_demoemea.identification.core must carry the same ecid + email strings for Demo Website stitching.',
        'Prefer BOTH after lab_generate_profile — capture ecid from generate response.',
        'event_type is free text — Event tool datalist entries are suggestions only.',
      ],
    },
    generatorPostBody,
    target: {
      requested_id: targetId,
      resolved: resolvedTarget,
      fallback_id: LAB_EVENT_TOOL_TARGET_ID,
      list_tool: 'lab_list_event_targets',
    },
    api: 'POST /api/events/generator',
    warnings: warnings || [],
    verify: 'lab_profile_activity after send — UPS event lag may take seconds.',
  };
}
