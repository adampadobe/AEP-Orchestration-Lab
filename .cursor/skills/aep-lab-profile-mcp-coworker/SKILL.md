---
name: aep-lab-profile-mcp-coworker
description: >-
  Workflows and example prompts for the AEP Orchestration Lab Profile MCP
  (Streamable HTTP on Cloud Run v3). Use when generating test profiles, checking
  infra, batch seeding, segment personas, access info, getting/updating profiles
  (full-snapshot stitch), profile activity, or provisioning profile pipelines.
---

# AEP Lab Profile MCP — Coworker workflows (Phase 3)

MCP server: **AEP Orchestration Lab — Profile MCP v3.0.0** (see `tools/aep-lab-profile-mcp/README.md`).

Configure in Coworker or Cursor with a **single** header:

- `X-AEP-Lab-Mcp-Key` — required for all tools (including provisioning)

Allowed sandboxes: Firestore **`mcpSandboxAllowlist/{keyId}`** per principal, or env fallback `apalmer`, `kirkham`. Verify with **`lab_mcp_access_info`**.

## Workflow 0 — Check MCP access

> Call **lab_mcp_access_info**. Report keyId, allowed sandboxes, principal label, and allowlist source.

## Workflow 1 — Check infra → generate travel profile → lookup

1. **Check infra readiness**

   > Use lab_profile_infra_status for sandbox apalmer and industry travel. Summarize whether streaming is configured.

2. **Generate one randomized profile**

   > Call lab_generate_profile with sandbox apalmer, industry travel, email travel.demo+001@adobetest.com, randomize true.

3. **Lookup by email**

   > Call lab_lookup_profile with sandbox apalmer, namespace email, identifier travel.demo+001@adobetest.com. Summarize key travel attributes.

## Workflow 2 — Hotel segment personas (Phase 3)

1. **Reactivation segment**

   > lab_generate_profile: sandbox apalmer, industry travel, email hotel.reactivation+001@adobetest.com, randomize true, segment_hint hotel_reactivation.

2. **High-value segment**

   > lab_generate_profile: sandbox apalmer, industry travel, email hotel.hv+001@adobetest.com, randomize true, segment_hint hotel_high_value.

3. **Batch seed for segments**

   > lab_generate_profiles_batch: sandbox apalmer, industry travel, count 10, base_email kirkham+hotel-seed, randomize true, segment_hint hotel_reactivation, delay_ms 800. Poll lab_batch_job_status until complete.

## Workflow 3 — Get profile → discuss changes → full-snapshot update

Profile Viewer streams **full writable snapshots** per industry dataflow — not minimal deltas. The MCP mirrors this.

1. **Get profile with metadata**

   > Use lab_get_profile for sandbox apalmer, namespace email, identifier travel.demo+001@adobetest.com. Summarize writable industries and key attributes.

2. **Discuss changes with the user**

   > Propose attribute_changes as dot-path / value pairs (e.g. person.name.firstName, loyalty.points). Confirm industry dataflow (travel, generic, etc.).

3. **Update with full stitch**

   > Call lab_update_profile: sandbox apalmer, industry travel, email travel.demo+001@adobetest.com, attribute_changes [{ path: "person.name.firstName", value: "Alex" }]. Explain that the server merged into the full writable snapshot before POST /api/profile/update.

4. **Verify**

   > Call lab_get_profile again and confirm the changed fields.

## Workflow 4 — Switch sandbox / onboard new sandbox

When Coworker switches to a sandbox that has no Firestore connection docs, generate/update will fail until infra is provisioned.

1. **Assess config**

   > Use lab_sandbox_profile_config for sandbox apalmer. Summarize ready vs notReadyIndustries and next_action per industry.

2. **Get onboarding plan**

   > Use lab_onboard_sandbox with sandbox apalmer, mode plan. List the ordered steps.

3. **Execute one industry (sync)**

   > Use lab_onboard_sandbox with sandbox apalmer, mode execute, industry travel. Wait for completion, then repeat for other not-ready industries.

4. **Execute all industries (async, Phase 3)**

   > lab_onboard_sandbox: sandbox apalmer, mode execute_all. Poll lab_batch_job_status with job_id every 15s until completed. Report per-industry results.

5. **Ops note for new colleague sandboxes**

   > Ops seeds Firestore mcpSandboxAllowlist/{keyId} or updates AEP_LAB_MCP_ALLOWED_SANDBOXES — see README. Coworker verifies with lab_mcp_access_info.

## Workflow 5 — Profile activity narration

1. **Events + channels**

   > Use lab_profile_activity for sandbox apalmer, identifier travel.demo+001@adobetest.com. Read the narration field and summarize for the user (event count, active channels).

2. **Optional audiences**

   > Re-run lab_profile_activity with include_audiences true if audience membership matters for the demo.

## Workflow 6 — Batch seed N profiles

1. **Start batch job**

   > Use lab_generate_profiles_batch: sandbox apalmer, industry retail, count 25, base_email kirkham+retail-seed, randomize true.

2. **Poll until complete**

   > Poll lab_batch_job_status with the returned job_id every 10 seconds until status is completed, completed_with_errors, or failed. Report succeeded/failed counts.

3. **Spot-check one profile**

   > Pick the first succeeded email from results and run lab_get_profile (namespace email).

## Workflow 7 — Provision industry infra

Same MCP key as all other tools.

1. **Status baseline**

   > lab_profile_infra_status for sandbox apalmer, industry fsi.

2. **Run all core steps**

   > lab_provision_profile_infra_step: sandbox apalmer, industry fsi, step all_core.

3. **Enable profile**

   > lab_enable_profile: sandbox apalmer, industry fsi.

4. **Verify**

   > lab_profile_infra_status again and confirm profile enabled / connection saved.

## Tips

- Set MCP client tool timeout ≥ **300s** for infra status, get/lookup/update/activity/onboarding, and provisioning.
- **lab_mcp_access_info** — check allowlist without secrets; use after ops adds Kirkham ACL.
- **segment_hint** — travel only: `hotel_high_value`, `hotel_reactivation`.
- Rate limits (per instance): 30 generates/min, 3 batch jobs/hr — backoff using retryAfterSec.
- Batch jobs max **100** profiles; use `email_pattern` for custom addressing (`{n}`, `{industry}`).
- Industry aliases: `telco` → `telecom`, `public` → `generic`.
- Provisioning is sandbox-allowlist gated like every other tool.
