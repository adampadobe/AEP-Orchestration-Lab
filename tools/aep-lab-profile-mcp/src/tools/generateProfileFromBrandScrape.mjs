import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { assessScrapeGenerateIndustryReadiness } from '../brandScrapeIndustryReadiness.mjs';
import {
  buildAttributesFromBrandScrapePersona,
  extractBrandScrapePersonas,
  extractScrapeIndustryTaxonomy,
  inferLabIndustryFromRecord,
} from '../brandScrapePersonaMap.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { executeGeneratePlan, planDualStreamGenerate } from '../framework/dualStreamGenerate.mjs';
import { ensurePreferredLanguageOnAttributes, normalizeGenerateProfileParams } from '../framework/generateProfileParams.mjs';
import { personHintsFromAttributes, recordRecentProfileGenerated } from '../framework/recordRecentProfile.mjs';
import { getBrandScrape } from '../labApiClient.mjs';
import { LAB_INDUSTRY_KEYS, normalizeIndustry } from '../industries.mjs';
import { checkGenerateRate } from '../rateLimiter.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { fromLabApi, jsonResult, toolError } from './helpers.mjs';
import {
  resolveProfileEmailForGenerate,
  shouldUseStoredGenerationPrefs,
  STORED_PREFS_MISSING_HINT,
} from './generationPrefs.mjs';

/**
 * @param {object} params
 */
