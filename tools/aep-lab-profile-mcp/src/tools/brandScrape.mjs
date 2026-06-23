import * as z from 'zod';
import { setTimeout as sleep } from 'node:timers/promises';
import { assertSandboxAllowed } from '../auth.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import {
  brandScrapeAnalyze,
  cancelBrandScrape,
  getBrandScrape,
  listBrandScrapes,
} from '../labApiClient.mjs';
import { resolveBrandScrapeFromList } from '../brandScrapeResolve.mjs';
import {
  isBrandScrapeTerminal,
  summarizeBrandScrape,
  summarizeBrandScrapeListItem,
} from '../brandScrapeSummary.mjs';
import { fromLabApi, jsonResult, toolError } from './helpers.mjs';

const DEFAULT_INCLUDE = {
  analysis: true,
  personas: false,
  campaigns: true,
  segments: false,
  stakeholders: false,
  tagAudit: true,
  llmDemoConfig: true,
};

const includeSchema = z
  .object({
    analysis: z.boolean().optional(),
    personas: z.boolean().optional(),
    campaigns: z.boolean().optional(),
    segments: z.boolean().optional(),
    stakeholders: z.boolean().optional(),
    tagAudit: z.boolean().optional(),
    llmDemoConfig: z.boolean().optional(),
  })
  .optional();

/**
 * @param {object} params
 * @param {string} params.sandbox
 * @param {string} params.scrapeId
 * @param {number} params.pollIntervalMs
 * @param {number} params.timeoutMs
 */
async function pollBrandScrapeUntilTerminal({ sandbox, scrapeId, pollIntervalMs, timeoutMs }) {
  const started = Date.now();
  let lastRow = null;

  while (Date.now() - started < timeoutMs) {
    const apiResult = await getBrandScrape({ sandbox, scrapeId });
    if (!apiResult.ok) {
      return { ok: false, apiResult, lastRow };
    }

    lastRow = apiResult.data || {};
    const status = String(lastRow.scrapeStatus || '');
    if (isBrandScrapeTerminal(status)) {
      return { ok: true, record: lastRow, timedOut: false, elapsedMs: Date.now() - started };
    }

    await sleep(pollIntervalMs);
  }

  return { ok: true, record: lastRow, timedOut: true, elapsedMs: Date.now() - started };
}

/**
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer
 */
