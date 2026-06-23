import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { checkEdgeSendRate } from '../rateLimiter.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import {
  buildRetailJourneyEventPack,
  resolveDemoEventSequence,
} from '../framework/demoEventPacks.mjs';
import { sendProfileEventSequence } from '../framework/sendProfileEventSequence.mjs';
import { jsonResult, toolError } from './helpers.mjs';

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerSendRetailJourneyEventsTool(mcpServer) {
  mcpServer.registerTool(
    'lab_send_retail_journey_events',
    {
      title: 'Send retail journey experience events',
      description:
        'Send a Portal Event tool–aligned retail customer journey (commerce.productViews → productListAdds → ' +
        'productListViews → transaction) for one profile. Uses schema-valid eventType values from Event Generator ' +
        'datalist — never custom strings like starbucks.page.view. Requires email + ecid from lab_generate_profile. ' +
        'Preflights identity before send; staggered timestamps spread events over the last few hours. ' +
        'Verify with lab_profile_activity (30–60s UPS lag). For batch brand-scrape demos use lab_prepare_demo_from_brand_scrape with steps.events.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        email: z.string().email().describe('Profile email from generate response'),
        ecid: z
          .string()
          .optional()
          .describe('Experience Cloud ID from lab_generate_profile — strongly recommended'),
        brand_name: z.string().optional().describe('Brand label for purchase event view_name (e.g. Starbucks)'),
        product_name: z.string().optional().describe('Product for productViews step (default brand-aware)'),
        base_url: z.string().optional().describe('Shop base URL for viewUrl fields'),
        target_id: z
          .string()
          .optional()
          .describe('Preset from lab_list_event_targets (default lab-event-tool-edge)'),
        delay_ms: z
          .number()
          .int()
          .min(0)
          .max(5000)
          .optional()
          .describe('Delay between events in ms (default 800)'),
        preflight: z.boolean().optional().describe('Run identity preflight before send (default true)'),
        event_sequence: z
          .enum(['retail_journey', 'single_page_view'])
          .optional()
          .describe('Override sequence (default retail_journey)'),
      },
    },
    async ({
      sandbox,
      email,
      ecid,
      brand_name,
      product_name,
      base_url,
      target_id,
      delay_ms,
      preflight,
      event_sequence,
    }) => {
      const started = Date.now();
      const keyId = getRequestKeyId();

      const rate = checkEdgeSendRate(keyId);
      if (!rate.ok) {
        writeAuditLog({
          keyId,
          tool: 'lab_send_retail_journey_events',
          sandbox,
          email,
          result: 'error',
          durationMs: Date.now() - started,
        });
        return toolError(rate.message, { retryAfterSec: rate.retryAfterSec });
      }

      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        writeAuditLog({
          keyId,
          tool: 'lab_send_retail_journey_events',
          sandbox,
          result: 'error',
          durationMs: Date.now() - started,
        });
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const resolved = resolveDemoEventSequence({
        event_sequence: event_sequence || 'retail_journey',
        industry: 'retail',
        view_name: product_name,
        brandName: brand_name,
        baseUrl: base_url,
      });

      const outcome = await sendProfileEventSequence({
        sandbox: allowed.sandbox,
        email,
        ecid,
        events: resolved.events,
        target_id,
        delay_ms: delay_ms ?? 800,
        preflight: preflight !== false,
      });

      writeAuditLog({
        keyId,
        tool: 'lab_send_retail_journey_events',
        sandbox: allowed.sandbox,
        email: outcome.email || email,
        identifier: outcome.ecid || email,
        result: outcome.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });

      if (!outcome.ok && outcome.error && !outcome.results?.length) {
        return toolError(outcome.error, { sequence: resolved.sequence });
      }

      return jsonResult({
        ok: outcome.ok,
        sandbox: allowed.sandbox,
        sequence: resolved.sequence,
        event_types: resolved.events.map((e) => e.event_type),
        example_pack: buildRetailJourneyEventPack({
          brandName: brand_name || 'Starbucks',
          productName: product_name,
          baseUrl: base_url,
        }).map((e) => ({ event_type: e.event_type, view_name: e.view_name })),
        ...outcome,
      });
    },
  );
}
