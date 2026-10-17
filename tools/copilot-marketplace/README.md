# AEP Orchestration Lab — GitHub Copilot CLI Marketplace

This marketplace packages the AEP Orchestration Lab for GitHub Copilot CLI. It
is separate from the Claude marketplace at the repository root and the Adobe CX
Coworker marketplace under `tools/coworker-marketplace`; neither of those
packages or their authentication flows is changed by this integration.

## Install

1. Create a sandbox-scoped MCP key in the AEP Orchestration Lab Portal. The key
   is a secret: do not put it in a repository file or command history.
2. Set it in the shell that will launch Copilot CLI. This reads the value
   without echoing it or placing it in shell history:

   ```sh
   printf 'AEP Lab MCP key: '
   read -s AEP_LAB_MCP_KEY
   printf '\n'
   export AEP_LAB_MCP_KEY
   ```

   Use your normal local secret manager or shell setup rather than committing
   the value. Copilot CLI resolves `${AEP_LAB_MCP_KEY}` from the shell
   environment when it starts the MCP connections.
3. In Copilot CLI, add the marketplace and install the plugin:

   ```text
   copilot plugin marketplace add adampadobe/AEP-Orchestration-Lab
   copilot plugin install aep-lab@aep-orchestration-lab-copilot
   ```

4. Start a new Copilot CLI session and check `/mcp` or `copilot mcp list` for
   the AEP Lab connections.

The plugin connects using the same `X-AEP-Lab-Mcp-Key` header used by other
API-key MCP clients. Its key is not embedded in the marketplace or plugin.
The Adobe CX Coworker plugin continues to use its signed-in Adobe IMS
passthrough; do not use that package or its auth configuration in Copilot.

## Package contents

`aep-lab/` contains a portable Agent Plugins 1.0 plugin manifest, remote
Streamable HTTP MCP server definitions for the full catalog and focused
endpoints, and the `aep-lab-profile-mcp` skill. Prefer the focused endpoint
that matches the task; use the General connection when a needed tool is not
available in a focused catalog.

For tool descriptions, endpoint details, and the full execution framework, see
[`tools/aep-lab-profile-mcp/README.md`](../aep-lab-profile-mcp/README.md) and
[`AGENTS.md`](../../AGENTS.md).
