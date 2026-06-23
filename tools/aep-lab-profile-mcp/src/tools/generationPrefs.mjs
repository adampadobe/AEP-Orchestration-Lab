import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import {
  getGenerationPrefs,
  reserveGenerationNextEmail,
  setGenerationPrefs,
} from '../labApiClient.mjs';
import { fromLabApi, jsonResult, toolError } from './helpers.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerGenerationPrefsTools(mcpServer) {
  mcpServer.registerTool(
    'lab_get_generation_prefs',
    {
      title: 'Get profile generation prefs',
      description:
        'Read shared Portal/MCP profile generation config from Firestore (base email, mobile, daily counter N, next scaled email preview). ' +
        'Same state as Profile Viewer "Generate from your base email". Requires user-generated MCP key (maps to Firebase uid).',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
      },
    },
    async ({ sandbox }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const apiResult = await getGenerationPrefs({ sandbox: allowed.sandbox });
      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        prefs: apiResult.data?.prefs,
      });
    },
  );

  mcpServer.registerTool(
    'lab_set_generation_prefs',
    {
      title: 'Set profile generation prefs',
      description:
        'Update shared base email, mobile phone, counter reset, or testProfile flag. ' +
        'Changes sync to Profile Viewer on next sandbox load or prefs pull.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name'),
        base_email: z.string().email().optional().describe('Base email for DDMMYYYY-N scaler'),
        mobile_phone: z.string().optional().describe('Optional mobile (lab default +447425627462)'),
        reset_counter: z.boolean().optional().describe('Reset daily counter N to 1'),
        counter_n: z.number().int().min(1).optional().describe('Set counter N explicitly (advanced)'),
        test_profile: z.boolean().optional().describe('Mark generated profiles as AEP test profiles (default true)'),
      },
    },
    async ({ sandbox, base_email, mobile_phone, reset_counter, counter_n, test_profile }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const apiResult = await setGenerationPrefs({
        sandbox: allowed.sandbox,
        baseEmail: base_email,
        mobilePhone: mobile_phone,
        resetCounter: reset_counter,
        counterN: counter_n,
        testProfile: test_profile,
      });
      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        prefs: apiResult.data?.prefs,
      });
    },
  );

  mcpServer.registerTool(
    'lab_confirm_generation_plan',
    {
      title: 'Confirm profile generation plan (read-only)',
      description:
        'Preview what lab_generate_profile will use when use_stored_prefs is true — base email, counter N, next scaled email, mobile, testProfile. Does NOT advance counter or generate.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name'),
      },
    },
    async ({ sandbox }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const apiResult = await getGenerationPrefs({ sandbox: allowed.sandbox });
      if (!apiResult.ok) {
        return fromLabApi(apiResult, { sandbox: allowed.sandbox });
      }

      const prefs = apiResult.data?.prefs || {};
      return jsonResult({
        sandbox: allowed.sandbox,
        baseEmail: prefs.baseEmail || '',
        mobilePhone: prefs.mobilePhone || '+447425627462',
        counterN: prefs.counterN,
        counterDate: prefs.counterDate,
        nextScaledEmail: prefs.nextScaledEmail || null,
        testProfile: prefs.testProfile !== false,
        emailPattern: prefs.emailPattern || '<local>+DDMMYYYY-N@<domain>',
        note: 'Read-only preview. Call lab_generate_profile with use_stored_prefs:true to reserve next email and generate.',
      });
    },
  );
}

/**
 * Resolve email for generate when use_stored_prefs is enabled.
 * @param {string} sandbox
 * @returns {Promise<{ ok: true, email: string, counterN: number } | { ok: false, error: string }>}
 */
export async function resolveStoredPrefsEmail(sandbox) {
  const apiResult = await reserveGenerationNextEmail({ sandbox });
  if (!apiResult.ok) {
    return { ok: false, error: apiResult.error || 'Failed to reserve next email' };
  }
  const email = apiResult.data?.scaledEmail;
  if (!email) {
    return { ok: false, error: apiResult.data?.error || 'No scaled email returned' };
  }
  return {
    ok: true,
    email: String(email),
    counterN: apiResult.data?.counterN,
    nextCounterN: apiResult.data?.nextCounterN,
    baseEmail: apiResult.data?.baseEmail,
    mobilePhone: apiResult.data?.mobilePhone,
    testProfile: apiResult.data?.testProfile,
  };
}
