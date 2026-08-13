import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { ajoAssetAudit, ajoAssetDelete, ajoAssetList } from '../labApiClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { fromLabApi, toolError } from './helpers.mjs';

function allowedSandbox(sandbox) {
  const result = assertSandboxAllowed(sandbox);
  return result.ok
    ? { sandbox: result.sandbox }
    : { error: toolError(result.message, { allowedSandboxes: result.allowedSandboxes }) };
}

function registerAssetTools(server, assetType) {
  const titleType = assetType === 'journey' ? 'journey' : 'campaign';
  const prefix = `lab_ajo_${titleType}`;

  server.registerTool(`${prefix}_list`, {
    title: `List and search AJO ${titleType}s`,
    description:
      `Read-only inventory of Adobe Journey Optimizer ${titleType}s. Use it to identify one candidate by exact ID, name, status, and modified date before calling ${prefix}_audit. This tool never changes or deletes anything.`,
    inputSchema: {
      sandbox: z.string().describe('AEP sandbox name; must match the user-generated MCP key scope'),
      name: z.string().max(200).optional().describe(`Optional case-insensitive ${titleType} name filter`),
      start: z.number().int().min(0).optional().describe('Page start offset (default 0)'),
      limit: z.number().int().min(1).max(100).optional().describe('Page size (default 50, max 100)'),
    },
  }, async (params) => {
    const started = Date.now();
    const check = allowedSandbox(params.sandbox);
    if (check.error) return check.error;
    const result = await ajoAssetList({ ...params, sandbox: check.sandbox, asset_type: assetType });
    writeAuditLog({ keyId: getRequestKeyId(), tool: `${prefix}_list`, sandbox: check.sandbox,
      result: result.ok ? 'ok' : 'error', count: result.ok ? result.data?.count : null, durationMs: Date.now() - started });
    return fromLabApi(result, { sandbox: check.sandbox, assetType });
  });

  server.registerTool(`${prefix}_audit`, {
    title: `Audit one AJO ${titleType} before deletion`,
    description:
      `Required read-only pre-delete review for one exact AJO ${titleType} ID. Returns current identity, lifecycle, metadata, blockers, and exact confirmation values. Show the audit to the colleague and obtain explicit confirmation before delete.`,
    inputSchema: {
      sandbox: z.string().describe('AEP sandbox name; must match the user-generated MCP key scope'),
      [`${titleType}_id`]: z.string().min(1).describe(`Exact AJO ${titleType} ID returned by the list tool`),
    },
  }, async (params) => {
    const started = Date.now();
    const check = allowedSandbox(params.sandbox);
    if (check.error) return check.error;
    const assetId = params[`${titleType}_id`];
    const result = await ajoAssetAudit({ sandbox: check.sandbox, asset_type: assetType, asset_id: assetId });
    writeAuditLog({ keyId: getRequestKeyId(), tool: `${prefix}_audit`, sandbox: check.sandbox,
      identifier: assetId, result: result.ok ? 'ok' : 'error', durationMs: Date.now() - started });
    return fromLabApi(result, { sandbox: check.sandbox, assetType, assetId });
  });

  server.registerTool(`${prefix}_delete`, {
    title: `Delete one explicitly confirmed AJO ${titleType}`,
    description:
      `DESTRUCTIVE AND IRREVERSIBLE. Call only after ${prefix}_audit and explicit colleague confirmation of this exact sandbox, ID, name, and status. The server immediately re-reads the ${titleType}, rejects lifecycle or identity changes, and never batch-deletes.`,
    inputSchema: {
      sandbox: z.string().describe('AEP sandbox name; must match the user-generated MCP key scope'),
      [`${titleType}_id`]: z.string().min(1).describe(`Exact ID returned by ${prefix}_audit`),
      expected_name: z.string().min(1).describe(`Exact current name returned by ${prefix}_audit`),
      expected_status: z.string().min(1).describe(`Exact current status returned by ${prefix}_audit`),
      confirmed: z.literal(true).describe(`True only after explicit confirmation of this exact ${titleType}`),
    },
  }, async (params) => {
    const started = Date.now();
    const check = allowedSandbox(params.sandbox);
    if (check.error) return check.error;
    const assetId = params[`${titleType}_id`];
    const result = await ajoAssetDelete({
      sandbox: check.sandbox, asset_type: assetType, asset_id: assetId,
      expected_name: params.expected_name, expected_status: params.expected_status, confirmed: params.confirmed,
    });
    writeAuditLog({ keyId: getRequestKeyId(), tool: `${prefix}_delete`, sandbox: check.sandbox,
      identifier: assetId, result: result.ok ? 'ok' : 'error', durationMs: Date.now() - started });
    return fromLabApi(result, { sandbox: check.sandbox, assetType, assetId });
  });
}

export function registerAjoCleanupTools(server) {
  registerAssetTools(server, 'journey');
  registerAssetTools(server, 'campaign');
}
