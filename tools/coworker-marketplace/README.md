# AEP Orchestration Lab — Coworker Marketplace

A Claude/Cowork-format plugin marketplace so Adobe CX Coworker users can install the AEP Orchestration Lab's MCP connections in one click, instead of manually pasting a JSON snippet per connection.

This directory is the Adobe CX Coworker package and uses Adobe IMS passthrough. Claude uses the repository-root marketplace and the separate `tools/claude-marketplace` package, which prompts for a sandbox-scoped Portal MCP key.

## V2: all Lab connections, one personal secret

The separate `tools/coworker-marketplace-v2` marketplace packages General and
all 19 focused Lab connections in plugin **AEP-Orchestration-Lab-v2**, version
**0.3.0**. Use **AEP-Orchestration-Lab-v2** as the Coworker marketplace name.
It preserves the installed pilot's plugin identity and its
`lab-v2-entry` and `lab-v2-demo` connection names. It does not replace v1 or the
root Claude marketplace. It includes the existing `aep-lab-profile-mcp` workflow
skill and full playbook, adapted for v2 connection names and personal-secret auth.

Every server references `${user_secrets.aep_lab_mcp_key}` in the
`X-AEP-Lab-Mcp-Key` header, without an IMS passthrough provider. One personal key
therefore authenticates the entire bundle; access is still constrained by that
key's sandbox allowlist and each tool's authorization requirements.

**Live evidence, 19 November 2026:** Coworker's two-connection 0.1.0 pilot
resolved the personal secret, discovered Entry (5 tools) and Demo Prep (24 tools),
and successfully called access information on both plus read-only demo-config
inspection. Both identified Adam Palmer with sandbox `apalmer`; both connections
remained Connected after a browser refresh. Before the key was configured, Test
returned HTTP 502; an incorrectly entered key produced a generic HTTP 403, and
correcting the saved secret resolved it. These observations do not constitute a
dedicated key-revocation test. The expanded 0.2.0 bundle subsequently passed
native read-only discovery on all 20 connections, including General's 252 tools.
This does not prove downstream service permissions for every operation.

| Connection | Context |
|---|---|
| `lab-v2-entry` | Entry and context discovery |
| `lv2-all` | General / full Lab |
| `lab-v2-snow` | Snowflake |
| `lab-v2-profiles` | Profiles and events |
| `lab-v2-demo` | Demo preparation and branding |
| `lab-v2-pdf` | PDF preparation |
| `lab-v2-audiences` | Audiences |
| `lv2-dps` | Decisioning |
| `lab-v2-ajo-clean` | AJO cleanup |
| `lab-v2-ajo-oc` | AJO Orchestrated Campaign datasets |
| `lab-v2-command` | Command Centre |
| `lab-v2-weather` | Weather |
| `lab-v2-geo` | Geographic insights |
| `lab-v2-commerce` | Commerce |
| `lab-v2-aco` | Commerce Optimizer |
| `lab-v2-firefly` | Firefly |
| `lab-v2-creative` | Creativity |
| `lab-v2-catalog` | Adobe capabilities |
| `lab-v2-measure` | Measurement quality |
| `lab-v2-figma` | Figma |

General and Decisioning use shorter prefixes to keep every qualified tool name,
including an optional `mcp__` namespace, within 64 characters. Endpoint URLs and
timeouts match v1. Local packaging checks cover all 20 contexts but do not prove
live availability or downstream Adobe-service permissions.

The simplest install uses the dedicated distribution repository:
**`adampadobe/AEP-Orchestration-Lab-v2`**, default ref, **no subdirectory**,
marketplace name **`AEP-Orchestration-Lab-v2`**. See the
[v2 installation guide](../coworker-marketplace-v2/README.md).

Alternatively, install from this authoring repository after publishing an approved ref:

