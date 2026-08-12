import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import {
  applyDemoConfig,
  getBrandScrape,
  inspectDemoConfig,
  previewDemoConfig,
  previewDemoConfigRestore,
} from '../labApiClient.mjs';
import { inferLabIndustryFromRecord } from '../brandScrapePersonaMap.mjs';
import { fromLabApi, jsonResult, toolError } from './helpers.mjs';

const changeSchema = z.object({
  path: z.string().describe('Allowlisted Section.field path returned by lab_demo_config_inspect'),
  value: z.union([z.string(), z.number(), z.boolean()]).describe('New scalar value'),
});

function stableHttpUrl(value) {
  const text = String(value || '').trim();
  if (!/^https?:\/\/[^\s]+$/i.test(text)) return '';
  if (/x-goog-(signature|credential|expires)|[?&](expires|signature)=/i.test(text)) return '';
  return text;
}

function firstColor(record) {
  const colors = record?.crawlSummary?.assets?.colors;
  if (!Array.isArray(colors)) return '';
  for (const item of colors) {
    const raw = typeof item === 'string' ? item : item?.hex || item?.color || item?.value;
    const text = String(raw || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(text)) return text;
  }
  return '';
}

function stableLogo(record) {
  const candidates = [
    record?.customerLogo?.publicUrl,
    record?.customerLogo?.url,
    record?.crawlSummary?.assets?.customerLogo?.publicUrl,
    record?.demoWebsite?.customerLogoUrl,
  ];
  return candidates.map(stableHttpUrl).find(Boolean) || '';
}

/**
 * Build conservative, evidence-backed RTDB suggestions from a completed scrape.
 * Never invent a slogan/short name and never use expiring signed logo URLs.
 */
export function buildDemoConfigChangesFromScrape(record, preset = 'brand_and_industry', options = {}) {
  const changes = [];
  const brandName = String(record?.brandName || record?.customerName || '').trim();
  const brandUrl = stableHttpUrl(record?.url || record?.baseUrl);
  const shortName = String(record?.shortName || record?.customerShortName || '').trim();
  const slogan = String(record?.analysis?.slogan || record?.analysis?.tagline || '').trim();
  const logo = stableHttpUrl(options.customerLogoUrl) || stableLogo(record);

  if (brandName) changes.push({ path: 'CoreDemoData.name', value: brandName });
  if (shortName) changes.push({ path: 'CoreDemoData.shortName', value: shortName });
  if (slogan) changes.push({ path: 'CoreDemoData.slogan', value: slogan });
  if (brandUrl) changes.push({ path: 'CoreDemoData.url', value: brandUrl });
  if (logo) changes.push({ path: 'CoreDemoData.customerLogo', value: logo });

  if (preset === 'brand_and_industry') {
    const colour = firstColor(record);
    const industry = inferLabIndustryFromRecord(record).industry;
    if (colour) changes.push({ path: 'StaffPortal.Colour', value: colour });
    if (industry) {
      changes.push({ path: 'CallCentre.industryId', value: industry });
      changes.push({ path: 'ExpAccelerator.opportunityIndustry', value: industry });
    }
    if (brandName) changes.push({ path: 'ExpAccelerator.displayNameOverride', value: brandName });
  }
  return changes;
}

function mergeChanges(base, overrides) {
  const byPath = new Map();
  for (const item of [...(base || []), ...(overrides || [])]) {
    if (item && item.path) byPath.set(String(item.path), { path: String(item.path), value: item.value });
  }
  return [...byPath.values()];
}

function checkAllowed(sandbox) {
  const allowed = assertSandboxAllowed(sandbox);
  if (!allowed.ok) return { error: toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes }) };
  return { sandbox: allowed.sandbox };
}

