# aep-lab-command-centre-mcp

Stdio MCP server that lets any MCP-compatible LLM (Claude Desktop, Claude Code, etc.) read and fully manage your own AEP Orchestration Lab Solutions Consultant Command Centre — customer engagements, tasks, and meetings — without opening the browser. It calls the deployed lab's `/api/home-command/mcp/*` Cloud Function over HTTPS, authenticated with a personal MCP API key.

## Setup

1. Generate an MCP API key from the lab while signed in: Profile Viewer → MCP servers (or `POST /api/lab/mcp-keys` with your Firebase ID token).
2. `cd tools/aep-lab-command-centre-mcp && npm install`
3. `cp .env.mcp.example .env.mcp` and paste your key into `AEP_LAB_MCP_API_KEY`.
4. Add it to your MCP client's config, e.g. Claude Desktop's `claude_desktop_config.json` or Claude Code's `.mcp.json`:

```json
{
  "mcpServers": {
    "aep-lab-command-centre": {
      "command": "node",
      "args": ["/absolute/path/to/AEP-Orchestration-Lab/tools/aep-lab-command-centre-mcp/src/server.mjs"]
    }
  }
}
```

5. Restart your MCP client. You should see tools: `list_command_centre`, `add_customer_engagement`, `update_customer_engagement`, `delete_customer_engagement`, `add_task`, `update_task`, `delete_task`, `add_meeting`, `update_meeting`, `delete_meeting`.

## How it resolves your data

The MCP key is bound to your Firebase uid at generation time. Each request resolves your uid → RTDB workspace slug the same way the browser does (`userWorkspaceOwners/{uid}` → Firestore workspace profile → email-derived fallback — see `functions/homeCommandMcpAuth.js`), so writes from here land in the exact same `userWorkspaces/{slug}/commandCentre/default` bucket the browser Command Centre reads from. Changes made here show up in the browser on next reload, and vice versa.

## Security

Never commit `.env.mcp`. Rotate the key from Profile Viewer → MCP servers if it leaks — this key can read and modify your Command Centre data (not any other user's).
