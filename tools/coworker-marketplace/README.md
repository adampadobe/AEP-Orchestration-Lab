# AEP Orchestration Lab — Coworker Marketplace

A Claude/Cowork-format plugin marketplace so Adobe CX Coworker users can install the AEP Orchestration Lab's MCP connections in one click, instead of manually pasting a JSON snippet per connection.

This directory is the Adobe CX Coworker package and uses Adobe IMS passthrough. Claude uses the repository-root marketplace and the separate `tools/claude-marketplace` package, which prompts for a sandbox-scoped Portal MCP key.

## Experimental v2: one personal secret

The separate `tools/coworker-marketplace-v2` marketplace contains only
`lab-v2-entry` and `lab-v2-demo`. It does not replace v1 or the root Claude
marketplace. It contains no workflow skill; this pilot tests authentication only.

Both servers reference `${user_secrets.aep_lab_mcp_key}` in the
`X-AEP-Lab-Mcp-Key` header, without an IMS passthrough provider. This uses the
secret-backed header syntax exposed by Coworker's Add Server UI. Resolution of
that syntax from a **plugin** remains unverified until the live pilot succeeds;
local packaging checks do not prove Coworker runtime compatibility.

Pilot setup, after the package is published to an approved GitHub ref:

1. In Coworker **App settings > Secrets > Your secrets**, save a personal,
   sandbox-scoped Portal MCP key as `aep_lab_mcp_key`. Never put the key in Git,
   chat, the marketplace's GitHub-token field, or an organization-wide secret.
2. Add repository `adampadobe/AEP-Orchestration-Lab`, the published pilot ref,
   subdirectory `tools/coworker-marketplace-v2`, and a distinct marketplace name.
   Install **AEP Lab v2 authentication pilot**, leaving v1 unchanged.
3. Test both connections and start a fresh chat. Verify access information
   identifies the intended user and sandbox, then perform only a read-only demo
   config inspection. Do not scrape, back up, switch customers, or generate data
   as part of this authentication test. The demo-prep connection still exposes
   mutation tools; this package is not a read-only security boundary.
4. Verify a fresh chat after refreshing the plugin still authenticates both
   contexts. Confirm missing/invalid credentials fail without exposing their
   values, using a dedicated test key rather than revoking an in-use key.

If either connection cannot resolve the saved secret, stop the pilot and retain
the exact sanitized error for Coworker development; do not embed a key or fall
back to forwarding IMS tokens. Remove only the v2 plugin/marketplace to undo the
pilot, and remove its personal secret only if no other connection uses it.

Removing the subdirectory requirement is deferred until this proof succeeds.
The repository root already serves Claude and must not be repointed to Coworker.
No Firebase or Cloud Run deployment is needed for this package-only pilot.

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
