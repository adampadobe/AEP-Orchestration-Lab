import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { ajoLoyaltyRead } from '../labApiClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { fromLabApi, toolError } from './helpers.mjs';

const sandbox = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,47}$/).describe('Exact sandbox authorized for the current MCP key or IMS enrollment.');
const challengeId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/).describe('Exact AJO Loyalty challenge ID, not its display name.');
const profileId = z.string().trim().min(1).max(512).regex(/^[^\u0000-\u001f\u007f]+$/)
  .describe('Existing member identifier in the Loyalty configuration identity namespace. Do not assume email or ECID; inspect configuration first.');
const region = z.string().regex(/^[a-z][a-z0-9]{1,15}$/).optional()
  .describe('Confirmed Adobe region code for member-state reads. Defaults to va7 per the State API reference; global uses platform.adobe.io. Never probe multiple regions to guess.');

async function invoke(name, action, params) {
  const allowed = assertSandboxAllowed(params.sandbox);
  if (!allowed.ok) return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
  const started = Date.now();
  const result = await ajoLoyaltyRead({ ...params, sandbox: allowed.sandbox, action });
  writeAuditLog({
    keyId: getRequestKeyId(),
    tool: name,
    sandbox: allowed.sandbox,
    result: result.ok && result.data?.ok === true ? 'ok' : 'error',
    durationMs: Date.now() - started,
  });
  if (result.ok && result.data?.ok !== true) {
    return toolError('Loyalty backend did not confirm a successful read.', { response: result.data });
  }
  return fromLabApi(result, { sandbox: allowed.sandbox });
}

export function registerAjoLoyaltyTools(server) {
  const definitions = [
    ['lab_ajo_loyalty_config', 'config', {
      title: 'Read AJO Loyalty configuration',
      description: 'Read a safe summary of the Loyalty identity namespace and event configuration. Provider and sink authentication/settings are omitted. Use before selecting a member profile_id. Uses server-side Adobe IMS credentials; no configuration is changed.',
      inputSchema: { sandbox },
    }],
    ['lab_ajo_loyalty_challenge_list', 'challenge_list', {
      title: 'List AJO Loyalty challenge definitions',
      description: 'Read one bounded metadata page, including task definitions, dates and rewards. Preserves children/_page/_links (IDs in _id), or the documented challengeList format. Follow Adobe pagination using start. Published metadata does not prove member eligibility or participation.',
      inputSchema: {
        sandbox,
        limit: z.number().int().min(1).max(100).optional(),
        start: z.string().trim().min(1).max(1024).regex(/^[^\u0000-\u001f\u007f]+$/).optional().describe('Opaque pagination cursor returned by Adobe; not a URL.'),
      },
    }],
    ['lab_ajo_loyalty_challenge_get', 'challenge_get', {
      title: 'Read an AJO Loyalty challenge definition',
      description: 'Read the existing challenge with an exact challenge_id. Returns metadata only, not a member progress record. Never edits, publishes, or activates a challenge.',
      inputSchema: { sandbox, challenge_id: challengeId },
    }],
    ['lab_ajo_loyalty_profile_state', 'profile_state', {
      title: 'Read AJO Loyalty member task progress',
      description: 'Read /ajo/loyalty/challenges/state with pid and v=2, optionally cid and test. Requires a confirmed existing member identifier in the configured namespace and region; use metadata _id as challenge_id. Returns challengeList with taskState, variables, accumulators and completion history unchanged. Never signs up a member, sends events, or changes progress.',
      inputSchema: { sandbox, profile_id: profileId, challenge_id: challengeId.optional(), region, test: z.boolean().optional() },
    }],
    ['lab_ajo_loyalty_profile_challenges', 'profile_challenges', {
      title: 'Read active or completed AJO Loyalty participation',
      description: 'Read /ajo/loyalty/challenges/{profileId}?state=active|complete for an existing member. Confirm the configured identity namespace and region first. A completed challenge does not by itself prove a points balance was credited.',
      inputSchema: { sandbox, profile_id: profileId, region, state: z.enum(['active', 'complete']).optional() },
    }],
  ];
  for (const [name, action, definition] of definitions) {
    server.registerTool(name, {
      ...definition,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, (params) => invoke(name, action, params));
  }
}
