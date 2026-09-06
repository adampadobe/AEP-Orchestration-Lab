# AEP Orchestration Lab (Coworker plugin)

One-click Adobe CX Coworker install for the AEP Orchestration Lab's MCP connections — no manual JSON pasting per connection.

## What this installs

Nine MCP connections, one per Lab capability:

| Connection | Endpoint | Purpose |
|---|---|---|
| `aep-lab-entry` | `/mcp/entry` | Capability directory and workflow recommender |
| `aep-lab-profiles` | `/mcp/profile` | Profile lifecycle, industry events, Snowflake dual-load |
| `aep-lab-demo-prep` | `/mcp/demo-prep` | Brand scrape, customer switch, RTDB demo config |
| `aep-lab-pdf-prep` | `/mcp/pdf` | HTML/document to PDF, storage, server templates |
| `aep-lab-audiences` | `/mcp/audiences` | Governed audience list/audit/delete |
| `aep-lab-decisioning` | `/mcp/decisioning` | Edge decision evaluation and catalog |
| `aep-lab-ajo-cleanup` | `/mcp/ajo-cleanup` | Governed AJO journey/campaign list/audit/delete |
| `aep-lab-command-centre` | `/mcp/command-centre` | Your own Command Centre engagements, tasks, meetings |
| `aep-lab-weather` | `/mcp/weather` | Live weather + Google Maps for demo scenarios |

This is deliberately **not** the full `/mcp` catch-all connection — every tool it would add is already covered by the nine above, so bundling it too would only add duplicate tool names with no new capability. It's still available as a standalone manual connection; see `tools/aep-lab-profile-mcp/README.md`.

## Setup: one required environment variable

All nine connections share a single header, `X-AEP-Lab-Mcp-Key`, sourced from one environment variable:

**`AEP_LAB_MCP_KEY`** — generate a sandbox-scoped key from the Profile Viewer's MCP key panel (same self-service flow used for manual setup today), then set it as this variable when Coworker prompts for it during install.

`aep-lab-command-centre`, and any Snowflake-backed tools reached through `aep-lab-profiles`, require a **user-generated** key (not a shared ops key) — the key you generate from your own Profile Viewer session already satisfies this.

## Security

This plugin only changes *how the connection gets added* to Coworker. The underlying MCP server's auth model is unchanged: every request still requires a valid, sandbox-scoped `X-AEP-Lab-Mcp-Key`, validated server-side exactly as it is for a manually-configured connection. The key itself is never stored in this repo — it lives only in the environment variable you set at install time.

## Further reading

- `tools/aep-lab-profile-mcp/README.md` — full tool reference, endpoint list, environment variables
- `skills/aep-lab-profile-mcp/SKILL.md` — workflow guidance and example Coworker prompts bundled with this plugin
