import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { checkGenerateRate } from '../rateLimiter.mjs';
import { resolveBrandScrapeFromList } from '../brandScrapeResolve.mjs';
import { listBrandScrapes, previewDemoAssets, previewDemoConfig } from '../labApiClient.mjs';
import {
  createClientJourneyFromScrape,
  generateProfilesFromScrapePersonas,
  loadBrandScrapeRecord,
  sendDemoEventsForProfiles,
} from '../brandScrapeDemoPrep.mjs';
import {
  checkGenerationPrefsConfigured,
  shouldUseStoredGenerationPrefs,
} from './generationPrefs.mjs';
import { fromLabApi, jsonResult, toolError } from './helpers.mjs';
import { buildDemoConfigChangesFromScrape } from './demoConfig.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerPrepareDemoFromBrandScrapeTool(mcpServer) {
  mcpServer.registerTool(
    'lab_prepare_demo_from_brand_scrape',
    {
      title: 'Orchestrate demo prep from brand scrape',
      description:
        'End-to-end demo prep from an existing brand scrape: golden profiles from personas (default on), ' +
        'optional stable image-hosting preview, governed RTDB preview, experience events per profile, and Client Journey v2 HTML asset. ' +
        'For a complete customer image + RTDB change, prefer lab_demo_customer_switch so one confirmation governs both. ' +
        'Profiles reserve scaled emails + static mobile from Firestore generation prefs (FORMAT: <local>+DDMMYYYY-N@<domain>). ' +
        'Call lab_confirm_profile_generation before first generate. ' +
        'Provide scrape_id OR url — when url is given, resolves an existing complete scrape via lab_resolve_brand_scrape logic. ' +
        'Profile industry defaults from scrape taxonomy (lab_industry in summary) — do not override unless user asks. ' +
        'Prerequisite: complete scrape with personas (lab_resolve_brand_scrape → lab_brand_scrape if need_new_scrape). ' +
        'Does not create RTCDP audiences or AJO platform journeys — see lab_create_journey_from_brand_scrape ajoPlatformGap.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        scrape_id: z.string().optional().describe('Brand scrape id (or pass url to auto-resolve)'),
        url: z
          .string()
          .optional()
          .describe('Brand URL — auto-resolve existing scrape when scrape_id omitted'),
        prefer_existing: z
          .boolean()
          .optional()
          .describe('When resolving url, reuse existing scrape (default true)'),
        industry: z
          .string()
          .optional()
          .describe('Override scrape-inferred lab_industry for profile generation — omit unless user explicitly asks'),
        steps: z
          .object({
            profiles: z.boolean().optional().describe('Generate golden profiles (default true)'),
            events: z.boolean().optional().describe('Send Portal-aligned journey events per profile (default false; retail → commerce pack)'),
            journey: z.boolean().optional().describe('Create Client Journey v2 asset (default false; ~60–180s)'),
            demo_config_preview: z
              .boolean()
              .optional()
              .describe('Preview user-scoped RTDB brand/industry changes from the scrape; never applies them'),
            assets_preview: z
              .boolean()
              .optional()
              .describe('Preview fixed stable Image Hosting slots from the scrape; never replaces public assets'),
          })
          .optional(),
        asset_pack: z
          .enum(['core', 'core_and_mobile'])
          .optional()
          .describe('Asset preview pack: defaults to core_and_mobile (logo, hero and three mobile/channel images); core is an explicit reduced option'),
        logo_image_index: z.number().int().min(0).optional(),
        hero_image_index: z.number().int().min(0).optional(),
        persona_indices: z.array(z.number().int().min(0)).optional().describe('Subset of personas for profiles step'),
        journey_persona_name: z.string().optional().describe('Persona for CJv2 when steps.journey true'),
        journey_type: z.string().optional().describe('Journey type override for CJv2'),
        journey_tier: z.enum(['Foundation', 'Advanced']).optional(),
        event_type: z.string().optional().describe('Single event type override (any string; portal free-text)'),
        event_types: z
          .array(z.string())
          .optional()
          .describe('Multiple event types per profile — any strings; overrides event_type / journey packs'),
        event_view_name: z.string().optional().describe('Product or page name for events step'),
        event_sequence: z
          .enum(['retail_journey', 'single_page_view'])
          .optional()
          .describe('Optional commerce pack when event_types omitted — retail defaults retail_journey'),
        realistic_events: z
          .boolean()
          .optional()
          .describe('When true with retail lab_industry, sends commerce journey (same as retail_journey)'),
        event_delay_ms: z
          .number()
          .int()
          .min(0)
          .max(5000)
          .optional()
          .describe('Delay between events per profile (default 800)'),
        append_if_existing: z.boolean().optional(),
        test_profile: z.boolean().optional(),
        use_stored_prefs: z
          .boolean()
          .optional()
          .describe('When true (default), reserve scaled email + mobile per persona from Firestore generation prefs'),
        loyalty_member: z.boolean().optional(),
      },
    },
    async ({
      sandbox,
      scrape_id,
      url,
      prefer_existing,
      industry,
      steps,
      asset_pack,
      logo_image_index,
      hero_image_index,
      persona_indices,
      journey_persona_name,
      journey_type,
      journey_tier,
      event_type,
      event_types,
      event_sequence,
      realistic_events,
      event_view_name,
      event_delay_ms,
      append_if_existing,
      test_profile,
      use_stored_prefs,
      loyalty_member,
    }) => {
      const started = Date.now();
      const keyId = getRequestKeyId();

      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      let scrapeId = String(scrape_id || '').trim();
      let resolveMeta = null;

      if (!scrapeId) {
        const brandUrl = String(url || '').trim();
        if (!brandUrl) {
          return toolError('scrape_id or url is required.');
        }

        const listResult = await listBrandScrapes({ sandbox: allowed.sandbox });
        if (!listResult.ok) {
          return fromLabApi(listResult, { sandbox: allowed.sandbox });
        }

        const items = Array.isArray(listResult.data?.items) ? listResult.data.items : [];
        resolveMeta = resolveBrandScrapeFromList(items, {
          url: brandUrl,
          prefer_existing: prefer_existing !== false,
          require_personas: true,
          require_complete: true,
        });

        if (resolveMeta.need_new_scrape) {
          return toolError(resolveMeta.reason || 'No suitable scrape found for url.', {
            url: brandUrl,
            resolve: resolveMeta,
            nextStep:
              'Call lab_brand_scrape with include.personas:true (and include.segments for CJv2), then re-run lab_prepare_demo_from_brand_scrape.',
          });
        }

        scrapeId = String(resolveMeta.scrape_id || '').trim();
        if (!scrapeId) {
          return toolError('Resolve succeeded but no scrape_id returned.', { resolve: resolveMeta });
        }
      }

      const stepFlags = {
        profiles: steps?.profiles !== false,
        events: steps?.events === true,
        journey: steps?.journey === true,
        demoConfigPreview: steps?.demo_config_preview === true,
        assetsPreview: steps?.assets_preview === true,
      };

      if (stepFlags.profiles || stepFlags.events) {
        const rate = checkGenerateRate(keyId);
        if (!rate.ok) {
          return toolError(rate.message, { retryAfterSec: rate.retryAfterSec });
        }
      }

      if (stepFlags.profiles && shouldUseStoredGenerationPrefs(use_stored_prefs, undefined)) {
        const prefsCheck = await checkGenerationPrefsConfigured(allowed.sandbox);
        if (!prefsCheck.ok) {
          writeAuditLog({
            keyId,
            tool: 'lab_prepare_demo_from_brand_scrape',
            sandbox: allowed.sandbox,
            identifier: scrapeId || String(url || '').trim(),
            result: 'error',
            durationMs: Date.now() - started,
          });
          return toolError(prefsCheck.error, {
            blockedStep: 'profiles',
            hint: prefsCheck.hint,
            coworkerPrompt: prefsCheck.coworkerPrompt,
            confirmTool: prefsCheck.confirmTool,
            questionsForColleague: prefsCheck.questionsForColleague,
            formatRules: prefsCheck.formatRules,
            recommendedAction: prefsCheck.recommendedAction,
            nextStep: prefsCheck.nextStep,
            coworkerHints: {
              confirm: `Call ${prefsCheck.confirmTool} for sandbox ${allowed.sandbox} — ask colleague base email, then confirmed:true.`,
              retry: 'Re-run lab_prepare_demo_from_brand_scrape with the same scrape_id or url after prefs are saved.',
            },
          });
        }
      }

      writeAuditLog({
        keyId,
        tool: 'lab_prepare_demo_from_brand_scrape',
        sandbox: allowed.sandbox,
        identifier: scrapeId,
      });

      const loaded = await loadBrandScrapeRecord({ sandbox: allowed.sandbox, scrapeId });
      if (!loaded.ok) {
        writeAuditLog({
          keyId,
          tool: 'lab_prepare_demo_from_brand_scrape',
          sandbox: allowed.sandbox,
          identifier: scrapeId,
          result: 'error',
          durationMs: Date.now() - started,
        });
        return toolError(loaded.error || 'Failed to load scrape', { summary: loaded.summary });
      }

      /** @type {Record<string, unknown>} */
      const pipeline = { scrapeSummary: loaded.summary, stepsRun: [] };

      if (stepFlags.assetsPreview) {
        const preview = await previewDemoAssets({
          sandbox: allowed.sandbox,
          scrape_id: scrapeId,
          asset_pack: asset_pack || 'core_and_mobile',
          overrides: { logo_image_index, hero_image_index },
        });
        pipeline.stepsRun.push('assets_preview');
        pipeline.demoAssetsPreview = preview.ok ? preview.data : {
          ok: false,
          error: preview.error,
          status: preview.status,
        };
        if (!preview.ok) {
          return jsonResult({
            ok: false,
            sandbox: allowed.sandbox,
            scrapeId,
            error: 'Demo assets preview step failed',
            pipeline,
          });
        }
      }

      if (stepFlags.demoConfigPreview) {
        const logoAsset = Array.isArray(pipeline.demoAssetsPreview?.proposed)
          ? pipeline.demoAssetsPreview.proposed.find((item) => item && item.slot === 'logo')
          : null;
        const changes = buildDemoConfigChangesFromScrape(loaded.record, 'brand_and_industry', {
          customerLogoUrl: logoAsset && logoAsset.cdnUrl,
        });
        if (!changes.length) {
          return toolError('The scrape did not contain safe brand values for a demo configuration preview.', {
            sandbox: allowed.sandbox,
            scrapeId,
          });
        }
        const preview = await previewDemoConfig({
          sandbox: allowed.sandbox,
          changes,
          source: `brand-scrape:${scrapeId}`,
        });
        pipeline.stepsRun.push('demo_config_preview');
        pipeline.demoConfigPreview = preview.ok ? preview.data : {
          ok: false,
          error: preview.error,
          status: preview.status,
        };
        if (!preview.ok) {
          return jsonResult({
            ok: false,
            sandbox: allowed.sandbox,
            scrapeId,
            error: 'Demo configuration preview step failed',
            pipeline,
          });
        }
      }

      let profileOutcome = null;
      if (stepFlags.profiles) {
        profileOutcome = await generateProfilesFromScrapePersonas({
          sandbox: allowed.sandbox,
          record: loaded.record,
          industry,
          personaIndices: persona_indices,
          append_if_existing,
          test_profile,
          loyalty_member,
          use_stored_prefs,
          delay_ms: 400,
        });
        pipeline.stepsRun.push('profiles');
        pipeline.profiles = profileOutcome;
        if (!profileOutcome.ok) {
          writeAuditLog({
            keyId,
            tool: 'lab_prepare_demo_from_brand_scrape',
            sandbox: allowed.sandbox,
            identifier: scrapeId,
            result: 'error',
            durationMs: Date.now() - started,
          });
          return jsonResult({
            ok: false,
            sandbox: allowed.sandbox,
            scrapeId,
            error: 'Profile generation step had failures',
            pipeline,
          });
        }
      }

      if (stepFlags.events) {
        const profileRows = profileOutcome?.results || [];
        if (!profileRows.length) {
          return toolError('steps.events requires profiles step (or no profiles were generated).');
        }
        const eventOutcome = await sendDemoEventsForProfiles({
          sandbox: allowed.sandbox,
          profileResults: profileRows,
          industry: profileOutcome?.industry || profileOutcome?.lab_industry || loaded.summary?.lab_industry,
          event_types,
          event_sequence: realistic_events === false ? 'single_page_view' : event_sequence,
          realistic_events,
          event_type,
          view_name: event_view_name,
          brand_name: loaded.summary?.brandName || undefined,
          base_url: loaded.summary?.url || undefined,
          delay_ms: event_delay_ms ?? 800,
        });
        pipeline.stepsRun.push('events');
        pipeline.events = eventOutcome;
      }

      if (stepFlags.journey) {
        const journeyOutcome = await createClientJourneyFromScrape({
          sandbox: allowed.sandbox,
          scrapeId,
          record: loaded.record,
          persona_name: journey_persona_name,
          journey_type,
          tier: journey_tier,
        });
        pipeline.stepsRun.push('journey');
        pipeline.journey = {
          ok: journeyOutcome.ok,
          meta: journeyOutcome.meta,
          htmlLength: journeyOutcome.htmlLength,
          ajoPlatformGap: journeyOutcome.ajoPlatformGap,
          error: journeyOutcome.ok ? undefined : journeyOutcome.error,
        };
      }

      writeAuditLog({
        keyId,
        tool: 'lab_prepare_demo_from_brand_scrape',
        sandbox: allowed.sandbox,
        identifier: scrapeId,
        result: 'ok',
        durationMs: Date.now() - started,
      });

      return jsonResult({
        ok: true,
        sandbox: allowed.sandbox,
        scrapeId,
        ...(resolveMeta ? { resolvedFromUrl: resolveMeta } : {}),
        pipeline,
        coworkerHints: {
          next:
            'Verify profiles with lab_get_profile; optional lab_profile_activity after events (allow 30–60s UPS lag).',
          assets:
            'For the actual customer change, call lab_demo_customer_switch with this scrapeId so RTDB and all five managed images share one governed confirmation and verification result.',
          demoConfig:
            'Use the individual lab_demo_config_apply only when the colleague deliberately wants an RTDB-only partial update.',
          audiences: 'Create RTCDP segments in AEP UI using scrape segment names as a brief — no auto-create API in lab.',
          ajo: 'CJv2 journey is a sales HTML asset; publish real AJO journeys manually in Journey Optimizer.',
        },
      });
    },
  );
}
