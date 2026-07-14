import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import {
  buildEmailFormatRules,
  buildProfileGenerationConfirmQuestions,
  validateE164MobilePhone,
  validateScaledLabEmail,
} from '../framework/emailFormatGuardrails.mjs';
import {
  getGenerationPrefs,
  reserveGenerationNextEmail,
  setGenerationPrefs,
} from '../labApiClient.mjs';
import { fromLabApi, jsonResult, toolError } from './helpers.mjs';

const FORMAT_RULES_BLURB =
  'FORMAT RULES: lab emails use <local>+DDMMYYYY-N@<domain> (shared Firestore counter). ' +
  'Omit email on generate to auto-reserve; custom email must match pattern or is rejected. ' +
  'Mobile: static E.164 from prefs (default +447425627462).';

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
        'Same state as Profile Viewer "Generate from your base email". Requires user-generated MCP key (maps to Firebase uid). ' +
        FORMAT_RULES_BLURB,
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
      const prefs = apiResult.data?.prefs || {};
      return fromLabApi(apiResult, {
        sandbox: allowed.sandbox,
        prefs,
        formatRules: buildEmailFormatRules(),
        confirmQuestions: buildProfileGenerationConfirmQuestions(prefs),
      });
    },
  );

  mcpServer.registerTool(
    'lab_set_generation_prefs',
    {
      title: 'Set profile generation prefs',
      description:
        'Update shared base email, mobile phone, counter reset, or testProfile flag. ' +
        'Changes sync to Profile Viewer on next sandbox load or prefs pull. ' +
        FORMAT_RULES_BLURB,
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

      if (mobile_phone != null) {
        const phoneCheck = validateE164MobilePhone(mobile_phone);
        if (!phoneCheck.ok) {
          return toolError(phoneCheck.error, {
            coworkerPrompt: phoneCheck.coworkerPrompt,
            example: phoneCheck.example,
          });
        }
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
        'Preview what lab_generate_profile will use when use_stored_prefs is true — base email, counter N, next scaled email, mobile, testProfile. Does NOT advance counter or generate. ' +
        FORMAT_RULES_BLURB,
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
      const confirm = buildProfileGenerationConfirmQuestions(prefs);
      return jsonResult({
        sandbox: allowed.sandbox,
        baseEmail: prefs.baseEmail || '',
        mobilePhone: prefs.mobilePhone || '+447425627462',
        counterN: prefs.counterN,
        counterDate: prefs.counterDate,
        nextScaledEmail: prefs.nextScaledEmail || null,
        testProfile: prefs.testProfile !== false,
        emailPattern: prefs.emailPattern || '<local>+DDMMYYYY-N@<domain>',
        formatRules: confirm.formatRules,
        questionsForColleague: confirm.questionsForColleague,
        recommendedAction: confirm.recommendedAction,
        prefsReady: confirm.prefsReady,
        note: 'Read-only preview. Call lab_generate_profile with use_stored_prefs:true to reserve next email and generate.',
      });
    },
  );

  mcpServer.registerTool(
    'lab_confirm_profile_generation',
    {
      title: 'Confirm profile generation prefs with colleague',
      description:
        'Gate before first lab_generate_profile / brand-scrape profile tools: returns FORMAT RULES, questions for the colleague, ' +
        'and current Firestore prefs preview (does NOT consume counter). ' +
        'When colleague confirms, pass confirmed:true with base_email (+ optional mobile_phone) to persist via lab_set_generation_prefs. ' +
        FORMAT_RULES_BLURB,
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        confirmed: z
          .boolean()
          .optional()
          .describe('When true, persist base_email / mobile_phone after colleague confirmation'),
        base_email: z
          .string()
          .email()
          .optional()
          .describe('Base email for DDMMYYYY-N scaler (required when confirmed:true and prefs empty)'),
        mobile_phone: z
          .string()
          .optional()
          .describe('E.164 mobile (optional; lab default +447425627462)'),
        reset_counter: z.boolean().optional().describe('Reset daily counter to 1 when confirming'),
      },
    },
    async ({ sandbox, confirmed, base_email, mobile_phone, reset_counter }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const apiResult = await getGenerationPrefs({ sandbox: allowed.sandbox });
      if (!apiResult.ok) {
        return fromLabApi(apiResult, { sandbox: allowed.sandbox });
      }

      const prefs = apiResult.data?.prefs || {};
      const confirm = buildProfileGenerationConfirmQuestions(prefs);

      if (!confirmed) {
        return jsonResult({
          sandbox: allowed.sandbox,
          status: 'awaiting_colleague_confirmation',
          ...confirm,
          nextStep:
            'Ask colleague the questions above. When approved, call again with confirmed:true and base_email (if not already set).',
        });
      }

      const nextBase = String(base_email || prefs.baseEmail || '').trim();
      if (!nextBase) {
        return toolError('base_email is required when confirmed:true and no base email is stored yet.', {
          coworkerPrompt: 'Ask colleague for base email (e.g. apalmer@adobetest.com) before generating profiles.',
          formatRules: confirm.formatRules,
          questionsForColleague: confirm.questionsForColleague,
        });
      }

      if (mobile_phone != null) {
        const phoneCheck = validateE164MobilePhone(mobile_phone);
        if (!phoneCheck.ok) {
          return toolError(phoneCheck.error, {
            coworkerPrompt: phoneCheck.coworkerPrompt,
            example: phoneCheck.example,
          });
        }
      }

      const setResult = await setGenerationPrefs({
        sandbox: allowed.sandbox,
        baseEmail: nextBase,
        mobilePhone: mobile_phone,
        resetCounter: reset_counter,
      });
      if (!setResult.ok) {
        return fromLabApi(setResult, { sandbox: allowed.sandbox });
      }

      const updated = setResult.data?.prefs || {};
      const readyConfirm = buildProfileGenerationConfirmQuestions(updated);
      return jsonResult({
        sandbox: allowed.sandbox,
        status: 'confirmed',
        prefs: updated,
        formatRules: readyConfirm.formatRules,
        nextScaledEmailPreview: updated.nextScaledEmail || null,
        mobilePhone: updated.mobilePhone,
        readyToGenerate: true,
        nextStep: 'lab_generate_profile — omit email to reserve next scaled address automatically.',
      });
    },
  );
}

