import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import {
  platformAssetList, platformAssetAudit, platformAssetDelete,
  platformCleanupInventory, platformCleanupPlan, platformCleanupApply, platformCleanupVerify,
  platformFlowDisablePlan, platformFlowDisableApply,
} from '../labApiClient.mjs';
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
  const batchTarget = z.object({
    resource_type: z.enum([
      'flow', 'dataset', 'schema', 'descriptor', 'sourceConnection',
      'targetConnection', 'baseConnection', 'account', 'mappingSet', 'ajoChannel',
    ]),
    resource_id: z.string().min(1).max(512).refine((id) => !/[*?]/.test(id))
      .describe('Exact ID from the workbook or a fresh metadata inventory; never a name or pattern.'),
  });
  const batchTargets = z.array(batchTarget).min(1).max(100);
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
    ['lab_platform_cleanup_inventory', 'Inventory exact AEP cleanup targets',
      'Metadata-only exact-ID inventory for flows, datasets, schemas, descriptors and connections. '
      + 'Reports unsupported mapping-set/AJO-channel coverage and limitations; no customer records are read. '
      + 'IDs are inputs, never discovered as deletion selectors.',
      { sandbox: scope.sandbox, targets: batchTargets }, platformCleanupInventory],
    ['lab_platform_cleanup_plan', 'Build a governed exact-ID cleanup plan',
      'Creates an immutable, principal/org/sandbox/state/policy-bound plan that expires after 15 minutes. '
      + 'Orders dependencies from observed references, caps scope at 100 objects and reports blockers, unknown coverage, '
      + 'protected resources and the exact manifest. A plan receipt is persisted in Firestore. '
      + 'Supported DELETE adapters cover flows, datasets, tenant schemas, descriptors and connections/accounts. '
      + 'Flows must already be disabled with terminal runs. Protected resources and unresolved dependencies remain blocked. '
      + 'Mapping-set/AJO-channel deletion is unsupported. Review non-atomic DELETE warnings before confirmation.',
      { sandbox: scope.sandbox, targets: batchTargets }, platformCleanupPlan],
    ['lab_platform_cleanup_apply', 'Apply a reviewed cleanup plan',
      'DESTRUCTIVE AND IRREVERSIBLE. Requires explicit confirmation of the exact plan, count, digest, and independent '
      + 'external-usage clearance, plus acknowledgment that Adobe DELETE has no documented atomic stale-state protection. '
      + 'Claims once, coordinates concurrent batch plans in the same org/sandbox, and executes serially with durable '
      + 'per-item intent/result, fresh state/dependency checks and GET 404 readback. Asynchronous flow deletion is '
      + 'polled read-only within the execution/expiry budget; acceptance or delete-finalizing is not completion. Stops on first failure, uncertainty, '
      + 'expiry or execution budget; never automatically retries, resumes, pauses flows or expands scope. '
      + 'After interruption call verify, then obtain fresh review and confirmation for remaining targets.',
      {
        sandbox: scope.sandbox,
        plan_id: z.string().uuid(),
        manifest_digest: z.string().regex(/^[a-f0-9]{64}$/i),
        expected_count: z.number().int().min(1).max(100),
        confirmed: z.literal(true),
        usage_cleared: z.literal(true),
        non_atomic_delete_acknowledged: z.literal(true)
          .describe('Only after the colleague accepts that an external writer can change state between the final GET and DELETE; conditional DELETE is not documented.'),
      }, platformCleanupApply],
    ['lab_platform_cleanup_verify', 'Verify cleanup plan status and readback',
      'Read-only recovery/status check for a deletion or flow-disable plan. Reconciles current object presence or disabled state and terminal runs without replaying mutations; '
      + 'absence is not reported as deletion success unless a durable successful attempt exists. '
      + 'Protected-baseline and external-usage limitations remain explicit.',
      { sandbox: scope.sandbox, plan_id: z.string().uuid() }, platformCleanupVerify],
    ['lab_platform_flow_disable_plan', 'Review exact flows before pausing ingestion',
      'Creates a 15-minute principal/org/sandbox/policy/configuration-bound disable plan for exact UUIDs only. '
      + 'Shows names, current states, scope, protected baseline and ingestion-impact warnings. '
      + 'Protected REL/Agentic/Profile flows and feeds into protected datasets cannot be disabled. '
      + 'Review every blocker and independently clear downstream impact before confirmation. Does not disable or delete anything.',
      {
        sandbox: scope.sandbox,
        flow_ids: z.array(z.string().uuid()).min(1).max(100)
          .refine((ids) => new Set(ids).size === ids.length, 'Duplicate flow IDs are not allowed.'),
      }, platformFlowDisablePlan],
    ['lab_platform_flow_disable_apply', 'Disable explicitly confirmed flows',
      'PAUSES INGESTION. Requires exact plan ID, digest, count, explicit confirmation, independent impact clearance '
      + 'and ingestion_pause_acknowledged true. Uses the documented Flow Service POST state action, with a current If-Match etag. '
      + 'Coordinates with deletion plans, records intent/results and verifies disabled configuration. '
      + 'Polls runs read-only within a bounded window; draining is not cleanup-ready. Use lab_platform_cleanup_verify afterward. '
      + 'Never requests run cancellation, deletes assets, re-enables flows, changes schedules/mappings, expands scope or automatically retries/resumes. '
      + 'Deletion needs a separate fresh plan and confirmation.',
      {
        sandbox: scope.sandbox, plan_id: z.string().uuid(), manifest_digest: z.string().regex(/^[a-f0-9]{64}$/i),
        expected_count: z.number().int().min(1).max(100), confirmed: z.literal(true), usage_cleared: z.literal(true),
        ingestion_pause_acknowledged: z.literal(true),
      }, platformFlowDisableApply],
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