export function registerBrandScrapeTools(mcpServer) {
  mcpServer.registerTool(
    'lab_brand_scrape',
    {
      title: 'Run brand scrape for a URL',
      description:
        'POST brandScraperAnalyze (direct Cloud Function, same store as Profile Viewer Brand scraper). ' +
        'Crawls the brand URL, extracts colours/fonts/assets, and runs optional Gemini brand analysis. ' +
        'Default prefer_existing:true reuses a complete scrape with personas for the same URL — set force_new:true only when you need a fresh crawl. ' +
        'Default is async (202 + scrapeId) — poll with lab_get_brand_scrape or set wait_for_complete:true. ' +
        'Results appear in portal brand-scraper.html history and Image hosting for the same sandbox.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        url: z.string().describe('Brand website URL (e.g. https://nike.com)'),
        business_type: z.enum(['b2c', 'b2b']).optional().describe('Business type (default b2c)'),
        country: z.string().optional().describe('Persona country code for audience steps (optional)'),
        max_pages: z.number().int().min(1).max(25).optional().describe('Pages to crawl (default 3, max 25)'),
        crawler: z.enum(['fetch', 'js']).optional().describe('fetch (default) or js (Playwright, slower)'),
        include: includeSchema.describe('AI/crawl steps — defaults match Portal light first pass'),
        mode: z.enum(['new', 'append']).optional().describe('new scrape or append to existing_scrape_id'),
        existing_scrape_id: z.string().optional().describe('Required when mode=append'),
        wait_for_complete: z
          .boolean()
          .optional()
          .describe('When true, poll lab store until scrapeStatus is complete or failed (default true)'),
        prefer_existing: z
          .boolean()
          .optional()
          .describe(
            'When true (default), reuse a complete scrape with personas for this URL instead of starting a new crawl',
          ),
        force_new: z
          .boolean()
          .optional()
          .describe('When true, always start a new crawl (skips prefer_existing dedupe)'),
        require_personas: z
          .boolean()
          .optional()
          .describe('When prefer_existing, require personasPresent (default true)'),
        require_complete: z
          .boolean()
          .optional()
          .describe('When prefer_existing, require scrapeStatus complete (default true)'),
        poll_timeout_sec: z
          .number()
          .int()
          .min(30)
          .max(540)
          .optional()
          .describe('Max wait when wait_for_complete (default 480s)'),
      },
    },
    async ({
      sandbox,
      url,
      business_type,
      country,
      max_pages,
      crawler,
      include,
      mode,
      existing_scrape_id,
      wait_for_complete,
      prefer_existing,
      force_new,
      require_personas,
      require_complete,
      poll_timeout_sec,
    }) => {
      const started = Date.now();
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const brandUrl = String(url || '').trim();
      if (!brandUrl) {
        return toolError('url is required.');
      }

      const scrapeMode = mode === 'append' ? 'append' : 'new';
      if (scrapeMode === 'append' && !String(existing_scrape_id || '').trim()) {
        return toolError('existing_scrape_id is required when mode=append.');
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_brand_scrape',
        sandbox: allowed.sandbox,
        identifier: brandUrl,
      });

      const includeMerged = { ...DEFAULT_INCLUDE, ...(include && typeof include === 'object' ? include : {}) };
      const shouldWait = wait_for_complete !== false;
      const shouldPreferExisting = prefer_existing !== false && !force_new && scrapeMode !== 'append';

      if (shouldPreferExisting) {
        const listResult = await listBrandScrapes({ sandbox: allowed.sandbox });
        if (listResult.ok) {
          const items = Array.isArray(listResult.data?.items) ? listResult.data.items : [];
          const resolved = resolveBrandScrapeFromList(items, {
            url: brandUrl,
            prefer_existing: true,
            require_personas: require_personas !== false,
            require_complete: require_complete !== false,
          });
          if (!resolved.need_new_scrape && resolved.scrape_id) {
            const reuseId = String(resolved.scrape_id).trim();
            writeAuditLog({
              keyId: getRequestKeyId(),
              tool: 'lab_brand_scrape',
              sandbox: allowed.sandbox,
              identifier: reuseId,
              result: 'ok',
              durationMs: Date.now() - started,
            });

            if (!shouldWait) {
              return jsonResult({
                ok: true,
                sandbox: allowed.sandbox,
                scrapeId: reuseId,
                reused: true,
                resolve: resolved,
                summary: resolved.summary,
                coworkerHints: {
                  portalUrl: resolved.summary?.portalUrl,
                  reuse: 'Existing complete scrape reused — no new crawl started.',
                },
              });
            }

            const poll = await pollBrandScrapeUntilTerminal({
              sandbox: allowed.sandbox,
              scrapeId: reuseId,
              pollIntervalMs: 2000,
              timeoutMs: 15_000,
            });
            const summary = summarizeBrandScrape(poll.record || resolved.summary);
            return jsonResult({
              ok: true,
              sandbox: allowed.sandbox,
              scrapeId: reuseId,
              reused: true,
              resolve: resolved,
              waitedMs: poll.elapsedMs,
              summary,
              lab: poll.record || undefined,
              coworkerHints: {
                portalUrl: summary?.portalUrl,
                reuse: 'Existing complete scrape reused — no new crawl started.',
                refresh: 'Call force_new:true only when you need a fresh crawl.',
              },
            });
          }
        }
      }

      const analyzeResult = await brandScrapeAnalyze({
        sandbox: allowed.sandbox,
        url: brandUrl,
        business_type,
        country,
        max_pages,
        crawler,
        include: includeMerged,
        mode: scrapeMode,
        existing_scrape_id,
        prefer_existing: shouldPreferExisting,
        force_new: force_new === true,
        require_personas: require_personas !== false,
        require_complete: require_complete !== false,
      });

      if (!analyzeResult.ok) {
        writeAuditLog({
          keyId: getRequestKeyId(),
          tool: 'lab_brand_scrape',
          sandbox: allowed.sandbox,
          identifier: brandUrl,
          result: 'error',
          durationMs: Date.now() - started,
        });
        return toolError(analyzeResult.error || 'Brand scrape analyze failed', {
          status: analyzeResult.status,
          url: analyzeResult.url,
          response: analyzeResult.data,
        });
      }

      const scrapeId = String(analyzeResult.scrapeId || analyzeResult.data?.scrapeId || '').trim();
      if (!scrapeId) {
        return toolError('Analyze accepted but no scrapeId returned.', { lab: analyzeResult.data });
      }

      const serverReused = analyzeResult.data?.reused === true;
      if (serverReused && analyzeResult.data?.reuseReason === 'complete' && !shouldWait) {
        const summary = summarizeBrandScrape(analyzeResult.data);
        writeAuditLog({
          keyId: getRequestKeyId(),
          tool: 'lab_brand_scrape',
          sandbox: allowed.sandbox,
          identifier: scrapeId,
          result: 'ok',
          durationMs: Date.now() - started,
        });
        return jsonResult({
          ok: true,
          sandbox: allowed.sandbox,
          scrapeId,
          reused: true,
          serverReused: true,
          summary,
          coworkerHints: {
            reuse: 'Server returned existing complete scrape — no new crawl started.',
          },
        });
      }

      if (!shouldWait) {
        writeAuditLog({
          keyId: getRequestKeyId(),
          tool: 'lab_brand_scrape',
          sandbox: allowed.sandbox,
          identifier: scrapeId,
          result: 'ok',
          durationMs: Date.now() - started,
        });
        return jsonResult({
          ok: true,
          sandbox: allowed.sandbox,
          scrapeId,
          asyncAccepted: analyzeResult.asyncAccepted === true,
          lab: analyzeResult.data,
          nextStep: `Poll lab_get_brand_scrape with scrape_id ${scrapeId} until scrapeStatus is complete or failed.`,
          portalUrl: 'https://aep-orchestration-lab.web.app/profile-viewer/brand-scraper.html',
        });
      }

      const poll = await pollBrandScrapeUntilTerminal({
        sandbox: allowed.sandbox,
        scrapeId,
        pollIntervalMs: 5000,
        timeoutMs: (poll_timeout_sec ?? 480) * 1000,
      });

      if (!poll.ok) {
        writeAuditLog({
          keyId: getRequestKeyId(),
          tool: 'lab_brand_scrape',
          sandbox: allowed.sandbox,
          identifier: scrapeId,
          result: 'error',
          durationMs: Date.now() - started,
        });
        return fromLabApi(poll.apiResult, { scrapeId, sandbox: allowed.sandbox });
      }

      const summary = summarizeBrandScrape(poll.record);
      const terminalStatus = summary?.scrapeStatus || null;

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_brand_scrape',
        sandbox: allowed.sandbox,
        identifier: scrapeId,
        result: terminalStatus === 'failed' ? 'error' : 'ok',
        durationMs: Date.now() - started,
      });

      return jsonResult({
        ok: terminalStatus !== 'failed',
        sandbox: allowed.sandbox,
        scrapeId,
        asyncAccepted: analyzeResult.asyncAccepted === true,
        waitedMs: poll.elapsedMs,
        timedOut: poll.timedOut === true,
        summary,
        lab: poll.record,
        coworkerHints: {
          portalUrl: summary?.portalUrl,
          useInDemos:
            'Saved scrape is selectable in LLM Demo, Client Journey Asset v2 import, and Image hosting publish flows.',
          refresh: poll.timedOut
            ? `Poll again with lab_get_brand_scrape scrape_id=${scrapeId}.`
            : undefined,
        },
      });
    },
  );

  mcpServer.registerTool(
    'lab_cancel_brand_scrape',
    {
      title: 'Cancel a stuck brand scrape',
      description:
        'POST /api/brand-scraper/scrapes/{id}/cancel — same as Portal history card Cancel. ' +
        'Marks a running or crawl_complete scrape as failed so history no longer shows Running. ' +
        'Use when a scrape is stuck in fetch/crawl; then force_new:true to retry if needed.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        scrape_id: z.string().describe('Scrape id from history or lab_list_brand_scrapes'),
        reason: z.string().optional().describe('Optional cancel reason stored on the scrape row'),
      },
    },
    async ({ sandbox, scrape_id, reason }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const scrapeId = String(scrape_id || '').trim();
      if (!scrapeId) {
        return toolError('scrape_id is required.');
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_cancel_brand_scrape',
        sandbox: allowed.sandbox,
        identifier: scrapeId,
      });

      const apiResult = await cancelBrandScrape({
        sandbox: allowed.sandbox,
        scrapeId,
        reason,
      });

      if (!apiResult.ok) {
        return fromLabApi(apiResult, { sandbox: allowed.sandbox, scrapeId });
      }

      return jsonResult({
        ok: true,
        sandbox: allowed.sandbox,
        scrapeId,
        lab: apiResult.data,
        coworkerHints: {
          portalUrl: 'https://aep-orchestration-lab.web.app/profile-viewer/brand-scraper.html',
          next: 'Refresh history — card should show failed/cancelled. Use lab_brand_scrape with force_new:true to retry.',
        },
      });
    },
  );

  mcpServer.registerTool(
    'lab_resolve_brand_scrape',
    {
      title: 'Resolve existing brand scrape for URL',
      description:
        'List sandbox scrape history and pick the best existing match for a brand URL before running lab_brand_scrape. ' +
        'Returns scrape_id + summary when a suitable complete scrape exists, or need_new_scrape:true with reason. ' +
        'Coworker: call this first — "Before scraping, check if we already have a complete scrape for this URL on this sandbox."',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        url: z
          .string()
          .optional()
          .describe('Brand website URL to match (host/path normalized). Omit to pick newest suitable scrape on sandbox.'),
        prefer_existing: z
          .boolean()
          .optional()
          .describe('When true (default), return existing match when found; when false, always need_new_scrape'),
        max_age_hours: z
          .number()
          .positive()
          .optional()
          .describe('Ignore scrapes older than this many hours (by updatedAt)'),
        require_personas: z
          .boolean()
          .optional()
          .describe('Require personasPresent on index row (default true — needed for demo prep)'),
        require_complete: z
          .boolean()
          .optional()
          .describe('Require scrapeStatus complete (default true)'),
      },
    },
    async ({
      sandbox,
      url,
      prefer_existing,
      max_age_hours,
      require_personas,
      require_complete,
    }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const apiResult = await listBrandScrapes({ sandbox: allowed.sandbox });
      if (!apiResult.ok) {
        return fromLabApi(apiResult, { sandbox: allowed.sandbox });
      }

      const items = Array.isArray(apiResult.data?.items) ? apiResult.data.items : [];
      const resolved = resolveBrandScrapeFromList(items, {
        url: url ? String(url).trim() : undefined,
        prefer_existing: prefer_existing !== false,
        max_age_hours,
        require_personas: require_personas !== false,
        require_complete: require_complete !== false,
      });

      return jsonResult({
        ok: true,
        sandbox: allowed.sandbox,
        ...resolved,
        historyCount: items.length,
        nextStep: resolved.need_new_scrape
          ? 'Call lab_brand_scrape with the same sandbox and url (include.personas:true for demo prep).'
          : `Reuse scrape_id ${resolved.scrape_id} — lab_prepare_demo_from_brand_scrape or lab_generate_profile_from_brand_scrape.`,
        portalUrl: 'https://aep-orchestration-lab.web.app/profile-viewer/brand-scraper.html',
      });
    },
  );

  mcpServer.registerTool(
    'lab_list_brand_scrapes',
    {
      title: 'List saved brand scrapes',
      description:
        'GET /api/brand-scraper/scrapes — same Firestore index as Profile Viewer Brand scraper history for the sandbox.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
      },
    },
    async ({ sandbox }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const apiResult = await listBrandScrapes({ sandbox: allowed.sandbox });
      if (!apiResult.ok) {
        return fromLabApi(apiResult, { sandbox: allowed.sandbox });
      }

      const items = Array.isArray(apiResult.data?.items) ? apiResult.data.items : [];
      return jsonResult({
        ok: true,
        sandbox: allowed.sandbox,
        count: items.length,
        items: items.map((item) => summarizeBrandScrapeListItem(item)),
        portalUrl: 'https://aep-orchestration-lab.web.app/profile-viewer/brand-scraper.html',
      });
    },
  );

  mcpServer.registerTool(
    'lab_get_brand_scrape',
    {
      title: 'Get brand scrape by id',
      description:
        'GET /api/brand-scraper/scrapes/{scrapeId} — full GCS-backed record plus Coworker summary (colours, fonts, personas, status). ' +
        'Same data Portal shows when you open a scrape card.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        scrape_id: z.string().describe('Scrape id from lab_brand_scrape or history list'),
        version: z.string().optional().describe('Optional archived version id (append snapshots)'),
        summary_only: z.boolean().optional().describe('When true, omit full lab payload (default false)'),
      },
    },
    async ({ sandbox, scrape_id, version, summary_only }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const scrapeId = String(scrape_id || '').trim();
      if (!scrapeId) {
        return toolError('scrape_id is required.');
      }

      const apiResult = await getBrandScrape({
        sandbox: allowed.sandbox,
        scrapeId,
        version,
      });

      if (!apiResult.ok) {
        return fromLabApi(apiResult, { sandbox: allowed.sandbox, scrapeId });
      }

      const record = apiResult.data || {};
      const summary = summarizeBrandScrape(record);

      return jsonResult({
        ok: true,
        sandbox: allowed.sandbox,
        scrapeId,
        summary,
        ...(summary_only ? {} : { lab: record }),
        coworkerHints: {
          terminal: isBrandScrapeTerminal(summary?.scrapeStatus),
          portalUrl: summary?.portalUrl,
        },
      });
    },
  );
}
