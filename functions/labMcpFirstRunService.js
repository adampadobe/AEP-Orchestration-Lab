/**
 * MCP first-run foundations — workspace profile + RTDB provision for Coworker onboarding.
 */

const { ldapSlugFromEmail, normalizeLdapSlug } = require('./labRtdbSlug');

/**
 * @param {object} deps
 * @param {typeof import('./labUserSandboxStore')} deps.labUserSandboxStore
 * @param {typeof import('./labRtdbProvisionService')} deps.labRtdbProvisionService
 * @param {typeof import('./labProfileGenerationPrefsStore')} deps.labProfileGenerationPrefsStore
 */
function createLabMcpFirstRunService(deps) {
  const { labUserSandboxStore, labRtdbProvisionService, labProfileGenerationPrefsStore } = deps;

  function parseNameFromEmail(email) {
    const local = String(email || '').split('@')[0] || '';
    const parts = local.replace(/[._-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return {
        firstName: parts[0].slice(0, 80),
        lastName: parts.slice(1).join(' ').slice(0, 80),
      };
    }
    if (parts.length === 1) {
      return { firstName: parts[0].slice(0, 80), lastName: 'User' };
    }
    return { firstName: 'Lab', lastName: 'User' };
  }

  /**
   * @param {object} input
   * @param {string} input.uid
   * @param {string} [input.principalEmail]
   * @param {string} input.sandbox
   * @param {object} [input.body]
   */
  async function runFirstRunSetup(input) {
    const uid = String(input.uid || '').trim().slice(0, 128);
    const sandbox = String(input.sandbox || '').trim().toLowerCase();
    const body = input.body && typeof input.body === 'object' ? input.body : {};
    if (!uid) throw Object.assign(new Error('uid is required'), { status: 400 });
    if (!sandbox) throw Object.assign(new Error('sandbox is required'), { status: 400 });

    const existingProfile = await labUserSandboxStore.getWorkspaceProfile(uid);
    const principalEmail = String(
      body.adobe_email || input.principalEmail || (existingProfile && existingProfile.adobeEmail) || '',
    ).trim().toLowerCase();

    const nameFallback = parseNameFromEmail(principalEmail);
    const firstName = String(body.first_name || body.firstName || (existingProfile && existingProfile.firstName) || nameFallback.firstName).trim();
    const lastName = String(body.last_name || body.lastName || (existingProfile && existingProfile.lastName) || nameFallback.lastName).trim();
    const workspaceName = String(body.workspace_name || body.workspaceName || (existingProfile && existingProfile.workspaceName) || `${firstName} ${lastName}`.trim()).trim();

    let workspaceSlug = normalizeLdapSlug(body.workspace_slug || body.workspaceSlug || (existingProfile && existingProfile.workspaceSlug) || '');
    if (!workspaceSlug && principalEmail) {
      workspaceSlug = ldapSlugFromEmail(principalEmail, firstName, lastName);
    }

    /** @type {Record<string, object>} */
    const checklist = {};

    const profileMissing = [];
    if (!firstName) profileMissing.push('first_name');
    if (!lastName) profileMissing.push('last_name');
    if (!principalEmail) profileMissing.push('adobe_email');

    let profile = existingProfile;
    const writeProfile = body.write_workspace_profile !== false;

    if (writeProfile && profileMissing.length === 0) {
      profile = await labUserSandboxStore.upsertWorkspaceProfile(uid, {
        firstName,
        lastName,
        adobeEmail: principalEmail,
        workspaceName,
        workspaceSlug: workspaceSlug || ldapSlugFromEmail(principalEmail, firstName, lastName),
      });
      workspaceSlug = normalizeLdapSlug(profile.workspaceSlug) || workspaceSlug;
      checklist.workspace_profile = {
        ready: true,
        workspaceSlug: profile.workspaceSlug,
        adobeEmail: profile.adobeEmail,
        note: 'Firestore labWorkspaceAccessProfiles/{uid}',
      };
    } else if (existingProfile && existingProfile.workspaceSlug) {
      checklist.workspace_profile = {
        ready: true,
        workspaceSlug: existingProfile.workspaceSlug,
        adobeEmail: existingProfile.adobeEmail,
        note: 'Existing profile — no changes written',
      };
    } else {
      checklist.workspace_profile = {
        ready: false,
        missing: profileMissing.length ? profileMissing : ['workspace_slug or adobe_email'],
        portal_action: 'Profile Viewer → workspace onboarding, or pass first_name, last_name, adobe_email, workspace_slug to lab_mcp_first_run_setup',
      };
    }

    const provisionRtdb = body.provision_rtdb !== false;
    if (provisionRtdb && principalEmail && workspaceSlug) {
      try {
        const owns = await labRtdbProvisionService.userOwnsWorkspace(null, uid, workspaceSlug);
        const provisioned = owns
          ? { ok: true, ldapSlug: workspaceSlug, uid, alreadyOwned: true }
          : await labRtdbProvisionService.provisionUserRtdbWorkspace({
            uid,
            adobeEmail: principalEmail,
            firstName,
            lastName,
            workspaceSlug,
            defaultSandbox: sandbox,
          });
        checklist.rtdb_workspace = {
          ready: true,
          ldapSlug: provisioned.ldapSlug,
          path: `ajoLookups/${provisioned.ldapSlug}`,
          alreadyOwned: !!provisioned.alreadyOwned,
        };
      } catch (e) {
        checklist.rtdb_workspace = {
          ready: false,
          error: String(e.message || e),
          code: e && e.code ? String(e.code) : '',
          portal_action: e && e.code === 'slug_taken'
            ? 'Choose a different workspace_slug — slug is claimed by another user'
            : 'Retry from Portal workspace onboarding or MCP with a new workspace_slug',
        };
      }
    } else if (!provisionRtdb) {
      checklist.rtdb_workspace = { ready: false, skipped: true, note: 'provision_rtdb=false' };
    } else {
      checklist.rtdb_workspace = {
        ready: false,
        missing: ['adobe_email', 'workspace_slug'],
        note: 'Complete workspace_profile first',
      };
    }

    try {
      const prefs = await labProfileGenerationPrefsStore.getPrefs(uid, sandbox);
      const hasBaseEmail = !!(prefs && prefs.baseEmail);
      checklist.generation_prefs = {
        ready: hasBaseEmail,
        baseEmail: hasBaseEmail ? prefs.baseEmail : null,
        nextScaledEmail: prefs && prefs.nextScaledEmail ? prefs.nextScaledEmail : null,
        portal_action: hasBaseEmail ? null : 'Profile Viewer base email field, or lab_set_generation_prefs in Coworker',
      };
    } catch (e) {
      checklist.generation_prefs = {
        ready: false,
        error: String(e.message || e),
        portal_action: 'lab_set_generation_prefs or Profile Viewer',
      };
    }

    checklist.sandbox_profile_infra = {
      ready: null,
      note: 'Call lab_sandbox_profile_config or lab_onboard_sandbox from Coworker for industry connections',
      next_tool: 'lab_sandbox_profile_config',
    };

    checklist.event_tool_config = {
      ready: null,
      note: 'Call lab_list_event_targets — Edge datastream may need Profile Viewer Event tool save',
      next_tool: 'lab_list_event_targets',
    };

    const foundationsReady =
      checklist.workspace_profile.ready === true
      && checklist.rtdb_workspace.ready === true;

    return {
      ok: true,
      sandbox,
      workspaceSlug: profile && profile.workspaceSlug ? profile.workspaceSlug : workspaceSlug,
      foundationsReady,
      checklist,
      next_steps: [
        'lab_mcp_access_info — confirm key + sandbox allowlist',
        'lab_sandbox_profile_config — industry infra readiness',
        ...(checklist.sandbox_profile_infra.ready === false ? ['lab_onboard_sandbox mode=plan'] : []),
        'lab_set_generation_prefs — optional base email before batch generate',
        'lab_list_event_targets — verify Edge event presets',
      ],
      coworker_hint:
        'Workspace slug (RTDB ldapSlug) namespaces demo config at ajoLookups/{slug}/. It may differ from the AEP sandbox name (e.g. prisacar).',
    };
  }

  return { runFirstRunSetup };
}

module.exports = { createLabMcpFirstRunService };
