import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { checkGenerateRate } from '../rateLimiter.mjs';
import {
  createClientJourneyFromScrape,
  generateProfilesFromScrapePersonas,
  loadBrandScrapeRecord,
  sendDemoEventsForProfiles,
} from '../brandScrapeDemoPrep.mjs';
import { jsonResult, toolError } from './helpers.mjs';

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
        'Prerequisite: lab_brand_scrape with include.personas:true (and include.segments for richer CJv2 context). ' +
        'Does not create RTCDP audiences or AJO platform journeys — see lab_create_journey_from_brand_scrape ajoPlatformGap.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        scrape_id: z.string().describe('Brand scrape id'),
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

      const scrapeId = String(scrape_id || '').trim();
      if (!scrapeId) {
        return toolError('scrape_id is required.');
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
