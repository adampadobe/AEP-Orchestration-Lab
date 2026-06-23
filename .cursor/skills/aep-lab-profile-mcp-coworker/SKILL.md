---
name: aep-lab-profile-mcp-coworker
description: >-
  Workflows and example prompts for the AEP Orchestration Lab Profile MCP
  (Streamable HTTP on Cloud Run v3). Use when generating test profiles, sending
  experience events, checking infra, batch seeding, segment personas, access info,
  getting/updating profiles (full-snapshot stitch), profile activity, or provisioning
  profile pipelines.
---

# AEP Lab Profile MCP — Coworker workflows (Phase 3.2)

MCP server: **AEP Orchestration Lab — Profile MCP v3.2.0** (see `tools/aep-lab-profile-mcp/README.md`).

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

## Workflow 2 — Hotel segment personas (travel)

1. **Reactivation segment**

   > lab_generate_profile: sandbox apalmer, industry travel, email hotel.reactivation+001@adobetest.com, randomize true, segment_hint hotel_reactivation.

2. **High-value segment**

   > lab_generate_profile: sandbox apalmer, industry travel, email hotel.hv+001@adobetest.com, randomize true, segment_hint hotel_high_value.

3. **Batch seed for segments**

   > lab_generate_profiles_batch: sandbox apalmer, industry travel, count 10, base_email kirkham+hotel-seed, randomize true, segment_hint hotel_reactivation, delay_ms 800. Poll lab_batch_job_status until complete.

## Workflow 2b — FSI segment personas (Phase 3.1)

1. **High net worth**

   > lab_generate_profile: sandbox apalmer, industry fsi, email fsi.hnw+001@adobetest.com, randomize true, segment_hint high_net_worth.

2. **Credit rebuild**

   > lab_generate_profile: sandbox apalmer, industry fsi, email fsi.rebuild+001@adobetest.com, randomize true, segment_hint credit_rebuild.

3. **Batch seed FSI segments**

   > lab_generate_profiles_batch: sandbox apalmer, industry fsi, count 10, base_email kirkham+fsi-seed, randomize true, segment_hint credit_rebuild, delay_ms 800. Poll lab_batch_job_status.

## Workflow 2c — Retail segment personas (Phase 3.1)

1. **Loyalty VIP**

   > lab_generate_profile: sandbox apalmer, industry retail, email retail.vip+001@adobetest.com, randomize true, segment_hint loyalty_vip.

2. **Cart abandoner**

   > lab_generate_profile: sandbox apalmer, industry retail, email retail.abandon+001@adobetest.com, randomize true, segment_hint cart_abandoner.

3. **Batch seed retail VIP cohort**

   > lab_generate_profiles_batch: sandbox apalmer, industry retail, count 25, base_email kirkham+retail-vip, randomize true, segment_hint loyalty_vip.

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

## Workflow 5b — Send experience event (Phase 3.2)

Mirrors Profile Viewer **Event tool**.

1. **Generate profile and capture ECID**

   > lab_generate_profile: sandbox apalmer, industry travel, email event.demo+001@adobetest.com, randomize true. Save ecid from the response.

2. **List event targets**

   > lab_list_event_targets for sandbox apalmer. Pick a target_id (Edge or DCS streaming).

3. **Send event**

   > lab_send_profile_event: sandbox apalmer, email event.demo+001@adobetest.com, ecid from step 1, target_id from step 2, event_type transaction, view_name "Lab demo page", channel web.

4. **Verify**

   > lab_profile_activity for sandbox apalmer, identifier event.demo+001@adobetest.com. Confirm event count increased and recent events include the sent type.

**Public-sector donation demo:**

   > lab_send_profile_event with event_type donation.made, public { donationAmount: 250, donationDate: "2026-06-23", eventRegistration: "annual-gala" }.

**Advanced (direct datastream):**

   > lab_send_edge_event: sandbox apalmer, datastream_id from lab_list_event_targets, email event.demo+001@adobetest.com, ecid …, event_type transaction.

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
- **segment_hint** — travel: `hotel_high_value`, `hotel_reactivation`; fsi: `high_net_worth`, `credit_rebuild`; retail: `loyalty_vip`, `cart_abandoner`.
- Rate limits (per instance): 30 generates/min, 30 event sends/min, 3 batch jobs/hr — backoff using retryAfterSec.
- Batch jobs max **100** profiles; use `email_pattern` for custom addressing (`{n}`, `{industry}`).
- Industry aliases: `telco` → `telecom`, `public` → `generic`.
- Provisioning is sandbox-allowlist gated like every other tool.