/** @typedef {{ use_stored_prefs?: boolean, email?: string }} StoredPrefsEmailInput */

export const STORED_PREFS_MISSING_HINT =
  'Set base email in Profile Viewer → Profile Generation (or lab_set_generation_prefs), then retry.';

export const GENERATION_PREFS_CONFIRM_TOOL = 'lab_confirm_profile_generation';

/**
 * Coworker-facing block payload when Firestore generation prefs are missing or incomplete.
 * @param {object} [prefs]
 * @param {string} [error]
 */
export function buildGenerationPrefsBlockedPayload(prefs = {}, error) {
  const confirm = buildProfileGenerationConfirmQuestions(prefs);
  return {
    error:
      error ||
      'Profile generation prefs not configured — base email required before first generate.',
    hint: STORED_PREFS_MISSING_HINT,
    coworkerPrompt:
      'Call lab_confirm_profile_generation for this sandbox (confirmed:false first), ask colleague for base email + domain, then confirmed:true with base_email before generating.',
    confirmTool: GENERATION_PREFS_CONFIRM_TOOL,
    questionsForColleague: confirm.questionsForColleague,
    formatRules: confirm.formatRules,
    recommendedAction: confirm.recommendedAction,
    prefsReady: confirm.prefsReady,
    nextStep:
      'lab_confirm_profile_generation sandbox {sandbox} → confirmed:true base_email colleague@domain.com → retry generate.',
  };
}

/**
 * Preflight: shared Firestore labProfileGenerationPrefs must have baseEmail before stored-prefs generate.
 * @param {string} sandbox
 */
export async function checkGenerationPrefsConfigured(sandbox) {
  const apiResult = await getGenerationPrefs({ sandbox });
  if (!apiResult.ok) {
    return {
      ok: false,
      ...buildGenerationPrefsBlockedPayload({}, apiResult.error || 'Failed to read generation prefs'),
    };
  }
  const prefs = apiResult.data?.prefs || {};
  const confirm = buildProfileGenerationConfirmQuestions(prefs);
  if (!confirm.prefsReady) {
    return { ok: false, prefs, ...buildGenerationPrefsBlockedPayload(prefs) };
  }
  return {
    ok: true,
    prefs,
    baseEmail: prefs.baseEmail,
    nextScaledEmail: prefs.nextScaledEmail || null,
    mobilePhone: prefs.mobilePhone || confirm.mobilePhone,
    confirm,
  };
}

