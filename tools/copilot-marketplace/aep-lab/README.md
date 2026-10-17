# AEP Orchestration Lab for GitHub Copilot CLI

This Agent Plugins 1.0 package connects Copilot CLI to the AEP Lab's hosted
Streamable HTTP MCP endpoints using the caller's sandbox-scoped
`X-AEP-Lab-Mcp-Key`. The key is referenced from `AEP_LAB_MCP_KEY` in the local
environment and is not stored in this plugin.

The plugin includes the full General catalog plus the focused endpoints. Use
the focused endpoint for ordinary tasks and General for first-run setup,
infrastructure, administration, cross-domain workflows, or any tool missing
from a focused catalog. The entry endpoint is a capability directory, not a
proxy for executing tools from other endpoints.

See [`../README.md`](../README.md) for installation. For the full tool
reference and execution framework, see
[`../../aep-lab-profile-mcp/README.md`](../../aep-lab-profile-mcp/README.md).
