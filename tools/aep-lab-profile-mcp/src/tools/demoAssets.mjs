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
  demoCustomerRequest,
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
  const scopeSchema = {
    customer_paths: z.array(z.string()).max(200).optional().describe('Exact customer-specific paths; classify every existing file on first save'),
    shared_paths: z.array(z.string()).max(200).optional().describe('Exact shared paths excluded from all customer backups and restores'),
  };
  const brandChanges = z.array(z.object({
    path: z.string(),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  })).max(9).optional().describe('Explicit branding fields to keep, replace or clear; never retain outgoing brand text silently');
  async function customerCall(sandbox, action, input) {
    const access = checkAllowed(sandbox);
    if (access.error) return access.error;
    const result = await demoCustomerRequest({ sandbox: access.sandbox, action, ...input });
    if (action === 'customer-apply' && result.ok && result.data?.ok === false) {
      return toolError(result.data.error?.message || result.data.error || `Customer operation ${result.data.status}; not ready to present.`, result.data);
    }
    writeAuditLog({ keyId: getRequestKeyId(), tool: action, sandbox: access.sandbox, result: result.ok ? 'ok' : 'error' });
    return fromLabApi(result, { sandbox: access.sandbox });
  }
  mcpServer.registerTool('lab_demo_customer_save', {
    title: 'Save current customer in the cloud',
    description: 'Preview a complete named customer snapshot of selected Image Hosting files plus approved RTDB branding. Inspect assets first and classify customer versus shared files. No local ZIP is needed. After explicit confirmation, apply the returned preflight with one request-bound idempotency key. Live files and RTDB remain unchanged by a save.',
    inputSchema: {
      sandbox: z.string(), customer_name: z.string().max(160).optional(), ...scopeSchema,
      preflight_id: z.string().optional(), confirmed: z.boolean().optional(),
      idempotency_key: z.string().min(8).max(120).optional(),
    },
  }, async ({ sandbox, confirmed, ...input }) => customerCall(sandbox,
    confirmed === true ? 'customer-apply' : 'customer-save-preview', { ...input, confirmed }));

  mcpServer.registerTool('lab_demo_customer_upload', {
    title: 'Stage a customer image for exact-path replacement',
    description: 'Uploads a PNG/JPEG/WebP/GIF/AVIF image up to 8 MiB to private staging for 15 minutes; validates decoded format and returns a stage ID and visual preview, not image bytes. Does not replace active images. Requires a client capable of transferring attachment bytes as base64; the remote server cannot read local attachment paths. Map the stage ID to an exact existing or new customer path in lab_demo_customer_switch. Animation is preserved; the target extension must match the actual format.',
    inputSchema: { sandbox: z.string(), file_name: z.string().max(240), content_type: z.string(), base64: z.string().max(12 * 1024 * 1024) },
  }, async ({ sandbox, ...input }) => customerCall(sandbox, 'customer-stage', input));

  mcpServer.registerTool('lab_demo_customer_operation', {
    title: 'Inspect or recover a customer operation',
    description: 'Read durable customer save/switch status after a timeout instead of automatically retrying. Supply operation_id or the original idempotency_key. Recovery requires an operation ID, explicit confirmation, and a five-minute safety delay; it restores the outgoing customer and never replays a rolled-back operation as success. Historical success is distinguished from isCurrentlyActive/verified.',
    inputSchema: {
      sandbox: z.string(), operation_id: z.string().optional(), idempotency_key: z.string().optional(),
      recover: z.boolean().optional(), confirmed: z.boolean().optional(),
    },
  }, async ({ sandbox, recover, ...input }) => customerCall(sandbox, recover === true ? 'customer-recover' : 'customer-status', input));

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
        'Preferred complete customer-package switch. Inspect first; preview from revision_id to restore a saved customer including branding, or customer_name plus staged replacements and explicit changes, or scrape_id. Classify customer_paths/shared_paths on first use. Confirm backup_customer_name when unknown or disputed. Review images, exact target paths, deletions and RTDB diff; then confirmed=true with the single returned preflight_id and idempotency_key. Saves the outgoing customer privately, preserves stable CDN URLs, excludes shared assets, and verifies or rolls back. No local ZIP. Original five-slot preflight apply remains available for compatibility but is image-pack scoped.',
      inputSchema: {
        sandbox: z.string(),
        scrape_id: z.string().optional().describe('Optional scrape source instead of a saved revision or staged files'),
        asset_preflight_id: z.string().optional().describe('Legacy five-slot apply only'),
        config_preflight_id: z.string().optional().describe('Legacy five-slot apply only'),
        confirmed: z.boolean().optional().describe('False/omitted previews; true applies after review'),
        idempotency_key: z.string().min(8).max(120).optional().describe('Required for confirmed apply'),
        preflight_id: z.string().optional().describe('Single complete-customer preview returned by preview mode'),
        revision_id: z.string().optional().describe('Saved complete-customer revision from inspect.customerLibrary'),
        customer_name: z.string().max(160).optional(),
        backup_customer_name: z.string().max(160).optional(),
        ...scopeSchema,
        replacements: z.array(z.object({ rel_path: z.string(), stage_id: z.string() })).max(200).optional(),
        changes: brandChanges,
        auto_classify_images: z.boolean().optional().describe('Preview mode default true; automatically classify when usable categories are missing'),
        force_reclassify: z.boolean().optional().describe('Preview mode only; refresh all image classifications with Gemini vision'),
        logo_image_index: z.number().int().min(0).optional(),
        hero_image_index: z.number().int().min(0).optional(),
      },
    },
    async ({ sandbox, scrape_id, asset_preflight_id, config_preflight_id, confirmed, idempotency_key, auto_classify_images, force_reclassify, logo_image_index, hero_image_index, ...packageInput }) => {
      const access = checkAllowed(sandbox);
      if (access.error) return access.error;
      const started = Date.now();
      let result;
      if (confirmed === true && packageInput.preflight_id) {
        return customerCall(sandbox, 'customer-apply', { ...packageInput, confirmed, idempotency_key });
      }
      if (confirmed !== true && !scrape_id) {
        return customerCall(sandbox, 'customer-switch-preview', packageInput);
      }
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
          allow_no_changes: true,
        });
        if (!config.ok) return fromLabApi(config, { sandbox: access.sandbox, scrapeId: scrape_id });
        const complete = await demoCustomerRequest({
          sandbox: access.sandbox, action: 'customer-switch-preview', ...packageInput,
          asset_preflight_id: assets.data?.preflightId, config_preflight_id: config.data?.preflightId,
        });
        if (!complete.ok) return fromLabApi(complete, { sandbox: access.sandbox, scrapeId: scrape_id });
        result = { ok: true, data: { ...complete.data, imageClassification: classification, scrapeId: scrape_id } };
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
        'Read-only inventory. customerLibrary includes all visible library paths, current customer/shared/unassigned classification, approved RTDB branding, saved complete-customer revisions with pagination and operation recovery state. Classify shared technical assets explicitly; they are excluded from package writes. Legacy five-slot data is also returned separately.',
      inputSchema: {
        sandbox: z.string().describe('AEP sandbox scoped to the MCP key or Adobe IMS Portal enrollment'),
        cursor: z.string().optional().describe('customerLibrary.nextCursor for more saved customer revisions'),
      },
    },
    async ({ sandbox, cursor }) => {
      const access = checkAllowed(sandbox);
      if (access.error) return access.error;
      writeAuditLog({ keyId: getRequestKeyId(), tool: 'lab_demo_assets_inspect', sandbox: access.sandbox });
      const packages = await demoCustomerRequest({ sandbox: access.sandbox, action: 'customer-inspect', cursor });
      if (!packages.ok) return fromLabApi(packages, { sandbox: access.sandbox });
      const legacy = await inspectDemoAssets({ sandbox: access.sandbox });
      if (!legacy.ok) return fromLabApi(legacy, { sandbox: access.sandbox });
      return fromLabApi({ ok: true, data: {
        ...legacy.data, legacyActiveCustomer: legacy.data?.activeCustomer,
        activeCustomer: packages.data?.activeCustomer || legacy.data?.activeCustomer,
        legacyImageRevisionsOnly: true, customerLibrary: packages.data,
      } }, { sandbox: access.sandbox });
    },
  );

  mcpServer.registerTool(
    'lab_demo_assets_preview_from_scrape',
    {
      title: 'Preview stable customer images from a brand scrape',
      description:
        'Creates a 15-minute, preview-only before/after asset preflight from one completed brand scrape. ' +
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
