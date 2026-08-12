import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import {
  applyDemoAssets,
  inspectDemoAssets,
  previewDemoAssets,
  previewDemoAssetsRestore,
} from '../labApiClient.mjs';
import { fromLabApi, toolError } from './helpers.mjs';

function checkAllowed(sandbox) {
  const allowed = assertSandboxAllowed(sandbox);
  if (!allowed.ok) return { error: toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes }) };
  return { sandbox: allowed.sandbox };
}

/** @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} mcpServer */
export function registerDemoAssetTools(mcpServer) {
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
        logo_image_index: z.number().int().min(0).optional().describe('Override the automatically selected imagesV2 logo index'),
        hero_image_index: z.number().int().min(0).optional().describe('Override the automatically selected imagesV2 hero index'),
      },
    },
    async ({ sandbox, scrape_id, asset_pack, logo_image_index, hero_image_index }) => {
      const access = checkAllowed(sandbox);
      if (access.error) return access.error;
      const started = Date.now();
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
      return fromLabApi(result, { sandbox: access.sandbox, scrapeId: scrape_id });
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
