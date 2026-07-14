import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import {
  getGenerationPrefs,
  getLabApiOrigin,
  listEventTargets,
  profileInfraStatusAll,
  getProfileConnection,
} from '../labApiClient.mjs';
import {
  buildSandboxProfileConfigReport,
  connectionApiPathForIndustry,
} from '../sandboxConfig.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId, getRequestMcpApiKey } from '../requestContext.mjs';
import { LAB_INDUSTRY_KEYS } from '../industries.mjs';
import { buildProfileGenerationConfirmQuestions } from '../framework/emailFormatGuardrails.mjs';
import { GENERATION_PREFS_CONFIRM_TOOL } from './generationPrefs.mjs';
import { jsonResult, toolError } from './helpers.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerMcpFirstRunSetupTool(mcpServer) {
  mcpServer.registerTool(
    'lab_mcp_first_run_setup',
    {
      title: 'MCP first-run foundations setup',
      description:
        'Run once after connecting Coworker with a new MCP key: writes lab workspace profile (Firestore), provisions RTDB demo workspace (ajoLookups/{workspace_slug}), checks generation prefs, and reports sandbox infra + event-tool readiness. ' +
        'Ask the user for workspace_slug when it should differ from their AEP sandbox name (e.g. sandbox prisacar, slug prisacar).',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (must match MCP key scope)'),
        workspace_slug: z
          .string()
          .optional()
          .describe('RTDB ldapSlug for demo config (ajoLookups/{slug}/). Defaults from adobe_email if omitted'),
        first_name: z.string().optional().describe('Lab user first name — required if profile missing'),
        last_name: z.string().optional().describe('Lab user last name — required if profile missing'),
        adobe_email: z.string().optional().describe('Adobe email — defaults from MCP key principal when omitted'),
        workspace_name: z.string().optional().describe('Display label for workspace (optional)'),
        provision_rtdb: z
          .boolean()
          .optional()
          .describe('Provision RTDB workspace stub (default true)'),
        include_sandbox_readiness: z
          .boolean()
          .optional()
          .describe('Also fetch lab_sandbox_profile_config + event targets (default true)'),
      },
    },
    async ({
      sandbox,
      workspace_slug,
      first_name,
      last_name,
      adobe_email,
      workspace_name,
      provision_rtdb,
      include_sandbox_readiness,
    }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const mcpKey = getRequestMcpApiKey();
      if (!mcpKey) {
        return toolError('X-AEP-Lab-Mcp-Key required for lab_mcp_first_run_setup.');
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_mcp_first_run_setup',
        sandbox: allowed.sandbox,
      });

      const setupUrl = `${getLabApiOrigin()}/api/lab/mcp-first-run-setup`;
      const setupRes = await fetch(setupUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-AEP-Lab-Mcp-Key': mcpKey,
        },
        body: JSON.stringify({
          sandbox: allowed.sandbox,
          workspace_slug,
          first_name,
          last_name,
          adobe_email,
          workspace_name,
          provision_rtdb: provision_rtdb !== false,
        }),
      });

      let setupData;
      try {
        setupData = await setupRes.json();
      } catch {
        setupData = { ok: false, error: 'Invalid JSON from mcp-first-run-setup' };
      }

      if (!setupRes.ok || !setupData.ok) {
        return toolError(setupData.error || `First-run setup failed (HTTP ${setupRes.status})`, {
          status: setupRes.status,
          sandbox: allowed.sandbox,
        });
      }

      const includeReadiness = include_sandbox_readiness !== false;
      /** @type {Record<string, unknown>} */
      const readiness = {};

      if (includeReadiness) {
        const statusResult = await profileInfraStatusAll({ sandbox: allowed.sandbox, refresh: true });
        const connectionsByIndustry = {};
        if (statusResult.ok) {
          await Promise.all(
            LAB_INDUSTRY_KEYS.map(async (key) => {
              const path = connectionApiPathForIndustry(key);
              if (!path) return;
              const connResult = await getProfileConnection({ path, sandbox: allowed.sandbox });
              if (connResult.ok) connectionsByIndustry[key] = connResult.data;
            }),
          );
          const report = buildSandboxProfileConfigReport({
            sandbox: allowed.sandbox,
            statusAllIndustries: statusResult.data?.industries || {},
            connectionsByIndustry,
          });
          readiness.sandbox_profile_config = {
            ready: report.ready,
            notReadyIndustries: report.notReadyIndustries,
            industries: report.industries,
            next_tool: report.ready ? null : 'lab_onboard_sandbox',
          };
        } else {
          readiness.sandbox_profile_config = {
            ready: false,
            error: statusResult.error,
            next_tool: 'lab_sandbox_profile_config',
          };
        }

        const targetsResult = await listEventTargets({ sandbox: allowed.sandbox });
        if (targetsResult.ok) {
          const targets = targetsResult.data?.targets || targetsResult.data?.items || [];
          const list = Array.isArray(targets) ? targets : [];
          const labTarget = list.find((t) => t && t.id === 'lab-event-tool-edge') || null;
          const hasLabDatastream = !!(labTarget && labTarget.dataStreamId);
          readiness.event_targets = {
            ready: hasLabDatastream,
            count: list.length,
            lab_event_tool_edge_configured: hasLabDatastream,
            lab_event_tool_datastream_id: labTarget?.dataStreamId || null,
            defaultTargetId: hasLabDatastream
              ? 'lab-event-tool-edge'
              : (list[0] && list[0].id) || null,
            portal_action: hasLabDatastream
              ? null
              : 'Profile Viewer Event tool → Step 2 save Edge datastream for this sandbox (or lab_save_event_datastream)',
            warning: hasLabDatastream
              ? undefined
              : 'Static demo targets may exist but lab-event-tool-edge is not wired to this sandbox — MCP sends will fail until datastream is saved.',
          };
        } else {
          readiness.event_targets = {
            ready: false,
            error: targetsResult.error,
            portal_action: 'Profile Viewer Event tool → Edge config',
          };
        }

        const prefsResult = await getGenerationPrefs({ sandbox: allowed.sandbox });
        if (prefsResult.ok && prefsResult.data) {
          const prefs = prefsResult.data.prefs || {};
          const baseEmail = prefsResult.data.baseEmail || prefs.baseEmail || null;
          const confirm = buildProfileGenerationConfirmQuestions(prefs);
          const prefsReady = !!(baseEmail || confirm.prefsReady);
          readiness.generation_prefs = {
            ready: prefsReady,
            baseEmail,
            nextScaledEmail: prefs.nextScaledEmail || null,
            mobilePhone: prefs.mobilePhone || confirm.mobilePhone,
            confirmTool: GENERATION_PREFS_CONFIRM_TOOL,
            ...(prefsReady
              ? { nextStep: 'Omit email on lab_generate_profile to reserve next scaled address.' }
              : {
                  blockReason: 'Base email not configured — required before first profile generate.',
                  questionsForColleague: confirm.questionsForColleague,
                  recommendedAction: confirm.recommendedAction,
                  nextStep: `Call ${GENERATION_PREFS_CONFIRM_TOOL} (confirmed:false), then confirmed:true with base_email.`,
                }),
          };
        } else {
          readiness.generation_prefs = {
            ready: false,
            error: prefsResult.error,
            confirmTool: GENERATION_PREFS_CONFIRM_TOOL,
            nextStep: `Call ${GENERATION_PREFS_CONFIRM_TOOL} before lab_generate_profile.`,
          };
        }
      }

      const prefsReady = readiness.generation_prefs?.ready !== false;
      const mergedNextSteps = Array.isArray(setupData.next_steps) ? [...setupData.next_steps] : [];
      if (includeReadiness && !prefsReady) {
        mergedNextSteps.unshift(
          `${GENERATION_PREFS_CONFIRM_TOOL} — confirm base email + mobile before first lab_generate_profile or brand-scrape profiles step.`,
        );
      }

      return jsonResult({
        ok: true,
        tool: 'lab_mcp_first_run_setup',
        sandbox: allowed.sandbox,
        workspaceSlug: setupData.workspaceSlug,
        foundationsReady: setupData.foundationsReady,
        checklist: setupData.checklist,
        readiness: includeReadiness ? readiness : undefined,
        next_steps: mergedNextSteps.length ? mergedNextSteps : setupData.next_steps,
        coworker_hint: prefsReady
          ? setupData.coworker_hint
          : [
              setupData.coworker_hint,
              `Generation prefs missing — call ${GENERATION_PREFS_CONFIRM_TOOL} before generating profiles.`,
            ]
              .filter(Boolean)
              .join(' '),
        portal_only: [
          'Event tool Edge datastream save (if event_targets not ready)',
          'Lab access approval (if sign-in blocked)',
          'Brand / demo panel customisation in Profile Viewer',
        ],
      });
    },
  );
}
