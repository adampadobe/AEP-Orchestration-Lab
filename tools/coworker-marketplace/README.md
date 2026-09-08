# AEP Orchestration Lab — Coworker Marketplace

A Claude/Cowork-format plugin marketplace so Adobe CX Coworker users can install the AEP Orchestration Lab's MCP connections in one click, instead of manually pasting a JSON snippet per connection.

This directory is the Adobe CX Coworker package and uses Adobe IMS passthrough. Claude uses the repository-root marketplace and the separate `tools/claude-marketplace` package, which prompts for a sandbox-scoped Portal MCP key.

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

## Structure

```
tools/coworker-marketplace/
├── .claude-plugin/marketplace.json   # marketplace manifest — lists installable plugins
└── aep-lab/                          # General plus all 9 focused Lab connections
    ├── .claude-plugin/plugin.json
    ├── .mcp.json                     # MCP server definitions (URL + header per connection)
    ├── skills/aep-lab-profile-mcp/   # workflow guidance, mirrored from .agents/skills/
    └── README.md
```

This is a `.claude-plugin/` marketplace/plugin format. See `aep-lab/README.md` for what gets installed and how Coworker IMS authentication maps to the Portal enrollment.
