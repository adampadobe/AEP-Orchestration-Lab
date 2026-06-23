import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { createClientJourneyFromScrape, loadBrandScrapeRecord } from '../brandScrapeDemoPrep.mjs';
import { getBrandScrape } from '../labApiClient.mjs';
import { jsonResult, toolError } from './helpers.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerCreateJourneyFromBrandScrapeTool(mcpServer) {
  mcpServer.registerTool(
    'lab_create_journey_from_brand_scrape',
    {
      title: 'Create Client Journey v2 asset from brand scrape',
      description:
        'Generate a 12-step Client Journey Asset v2 (interactive HTML + journey JSON) from a brand scrape — ' +
        'same pipeline as Profile Viewer client-journey-asset-v2.html import + Generate. ' +
        'Uses campaigns/personas/segments/tag audit from the scrape via /api/client-journey-v2/import/profile then Vertex Gemini (~60–180s). ' +
        'AJO PLATFORM GAP: this does NOT create an Adobe Journey Optimizer journey in AJO; lab only browses existing AJO journeys (journeysBrowse). ' +
        'Scrape segments are not created as RTCDP audiences.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        scrape_id: z.string().describe('Brand scrape id'),
        persona_name: z.string().optional().describe('Override persona (default: first scrape persona or CJv2 import mapping)'),
        journey_type: z
          .string()
          .optional()
          .describe('Override journey type (default: first detected campaign name or industry fallback)'),
        tier: z.enum(['Foundation', 'Advanced']).optional().describe('CJv2 tier (default Foundation)'),
        persona_gender: z.enum(['male', 'female']).optional().describe('Persona avatar gender for HTML renderer'),
        additional_context: z.string().optional().describe('Extra context appended to CJv2 generate prompt'),
        require_personas: z
          .boolean()
          .optional()
          .describe('When true (default), fail if scrape has no personas (recommended for persona-led journeys)'),
      },
    },
    async ({
      sandbox,
      scrape_id,
      persona_name,
      journey_type,
      tier,
      persona_gender,
      additional_context,
      require_personas,
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

      writeAuditLog({
        keyId,
        tool: 'lab_create_journey_from_brand_scrape',
        sandbox: allowed.sandbox,
        identifier: scrapeId,
      });

      let record = null;
      if (require_personas !== false) {
        const loaded = await loadBrandScrapeRecord({ sandbox: allowed.sandbox, scrapeId });
        if (!loaded.ok) {
          writeAuditLog({
            keyId,
            tool: 'lab_create_journey_from_brand_scrape',
            sandbox: allowed.sandbox,
            identifier: scrapeId,
            result: 'error',
            durationMs: Date.now() - started,
          });
          return toolError(loaded.error || 'Scrape missing personas', { summary: loaded.summary });
        }
        record = loaded.record;
      } else {
        const apiResult = await getBrandScrape({ sandbox: allowed.sandbox, scrapeId });
        if (!apiResult.ok) {
          return toolError(apiResult.error || 'getBrandScrape failed', { status: apiResult.status });
        }
        record = apiResult.data;
      }

      const outcome = await createClientJourneyFromScrape({
        sandbox: allowed.sandbox,
        scrapeId,
        record,
        persona_name,
        journey_type,
        tier,
        persona_gender,
        additional_context,
      });

      writeAuditLog({
        keyId,
        tool: 'lab_create_journey_from_brand_scrape',
        sandbox: allowed.sandbox,
        identifier: scrapeId,
        result: outcome.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });

      if (!outcome.ok) {
        return toolError(outcome.error || 'Journey generation failed', {
          cjv2Input: outcome.cjv2Input,
          apiResult: outcome.apiResult,
          ajoPlatformGap: outcome.ajoPlatformGap,
        });
      }

      return jsonResult({
        ok: true,
        sandbox: allowed.sandbox,
        scrapeId,
        meta: outcome.meta,
        journeyStepCount: Array.isArray(outcome.journey?.stepLabels) ? outcome.journey.stepLabels.length : null,
        htmlLength: outcome.htmlLength,
        sources: outcome.sources,
        portalUrl: outcome.portalUrl,
        ajoPlatformGap: outcome.ajoPlatformGap,
        coworkerHints: {
          download:
            'Open Client Journey Asset v2 in Profile Viewer to preview HTML and download PPTX; journey JSON is in the response journey field.',
          refine: 'Portal supports conversational refine via clientJourneyV2Refine.',
        },
      });
    },
  );
}
