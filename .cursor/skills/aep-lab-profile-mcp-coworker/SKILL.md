---
name: aep-lab-profile-mcp-coworker
description: >-
  Workflows and example prompts for the AEP Orchestration Lab Profile MCP
  (Streamable HTTP on Cloud Run). Use when generating test profiles, checking
  infra, batch seeding, getting/updating profiles (full-snapshot stitch),
  profile activity, or provisioning profile pipelines in allowed sandboxes.
---

# AEP Lab Profile MCP — Coworker workflows

MCP server: **AEP Orchestration Lab — Profile MCP** (see `tools/aep-lab-profile-mcp/README.md`).

Configure in Coworker or Cursor with a **single** header:

- `X-AEP-Lab-Mcp-Key` — required for all tools (including provisioning)

Allowed sandboxes (default): `apalmer`, `kirkham`.

## Workflow 1 — Check infra → generate travel profile → lookup

1. **Check infra readiness**

   > Use lab_profile_infra_status for sandbox apalmer and industry travel. Summarize whether streaming is configured.

2. **Generate one randomized profile**

   > Call lab_generate_profile with sandbox apalmer, industry travel, email travel.demo+001@adobetest.com, randomize true.

3. **Lookup by email**

   > Call lab_lookup_profile with sandbox apalmer, namespace email, identifier travel.demo+001@adobetest.com. Summarize key travel attributes.

## Workflow 2 — Get profile → discuss changes → full-snapshot update

Profile Viewer streams **full writable snapshots** per industry dataflow — not minimal deltas. The MCP mirrors this.

1. **Get profile with metadata**

   > Use lab_get_profile for sandbox apalmer, namespace email, identifier travel.demo+001@adobetest.com. Summarize writable industries and key attributes.

2. **Discuss changes with the user**

   > Propose attribute_changes as dot-path / value pairs (e.g. person.name.firstName, loyalty.points). Confirm industry dataflow (travel, generic, etc.).

3. **Update with full stitch**

   > Call lab_update_profile: sandbox apalmer, industry travel, email travel.demo+001@adobetest.com, attribute_changes [{ path: "person.name.firstName", value: "Alex" }]. Explain that the server merged into the full writable snapshot before POST /api/profile/update.

4. **Verify**

   > Call lab_get_profile again and confirm the changed fields.

## Workflow 3 — Switch sandbox / onboard new sandbox

When Coworker switches to a sandbox that has no Firestore connection docs, generate/update will fail until infra is provisioned.

1. **Assess config**

   > Use lab_sandbox_profile_config for sandbox apalmer. Summarize ready vs notReadyIndustries and next_action per industry.

2. **Get onboarding plan**

   > Use lab_onboard_sandbox with sandbox apalmer, mode plan. List the ordered steps.

3. **Execute per industry (one at a time)**

   > Use lab_onboard_sandbox with sandbox apalmer, mode execute, industry travel. Wait for completion, then repeat for other not-ready industries.

   Or chain manually: lab_provision_profile_infra_step (step all_core) → lab_enable_profile → lab_sandbox_profile_config (refresh true).

4. **Ops note for brand-new sandbox names**

   > Sandbox must be on Cloud Run allowlist `AEP_LAB_MCP_ALLOWED_SANDBOXES` (see README § Onboarding a new sandbox).

## Workflow 4 — Profile activity narration

1. **Events + channels**

   > Use lab_profile_activity for sandbox apalmer, identifier travel.demo+001@adobetest.com. Read the narration field and summarize for the user (event count, active channels).

2. **Optional audiences**

   > Re-run lab_profile_activity with include_audiences true if audience membership matters for the demo.

## Workflow 5 — Batch seed N profiles

1. **Start batch job**

   > Use lab_generate_profiles_batch: sandbox apalmer, industry retail, count 25, base_email kirkham+retail-seed, randomize true.

2. **Poll until complete**

   > Poll lab_batch_job_status with the returned job_id every 10 seconds until status is completed, completed_with_errors, or failed. Report succeeded/failed counts.

3. **Spot-check one profile**

   > Pick the first succeeded email from results and run lab_get_profile (namespace email).

## Workflow 6 — Provision industry infra

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
- **lab_sandbox_profile_config** — use when switching sandboxes; returns Firestore connection manifest + `ready` / `next_action`.
- **lab_onboard_sandbox** — `mode=plan` for Coworker checklist; `mode=execute` + one `industry` per call (provisioning is slow).
- **lab_update_profile** always uses full-snapshot stitch when `attribute_changes` is provided (fetch → merge → stream all writable rows for industry). Pass explicit `attributes` only when you have a complete dot-path snapshot.
- Batch jobs max **100** profiles; use `email_pattern` for custom addressing (`{n}`, `{industry}`).
- Industry aliases: `telco` → `telecom`, `public` → `generic`.
- Provisioning is sandbox-allowlist gated like every other tool — only `apalmer` and `kirkham` by default.
