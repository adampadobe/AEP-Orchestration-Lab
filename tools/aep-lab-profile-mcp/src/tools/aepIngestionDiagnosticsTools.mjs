import * as z from 'zod';
import { assertSandboxAllowed } from '../auth.mjs';
import { aepBatchDiagnose, aepFlowRunStatus, profileSeedScheduleDiagnose } from '../labApiClient.mjs';
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
}
