import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { aepBatchDiagnose, aepFlowRunStatus, profileSeedScheduleDiagnose, profileSeedScheduleSkipPreview, profileSeedScheduleSkipApply } from '../labApiClient.mjs';
import { fromLabApi, toolError } from './helpers.mjs';

const sandbox = z.string().min(1).describe('Must match the authenticated principal sandbox.');
const batchId = z.string().regex(/^(?:[0-9A-HJKMNP-TV-Z]{26}|[a-f0-9]{24,32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);

async function invoke(params, read) {
  const allowed = assertSandboxAllowed(params.sandbox);
  if (!allowed.ok) return toolError(allowed.message, { allowedSandboxes: allowed.allowedSandboxes });
  return fromLabApi(await read({ ...params, sandbox: allowed.sandbox }));
}

export function registerAepIngestionDiagnosticsTools(server) {
  server.registerTool('lab_aep_batch_diagnose', {
    title: 'Diagnose AEP batch ingestion',
    description: 'Read-only batch evidence: expanded processing/valve attempts, stall details, raw errors, failed and output file lists, bounded error-row samples and related flow-run activities. Provide batch_id or flow_id plus run_id. complete=false and issues explicitly identify unavailable exports or limits; empty attempt reasons do not prove no error. Adobe 401/403 stops collection unchanged. Never retries, enables Profile, or changes a batch.',
    inputSchema: {
      sandbox,
      batch_id: batchId.optional(),
      flow_id: z.string().uuid().optional(),
      run_id: z.string().uuid().optional(),
      sample_limit: z.number().int().min(0).max(50).optional().describe('First N diagnostic rows, default 10; 0 disables row samples. Samples can contain source data.'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, (params) => invoke(params, aepBatchDiagnose));

  server.registerTool('lab_aep_flow_run_status', {
    title: 'Read AEP flow run metrics',
    description: 'Read-only paginated flow-run state, read/written/failed/skipped counts, elapsed or completed duration, errors and raw activities. Missing counts are null, never zero. since filters the returned page locally by createdAt; follow continuation_token with unchanged flow_id and since even for empty filtered pages. No writes or automatic retries.',
    inputSchema: {
      sandbox,
      flow_id: z.string().uuid(),
      since: z.string().datetime({ offset: true }).optional().describe('ISO 8601 creation-time lower bound with timezone.'),
      limit: z.number().int().min(1).max(50).optional().describe('Runs per page, default 10.'),
      continuation_token: z.string().min(1).max(8192).optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, (params) => invoke(params, aepFlowRunStatus));

  server.registerTool('lab_profile_seed_schedule_diagnose', {
    title: 'Diagnose scheduled profile seeding',
    description: 'Read-only, owner- and sandbox-scoped diagnostics for the scheduled Snowflake profile seeder. Summarizes the schedule, dispatcher block/attention state and recent day slots, then reads the focused industry flow health now. Does not expose saved profile identities or schedule email/mobile settings. Live flow health is not proof of Snowflake writes or AEP profile arrival and does not reconstruct the original failure snapshot. Never unblocks or replays a slot.',
    inputSchema: { sandbox },
    annotations: { readOnlyHint: true, destructiveHint: false },
  }, (params) => invoke(params, profileSeedScheduleDiagnose));

  server.registerTool('lab_profile_seed_schedule_skip_preview', {
    title: 'Preview owner-scoped scheduled seed skip',
    description: 'Creates an expiring audited receipt for the exact prewrite failed slot; ready is not approval. Review manifest, health and the exact backend confirmation_phrase before apply. Strict unknown-failure health remains default; allow_verified_idle_runs requests a separate reviewed opt-in for bounded verified-empty Snowflake copy evidence. policy_review_required needs explicit idle policy acknowledgement at apply. Never replays the slot, generates profiles, changes AEP flows or proves AEP arrival. After an uncertain outcome stop and diagnose read-only; never automatically retry.',
    inputSchema: {
      sandbox,
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
        const date = new Date(`${value}T00:00:00Z`);
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
      }).describe('Exact failed day plan, YYYY-MM-DD.'),
      slot_id: z.literal('15').describe('Only the reviewed prewrite slot is supported.'),
      allow_verified_idle_runs: z.boolean().optional().describe('Request explicit review of verified-idle readiness; does not activate policy during preview.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  }, (params) => invoke(params, profileSeedScheduleSkipPreview));

  server.registerTool('lab_profile_seed_schedule_skip_apply', {
    title: 'Confirm scheduled seed skip only',
    description: 'Consumes the owner-bound reviewed receipt transactionally: skips only the exact prewrite slot, preserves attempt budget/error history and unblocks future scheduled dispatch. Pass the exact backend confirmation_phrase, unchanged digest/count and explicit acknowledgements. idle_readiness_acknowledged:true is required for a reviewed health-policy change; never infer it from ready. No replay, manual generation, AEP flow change or downstream promotion; source success is not proof of AEP arrival. Never auto-retry timeout/network uncertainty: stop and use read-only schedule diagnostics.',
    inputSchema: {
      sandbox,
      plan_id: z.string().uuid(),
      manifest_digest: z.string().regex(/^[a-f0-9]{64}$/i),
      expected_count: z.number().int().min(1).max(3),
      confirmed: z.literal(true),
      skip_only_acknowledged: z.literal(true),
      idle_readiness_acknowledged: z.literal(true).optional(),
      confirmation_phrase: z.string().min(1).max(512).describe('Exact phrase returned by the reviewed backend preview, without edits.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  }, (params) => invoke(params, profileSeedScheduleSkipApply));
}
