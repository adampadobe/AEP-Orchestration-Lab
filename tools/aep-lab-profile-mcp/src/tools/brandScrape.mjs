import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import {
  brandScrapeAnalyze,
  brandScrapeDemoBuild,
  cancelBrandScrape,
  getBrandScrape,
  listBrandScrapes,
} from '../labApiClient.mjs';
import { resolveBrandScrapeFromList, findInFlightBrandScrapeFromList } from '../brandScrapeResolve.mjs';
import { pollBrandScrapeUntilTerminal, brandScrapeProgressMessage } from '../brandScrapePoll.mjs';
import {
  isBrandScrapeTerminal,
  summarizeBrandScrape,
  summarizeBrandScrapeListItem,
  brandScrapeProgressHint,
  demoWebsiteCoworkerHint,
} from '../brandScrapeSummary.mjs';
import {
  generateScrapeBrief,
  generateAssetChecklist,
  briefFilename,
  checklistFilename,
  BRAND_SCRAPER_UPLOAD_LIMITS,
} from '../brandScraperBrief.mjs';
import {
  buildUploadedHtmlBody,
  validateBrandScrapeUpload,
} from '../brandScraperUploadValidation.mjs';
import { fromLabApi, jsonResult, toolError } from './helpers.mjs';

const DEFAULT_INCLUDE = {
  analysis: true,
  personas: false,
  campaigns: true,
  segments: false,
  stakeholders: false,
  tagAudit: true,
  llmDemoConfig: true,
  demoWebsite: false,
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
    demoWebsite: z.boolean().optional(),
  })
  .optional();

const uploadFileSchema = z.object({
  name: z.string().describe('Relative path, e.g. index.html or css/style.css'),
  content_base64: z.string().describe('Base64 or data-URL base64 content'),
});

const uploadSchema = z
  .object({
    files: z.array(uploadFileSchema).optional().describe('Individual .html or asset files (max ~40 total)'),
    zip_base64: z.string().optional().describe('Base64-encoded .zip (max 30 MB, ~40 files) — preferred for save-page bundles'),
  })
  .optional();

const sharedScrapeParams = {
  sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
  url: z.string().optional().describe('Brand website URL (required unless upload_only with fallback_url)'),
  business_type: z.enum(['b2c', 'b2b']).optional().describe('Business type (default b2c)'),
  country: z.string().optional().describe('Persona country for audience steps (optional)'),
  max_pages: z.number().int().min(1).max(25).optional().describe('Pages to crawl or target in brief (default 3)'),
  crawler: z.enum(['fetch', 'js']).optional().describe('fetch (default) or js (Playwright, slower)'),
  include: includeSchema.describe('AI/crawl steps — defaults match Portal light first pass; demoWebsite builds site clone'),
  mode: z.enum(['new', 'append']).optional().describe('new scrape or append to existing_scrape_id'),
  existing_scrape_id: z.string().optional().describe('Required when mode=append'),
  customer_name: z.string().optional().describe('Customer/brand label for demo website nav'),
  regenerate_demo_website: z.boolean().optional().describe('When include.demoWebsite:true, overwrite existing demo folder'),
  overwrite_demo_website: z.boolean().optional().describe('Alias for regenerate_demo_website'),
  wait_for_complete: z.boolean().optional().describe('When true, poll until scrapeStatus is complete or failed (default true)'),
  prefer_existing: z.boolean().optional().describe('When true (default), reuse complete scrapes with personas for same URL'),
  force_new: z.boolean().optional().describe('When true, always start a new crawl (skips prefer_existing dedupe)'),
  require_personas: z.boolean().optional().describe('When prefer_existing, require personasPresent (default true)'),
  require_complete: z.boolean().optional().describe('When prefer_existing, require scrapeStatus complete (default true)'),
  poll_timeout_sec: z.number().int().min(30).max(900).optional().describe('Max wait when wait_for_complete (default 480s; 600s with demoWebsite)'),
  upload: uploadSchema.describe(
    `HTML/ZIP upload — max ${BRAND_SCRAPER_UPLOAD_LIMITS.maxUploadMb} MB, ~${BRAND_SCRAPER_UPLOAD_LIMITS.maxFiles} files. Same payload as Portal Options → HTML upload.`,
  ),
  upload_only: z
    .boolean()
    .optional()
    .describe('Skip live crawl — analyse uploaded HTML/ZIP only (Portal "Uploaded HTML only")'),
  use_as_fallback: z
    .boolean()
    .optional()
    .describe('When true (default when upload present and not upload_only), merge upload after blocked live pages'),
  fallback_url: z.string().optional().describe('Canonical brand URL when upload_only and url omitted'),
};

