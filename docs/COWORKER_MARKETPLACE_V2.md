# Install AEP-Orchestration-Lab-v2 in Coworker

Use this guide for Adobe CX Enterprise Coworker. One marketplace installation
provides **20 Lab MCP connections and the full workflow skill**, using **one
personal Lab key saved once**. You do not need to register individual MCP
servers, enter a subdirectory, or create a Google OAuth client.

## Before you start

You need access to Coworker in your intended Adobe organization and approved
access to the [Lab Portal](https://aep-orchestration-lab.web.app/profile-viewer/home.html).
Each colleague uses their **own** Portal identity, authorized sandbox and key.
Installing a public plugin does not grant Lab access or downstream product
entitlements. Do not copy another colleague's key or assume the example sandbox
`apalmer` is available to you.

## 1. Create your personal Lab key

1. Sign in to the [Portal MCP servers page](https://aep-orchestration-lab.web.app/profile-viewer/mcp-servers.html)
   and select your authorized sandbox.
2. Create a personal MCP key, with a recognizable label such as `Coworker v2`.
   New keys are scoped to that sandbox. An existing appropriate personal key
   can be reused; do not rotate an in-use key just to install the plugin.
3. Keep the newly displayed value private. The Portal shows plaintext only when
   creating or rotating a key. Save it directly into Coworker's personal secret
   in the next step, not in chat, source code, a screenshot or this guide.

If Lab access or the required sandbox is unavailable, contact the Lab
administrator. Do not substitute a shared operations key or someone else's key.

## 2. Save the key once in Coworker

In Coworker, open **Profile > App settings > Secrets > Your secrets** and add:

| Secret field | Value |
|---|---|
| Name | `aep_lab_mcp_key` |
| Value | Your own sandbox-scoped Portal MCP key |

Use **Your secrets**, not an organization-wide secret. If this personal secret
already holds the correct key, leave it unchanged. It is not a GitHub access
token, Adobe OAuth client secret, or Google Cloud Secret Manager entry.

## 3. Add the marketplace and install the plugin

Open Coworker **Customizations > User > Marketplaces > Add marketplace**.
Enter these values:

| Marketplace field | Value |
|---|---|
| GitHub Repository | `adampadobe/AEP-Orchestration-Lab-v2` |
| Branch, Tag, or Commit SHA | `main`, or leave empty for the default branch |
| Subdirectory | **Leave empty** |
| GitHub token secret | **Leave empty**; this repository is public |
| Name | `AEP-Orchestration-Lab-v2` |

Check the Name after filling the repository and ref: the UI may auto-fill it.
Add the marketplace, select its available plugin, and install it. The display
name is **AEP-Orchestration-Lab-v2**; some Coworker lists show its internal
plugin ID, **`aep-lab-v2`**.

If a newly added marketplace initially shows **Ready / 0 plugins**, allow
discovery to finish and use **Sync** once. Do not create duplicate marketplaces.
The installed plugin should show **1 Skill**. If the Skills or Integrations
lists still show older cached results, reload the page.

The [distribution repository](https://github.com/adampadobe/AEP-Orchestration-Lab-v2)
is specifically for Coworker. The original
`adampadobe/AEP-Orchestration-Lab` repository root serves the separate Claude
marketplace; do not use that root as the Coworker v2 install source.

## 4. Verify without changing demo data

Under **Customizations > User > Integrations**, find the v2 connections and use
**Test**. A successful test discovers tools; it does not execute the full demo
workflow or prove every downstream service permission.

Under **Skills**, search for **Aep Lab Profile Mcp V2**
(`aep-lab-profile-mcp-v2`), supplied by `aep-lab-v2`. It includes the bundled
`references/workflows.md` playbook. Its distinct name avoids ambiguity with v1.

Start a new chat and use this prompt, replacing the sandbox placeholder:

> Load skill aep-lab-profile-mcp-v2 and its bundled workflow reference. Use
> lab-v2-entry to call lab_mcp_access_info. Report the principal and allowed
> sandboxes without exposing credentials. Only if my intended sandbox
> {your sandbox} is allowed, use lab-v2-demo to call lab_demo_config_inspect for
> it and report whether the read succeeded. Do not generate, scrape, preview,
> apply, back up, switch customers or change any data.

Confirm the returned principal is you and the allowlist includes the intended
sandbox before doing real work. A different principal is a reason to stop, not
to continue with another user's saved workspace.

## Included connections

Use the focused connection for the task; use General for tools absent from a
focused catalog. Tool availability can change with server releases.

| Connection name | Context / endpoint |
|---|---|
| `lab-v2-entry` | Entry directory, `/mcp/entry` |
| `lv2-all` | General, `/mcp` |
| `lab-v2-snow` | Snowflake, `/mcp/snowflake` |
| `lab-v2-profiles` | Profiles and events, `/mcp/profile` |
| `lab-v2-demo` | Demo preparation and branding, `/mcp/demo-prep` |
| `lab-v2-pdf` | PDF preparation, `/mcp/pdf` |
| `lab-v2-audiences` | Audiences, `/mcp/audiences` |
| `lv2-dps` | Decisioning, `/mcp/decisioning` |
| `lab-v2-ajo-clean` | AJO cleanup, `/mcp/ajo-cleanup` |
| `lab-v2-ajo-oc` | Orchestrated Campaign dataset reads, `/mcp/ajo-oc-datasets` |
| `lab-v2-command` | Command Centre, `/mcp/command-centre` |
| `lab-v2-weather` | Weather, `/mcp/weather` |
| `lab-v2-geo` | Geographic insights, `/mcp/geo-insights` |
| `lab-v2-commerce` | Commerce, `/mcp/commerce` |
| `lab-v2-aco` | Commerce Optimizer, `/mcp/commerce-optimizer` |
| `lab-v2-firefly` | Firefly, `/mcp/firefly` |
| `lab-v2-creative` | Creativity, `/mcp/creativity` |
| `lab-v2-catalog` | Adobe capabilities, `/mcp/adobe-capabilities` |
| `lab-v2-measure` | Measurement quality, `/mcp/measurement-quality` |
| `lab-v2-figma` | Figma, `/mcp/figma` |

The short General and Decisioning prefixes are intentional: keep qualified
tool names within 64 characters. Do not rename them to longer variants.

## How authentication and the domain work

```text
Public GitHub marketplace -> installs skill and connection definitions
Coworker personal secret -> X-AEP-Lab-Mcp-Key -> Lab MCP on Cloud Run
Lab MCP -> scoped Lab APIs and server-held downstream credentials
```

All connections use this existing host:
`https://aep-lab-profile-mcp-109406613852.us-central1.run.app`.
Each manifest references `${user_secrets.aep_lab_mcp_key}` for the
`X-AEP-Lab-Mcp-Key` header. The public repository contains the reference, not
the credential value.

V2 does **not** forward your Adobe IMS bearer token to that host and therefore
does not depend on the IMS-passthrough domain allowlist used by v1. This is not a
general network-policy bypass; normal Coworker connection policy still applies.
The earlier v1 discovery failure was not conclusively attributed to one cause.

"One key" means all 20 connections share one user's current key, not one key for
every user or sandbox. Changing that saved secret changes the identity/sandbox
scope used by all 20. The Lab's principal, sandbox and tool-specific checks
remain enforced. Snowflake and other services may still need the colleague's
separately configured Lab connection or product entitlements.

## Migrate from v1

Verify v2 first. To remove an existing personal v1 install:

1. Open **Customizations > User > Marketplaces > AEP-Orchestration-Lab-v1**.
2. In **Installed**, select only plugin **`aep-lab`**, then **Remove selected**.
   Wait until Installed is zero. Despite the marketplace-removal dialog's
   wording, Coworker can reject removal while its plugin is still installed.
3. Use **Remove** on that v1 marketplace and confirm its exact name.
4. Reload. Verify the v1 marketplace/skill are gone and v2 remains installed
   with skill `aep-lab-profile-mcp-v2` and its integrations.

Do not delete `aep_lab_mcp_key`, remove v2, revoke an in-use key, or delete
repository files. This is a per-user Coworker uninstall, not retirement of v1
for every colleague or removal of the Claude/Copilot packages.

## Troubleshooting

| Symptom | Next safe check |
|---|---|
| Ready, but no available plugin | Confirm the dedicated v2 repo and empty subdirectory; wait, then Sync once. |
| Installed, but skill or tools absent | Reload settings, verify `aep-lab-v2`, then start a new chat. Do not rely on an older chat's discovery result. |
| Missing or incorrect secret | Check the exact personal secret name and correct it in the Secrets UI. Never share its value in chat or logs. |
| HTTP 403 | Check the key, revocation status, principal, sandbox scope and connection identity. A generic 403 alone does not identify which layer rejected access. |
| HTTP 502 | Preserve the sanitized error and request/time context. A missing secret produced this during testing, but 502 is not proof of that cause. |
| Tools discovered, but a specific operation fails | Inspect that operation's permission/readiness error. Discovery is not proof of downstream access. |
| HTTP 404 after a server restart | Reinitialize/refresh the MCP connection. Never replay a mutation as part of reconnecting. |

Provide development with the marketplace repo/ref, plugin version, connection
name, timestamp, request ID if available, and sanitized error. Never include
tokens, header values, populated configuration exports or raw secret screens.

## Updates, removal and maintainer handoff

With ref `main`, Sync can discover newer repository content; refresh/update the
installed plugin and start a new chat. If an installed copy stays stale,
uninstall/reinstall only `aep-lab-v2`, retaining its marketplace and personal
secret. A commit-pinned install does not advance with Sync: change the ref, or
remove/re-add just that marketplace if the UI has no ref editor.

To uninstall v2, remove its installed plugin before removing its marketplace.
Only delete its personal secret if no remaining connection uses it.

The authoring source is [`tools/coworker-marketplace-v2`](../tools/coworker-marketplace-v2/README.md)
in this repository. Maintainers validate changes with Node 22:

```bash
node --test tools/aep-lab-profile-mcp/test/coworkerMarketplace.test.mjs
```

Publish only that credential-free package's contents at the distribution
repository root after authorized source publication/review. Record the source
commit in the distribution commit, preserve relative skill references, and
verify native discovery plus the read-only chat check. Changes in this
authoring repository do not automatically update the distribution repository.
Do not repoint the original Claude root marketplace. Package/documentation
changes do not require Firebase or Cloud Run deployment.

**Verified 19 November 2026, plugin 0.3.1:** root-repository install with an empty
subdirectory; all 20 native connection tests; v2 skill and bundled-reference
loading in Coworker; access-info and read-only demo-config inspection for the
test user's authorized `apalmer` sandbox. This does not certify every
colleague's entitlements, all downstream operations, or a dedicated revocation
test.
