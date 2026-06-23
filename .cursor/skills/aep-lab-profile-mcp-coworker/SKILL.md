---
name: aep-lab-profile-mcp-coworker
description: >-
  Workflows and example prompts for the AEP Orchestration Lab Profile MCP
  (Streamable HTTP on Cloud Run). Use when generating test profiles, checking
  infra, batch seeding, or provisioning profile pipelines in allowed sandboxes.
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

## Workflow 2 — Batch seed N profiles

1. **Start batch job**

   > Use lab_generate_profiles_batch: sandbox apalmer, industry retail, count 25, base_email kirkham+retail-seed, randomize true.

2. **Poll until complete**

   > Poll lab_batch_job_status with the returned job_id every 10 seconds until status is completed, completed_with_errors, or failed. Report succeeded/failed counts.

3. **Spot-check one profile**

   > Pick the first succeeded email from results and run lab_lookup_profile (namespace email).

## Workflow 3 — Provision industry infra

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

- Set MCP client tool timeout ≥ **300s** for infra status, lookup, and provisioning.
- Batch jobs max **100** profiles; use `email_pattern` for custom addressing (`{n}`, `{industry}`).
- Industry aliases: `telco` → `telecom`, `public` → `generic`.
- Provisioning is sandbox-allowlist gated like every other tool — only `apalmer` and `kirkham` by default.
