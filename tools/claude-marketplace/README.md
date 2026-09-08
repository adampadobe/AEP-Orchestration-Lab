# AEP Orchestration Lab — Claude Marketplace

Claude-compatible packaging for the AEP Orchestration Lab MCP. The repository-root marketplace manifest points to this plugin, so Claude users add the repository without a subdirectory:

1. Open **Customize → Plugins → Add marketplace** in Claude.
2. Enter `https://github.com/adampadobe/AEP-Orchestration-Lab` and sync it.
3. Install **AEP Orchestration Lab**.
4. When prompted, paste a sandbox-scoped MCP key generated in the AEP Orchestration Lab Portal.

The key is declared as sensitive plugin configuration and is sent only as `X-AEP-Lab-Mcp-Key` to the Lab's Cloud Run MCP endpoints. It is never stored in this repository.

The plugin installs `aep-lab-general` (the complete 155-tool catalog) plus the eleven focused connections, including governed Adobe Commerce storefront preparation and read-only Commerce Optimizer preparation. Prefer a focused connection for ordinary tasks and General for advanced or cross-domain workflows.

Adobe CX Coworker uses the separate `tools/coworker-marketplace` package and Adobe IMS passthrough. Do not point Coworker at this Claude-specific package.