1. In Coworker **App settings > Secrets > Your secrets**, save a personal,
   sandbox-scoped Portal MCP key as `aep_lab_mcp_key`. Never put the key in Git,
   chat, the marketplace's GitHub-token field, or an organization-wide secret.
2. Add repository `adampadobe/AEP-Orchestration-Lab`, the published v2 ref,
   subdirectory `tools/coworker-marketplace-v2`, and marketplace name
   `AEP-Orchestration-Lab-v2`.
   Install **AEP-Orchestration-Lab-v2** (`aep-lab-v2`), leaving v1 unchanged. If a newly added
   marketplace initially shows Ready with zero plugins, let discovery finish;
   one explicit **Sync** resolved this during the pilot.
3. Use **Test** on each connection and start a fresh chat. Verify access information
   identifies the intended user and sandbox, then perform only a read-only demo
   config inspection. Do not scrape, back up, switch customers, or generate data
   as part of this authentication test. The demo-prep connection still exposes
   mutation tools; this package is not a read-only security boundary.
4. Verify a fresh chat after refreshing the plugin still authenticates the
   contexts. Confirm missing/invalid credentials fail without exposing their
   values, using a dedicated test key rather than revoking an in-use key.

For an existing pilot install pinned to a commit SHA, **Sync does not advance
that pin**. Update the marketplace to the newly approved ref before refreshing
or updating the plugin. If the UI has no ref editor, remove only the v2 plugin
and its marketplace, then re-add at the new ref and reinstall. Keep the existing
personal secret; the expanded bundle references the same name. Start a new chat.

If a connection cannot resolve the saved secret, stop the update and retain
the exact sanitized error for Coworker development; do not embed a key or fall
back to forwarding IMS tokens. Remove only the v2 plugin/marketplace to undo the
update, and remove its personal secret only if no other connection uses it.

The dedicated v2 repository contains only this credential-free package at its
root. The original repository root still serves Claude and is not repointed.
Publish changes from `tools/coworker-marketplace-v2` to the distribution
repository after packaging validation. No Firebase or Cloud Run deployment is
needed for this package-only change.

## Add this marketplace in Coworker

1. Open **CX Coworker**.
2. In the left sidebar, go to **Marketplaces**.
3. Click **+ Add Marketplace** (top right).
4. In the dialog:
   - **Source Type:** GitHub
   - **GitHub Repository:** `https://github.com/adampadobe/AEP-Orchestration-Lab`
   - **Branch, Tag, or Commit SHA** *(optional)*: leave as `main`
   - **Subdirectory** *(optional)*: `tools/coworker-marketplace`
5. Click **Add Marketplace**.

Once added, install the **AEP Orchestration Lab** plugin from the marketplace's Available list. Coworker forwards your signed-in Adobe IMS session automatically; no key is pasted into the plugin. Create at least one sandbox-scoped MCP key in the AEP Lab Portal once to establish your sandbox enrollment, but keep the plaintext key for non-Coworker clients only.

**Plugin 1.9.0:** General, Decisioning, and Commerce Optimizer use shorter connection names (`lab-all`, `lab-dps`, `lab-aco`) to keep qualified tool names within 64 characters. Existing installs must refresh/update or reinstall the plugin and start a new chat; see `aep-lab/README.md` for migration steps. Endpoint URLs, tool names, and IMS authentication do not change.

## Structure

```
tools/coworker-marketplace/
├── .claude-plugin/marketplace.json   # marketplace manifest — lists installable plugins
└── aep-lab/                          # General plus all 19 focused Lab connections
    ├── .claude-plugin/plugin.json
    ├── .mcp.json                     # MCP server definitions (URL + header per connection)
    ├── skills/aep-lab-profile-mcp/   # workflow guidance, mirrored from .agents/skills/
    └── README.md
```

This is a `.claude-plugin/` marketplace/plugin format. See `aep-lab/README.md` for what gets installed and how Coworker IMS authentication maps to the Portal enrollment.
