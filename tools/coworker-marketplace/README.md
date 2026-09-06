# AEP Orchestration Lab — Coworker Marketplace

A Claude/Cowork-format plugin marketplace so Adobe CX Coworker users can install the AEP Orchestration Lab's MCP connections in one click, instead of manually pasting a JSON snippet per connection.

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

Once added, install the **AEP Orchestration Lab** plugin from the marketplace's Available list. You'll be prompted for one environment variable, `AEP_LAB_MCP_KEY` — see `aep-lab/README.md` for how to generate it.

## Structure

```
tools/coworker-marketplace/
├── .claude-plugin/marketplace.json   # marketplace manifest — lists installable plugins
└── aep-lab/                          # the one bundled plugin (all 9 focused Lab connections)
    ├── .claude-plugin/plugin.json
    ├── .mcp.json                     # MCP server definitions (URL + header per connection)
    ├── skills/aep-lab-profile-mcp/   # workflow guidance, mirrored from .agents/skills/
    └── README.md
```

This is a `.claude-plugin/` marketplace/plugin format (the same schema Claude Code plugins use — Adobe CX Coworker is Adobe's deployment of Claude's Cowork app and shares it unmodified). See `aep-lab/README.md` for what gets installed and the required environment variable.
