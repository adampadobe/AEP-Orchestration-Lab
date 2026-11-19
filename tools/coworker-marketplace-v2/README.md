# AEP-Orchestration-Lab-v2

One Coworker plugin containing the Lab workflow skill and all 20 Lab MCP
connections. Every connection uses the same personal, sandbox-scoped Lab key.
No Adobe IMS passthrough or separate per-connection key setup is required.

## Install in Coworker

1. Open **Customizations > User > Marketplaces > Add marketplace**.
2. Set **GitHub Repository** to `adampadobe/AEP-Orchestration-Lab-v2`.
   Leave the ref at its default and **Subdirectory empty**. Set **Name** to
   `AEP-Orchestration-Lab-v2`. Leave the GitHub-token field empty for this public
   repository.
3. Install plugin **AEP-Orchestration-Lab-v2** (internal ID `aep-lab-v2`).
   If initial discovery shows zero plugins, let it finish and use **Sync** once.
4. In **Profile > App settings > Secrets > Your secrets**, save your personal
   Portal MCP key as `aep_lab_mcp_key`. If that secret already exists, keep it;
   reinstalling the plugin does not require entering it again.
5. Start a new chat. Ask for a read-only `lab_mcp_access_info` check, confirm the
   expected principal and sandbox, then use the installed workflow skill.

Never paste the key in chat, Git, an organization-wide secret, or the
marketplace's GitHub-token field. All servers reference
`${user_secrets.aep_lab_mcp_key}` in the `X-AEP-Lab-Mcp-Key` header.

## Included

Version **0.3.1** includes skill `aep-lab-profile-mcp-v2` with its full workflow
playbook, adapted for v2 names and personal-secret authentication. Its distinct
name avoids ambiguity when v1 is also installed. The 20
connections cover Entry, General, Snowflake, Profiles, Demo Prep, PDF, Audiences,
Decisioning, AJO cleanup, Orchestrated Campaign datasets, Command Centre, Weather,
Geo Insights, Commerce, Commerce Optimizer, Firefly, Creativity, Adobe
Capabilities, Measurement Quality, and Figma.

Use focused connections when possible; `lv2-all` is the full catalog. Some
connection prefixes are deliberately short to preserve all qualified tool names.
Discovery does not prove permissions or readiness for every downstream Adobe
operation. The key's sandbox allowlist and tool-specific approval gates remain
in force. Preview and obtain explicit confirmation before mutations; after an
uncertain write, inspect its operation status instead of retrying.

The 0.2.0 bundle passed Coworker's native read-only connection discovery on all
20 endpoints on 19 November 2026. The earlier Entry/Demo Prep pilot also passed
authenticated access checks and read-only demo-config inspection. The 0.3.0
skill addition and 0.3.1 skill-name fix do not change endpoints or authentication.

## Updates and rollback

Sync the marketplace, update or refresh the plugin, then start a new chat.
An install pinned to a commit does not advance when synced; update that pin
explicitly. Remove only this v2 plugin/marketplace to uninstall; delete its
personal secret only when no other connection uses it.

This repository is a credential-free distribution of
[`tools/coworker-marketplace-v2`](https://github.com/adampadobe/AEP-Orchestration-Lab/tree/adampadobe-coworker-marketplace-diagnosis/tools/coworker-marketplace-v2).
The main Lab repository remains the authoring source; publish focused package
updates here after its packaging checks pass. No Firebase or Cloud Run
deployment is required. V1 and the original repository-root Claude marketplace
are separate and unchanged.
