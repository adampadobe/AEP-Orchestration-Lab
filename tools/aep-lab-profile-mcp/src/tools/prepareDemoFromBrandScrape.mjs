import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { checkGenerateRate } from '../rateLimiter.mjs';
import { resolveBrandScrapeFromList } from '../brandScrapeResolve.mjs';
import { listBrandScrapes } from '../labApiClient.mjs';
import {
  createClientJourneyFromScrape,
  generateProfilesFromScrapePersonas,
  loadBrandScrapeRecord,
  sendDemoEventsForProfiles,
} from '../brandScrapeDemoPrep.mjs';
import { fromLabApi, jsonResult, toolError } from './helpers.mjs';

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
        'optional experience events per profile, optional Client Journey v2 HTML asset. ' +
        'Provide scrape_id OR url — when url is given, resolves an existing complete scrape via lab_resolve_brand_scrape logic. ' +
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
        industry: z.string().optional().describe('Override inferred industry for profile generation'),
        steps: z
          .object({
            profiles: z.boolean().optional().describe('Generate golden profiles (default true)'),
            events: z.boolean().optional().describe('Send one web page view event per profile (default false)'),
            journey: z.boolean().optional().describe('Create Client Journey v2 asset (default false; ~60–180s)'),
          })
          .optional(),
        persona_indices: z.array(z.number().int().min(0)).optional().describe('Subset of personas for profiles step'),
        journey_persona_name: z.string().optional().describe('Persona for CJv2 when steps.journey true'),
        journey_type: z.string().optional().describe('Journey type override for CJv2'),
        journey_tier: z.enum(['Foundation', 'Advanced']).optional(),
        event_type: z.string().optional().describe('Event type when steps.events true'),
        event_view_name: z.string().optional().describe('Page view name for events step'),
        append_if_existing: z.boolean().optional(),
        test_profile: z.boolean().optional(),
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
      persona_indices,
      journey_persona_name,
      journey_type,
      journey_tier,
      event_type,
      event_view_name,
      append_if_existing,
      test_profile,
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
      };

      if (stepFlags.profiles || stepFlags.events) {
        const rate = checkGenerateRate(keyId);
        if (!rate.ok) {
          return toolError(rate.message, { retryAfterSec: rate.retryAfterSec });
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
          event_type,
          view_name: event_view_name,
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
          audiences: 'Create RTCDP segments in AEP UI using scrape segment names as a brief — no auto-create API in lab.',
          ajo: 'CJv2 journey is a sales HTML asset; publish real AJO journeys manually in Journey Optimizer.',
        },
      });
    },
  );
}
