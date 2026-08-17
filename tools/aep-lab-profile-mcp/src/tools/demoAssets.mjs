import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import {
  applyDemoCustomerSwitch,
  applyDemoAssets,
  getBrandScrape,
  inspectDemoAssets,
  previewDemoConfig,
  previewDemoAssets,
  previewDemoAssetsRestore,
} from '../labApiClient.mjs';
import { fromLabApi, toolError } from './helpers.mjs';
import { buildDemoConfigChangesFromScrape } from './demoConfig.mjs';
import { ensureClassifiedScrapeImages } from '../demoImageClassification.mjs';

function checkAllowed(sandbox) {
  const allowed = assertSandboxAllowed(sandbox);
  if (!allowed.ok) return { error: toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes }) };
  return { sandbox: allowed.sandbox };
}

/** @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer */
export function registerDemoAssetTools(mcpServer) {
  mcpServer.registerTool(
    'lab_brand_scrape_classify_images',
    {
      title: 'Auto-classify customer scrape images for demo prep',
      description:
        'Uses the existing Firebase Gemini vision classifier to download, store, and classify up to 20 scraped images as logo, hero banner, lifestyle, product, illustration, portrait, icon, infographic, decorative, tracking pixel, or unknown. ' +
        'Skips the model call when the saved scrape already has a usable logo and supporting image unless force_reclassify=true. Returns category counts and whether the scrape is ready for managed demo assets.',
      inputSchema: {
        sandbox: z.string(),
        scrape_id: z.string(),
        force_reclassify: z.boolean().optional().describe('Run Gemini classification again even when the existing classification is sufficient'),
      },
    },
    async ({ sandbox, scrape_id, force_reclassify }) => {
      const access = checkAllowed(sandbox);
      if (access.error) return access.error;
      const started = Date.now();
      const outcome = await ensureClassifiedScrapeImages({
        sandbox: access.sandbox,
        scrapeId: scrape_id,
        force: force_reclassify === true,
      });
      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_brand_scrape_classify_images',
        sandbox: access.sandbox,
        identifier: scrape_id,
        result: outcome.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });
      if (!outcome.ok) {
        if (outcome.errorResult) return fromLabApi(outcome.errorResult, { sandbox: access.sandbox, scrapeId: scrape_id });
        return toolError(outcome.error || 'Image classification failed.', outcome);
      }
      return fromLabApi({
        ok: true,
        data: {
          sandbox: access.sandbox,
          scrapeId: scrape_id,
          classification: outcome.classification,
          readyForDemoAssets: outcome.classification.after.readyForDemoAssets,
          nextStep: outcome.classification.after.readyForDemoAssets
            ? 'Call lab_demo_customer_switch to preview RTDB and all five managed images.'
            : 'Use logo_image_index or hero_image_index overrides after reviewing the classified images.',
        },
      });
    },
  );

  mcpServer.registerTool(
    'lab_demo_customer_switch',
    {
      title: 'Preview or apply a complete customer demo switch',
      description:
        'Preferred customer-change workflow for demo prep. With confirmed=false, creates one combined preview from a completed brand scrape for RTDB plus all five managed image slots. ' +
        'After the colleague reviews it, call again with confirmed=true and both returned preflight IDs. The server backs up the prior named customer, publishes and hash-verifies images first, applies RTDB last, verifies alignment, and restores the prior images if the switch fails.',
      inputSchema: {
        sandbox: z.string(),
        scrape_id: z.string().optional().describe('Required for preview mode'),
        asset_preflight_id: z.string().optional().describe('Returned by preview; required for apply mode'),
        config_preflight_id: z.string().optional().describe('Returned by preview; required for apply mode'),
        confirmed: z.boolean().optional().describe('False/omitted previews; true applies after review'),
        idempotency_key: z.string().min(8).max(120).optional().describe('Required for confirmed apply'),
        auto_classify_images: z.boolean().optional().describe('Preview mode default true; automatically classify when usable categories are missing'),
        force_reclassify: z.boolean().optional().describe('Preview mode only; refresh all image classifications with Gemini vision'),
        logo_image_index: z.number().int().min(0).optional(),
        hero_image_index: z.number().int().min(0).optional(),
      },
    },
    async ({ sandbox, scrape_id, asset_preflight_id, config_preflight_id, confirmed, idempotency_key, auto_classify_images, force_reclassify, logo_image_index, hero_image_index }) => {
      const access = checkAllowed(sandbox);
      if (access.error) return access.error;
      const started = Date.now();
      let result;
      if (confirmed === true) {
        if (!asset_preflight_id || !config_preflight_id || !idempotency_key) {
          return toolError('asset_preflight_id, config_preflight_id and idempotency_key are required for a confirmed customer switch.');
        }
        result = await applyDemoCustomerSwitch({
          sandbox: access.sandbox,
          asset_preflight_id,
          config_preflight_id,
          confirmed: true,
          idempotency_key,
        });
      } else {
        if (!scrape_id) return toolError('scrape_id is required to preview a complete customer switch.');
        let scrapeRecord;
        let classification = null;
        if (auto_classify_images !== false || force_reclassify === true) {
          const classified = await ensureClassifiedScrapeImages({
            sandbox: access.sandbox,
            scrapeId: scrape_id,
            force: force_reclassify === true,
          });
          if (!classified.ok) {
            if (classified.errorResult) return fromLabApi(classified.errorResult, { sandbox: access.sandbox, scrapeId: scrape_id });
            return toolError(classified.error || 'Image classification failed.', classified);
          }
          scrapeRecord = classified.record;
          classification = classified.classification;
        }
        const assets = await previewDemoAssets({
          sandbox: access.sandbox,
          scrape_id,
          asset_pack: 'core_and_mobile',
          overrides: { logo_image_index, hero_image_index },
        });
        if (!assets.ok) return fromLabApi(assets, { sandbox: access.sandbox, scrapeId: scrape_id });
        if (!scrapeRecord) {
          const scrape = await getBrandScrape({ sandbox: access.sandbox, scrapeId: scrape_id });
          if (!scrape.ok) return fromLabApi(scrape, { sandbox: access.sandbox, scrapeId: scrape_id });
          scrapeRecord = scrape.data;
        }
        const logo = (assets.data?.proposed || []).find((item) => item.slot === 'logo');
        const changes = buildDemoConfigChangesFromScrape(scrapeRecord, 'brand_and_industry', { customerLogoUrl: logo?.cdnUrl });
        const config = await previewDemoConfig({
          sandbox: access.sandbox,
          changes,
          source: `customer-switch:${scrape_id}`,
        });
        if (!config.ok) return fromLabApi(config, { sandbox: access.sandbox, scrapeId: scrape_id });
        result = {
          ok: true,
          data: {
            sandbox: access.sandbox,
            scrapeId: scrape_id,
            customerName: assets.data?.customerName || scrapeRecord?.brandName || null,
            imageClassification: classification,
            assetPreflightId: assets.data?.preflightId,
            configPreflightId: config.data?.preflightId,
            assets: assets.data,
            configuration: config.data,
            confirmation: {
              required: true,
              message: 'Review the RTDB diff and all five image previews, then call this tool again with confirmed=true and both preflight IDs.',
            },
          },
        };
      }
      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_demo_customer_switch',
        sandbox: access.sandbox,
        identifier: scrape_id || asset_preflight_id || 'switch',
        result: result.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });
      return fromLabApi(result, { sandbox: access.sandbox });
    },
  );

  mcpServer.registerTool(
    'lab_demo_assets_inspect',
    {
      title: 'Inspect active customer demo assets and saved customers',
      description:
        'Read-only inventory of the customer-swappable stable Image Hosting slots, their permanent CDN URLs, hashes, active customer, and named backup revisions. ' +
        'Shared decisioning, loyalty, carousel, and technical library files are deliberately excluded.',
      inputSchema: { sandbox: z.string().describe('AEP sandbox scoped to the user-generated MCP key') },
    },
    async ({ sandbox }) => {
      const access = checkAllowed(sandbox);
      if (access.error) return access.error;
      writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_demo_assets_inspect', sandbox: access.sandbox });
      return fromLabApi(await inspectDemoAssets({ sandbox: access.sandbox }), { sandbox: access.sandbox });
    },
  );

  mcpServer.registerTool(
    'lab_demo_assets_preview_from_scrape',
    {
      title: 'Preview stable customer images from a brand scrape',
      description:
        'Creates a 15-minute, read-only before/after asset preflight from one completed brand scrape. ' +
        'Prefers the persisted customer logo and the highest-confidence hero image, transforms them into fixed PNG slots, and returns signed previews plus permanent target URLs. ' +
        'No public image is replaced until lab_demo_assets_apply is explicitly confirmed.',
      inputSchema: {
        sandbox: z.string(),
        scrape_id: z.string(),
        asset_pack: z.enum(['core', 'core_and_mobile']).optional().describe('core = logo + website hero; core_and_mobile also prepares three mobile/channel slots'),
        auto_classify_images: z.boolean().optional().describe('Default true; classify with Gemini vision when usable logo/supporting categories are missing'),
        force_reclassify: z.boolean().optional(),
        logo_image_index: z.number().int().min(0).optional().describe('Override the automatically selected imagesV2 logo index'),
        hero_image_index: z.number().int().min(0).optional().describe('Override the automatically selected imagesV2 hero index'),
      },
    },
    async ({ sandbox, scrape_id, asset_pack, auto_classify_images, force_reclassify, logo_image_index, hero_image_index }) => {
      const access = checkAllowed(sandbox);
      if (access.error) return access.error;
      const started = Date.now();
      let classification = null;
      if (auto_classify_images !== false || force_reclassify === true) {
        const classified = await ensureClassifiedScrapeImages({
          sandbox: access.sandbox,
          scrapeId: scrape_id,
          force: force_reclassify === true,
        });
        if (!classified.ok) {
          if (classified.errorResult) return fromLabApi(classified.errorResult, { sandbox: access.sandbox, scrapeId: scrape_id });
          return toolError(classified.error || 'Image classification failed.', classified);
        }
        classification = classified.classification;
      }
      const result = await previewDemoAssets({
        sandbox: access.sandbox,
        scrape_id,
        asset_pack,
        overrides: { logo_image_index, hero_image_index },
      });
      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_demo_assets_preview_from_scrape',
        sandbox: access.sandbox,
        identifier: scrape_id,
        result: result.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });
      if (!result.ok) return fromLabApi(result, { sandbox: access.sandbox, scrapeId: scrape_id });
      return fromLabApi({ ok: true, data: { ...result.data, imageClassification: classification } }, { sandbox: access.sandbox, scrapeId: scrape_id });
    },
  );

  mcpServer.registerTool(
    'lab_demo_assets_apply',
    {
      title: 'Back up current customer and activate confirmed demo assets',
      description:
        'Applies one unexpired asset preview after explicit colleague confirmation. ' +
        'The server detects conflicts, saves the current managed slots as a named immutable customer revision, writes only allowlisted stable paths, verifies hashes, supports idempotent retries, and rolls back on failure.',
      inputSchema: {
        sandbox: z.string(),
        preflight_id: z.string(),
        confirmed: z.boolean().describe('Must be true after the colleague reviews image previews and target paths'),
        idempotency_key: z.string().min(8).max(128),
        backup_customer_name: z.string().max(160).optional().describe('Optional correction for the customer name used to label the automatic backup'),
      },
    },
    async ({ sandbox, preflight_id, confirmed, idempotency_key, backup_customer_name }) => {
      const access = checkAllowed(sandbox);
      if (access.error) return access.error;
      if (confirmed !== true) return toolError('Explicit colleague confirmation is required before replacing active demo images.');
      const started = Date.now();
      const result = await applyDemoAssets({
        sandbox: access.sandbox,
        preflight_id,
        confirmed,
        idempotency_key,
        backup_customer_name,
      });
      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_demo_assets_apply',
        sandbox: access.sandbox,
        identifier: preflight_id,
        result: result.ok ? 'ok' : 'error',
        durationMs: Date.now() - started,
      });
      return fromLabApi(result, { sandbox: access.sandbox, preflightId: preflight_id });
    },
  );

  mcpServer.registerTool(
    'lab_demo_assets_restore',
    {
      title: 'Preview or restore a saved customer image set',
      description:
        'Restores a named customer revision without changing stable CDN URLs. ' +
        'First pass revision_id with confirmed false to receive a preview. After review, pass the returned preflight_id with confirmed true and an idempotency_key. ' +
        'The currently active customer is backed up before the restore.',
      inputSchema: {
        sandbox: z.string(),
        revision_id: z.string().optional(),
        preflight_id: z.string().optional(),
        confirmed: z.boolean().optional(),
        idempotency_key: z.string().min(8).max(128).optional(),
        backup_customer_name: z.string().max(160).optional(),
      },
    },
    async ({ sandbox, revision_id, preflight_id, confirmed, idempotency_key, backup_customer_name }) => {
      const access = checkAllowed(sandbox);
      if (access.error) return access.error;
      let result;
      let identifier;
      if (confirmed === true) {
        if (!preflight_id || !idempotency_key) return toolError('preflight_id and idempotency_key are required for a confirmed restore.');
        identifier = preflight_id;
        result = await applyDemoAssets({
          sandbox: access.sandbox,
          preflight_id,
          confirmed: true,
          idempotency_key,
          backup_customer_name,
        });
      } else {
        if (!revision_id) return toolError('revision_id is required to preview a customer asset restore.');
        identifier = revision_id;
        result = await previewDemoAssetsRestore({ sandbox: access.sandbox, revision_id });
      }
      writeAuditLog({
        keyId: getRequestKeyId(),
        tool: 'lab_demo_assets_restore',
        sandbox: access.sandbox,
        identifier,
        result: result.ok ? 'ok' : 'error',
      });
      return fromLabApi(result, { sandbox: access.sandbox });
    },
  );
}