async function generateOneFromScrapePersona({
  sandbox,
  record,
  persona,
  personaIndex,
  industry,
  email,
  segment_hint,
  loyalty_member,
  last_order_details,
  append_if_existing,
  test_profile,
  test_profile_override_reason,
  use_stored_prefs,
}) {
  const useStored = shouldUseStoredGenerationPrefs(use_stored_prefs, email);
  const emailResolved = await resolveProfileEmailForGenerate({
    sandbox,
    email,
    use_stored_prefs: useStored,
  });

  if (!emailResolved.ok) {
    return {
      ok: false,
      error: emailResolved.error,
      hint: emailResolved.hint || STORED_PREFS_MISSING_HINT,
      coworkerPrompt: emailResolved.coworkerPrompt,
      expectedPattern: emailResolved.expectedPattern,
      example: emailResolved.example,
      formatRules: emailResolved.formatRules,
    };
  }

  const resolvedEmail = emailResolved.email;
  /** @type {Record<string, unknown>} */
  const storedPrefsMeta = emailResolved.use_stored_prefs
    ? {
        use_stored_prefs: true,
        counterN: emailResolved.counterN,
        nextCounterN: emailResolved.nextCounterN,
        baseEmail: emailResolved.baseEmail,
        mobilePhone: emailResolved.mobilePhone,
      }
    : {};
  /** @type {string | null} */
  const storedMobile = emailResolved.mobilePhone ? String(emailResolved.mobilePhone) : null;

  const built = buildAttributesFromBrandScrapePersona({
    persona,
    email: resolvedEmail,
    industry,
    segmentHint: segment_hint || null,
    loyalty_member,
    last_order_details,
    mobilePhone: storedMobile,
  });

  let mergedAttributes = ensurePreferredLanguageOnAttributes(built.attributes).attributes;

  const normalized = normalizeGenerateProfileParams({
    test_profile,
    test_profile_override_reason,
    attributes: mergedAttributes,
    ensureLanguage: false,
  });
  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }

  const generatePlan = planDualStreamGenerate({
    industry,
    attributes: normalized.attributes,
    email: resolvedEmail,
  });

  const apiResult = await executeGeneratePlan({
    email: resolvedEmail,
    sandbox,
    plan: generatePlan,
    append_if_existing,
    test_profile: normalized.test_profile,
  });

  let recentSync = null;
  if (apiResult.ok) {
    const ecid =
      apiResult.ecid ||
      apiResult.data?.ecid ||
      apiResult.data?.identification?.core?.ecid ||
      apiResult.data?.profile?.ecid ||
      undefined;
    const hints = personHintsFromAttributes(normalized.attributes);
    recentSync = await recordRecentProfileGenerated({
      sandbox,
      email: resolvedEmail,
      ecid,
      industry,
      attributes: normalized.attributes,
      ...hints,
    });
  }

  return {
    ok: apiResult.ok,
    error: apiResult.error,
    email: resolvedEmail,
    personaIndex,
    personaName: persona.name || null,
    segment_hint: built.segmentHint,
    scrapeOverlays: built.overlays,
    attributes: normalized.attributes,
    test_profile: normalized.test_profile,
    dual_stream: generatePlan.dualStream,
    generate_plan: generatePlan.steps.map((s) => ({
      step: s.step,
      industry: s.industry,
      role: s.role,
      appendIfExisting: s.appendIfExisting,
      attributeCount: Object.keys(s.attributes || {}).length,
    })),
    generate_step_results: apiResult.stepResults || null,
    ecid: apiResult.ecid || apiResult.data?.ecid || null,
    apiData: apiResult.data,
    recent_profiles_sync: recentSync,
    storedPrefsMeta,
  };
}

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerGenerateProfileFromBrandScrapeTools(mcpServer) {
  mcpServer.registerTool(
    'lab_generate_profile_from_brand_scrape',
    {
      title: 'Generate golden profile from brand scrape persona',
      description:
        'Loads a saved brand scrape (lab_get_brand_scrape / Portal history), maps a marketing persona to correlated XDM attributes ' +
        '(identity from scrape + randomized industry paths via personaBuilder), then streams via lab_generate_profile dual-stream flow. ' +
        'Requires personas on the scrape (re-run lab_brand_scrape with include.personas:true). ' +
        'Industry defaults from scrape taxonomy (record.industry / industryInfo — e.g. Food & beverage → retail, Travel & Hospitality → travel). ' +
        'Do NOT pass industry unless the user explicitly requests an override — wrong industry skips industry-owned XDM paths. ' +
        'Response includes scrape_industry, lab_industry, industry_source. Warns when lab_sandbox_profile_config is not ready. ' +
        'segment_hint can be explicit or inferred from persona.suggested_segments. ' +
        'Email/mobile FORMAT RULES: omit email to reserve <local>+DDMMYYYY-N@<domain> + static E.164 mobile from Firestore generation prefs (Portal parity). ' +
        'Custom email must match scaled pattern. Call lab_confirm_profile_generation before first generate. ' +
        'Persona name/age/location still overlay on attributes; email never derived from persona slug. ' +
        'Chain: lab_brand_scrape → lab_generate_profile_from_brand_scrape → lab_send_profile_event.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        scrape_id: z.string().describe('Brand scrape id from lab_brand_scrape or history'),
        persona_index: z
          .number()
          .int()
          .min(0)
          .max(11)
          .optional()
          .describe('Zero-based persona index (default 0). Ignored when all_personas:true.'),
        all_personas: z
          .boolean()
          .optional()
          .describe('When true, generate one profile per scrape persona (sequential, max 6)'),
        industry: z
          .string()
          .optional()
          .describe(
            'Override lab industry key — omit unless user explicitly asks; default is scrape-inferred lab_industry from taxonomy',
          ),
        email: z
          .string()
          .email()
          .optional()
          .describe('Profile email — omit to reserve next scaled email from Firestore generation prefs (Portal + MCP counter)'),
        segment_hint: z.string().optional().describe('Optional lab segment_hint overlay (travel/fsi/retail)'),
        loyalty_member: z.boolean().optional().describe('Emit loyalty block (default false)'),
        last_order_details: z.boolean().optional().describe('Retail: include last-order block (default true)'),
        append_if_existing: z.boolean().optional().describe('Reuse ECID when profile exists'),
        test_profile: z.boolean().optional().describe('AEP test profile (default true)'),
        test_profile_override_reason: z.string().optional(),
        use_stored_prefs: z
          .boolean()
          .optional()
          .describe(
            'When true (default when email omitted), reserve next scaled email + static mobile from Firestore prefs per persona (works with all_personas)',
          ),
      },
    },
    async (args) => {
      const started = Date.now();
      const keyId = getRequestKeyId();
      const {
        sandbox,
        scrape_id,
        persona_index,
        all_personas,
        industry: industryOverride,
        email,
        segment_hint,
        loyalty_member,
        last_order_details,
        append_if_existing,
        test_profile,
        test_profile_override_reason,
        use_stored_prefs,
      } = args;

      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const scrapeId = String(scrape_id || '').trim();
      if (!scrapeId) {
        return toolError('scrape_id is required.');
      }

      const apiFetch = await getBrandScrape({ sandbox: allowed.sandbox, scrapeId });
      if (!apiFetch.ok) {
        return fromLabApi(apiFetch, { sandbox: allowed.sandbox, scrapeId });
      }

      const record = apiFetch.data || {};
      if (String(record.scrapeStatus || '') !== 'complete') {
        return toolError(`Scrape is not complete (status=${record.scrapeStatus || 'unknown'}). Poll lab_get_brand_scrape or re-run lab_brand_scrape.`, {
          scrapeId,
          scrapeStatus: record.scrapeStatus,
        });
      }

      const personas = extractBrandScrapePersonas(record);
      if (!personas.length) {
        return toolError(
          'No personas on this scrape. Re-run lab_brand_scrape with include.personas:true or append personas in Portal Brand scraper Options.',
          { scrapeId, personasPresent: record.personasPresent },
        );
      }

      let industry = 'generic';
      let industrySource = 'default';
      const scrapeIndustry = extractScrapeIndustryTaxonomy(record) || null;
      if (industryOverride) {
        const norm = normalizeIndustry(industryOverride);
        if (!LAB_INDUSTRY_KEYS.includes(norm.industry)) {
          return toolError(`Unknown industry "${industryOverride}". Supported: ${LAB_INDUSTRY_KEYS.join(', ')}.`);
        }
        industry = norm.industry;
        industrySource = 'argument';
      } else {
        const inferred = inferLabIndustryFromRecord(record);
        industry = inferred.industry;
        industrySource = inferred.source;
      }

      const industryReadiness = await assessScrapeGenerateIndustryReadiness({
        sandbox: allowed.sandbox,
        industry,
      });
      const readinessWarnings = industryReadiness.ready ? [] : industryReadiness.warnings;

      const indices = all_personas
        ? personas.map((_, i) => i)
        : [persona_index ?? 0];

      for (const idx of indices) {
        if (idx < 0 || idx >= personas.length) {
          return toolError(`persona_index ${idx} out of range (scrape has ${personas.length} personas).`, {
            personaCount: personas.length,
          });
        }
      }

      const results = [];
      for (const idx of indices) {
        const rate = checkGenerateRate(keyId);
        if (!rate.ok) {
          return toolError(rate.message, { retryAfterSec: rate.retryAfterSec, partialResults: results });
        }

        const persona = personas[idx];
        const one = await generateOneFromScrapePersona({
          sandbox: allowed.sandbox,
          record,
          persona,
          personaIndex: idx,
          industry,
          email: all_personas || indices.length > 1 ? undefined : email,
          segment_hint,
          loyalty_member,
          last_order_details,
          append_if_existing,
          test_profile,
          test_profile_override_reason,
          use_stored_prefs: shouldUseStoredGenerationPrefs(
            use_stored_prefs,
            all_personas || indices.length > 1 ? undefined : email,
          ),
        });

        writeAuditLog({
          keyId,
          tool: 'lab_generate_profile_from_brand_scrape',
          sandbox: allowed.sandbox,
          industry,
          email: one.email,
          identifier: scrapeId,
          result: one.ok ? 'ok' : 'error',
          durationMs: Date.now() - started,
        });

        if (!one.ok) {
          return toolError(one.error || 'Generate failed', {
            scrapeId,
            personaIndex: idx,
            personaName: persona.name,
            partialResults: results,
            hint: one.hint,
            coworkerPrompt: one.coworkerPrompt,
            expectedPattern: one.expectedPattern,
            example: one.example,
            formatRules: one.formatRules,
            confirmTool: 'lab_confirm_profile_generation',
          });
        }

        results.push({
          personaIndex: idx,
          personaName: one.personaName,
          email: one.email,
          ecid: one.ecid,
          segment_hint: one.segment_hint,
          scrapeOverlays: one.scrapeOverlays,
          test_profile: one.test_profile,
          dual_stream: one.dual_stream,
          generate_plan: one.generate_plan,
          generate_step_results: one.generate_step_results,
          recent_profiles_sync: one.recent_profiles_sync,
          ...one.storedPrefsMeta,
        });
      }

      return jsonResult({
        ok: true,
        sandbox: allowed.sandbox,
        scrapeId,
        brandName: record.brandName || null,
        scrape_industry: scrapeIndustry,
        inferred_industry: scrapeIndustry,
        lab_industry: industry,
        scrapeIndustry,
        industry,
        industrySource,
        industry_source: industrySource,
        industry_readiness: industryReadiness,
        warnings: readinessWarnings.length ? readinessWarnings : undefined,
        personaCount: personas.length,
        generated: results.length,
        profiles: results,
        coworkerHints: {
          industryRule:
            industrySource === 'argument'
              ? 'Industry was overridden via argument — confirm with user if dual-stream paths look wrong.'
              : `Using scrape-inferred lab_industry "${industry}" — do not override unless user asks.`,
          infra: industryReadiness.ready
            ? undefined
            : industryReadiness.next_action || 'lab_sandbox_profile_config',
          nextSteps: [
            'lab_send_profile_event with email + ecid from each profile',
            'lab_profile_activity to verify events',
            'Scrape segments are narrative only — create RTCDP audiences separately or use lab segment_hints for seeded personas',
          ],
          scrapeSegmentsNote:
            'personas[].suggested_segments and record.segments are demo copy, not UPS segment memberships.',
        },
      });
    },
  );

  mcpServer.registerTool(
    'lab_generate_profiles_from_brand_scrape',
    {
      title: 'Generate golden profiles for all scrape personas (alias)',
      description:
        'Alias for lab_generate_profile_from_brand_scrape with all_personas:true — streams one AEP test profile per brand scrape persona. ' +
        'Each profile reserves the next scaled email from Firestore generation prefs (omit email; same Portal counter). ' +
        'See lab_generate_profile_from_brand_scrape for single-persona options (persona_index, use_stored_prefs).',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        scrape_id: z.string().describe('Brand scrape id'),
        industry: z
          .string()
          .optional()
          .describe('Override inferred lab industry — omit unless user explicitly requests'),
        persona_indices: z
          .array(z.number().int().min(0).max(11))
          .optional()
          .describe('Subset of persona indices (default: all personas on scrape)'),
        segment_hint: z.string().optional(),
        loyalty_member: z.boolean().optional(),
        last_order_details: z.boolean().optional(),
        append_if_existing: z.boolean().optional(),
        test_profile: z.boolean().optional(),
        use_stored_prefs: z
          .boolean()
          .optional()
          .describe('When true (default when email omitted), reserve scaled email + mobile per persona from Firestore prefs'),
        delay_ms: z.number().int().min(0).max(5000).optional().describe('Delay between generates (default 400)'),
      },
    },
    async ({
      sandbox,
      scrape_id,
      industry,
      persona_indices,
      segment_hint,
      loyalty_member,
      last_order_details,
      append_if_existing,
      test_profile,
      use_stored_prefs,
      delay_ms,
    }) => {
      const started = Date.now();
      const keyId = getRequestKeyId();

      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const scrapeId = String(scrape_id || '').trim();
      if (!scrapeId) {
        return toolError('scrape_id is required.');
      }

      const apiFetch = await getBrandScrape({ sandbox: allowed.sandbox, scrapeId });
      if (!apiFetch.ok) {
        return fromLabApi(apiFetch, { sandbox: allowed.sandbox, scrapeId });
      }

      const record = apiFetch.data || {};
      if (String(record.scrapeStatus || '') !== 'complete') {
        return toolError(`Scrape is not complete (status=${record.scrapeStatus || 'unknown'}).`, { scrapeId });
      }

      const personas = extractBrandScrapePersonas(record);
      if (!personas.length) {
        return toolError('No personas on scrape — include.personas:true on lab_brand_scrape.', { scrapeId });
      }

      const indices =
        Array.isArray(persona_indices) && persona_indices.length
          ? persona_indices.filter((i) => i >= 0 && i < personas.length)
          : personas.map((_, i) => i);

      let canonicalIndustry = 'generic';
      let industrySource = 'default';
      const scrapeIndustry = extractScrapeIndustryTaxonomy(record) || null;
      if (industry) {
        const norm = normalizeIndustry(industry);
        if (!LAB_INDUSTRY_KEYS.includes(norm.industry)) {
          return toolError(`Unknown industry "${industry}".`);
        }
        canonicalIndustry = norm.industry;
        industrySource = 'argument';
      } else {
        const inferred = inferLabIndustryFromRecord(record);
        canonicalIndustry = inferred.industry;
        industrySource = inferred.source;
      }

      const industryReadiness = await assessScrapeGenerateIndustryReadiness({
        sandbox: allowed.sandbox,
        industry: canonicalIndustry,
      });

      const results = [];
      const gap = delay_ms ?? 400;
      for (let n = 0; n < indices.length; n += 1) {
        const idx = indices[n];
        if (n > 0 && gap > 0) await new Promise((r) => setTimeout(r, gap));

        const rate = checkGenerateRate(keyId);
        if (!rate.ok) {
          return toolError(rate.message, { retryAfterSec: rate.retryAfterSec, partialResults: results });
        }

        const one = await generateOneFromScrapePersona({
          sandbox: allowed.sandbox,
          record,
          persona: personas[idx],
          personaIndex: idx,
          industry: canonicalIndustry,
          segment_hint,
          loyalty_member,
          last_order_details,
          append_if_existing,
          test_profile,
          use_stored_prefs: shouldUseStoredGenerationPrefs(use_stored_prefs, undefined),
        });

        writeAuditLog({
          keyId,
          tool: 'lab_generate_profiles_from_brand_scrape',
          sandbox: allowed.sandbox,
          industry: canonicalIndustry,
          email: one.email,
          identifier: scrapeId,
          result: one.ok ? 'ok' : 'error',
          durationMs: Date.now() - started,
        });

        if (!one.ok) {
          return toolError(one.error || 'Generate failed', { personaIndex: idx, partialResults: results });
        }

        results.push({
          personaIndex: idx,
          personaName: one.personaName,
          email: one.email,
          ecid: one.ecid,
          segment_hint: one.segment_hint,
          scrapeOverlays: one.scrapeOverlays,
        });
      }

      return jsonResult({
        ok: true,
        sandbox: allowed.sandbox,
        scrapeId,
        scrape_industry: scrapeIndustry,
        inferred_industry: scrapeIndustry,
        lab_industry: canonicalIndustry,
        industry: canonicalIndustry,
        industrySource,
        industry_source: industrySource,
        industry_readiness: industryReadiness,
        warnings: industryReadiness.ready ? undefined : industryReadiness.warnings,
        generated: results.length,
        profiles: results,
      });
    },
  );
}