/**
 * Default true when email omitted — matches lab_generate_profile.
 * @param {boolean | undefined} use_stored_prefs
 * @param {string | undefined} email
 */
export function shouldUseStoredGenerationPrefs(use_stored_prefs, email) {
  return use_stored_prefs ?? !email;
}

/**
 * Overlay Firestore static mobile onto generated attributes.
 * @param {Record<string, unknown> | undefined} attributes
 * @param {string | null | undefined} mobilePhone
 */
export function applyStoredPrefsMobileToAttributes(attributes, mobilePhone) {
  if (!attributes || typeof attributes !== 'object') return attributes;
  const phone = String(mobilePhone || '').trim();
  if (!phone) return attributes;
  return { ...attributes, 'mobilePhone.number': phone };
}

/**
 * Resolve email for generate when use_stored_prefs is enabled.
 * @param {string} sandbox
 * @returns {Promise<{ ok: true, email: string, counterN: number, nextCounterN?: number, baseEmail?: string, mobilePhone?: string, testProfile?: boolean } | { ok: false, error: string, hint?: string }>}
 */
/**
 * Resolve email for profile generate: stored prefs counter OR validated custom email.
 * @param {object} opts
 * @param {string} opts.sandbox
 * @param {string} [opts.email]
 * @param {boolean} [opts.use_stored_prefs]
 */
export async function resolveProfileEmailForGenerate({ sandbox, email, use_stored_prefs }) {
  const useStored = shouldUseStoredGenerationPrefs(use_stored_prefs, email);
  if (useStored) {
    const reserved = await resolveStoredPrefsEmail(sandbox);
    if (!reserved.ok) {
      const blocked = buildGenerationPrefsBlockedPayload({}, reserved.error);
      return {
        ok: false,
        error: reserved.error,
        hint: reserved.hint || blocked.hint,
        coworkerPrompt: blocked.coworkerPrompt,
        confirmTool: blocked.confirmTool,
        questionsForColleague: blocked.questionsForColleague,
        formatRules: blocked.formatRules,
        recommendedAction: blocked.recommendedAction,
        nextStep: blocked.nextStep,
      };
    }
    return {
      ok: true,
      email: reserved.email,
      use_stored_prefs: true,
      counterN: reserved.counterN,
      nextCounterN: reserved.nextCounterN,
      baseEmail: reserved.baseEmail,
      mobilePhone: reserved.mobilePhone,
      testProfile: reserved.testProfile,
    };
  }

  if (!email) {
    return {
      ok: false,
      error: 'email is required when use_stored_prefs is false.',
      coworkerPrompt: 'Omit email to use Firestore counter, or pass a scaled email matching +DDMMYYYY-N.',
    };
  }

  const validation = validateScaledLabEmail(email);
  if (!validation.ok) {
    return {
      ok: false,
      error: validation.error,
      coworkerPrompt: validation.coworkerPrompt,
      expectedPattern: validation.expectedPattern,
      example: validation.example,
      provided: validation.provided,
      formatRules: buildEmailFormatRules(),
    };
  }

  return { ok: true, email: validation.email, use_stored_prefs: false };
}

export async function resolveStoredPrefsEmail(sandbox) {
  const apiResult = await reserveGenerationNextEmail({ sandbox });
  if (!apiResult.ok) {
    return {
      ok: false,
      error: apiResult.error || 'Failed to reserve next email',
      hint: STORED_PREFS_MISSING_HINT,
    };
  }
  const email = apiResult.data?.scaledEmail;
  if (!email) {
    const err = apiResult.data?.error || 'No scaled email returned';
    const needsBase =
      String(err).includes('baseEmail') ||
      String(err).includes('Profile Viewer') ||
      String(err).includes('lab_set_generation_prefs');
    if (needsBase) {
      const blocked = buildGenerationPrefsBlockedPayload({}, err);
      return {
        ok: false,
        error: err,
        hint: blocked.hint,
        coworkerPrompt: blocked.coworkerPrompt,
        confirmTool: blocked.confirmTool,
        questionsForColleague: blocked.questionsForColleague,
        formatRules: blocked.formatRules,
        recommendedAction: blocked.recommendedAction,
        nextStep: blocked.nextStep,
      };
    }
    return {
      ok: false,
      error: err,
    };
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
