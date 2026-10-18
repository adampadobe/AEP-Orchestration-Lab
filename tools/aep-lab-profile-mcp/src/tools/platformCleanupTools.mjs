import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { platformAssetList, platformAssetAudit, platformAssetDelete } from '../labApiClient.mjs';
import { writeAuditLog } from '../auditLog.mjs';
import { getRequestKeyId } from '../requestContext.mjs';
import { fromLabApi, toolError } from './helpers.mjs';

export function registerPlatformCleanupTools(server) {
  const scope = {
    sandbox: z.string().min(1).describe('Sandbox covered by the user MCP key or validated IMS enrollment.'),
    resource_type: z.enum(['dataset', 'schema']),
  };
  const target = {
    ...scope,
    resource_id: z.string().min(1).describe('Exact dataset ID or full tenant schema $id URI returned by inventory.'),
  };
  const tools = [
    ['lab_platform_asset_list', 'List AEP datasets or tenant schemas',
      'Metadata-only inventory. Never deletes anything or reads customer records. Identify exact IDs before auditing.',
      { ...scope, name: z.string().max(200).optional().describe('Case-insensitive name substring; never a delete selector.') },
      platformAssetList],
    ['lab_platform_asset_audit', 'Audit one AEP dataset or schema before deletion',
      'Required exact-ID pre-delete dependency review. Blocks Profile/Identity-enabled resources, incoming relationships, '
      + 'source/target connections, and schemas with datasets. Returns a single-use audit_id valid for 15 minutes, '
      + 'bound to the principal, org, sandbox and exact resource state. Show warnings and obtain explicit confirmation. '
      + 'AJO/campaign/audience usage cannot be proven by this audit and must be independently cleared.',
      target, platformAssetAudit],
    ['lab_platform_asset_delete', 'Delete one explicitly confirmed AEP dataset or schema',
      'DESTRUCTIVE AND IRREVERSIBLE. Only after lab_platform_asset_audit and explicit confirmation of exact ID/name. '
      + 'Delete datasets first, then schemas child-before-parent. Deletes only the exact asset and, for a schema, '
      + 'its own audited descriptors; never cascades into other datasets, schemas, flows or campaigns. '
      + 'Re-audits immediately, rejects stale/reused audits and verifies absence. On partial/uncertain failure stop '
      + 'and re-audit; never automatically retry. No bulk or wildcard deletion.',
      {
        ...target,
        audit_id: z.string().uuid().describe('Single-use audit_id returned by a successful unblocked audit.'),
        expected_name: z.string().min(1).describe('Exact current name shown in the audit and confirmed by the colleague.'),
        confirmed: z.literal(true).describe('Only after explicit confirmation of this exact resource.'),
        usage_cleared: z.literal(true).describe('Only after the colleague independently clears AJO/campaign/audience and external usage.'),
      }, platformAssetDelete],
  ];
  for (const [name, title, description, inputSchema, invoke] of tools) {
    server.registerTool(name, { title, description, inputSchema }, async (params) => {
      const allowed = assertSandboxAllowed(params.sandbox);
      if (!allowed.ok) return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
      const started = Date.now();
      const result = await invoke({ ...params, sandbox: allowed.sandbox });
      writeAuditLog({
        keyId: getRequestKeyId(), tool: name, sandbox: allowed.sandbox,
        identifier: params.resource_id, result: result.ok ? 'ok' : 'error', durationMs: Date.now() - started,
      });
      return fromLabApi(result, { sandbox: allowed.sandbox });
    });
  }
}