function scrapeCoworkerHints(summary, extra = {}) {
  const demoHint = demoWebsiteCoworkerHint(summary);
  return {
    ...extra,
    ...(demoHint ? { demoWebsite: demoHint } : {}),
  };
}

function offlineFallbackCoworkerHints({ url, customer_name, include } = {}) {
  return {
    offlineFallback:
      'Live crawl or LLM analysis failed (403, bot protection, auth wall). Do NOT retry lab_brand_scrape in a loop.',
    nextSteps: [
      '1. Call lab_brand_scrape_brief with the same url + include flags — share the LLM task prompt with the colleague.',
      '2. Colleague runs external LLM (Claude/ChatGPT) or manual Chrome save-page + Image Eye asset collection.',
      '3. Colleague provides a .zip (≤30 MB) — call lab_brand_scrape_upload with zip_base64 or upload.files[].',
      '4. Poll lab_poll_brand_scrape until complete; then lab_build_demo_website if demo clone needed.',
    ],
    briefTool: 'lab_brand_scrape_brief',
    uploadTool: 'lab_brand_scrape_upload',
    portalUpload: 'https://aep-orchestration-lab.web.app/profile-viewer/brand-scraper.html → Options → HTML upload',
    uploadLimits: `Max ${BRAND_SCRAPER_UPLOAD_LIMITS.maxUploadMb} MB, ~${BRAND_SCRAPER_UPLOAD_LIMITS.maxFiles} files (.html + asset folders in ZIP)`,
    examplePrompt:
      `Call lab_brand_scrape_brief sandbox apalmer url ${url || 'https://example.com'} include personas segments. ` +
      'Paste the LLM task prompt section to the colleague. When they return a save-page ZIP, call lab_brand_scrape_upload with upload_only:true.',
  };
}

function resolveUploadFlags({ upload, upload_only, use_as_fallback }) {
  const hasUpload = !!(upload && (upload.zip_base64 || (upload.files && upload.files.length)));
  const uploadOnly = upload_only === true;
  const useAsFallback = use_as_fallback === true || (hasUpload && !uploadOnly && use_as_fallback !== false);
  return { hasUpload, uploadOnly, useAsFallback };
}

