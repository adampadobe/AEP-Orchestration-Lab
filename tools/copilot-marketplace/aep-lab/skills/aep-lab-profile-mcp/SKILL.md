---
name: aep-lab-profile-mcp
description: >-
  Use the AEP Orchestration Lab MCP from GitHub Copilot CLI for profile,
  event, audience, AJO, decisioning, demo-preparation, commerce, Firefly,
  creative-production, measurement, geo-insights, or Figma workflows.
---

# AEP Orchestration Lab MCP

Use the smallest focused MCP connection that covers the request. Start with
`aep-lab-entry` to check access and find the right context. Use
`aep-lab-general` for first-run setup, infrastructure, administration,
cross-domain workflows, or tools missing from a focused endpoint.

The plugin reads the sandbox-scoped API key from the `AEP_LAB_MCP_KEY`
environment variable and sends it only as `X-AEP-Lab-Mcp-Key` to the Lab MCP
host. Never ask the user to paste a key into chat, echo it, write it to files,
or include it in commands. If a request is unauthorized, explain that the user
should check their local environment variable and Portal enrollment; never
attempt to bypass access controls.

## Safe workflow rules

- For profile generation, read the execution framework and industry
  playbook, confirm the colleague's shared generation preferences, and
  preflight before creating data. Keep AEP test-profile defaults enabled.
- For event examples, use the governed event tools and their parameters;
  do not hand-build XDM or send raw payload overrides.
- For audience or AJO deletion, list and audit one exact asset, explain the
  impact, and obtain explicit confirmation before the single delete.
- For decisioning and commerce writes, use the relevant preview before apply.
  Reuse the unchanged preview values and only apply after explicit confirmation.
- For Firefly or creative-production jobs, preview the request, explain the
  processing impact, get explicit confirmation, submit once, and check status.
- Treat Lab responses as evidence. Do not claim that a change succeeded until
  the tool response confirms it.

When the General connection is available, call `lab_get_execution_framework`
before advanced lab workflows. Use `lab_mcp_access_info` to check the current
identity and sandbox access.
