# AEP Orchestration Lab (Coworker plugin)

One-click Adobe CX Coworker install for the AEP Orchestration Lab's MCP connections — no manual JSON pasting per connection.

## What this installs

Twelve MCP connections: the complete General catalog plus eleven focused capabilities:

| Connection | Endpoint | Purpose |
|---|---|---|
| `aep-lab-entry` | `/mcp/entry` | Capability directory and workflow recommender |
| `aep-lab-general` | `/mcp` | Complete 146-tool catalog, including advanced onboarding, infrastructure, Snowflake, Commerce, Commerce Optimizer, and administration |
| `aep-lab-profiles` | `/mcp/profile` | Profile lifecycle, industry events, Snowflake dual-load |
| `aep-lab-demo-prep` | `/mcp/demo-prep` | Brand scrape, customer switch, RTDB demo config |
| `aep-lab-pdf-prep` | `/mcp/pdf` | HTML/document to PDF, storage, server templates |
| `aep-lab-audiences` | `/mcp/audiences` | Governed audience list/audit/delete |
| `aep-lab-decisioning` | `/mcp/decisioning` | Edge decision evaluation and catalog |
| `aep-lab-ajo-cleanup` | `/mcp/ajo-cleanup` | Governed AJO journey/campaign list/audit/delete |
| `aep-lab-command-centre` | `/mcp/command-centre` | Your own Command Centre engagements, tasks, meetings |
| `aep-lab-weather` | `/mcp/weather` | Live weather + Google Maps for demo scenarios |
| `aep-lab-commerce` | `/mcp/commerce` | Read-only ACCS access, stores, products, categories, inventory, and GraphQL |
| `aep-lab-commerce-optimizer` | `/mcp/commerce-optimizer` | Read-only ACO tenant, catalog views, products, navigation, recommendations, and GraphQL |

Use a focused connection for ordinary tasks and `aep-lab-general` when a required advanced tool is not present there. General overlaps with the focused connections, but ensures the marketplace exposes the complete Lab catalog.

## Setup: signed-in Adobe IMS

All twelve connections use Coworker's signed-in Adobe IMS session. The plugin forwards `Authorization`, the selected IMS org, and Coworker identity headers to Cloud Run. Cloud Run validates the bearer token with Adobe IMS before accepting an MCP request; forwarded identity headers alone are never trusted.

Before first use, create at least one sandbox-scoped MCP key from the Profile Viewer's MCP key panel. That creates the server-side enrollment tying your verified Adobe email to the permitted sandbox. You do **not** paste that key into Coworker; Coworker needs only your existing Adobe sign-in.

API-key clients such as Codex or Cursor continue to send the generated key as `X-AEP-Lab-Mcp-Key`. Existing API-key connections remain compatible.

## Security

The plugin stores no user secrets. Coworker's bearer token is validated against Adobe IMS UserInfo, the verified identity must be an `@adobe.com` account, and the identity must have an active Portal MCP-key enrollment. The enrollment supplies the sandbox allowlist; the plaintext Portal key is never recoverable or needed by Coworker.

## Further reading

- `tools/aep-lab-profile-mcp/README.md` — full tool reference, endpoint list, environment variables
- `skills/aep-lab-profile-mcp/SKILL.md` — workflow guidance and example Coworker prompts bundled with this plugin