function prepareAnalyzeUpload({ upload, upload_only, use_as_fallback }) {
  const flags = resolveUploadFlags({ upload, upload_only, use_as_fallback });
  if (!flags.hasUpload) return { ...flags, uploadedHtml: null, validation: null };

  const validation = validateBrandScrapeUpload(upload);
  if (!validation.ok) {
    return { ...flags, uploadedHtml: null, validation };
  }

  const uploadedHtml = buildUploadedHtmlBody(upload, {
    upload_only: flags.uploadOnly,
    use_as_fallback: flags.useAsFallback,
  });
  return { ...flags, uploadedHtml, validation };
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
        'Set include.demoWebsite:true to build a Profile Viewer site clone (logo, nav, env bar) after analysis — same as Portal Options → Demo website. ' +
        'Default prefer_existing:true reuses a complete scrape with personas for the same URL — set force_new:true only when you need a fresh crawl. ' +
        'Reuses in-flight scrapes for the same URL automatically (never start parallel crawls). ' +
        'Default wait_for_complete:true polls until done — or call lab_poll_brand_scrape for progress messages. ' +
        'When crawl fails (403/bot protection), coworkerHints.offlineFallback points to lab_brand_scrape_brief → lab_brand_scrape_upload. ' +
        'Optional upload: zip_base64 or files[] (max 30 MB) with upload_only or use_as_fallback — same as Portal HTML upload.',
      inputSchema: {
        ...sharedScrapeParams,
        url: z.string().describe('Brand website URL (e.g. https://nike.com)'),
      },
    },
    async (params) => {
      const {
        sandbox,
        url,
        business_type,
        country,
        max_pages,
        crawler,
        include,
        mode,
        existing_scrape_id,
        customer_name,
        regenerate_demo_website,
        overwrite_demo_website,
        wait_for_complete,
        prefer_existing,
        force_new,
        require_personas,
        require_complete,
        poll_timeout_sec,
        upload,
        upload_only,
        use_as_fallback,
        fallback_url,
      } = params;
      const started = Date.now();
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const brandUrl = String(url || fallback_url || '').trim();
      const uploadPrep = prepareAnalyzeUpload({ upload, upload_only, use_as_fallback });
      if (uploadPrep.validation && !uploadPrep.validation.ok) {
        return toolError(uploadPrep.validation.error, uploadPrep.validation.details || {});
      }

      const flags = resolveUploadFlags({ upload, upload_only, use_as_fallback });
      if (flags.uploadOnly && !brandUrl) {
        return toolError('url or fallback_url is required when upload_only:true (used as canonical brand URL for analysis).');
      }
      if (!brandUrl && !flags.uploadOnly) {
        return toolError('url is required.');
      }
      if (flags.uploadOnly && !uploadPrep.hasUpload) {
        return toolError('upload_only requires upload.zip_base64 or upload.files[] with at least one .html file.');
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
      const demoPollTimeoutSec = includeMerged.demoWebsite ? (poll_timeout_sec ?? 600) : (poll_timeout_sec ?? 480);

      if (shouldPreferExisting) {
        const listResult = await listBrandScrapes({ sandbox: allowed.sandbox });
        if (listResult.ok) {
          const items = Array.isArray(listResult.data?.items) ? listResult.data.items : [];

          if (!force_new) {
            const inFlight = findInFlightBrandScrapeFromList(items, brandUrl);
            if (inFlight && inFlight.scrapeId) {
              const reuseId = String(inFlight.scrapeId).trim();
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
                  reuseReason: 'in_flight',
                  summary: summarizeBrandScrapeListItem(inFlight),
                  coworkerHints: {
                    patience: brandScrapeProgressHint(inFlight),
                    poll: `Call lab_poll_brand_scrape with scrape_id ${reuseId} — do not start another lab_brand_scrape for this URL.`,
                  },
                });
              }

              const poll = await pollBrandScrapeUntilTerminal({
                sandbox: allowed.sandbox,
                scrapeId: reuseId,
                pollIntervalMs: 5000,
                timeoutMs: demoPollTimeoutSec * 1000,
              });
              const summary = poll.summary || summarizeBrandScrape(poll.record);
              return jsonResult({
                ok: summary?.scrapeStatus !== 'failed',
                sandbox: allowed.sandbox,
                scrapeId: reuseId,
                reused: true,
                reuseReason: 'in_flight',
                waitedMs: poll.elapsedMs,
                timedOut: poll.timedOut === true,
                progress: poll.progress,
                progressMessages: poll.progressMessages,
                summary,
                lab: poll.record || undefined,
                coworkerHints: scrapeCoworkerHints(summary, {
                  patience: 'Reused the existing in-flight scrape — only one crawl runs per URL per sandbox.',
                  poll: poll.timedOut
                    ? `Still running — call lab_poll_brand_scrape scrape_id=${reuseId}.`
                    : undefined,
                }),
              });
            }
          }

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
                coworkerHints: scrapeCoworkerHints(resolved.summary, {
                  portalUrl: resolved.summary?.portalUrl,
                  reuse: 'Existing complete scrape reused — no new crawl started.',
                }),
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
              coworkerHints: scrapeCoworkerHints(summary, {
                portalUrl: summary?.portalUrl,
                reuse: 'Existing complete scrape reused — no new crawl started.',
                refresh: 'Call force_new:true only when you need a fresh crawl.',
                ...(includeMerged.demoWebsite && !summary?.profileViewerDemoHref
                  ? { demoBuild: 'No demo website on reused scrape — call lab_build_demo_website with this scrape_id.' }
                  : {}),
              }),
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
        customer_name,
        regenerate_demo_website,
        overwrite_demo_website,
        upload_only: flags.uploadOnly,
        use_as_fallback: uploadPrep.useAsFallback,
        uploadedHtml: uploadPrep.uploadedHtml,
        fallback_url: fallback_url || undefined,
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
      const reuseReason = analyzeResult.data?.reuseReason || null;
      if (serverReused && (reuseReason === 'complete' || reuseReason === 'in_flight') && !shouldWait) {
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
          reuseReason,
          summary,
          coworkerHints: {
            reuse:
              reuseReason === 'in_flight'
                ? 'Server returned existing in-flight scrape — poll with lab_poll_brand_scrape; do not start another crawl.'
                : 'Server returned existing complete scrape — no new crawl started.',
          },
        });
      }

      if (serverReused && reuseReason === 'in_flight' && shouldWait) {
        const poll = await pollBrandScrapeUntilTerminal({
          sandbox: allowed.sandbox,
          scrapeId,
          pollIntervalMs: 5000,
          timeoutMs: demoPollTimeoutSec * 1000,
        });
        const summary = poll.summary || summarizeBrandScrape(poll.record);
        writeAuditLog({
          keyId: getRequestKeyId(),
          tool: 'lab_brand_scrape',
          sandbox: allowed.sandbox,
          identifier: scrapeId,
          result: summary?.scrapeStatus === 'failed' ? 'error' : 'ok',
          durationMs: Date.now() - started,
        });
        return jsonResult({
          ok: summary?.scrapeStatus !== 'failed',
          sandbox: allowed.sandbox,
          scrapeId,
          reused: true,
          serverReused: true,
          reuseReason: 'in_flight',
          waitedMs: poll.elapsedMs,
          timedOut: poll.timedOut === true,
          progress: poll.progress,
          progressMessages: poll.progressMessages,
          summary,
          lab: poll.record,
          coworkerHints: scrapeCoworkerHints(summary, {
            patience: 'Waited on existing in-flight scrape — do not fire parallel lab_brand_scrape calls.',
          }),
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
          nextStep: `Poll lab_poll_brand_scrape or lab_get_brand_scrape with scrape_id ${scrapeId} until scrapeStatus is complete or failed.`,
          portalUrl: 'https://aep-orchestration-lab.web.app/profile-viewer/brand-scraper.html',
        });
      }

      const poll = await pollBrandScrapeUntilTerminal({
        sandbox: allowed.sandbox,
        scrapeId,
        pollIntervalMs: 5000,
        timeoutMs: demoPollTimeoutSec * 1000,
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
      const failed = terminalStatus === 'failed';

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_brand_scrape',
        sandbox: allowed.sandbox,
        identifier: scrapeId,
        result: failed ? 'error' : 'ok',
        durationMs: Date.now() - started,
      });

      return jsonResult({
        ok: !failed,
        sandbox: allowed.sandbox,
        scrapeId,
        asyncAccepted: analyzeResult.asyncAccepted === true,
        waitedMs: poll.elapsedMs,
        timedOut: poll.timedOut === true,
        progress: poll.progress,
        progressMessages: poll.progressMessages,
        summary,
        lab: poll.record,
        coworkerHints: scrapeCoworkerHints(summary, {
          portalUrl: summary?.portalUrl,
          useInDemos:
            'Saved scrape is selectable in LLM Demo, Client Journey Asset v2 import, and Image hosting publish flows.',
          refresh: poll.timedOut
            ? `Poll again with lab_poll_brand_scrape scrape_id=${scrapeId}.`
            : undefined,
          patience: poll.timedOut
            ? includeMerged.demoWebsite
              ? 'Scrape or demo build may still be running — demo website adds several minutes after crawl.'
              : 'Scrape may still be running — brand crawls often take several minutes.'
            : undefined,
          ...(failed
            ? offlineFallbackCoworkerHints({
                url: brandUrl,
                customer_name,
                include: includeMerged,
              })
            : {}),
        }),
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
        'Returns scrape_id + summary (includes scrape_industry, lab_industry, industry_source) when a suitable complete scrape exists, or need_new_scrape:true with reason. ' +
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
        items: items.map((item) => {
          const summary = summarizeBrandScrapeListItem(item);
          const demoHint = demoWebsiteCoworkerHint(summary);
          return demoHint ? { ...summary, demoWebsiteHint: demoHint } : summary;
        }),
        portalUrl: 'https://aep-orchestration-lab.web.app/profile-viewer/brand-scraper.html',
      });
    },
  );

  mcpServer.registerTool(
    'lab_get_brand_scrape',
    {
      title: 'Get brand scrape by id',
      description:
        'GET /api/brand-scraper/scrapes/{scrapeId} — full GCS-backed record plus Coworker summary (colours, fonts, personas, status, lab_industry). ' +
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
        progress: brandScrapeProgressMessage(record),
        ...(summary_only ? {} : { lab: record }),
        coworkerHints: scrapeCoworkerHints(summary, {
          terminal: isBrandScrapeTerminal(summary?.scrapeStatus),
          portalUrl: summary?.portalUrl,
          patience: brandScrapeProgressHint(record),
        }),
      });
    },
  );

  mcpServer.registerTool(
    'lab_poll_brand_scrape',
    {
      title: 'Poll brand scrape until complete',
      description:
        'Poll lab_get_brand_scrape until scrapeStatus is complete or failed (or timeout). ' +
        'Returns human-readable progress messages for Coworker — use when lab_brand_scrape timed out or you need to reassure the user the crawl is still running. ' +
        'Do not call lab_brand_scrape again for the same URL while this returns terminal:false.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        scrape_id: z.string().describe('Scrape id from lab_brand_scrape or lab_resolve_brand_scrape'),
        poll_interval_sec: z
          .number()
          .int()
          .min(3)
          .max(60)
          .optional()
          .describe('Seconds between polls (default 10)'),
        timeout_sec: z
          .number()
          .int()
          .min(30)
          .max(540)
          .optional()
          .describe('Max wait (default 480s)'),
        wait: z
          .boolean()
          .optional()
          .describe('When false, return current status once without waiting (default true)'),
      },
    },
    async ({ sandbox, scrape_id, poll_interval_sec, timeout_sec, wait }) => {
      const allowed = assertSandboxAllowed(sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const scrapeId = String(scrape_id || '').trim();
      if (!scrapeId) {
        return toolError('scrape_id is required.');
      }

      const shouldWait = wait !== false;
      if (!shouldWait) {
        const apiResult = await getBrandScrape({ sandbox: allowed.sandbox, scrapeId });
        if (!apiResult.ok) {
          return fromLabApi(apiResult, { sandbox: allowed.sandbox, scrapeId });
        }
        const record = apiResult.data || {};
        const summary = summarizeBrandScrape(record);
        const terminal = isBrandScrapeTerminal(summary?.scrapeStatus);
        return jsonResult({
          ok: summary?.scrapeStatus !== 'failed',
          sandbox: allowed.sandbox,
          scrapeId,
          terminal,
          summary,
          progress: brandScrapeProgressMessage(record),
          coworkerHints: {
            patience: terminal ? undefined : brandScrapeProgressHint(record),
            next: terminal
              ? undefined
              : `Call lab_poll_brand_scrape again with wait:true or wait_for_complete on lab_brand_scrape.`,
          },
        });
      }

      const poll = await pollBrandScrapeUntilTerminal({
        sandbox: allowed.sandbox,
        scrapeId,
        pollIntervalMs: (poll_interval_sec ?? 10) * 1000,
        timeoutMs: (timeout_sec ?? 480) * 1000,
      });

      if (!poll.ok) {
        return fromLabApi(poll.apiResult, { sandbox: allowed.sandbox, scrapeId });
      }

      const summary = poll.summary || summarizeBrandScrape(poll.record);
      const terminal = isBrandScrapeTerminal(summary?.scrapeStatus);

      return jsonResult({
        ok: summary?.scrapeStatus !== 'failed',
        sandbox: allowed.sandbox,
        scrapeId,
        terminal,
        timedOut: poll.timedOut === true,
        waitedMs: poll.elapsedMs,
        progress: poll.progress,
        progressMessages: poll.progressMessages,
        summary,
        lab: poll.record,
        coworkerHints: scrapeCoworkerHints(summary, {
          patience: terminal || poll.timedOut
            ? undefined
            : 'Still running — brand scrapes often take several minutes.',
          next: poll.timedOut && !terminal
            ? `Still in progress after ${Math.round(poll.elapsedMs / 1000)}s — poll again; do not start a new lab_brand_scrape for this URL.`
            : undefined,
        }),
      });
    },
  );

  mcpServer.registerTool(
    'lab_build_demo_website',
    {
      title: 'Build or regenerate demo website from scrape',
      description:
        'POST brandScraperAnalyze with mode demo_build (direct Cloud Function — same as Portal Regenerate demo). ' +
        'Builds or overwrites the Profile Viewer site clone (logo, nav, env bar) from an existing scrape — no new crawl or AI analysis. ' +
        'Use after lab_brand_scrape when include.demoWebsite was false, or set regenerate:true to overwrite an existing demo folder. ' +
        'Default wait_for_complete:true polls lab_poll_brand_scrape until scrapeStatus is complete (buildPhase demo while running).',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox name (MCP allowlist)'),
        scrape_id: z.string().describe('Existing scrape id from lab_brand_scrape or lab_list_brand_scrapes'),
        regenerate: z
          .boolean()
          .optional()
          .describe('When true (default), overwrite existing demo folder (Portal Regenerate demo)'),
        customer_name: z.string().optional().describe('Customer/brand label for demo nav (defaults to scrape brandName)'),
        wait_for_complete: z
          .boolean()
          .optional()
          .describe('When true, poll until demo build finishes (default true)'),
        poll_timeout_sec: z
          .number()
          .int()
          .min(30)
          .max(900)
          .optional()
          .describe('Max wait when wait_for_complete (default 600s — demo build can take several minutes)'),
      },
    },
    async ({ sandbox, scrape_id, regenerate, customer_name, wait_for_complete, poll_timeout_sec }) => {
      const started = Date.now();
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
        tool: 'lab_build_demo_website',
        sandbox: allowed.sandbox,
        identifier: scrapeId,
      });

      const shouldRegenerate = regenerate !== false;
      const buildResult = await brandScrapeDemoBuild({
        sandbox: allowed.sandbox,
        scrape_id: scrapeId,
        regenerate: shouldRegenerate,
        overwrite: shouldRegenerate,
        customer_name,
      });

      if (!buildResult.ok) {
        writeAuditLog({
          keyId: getRequestKeyId(),
          tool: 'lab_build_demo_website',
          sandbox: allowed.sandbox,
          identifier: scrapeId,
          result: 'error',
          durationMs: Date.now() - started,
        });
        return toolError(buildResult.error || 'Demo website build failed', {
          status: buildResult.status,
          url: buildResult.url,
          response: buildResult.data,
        });
      }

      const shouldWait = wait_for_complete !== false;
      if (!shouldWait) {
        writeAuditLog({
          keyId: getRequestKeyId(),
          tool: 'lab_build_demo_website',
          sandbox: allowed.sandbox,
          identifier: scrapeId,
          result: 'ok',
          durationMs: Date.now() - started,
        });
        return jsonResult({
          ok: true,
          sandbox: allowed.sandbox,
          scrapeId,
          asyncAccepted: buildResult.asyncAccepted === true,
          lab: buildResult.data,
          nextStep: `Poll lab_poll_brand_scrape with scrape_id ${scrapeId} until scrapeStatus is complete.`,
        });
      }

      const poll = await pollBrandScrapeUntilTerminal({
        sandbox: allowed.sandbox,
        scrapeId,
        pollIntervalMs: 5000,
        timeoutMs: (poll_timeout_sec ?? 600) * 1000,
      });

      if (!poll.ok) {
        writeAuditLog({
          keyId: getRequestKeyId(),
          tool: 'lab_build_demo_website',
          sandbox: allowed.sandbox,
          identifier: scrapeId,
          result: 'error',
          durationMs: Date.now() - started,
        });
        return fromLabApi(poll.apiResult, { scrapeId, sandbox: allowed.sandbox });
      }

      const summary = poll.summary || summarizeBrandScrape(poll.record);
      const terminalStatus = summary?.scrapeStatus || null;

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_build_demo_website',
        sandbox: allowed.sandbox,
        identifier: scrapeId,
        result: terminalStatus === 'failed' ? 'error' : 'ok',
        durationMs: Date.now() - started,
      });

      return jsonResult({
        ok: terminalStatus !== 'failed',
        sandbox: allowed.sandbox,
        scrapeId,
        asyncAccepted: buildResult.asyncAccepted === true,
        waitedMs: poll.elapsedMs,
        timedOut: poll.timedOut === true,
        progress: poll.progress,
        progressMessages: poll.progressMessages,
        summary,
        lab: poll.record,
        coworkerHints: scrapeCoworkerHints(summary, {
          patience: poll.timedOut
            ? 'Demo build may still be running — poll lab_poll_brand_scrape again.'
            : undefined,
          refresh: poll.timedOut
            ? `Poll lab_poll_brand_scrape scrape_id=${scrapeId}.`
            : undefined,
        }),
      });
    },
  );

  mcpServer.registerTool(
    'lab_brand_scrape_brief',
    {
      title: 'Offline brand scrape brief (markdown)',
      description:
        'Returns the offline fallback markdown brief (same content as Portal Brand Scraper → Download brief). ' +
        'Use when lab_brand_scrape fails (403, bot protection, login wall) or LLM analysis keeps failing. ' +
        'Share the LLM task prompt section with the colleague; after they produce a save-page ZIP, call lab_brand_scrape_upload.',
      inputSchema: {
        url: z.string().optional().describe('Brand website URL'),
        customer_name: z.string().optional().describe('Customer / display name'),
        business_type: z.enum(['b2c', 'b2b']).optional().describe('Business type (default b2c)'),
        country: z.string().optional().describe('Persona country (default United Kingdom)'),
        max_pages: z.number().int().min(1).max(25).optional().describe('Target pages (default 3)'),
        include: includeSchema.describe('AI steps to document in the brief (match planned lab_brand_scrape include flags)'),
        kind: z
          .enum(['brief', 'checklist'])
          .optional()
          .describe('brief (default) — full offline workflow + LLM prompt; checklist — shorter asset checklist'),
      },
    },
    async ({ url, customer_name, business_type, country, max_pages, include, kind }) => {
      const includeMerged = { ...DEFAULT_INCLUDE, ...(include && typeof include === 'object' ? include : {}) };
      const opts = {
        url,
        customer_name,
        business_type,
        country,
        max_pages,
        includeAnalysis: includeMerged.analysis,
        includePersonas: includeMerged.personas,
        includeCampaigns: includeMerged.campaigns,
        includeSegments: includeMerged.segments,
        includeStakeholders: includeMerged.stakeholders,
        includeTagAudit: includeMerged.tagAudit,
        includeLlmDemoConfig: includeMerged.llmDemoConfig,
        includeDemoWebsite: includeMerged.demoWebsite,
      };

      const isChecklist = kind === 'checklist';
      const markdown = isChecklist ? generateAssetChecklist(opts) : generateScrapeBrief(opts);
      const filename = isChecklist ? checklistFilename(opts) : briefFilename(opts);

      return jsonResult({
        ok: true,
        kind: isChecklist ? 'checklist' : 'brief',
        filename,
        markdown,
        uploadLimits: BRAND_SCRAPER_UPLOAD_LIMITS,
        coworkerHints: {
          shareWithColleague:
            'Copy the "LLM task prompt" section from markdown to Claude/ChatGPT, or follow Workflow B (manual Chrome save-page + Image Eye).',
          afterZipReady:
            'Call lab_brand_scrape_upload with sandbox, url, upload.zip_base64 (or upload.files[]), upload_only:true when live crawl is impossible.',
          chain:
            'lab_brand_scrape (fail) → lab_brand_scrape_brief → external LLM/manual ZIP → lab_brand_scrape_upload → lab_poll_brand_scrape → lab_build_demo_website',
        },
      });
    },
  );

  mcpServer.registerTool(
    'lab_brand_scrape_upload',
    {
      title: 'Analyse uploaded HTML/ZIP (offline brand scrape)',
      description:
        'POST brandScraperAnalyze with uploaded HTML/ZIP — same backend as Portal Options → HTML upload (Alan/kirkham upload path). ' +
        'Default upload_only:true skips live crawl. Set use_as_fallback:true to try live crawl first and merge upload for blocked pages. ' +
        'Limits: 30 MB ZIP, ~40 files. Requires upload.zip_base64 and/or upload.files[] with at least one .html (or ZIP containing HTML). ' +
        'After upload, poll with lab_poll_brand_scrape; use lab_build_demo_website when include.demoWebsite:true.',
      inputSchema: {
        ...sharedScrapeParams,
        url: z.string().describe('Brand website URL (canonical base for uploaded pages)'),
        upload: uploadSchema
          .unwrap()
          .describe('Required — zip_base64 and/or files[] with base64 .html + assets'),
        upload_only: z
          .boolean()
          .optional()
          .describe('Skip live crawl (default true for this tool)'),
        force_new: z.boolean().optional().describe('When true, always start a new scrape row (default true for upload-only reruns)'),
      },
    },
    async (params) => {
      const started = Date.now();
      const allowed = assertSandboxAllowed(params.sandbox);
      if (!allowed.ok) {
        return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      }

      const uploadOnly = params.upload_only !== false;
      const uploadPrep = prepareAnalyzeUpload({
        upload: params.upload,
        upload_only: uploadOnly,
        use_as_fallback: params.use_as_fallback,
      });

      if (!uploadPrep.hasUpload) {
        return toolError('upload is required — provide zip_base64 and/or files[] with .html content.');
      }
      if (uploadPrep.validation && !uploadPrep.validation.ok) {
        return toolError(uploadPrep.validation.error, uploadPrep.validation.details || {});
      }

      const brandUrl = String(params.url || params.fallback_url || '').trim();
      if (!brandUrl) {
        return toolError('url is required (canonical brand URL for uploaded HTML analysis).');
      }

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_brand_scrape_upload',
        sandbox: allowed.sandbox,
        identifier: brandUrl,
      });

      const includeMerged = {
        ...DEFAULT_INCLUDE,
        ...(params.include && typeof params.include === 'object' ? params.include : {}),
      };
      const shouldWait = params.wait_for_complete !== false;
      const demoPollTimeoutSec = includeMerged.demoWebsite
        ? (params.poll_timeout_sec ?? 600)
        : (params.poll_timeout_sec ?? 480);

      const analyzeResult = await brandScrapeAnalyze({
        sandbox: allowed.sandbox,
        url: brandUrl,
        business_type: params.business_type,
        country: params.country,
        max_pages: params.max_pages,
        crawler: params.crawler,
        include: includeMerged,
        mode: params.mode === 'append' ? 'append' : 'new',
        existing_scrape_id: params.existing_scrape_id,
        prefer_existing: false,
        force_new: params.force_new !== false,
        customer_name: params.customer_name,
        regenerate_demo_website: params.regenerate_demo_website,
        overwrite_demo_website: params.overwrite_demo_website,
        upload_only: uploadOnly,
        use_as_fallback: uploadPrep.useAsFallback,
        uploadedHtml: uploadPrep.uploadedHtml,
        fallback_url: params.fallback_url,
      });

      if (!analyzeResult.ok) {
        writeAuditLog({
          keyId: getRequestKeyId(),
          tool: 'lab_brand_scrape_upload',
          sandbox: allowed.sandbox,
          identifier: brandUrl,
          result: 'error',
          durationMs: Date.now() - started,
        });
        return toolError(analyzeResult.error || 'Brand scrape upload analyse failed', {
          status: analyzeResult.status,
          url: analyzeResult.url,
          response: analyzeResult.data,
        });
      }

      const scrapeId = String(analyzeResult.scrapeId || analyzeResult.data?.scrapeId || '').trim();
      if (!scrapeId) {
        return toolError('Upload analyse accepted but no scrapeId returned.', { lab: analyzeResult.data });
      }

      if (!shouldWait) {
        writeAuditLog({
          keyId: getRequestKeyId(),
          tool: 'lab_brand_scrape_upload',
          sandbox: allowed.sandbox,
          identifier: scrapeId,
          result: 'ok',
          durationMs: Date.now() - started,
        });
        return jsonResult({
          ok: true,
          sandbox: allowed.sandbox,
          scrapeId,
          uploadOnly,
          uploadSummary: uploadPrep.validation?.summary,
          asyncAccepted: analyzeResult.asyncAccepted === true,
          nextStep: `Poll lab_poll_brand_scrape scrape_id=${scrapeId} until scrapeStatus is complete or failed.`,
          coworkerHints: {
            poll: `Call lab_poll_brand_scrape with scrape_id ${scrapeId}.`,
            demo: includeMerged.demoWebsite
              ? 'Demo website build runs after analysis — allow several minutes; poll lab_poll_brand_scrape.'
              : undefined,
          },
        });
      }

      const poll = await pollBrandScrapeUntilTerminal({
        sandbox: allowed.sandbox,
        scrapeId,
        pollIntervalMs: 5000,
        timeoutMs: demoPollTimeoutSec * 1000,
      });

      if (!poll.ok) {
        return fromLabApi(poll.apiResult, { scrapeId, sandbox: allowed.sandbox });
      }

      const summary = summarizeBrandScrape(poll.record);
      const failed = summary?.scrapeStatus === 'failed';

      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_brand_scrape_upload',
        sandbox: allowed.sandbox,
        identifier: scrapeId,
        result: failed ? 'error' : 'ok',
        durationMs: Date.now() - started,
      });

      return jsonResult({
        ok: !failed,
        sandbox: allowed.sandbox,
        scrapeId,
        uploadOnly,
        uploadSummary: uploadPrep.validation?.summary,
        waitedMs: poll.elapsedMs,
        timedOut: poll.timedOut === true,
        progress: poll.progress,
        progressMessages: poll.progressMessages,
        summary,
        lab: poll.record,
        coworkerHints: scrapeCoworkerHints(summary, {
          upload: 'Uploaded HTML/ZIP analysed — same Firestore/GCS history as Portal upload path.',
          poll: poll.timedOut ? `Still running — lab_poll_brand_scrape scrape_id=${scrapeId}.` : undefined,
          ...(failed ? offlineFallbackCoworkerHints({ url: brandUrl, customer_name: params.customer_name }) : {}),
        }),
      });
    },
  );
}