/** @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer */
export function registerDemoConfigTools(mcpServer) {
  mcpServer.registerTool(
    'lab_demo_config_inspect',
    {
      title: 'Inspect my Real-Time Database demo configuration',
      description:
        'Always call this first when the colleague asks to view, prepare or update the Real-Time Database for demos. ' +
        'Resolves the workspace from the user-generated MCP key (no arbitrary workspace path), then returns current sections, values, descriptions, editable fields and validation rules. Read-only.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox scoped to the user-generated MCP key'),
      },
    },
    async ({ sandbox }) => {
      const access = checkAllowed(sandbox);
      if (access.error) return access.error;
      writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_demo_config_inspect', sandbox: access.sandbox });
      const result = await inspectDemoConfig({ sandbox: access.sandbox });
      return fromLabApi(result, { sandbox: access.sandbox });
    },
  );

  mcpServer.registerTool(
    'lab_demo_config_preview',
    {
      title: 'Preview governed demo configuration changes',
      description:
        'Creates a short-lived before/after preview for allowlisted RTDB demo fields; does not write RTDB. ' +
        'Call lab_demo_config_inspect first. Pass manual changes, a completed brand scrape_id, or both. ' +
        'Scrape mapping is conservative: verified brand name/URL/logo/colour and inferred industry only; it never invents slogans or short names.',
      inputSchema: {
        sandbox: z.string(),
        changes: z.array(changeSchema).max(50).optional(),
        scrape_id: z.string().optional().describe('Completed scrape whose brand evidence should seed suggestions'),
        preset: z.enum(['brand_only', 'brand_and_industry']).optional().describe('Scrape mapping preset; default brand_and_industry'),
      },
    },
    async ({ sandbox, changes, scrape_id, preset }) => {
      const access = checkAllowed(sandbox);
      if (access.error) return access.error;
      let scrapeChanges = [];
      let source = 'manual';
      let scrapeSummary = null;
      if (scrape_id) {
        const scrape = await getBrandScrape({ sandbox: access.sandbox, scrapeId: scrape_id });
        if (!scrape.ok) return fromLabApi(scrape, { sandbox: access.sandbox, scrapeId: scrape_id });
        const record = scrape.data || {};
        if (String(record.scrapeStatus || '').toLowerCase() !== 'complete') {
          return toolError('Brand scrape must be complete before deriving demo configuration.', {
            sandbox: access.sandbox,
            scrapeId: scrape_id,
            scrapeStatus: record.scrapeStatus || null,
          });
        }
        scrapeChanges = buildDemoConfigChangesFromScrape(record, preset || 'brand_and_industry');
        source = `brand-scrape:${scrape_id}`;
        scrapeSummary = {
          scrapeId: scrape_id,
          brandName: record.brandName || null,
          url: record.url || record.baseUrl || null,
          suggestedPaths: scrapeChanges.map((item) => item.path),
        };
      }
      const proposed = mergeChanges(scrapeChanges, changes);
      if (!proposed.length) {
        return toolError('No changes were supplied or safely derived from the scrape. Inspect the structure and pass explicit path/value changes.');
      }
      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_demo_config_preview',
        sandbox: access.sandbox,
        identifier: scrape_id || 'manual',
      });
      const result = await previewDemoConfig({ sandbox: access.sandbox, changes: proposed, source });
      if (!result.ok) return fromLabApi(result, { sandbox: access.sandbox, scrapeId: scrape_id || null });
      return jsonResult({ ...result.data, scrapeSummary });
    },
  );

  mcpServer.registerTool(
    'lab_demo_config_apply',
    {
      title: 'Apply confirmed demo configuration preview',
      description:
        'Applies one unexpired lab_demo_config_preview after explicit colleague confirmation. ' +
        'The server verifies ownership, detects preview conflicts, performs an atomic RTDB update, reads values back, creates a revision and makes retries idempotent.',
      inputSchema: {
        sandbox: z.string(),
        preflight_id: z.string(),
        confirmed: z.boolean().describe('Must be true after the colleague reviews the diff'),
        idempotency_key: z.string().min(8).max(128).describe('Stable retry key for this approved apply'),
      },
    },
    async ({ sandbox, preflight_id, confirmed, idempotency_key }) => {
      const access = checkAllowed(sandbox);
      if (access.error) return access.error;
      if (confirmed !== true) return toolError('Explicit colleague confirmation is required before applying RTDB changes.');
      const started = Date.now();
      const result = await applyDemoConfig({
        sandbox: access.sandbox,
        preflight_id,
        confirmed,
        idempotency_key,
      });
      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_demo_config_apply',
        sandbox: access.sandbox,
        identifier: preflight_id,
        result: result.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });
      return fromLabApi(result, { sandbox: access.sandbox, preflightId: preflight_id });
    },
  );

  mcpServer.registerTool(
    'lab_demo_config_restore',
    {
      title: 'Preview or apply a demo configuration revision restore',
      description:
        'Reverses a prior governed RTDB apply. First pass revision_id with confirmed false to receive a restore preview. ' +
        'After the colleague reviews it, pass the returned preflight_id with confirmed true and an idempotency_key.',
      inputSchema: {
        sandbox: z.string(),
        revision_id: z.string().optional(),
        preflight_id: z.string().optional(),
        confirmed: z.boolean().optional(),
        idempotency_key: z.string().min(8).max(128).optional(),
      },
    },
    async ({ sandbox, revision_id, preflight_id, confirmed, idempotency_key }) => {
      const access = checkAllowed(sandbox);
      if (access.error) return access.error;
      if (confirmed === true) {
        if (!preflight_id || !idempotency_key) {
          return toolError('preflight_id and idempotency_key are required for a confirmed restore.');
        }
        const result = await applyDemoConfig({
          sandbox: access.sandbox,
          preflight_id,
          confirmed: true,
          idempotency_key,
        });
        writeAuditLog({
          keyId: getRequestKeyId(),
          tool: 'lab_demo_config_restore',
          sandbox: access.sandbox,
          identifier: preflight_id,
          result: result.ok ? 'ok' : 'error',
        });
        return fromLabApi(result, { sandbox: access.sandbox, preflightId: preflight_id });
      }
      if (!revision_id) return toolError('revision_id is required to preview a restore.');
      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_demo_config_restore',
        sandbox: access.sandbox,
        identifier: revision_id,
      });
      const result = await previewDemoConfigRestore({ sandbox: access.sandbox, revision_id });
      return fromLabApi(result, { sandbox: access.sandbox, revisionId: revision_id });
    },
  );
}
