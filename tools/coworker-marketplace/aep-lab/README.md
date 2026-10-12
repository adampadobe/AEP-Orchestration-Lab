# AEP Orchestration Lab (Coworker plugin)

One-click Adobe CX Coworker install for the AEP Orchestration Lab's MCP connections — no manual JSON pasting per connection.

## What this installs

Eighteen MCP connections: the complete General catalog plus seventeen focused capabilities:

| Connection | Endpoint | Purpose |
|---|---|---|
| `aep-lab-entry` | `/mcp/entry` | Capability directory and workflow recommender |
| `lab-all` | `/mcp` | Complete 212-tool catalog, including advanced onboarding, infrastructure, Snowflake, Commerce, Commerce Optimizer, Firefly, creative production, Adobe API discovery, measurement diagnostics, geo insights, and administration |
| `aep-lab-profiles` | `/mcp/profile` | Profile lifecycle, industry events, Snowflake dual-load |
| `aep-lab-demo-prep` | `/mcp/demo-prep` | Brand scrape, customer switch, RTDB demo config |
| `aep-lab-pdf-prep` | `/mcp/pdf` | HTML/document to PDF, storage, server templates |
| `aep-lab-audiences` | `/mcp/audiences` | Governed audience list/audit/delete |
| `lab-dps` | `/mcp/decisioning` | Edge decision evaluation, catalog management, governed bulk migration, and job polling |
| `aep-lab-ajo-cleanup` | `/mcp/ajo-cleanup` | Governed AJO journey/campaign list/audit/delete |
| `aep-lab-command-centre` | `/mcp/command-centre` | Your own Command Centre engagements, tasks, meetings |
| `aep-lab-weather` | `/mcp/weather` | Live weather + Google Maps for demo scenarios |
| `aep-lab-geo-insights` | `/mcp/geo-insights` | AEP audience geo-hotspots with live weather context; aggregate-only, k=10 suppression |
| `aep-lab-commerce` | `/mcp/commerce` | Governed ACCS storefront preparation: products, attributes, categories, assignments, inventory, media, GraphQL discovery, preview/apply, and audited deletion |
| `lab-aco` | `/mcp/commerce-optimizer` | ACO storefront reads plus confirmation-gated products, metadata, categories, price books, prices, and product-layer ingestion |
| `aep-lab-firefly` | `/mcp/firefly` | Governed Firefly image, video, Text to Speech, transcription/captions, dubbing/lip sync, and shared async status |
| `aep-lab-creativity` | `/mcp/creativity` | Governed Photoshop v2 Lightroom-style edits, InDesign data merge, Substance 3D render, Express variations, Illustrator Image Trace, and shared status |
| `aep-lab-adobe-capabilities` | `/mcp/adobe-capabilities` | Read-only 35-service scope catalog plus bounded AJO suppression and GenStudio Experience probes |
| `aep-lab-measurement-quality` | `/mcp/measurement-quality` | Read-only Assurance metadata, Tags property/environment audit, and Adobe Status incident correlation |
| `aep-lab-figma` | `/mcp/figma` | Figma files, node structure, design context, renders, components, styles, variables, and comments via a server-held Figma token (no Figma OAuth in Coworker) |

Use a focused connection for ordinary tasks and `lab-all` when a required advanced tool is not present there. General overlaps with the focused connections, but ensures the marketplace exposes the complete Lab catalog.

## Upgrading to plugin 1.9.0

The Coworker connection names for General, Decisioning, and Commerce Optimizer are now `lab-all`, `lab-dps`, and `lab-aco`. Their endpoints and tool names are unchanged. The old names made `<connection>__<tool>` exceed a 64-character callable-name budget for offer-eligibility preview and five Optimizer tools (attribute metadata plus the four ingestion lifecycle tools), matching the observed Coworker omissions. The shorter names also leave room for an additional `mcp__` namespace. Claude/API-key configuration names and the execution framework's context IDs remain unchanged; the directory supplies `coworkerConnectionName` for these three contexts.

Refresh the marketplace and update the plugin (or reinstall it if Coworker retains the old connections). Remove or disconnect the three old named connections, then start a new chat using the new names. A new chat alone cannot update an old installed manifest. Confirm discovery shows General 212 tools, Commerce Optimizer 15, and Decisioning 24 after the server's job-polling update is released. Do not paste a Portal key or change IMS settings to resolve tool discovery.

## Setup: signed-in Adobe IMS

All eighteen connections use Coworker's signed-in Adobe IMS session. The plugin forwards `Authorization`, the selected IMS org, and Coworker identity headers to Cloud Run. Cloud Run validates the bearer token with Adobe IMS before accepting an MCP request; forwarded identity headers alone are never trusted. Adobe creative service credentials remain in Cloud Run Secret Manager and are never sent to Coworker.

Before first use, create at least one sandbox-scoped MCP key from the Profile Viewer's MCP key panel. That creates the server-side enrollment tying your verified Adobe email to the permitted sandbox. You do **not** paste that key into Coworker; Coworker needs only your existing Adobe sign-in.

API-key clients such as Codex or Cursor continue to send the generated key as `X-AEP-Lab-Mcp-Key`. Existing API-key connections remain compatible.

## Security

The plugin stores no user secrets. Coworker's bearer token is validated against Adobe IMS UserInfo, the verified identity must be an `@adobe.com` account, and the identity must have an active Portal MCP-key enrollment. The enrollment supplies the sandbox allowlist; the plaintext Portal key is never recoverable or needed by Coworker.

## Further reading

- `tools/aep-lab-profile-mcp/README.md` — full tool reference, endpoint list, environment variables
- `skills/aep-lab-profile-mcp/SKILL.md` — workflow guidance and example Coworker prompts bundled with this plugin
