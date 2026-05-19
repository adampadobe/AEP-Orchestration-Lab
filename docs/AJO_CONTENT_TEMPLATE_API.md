# Adobe Journey Optimizer — HTML content templates (API)

This note explains how we **create** Journey Optimizer **content templates** of type `html` (email) against `platform.adobe.io`, and how to avoid a recurring pitfall: **invalid or duplicate `Content-Type` headers**.

## Policy — create templates and fragments against AEP directly

When **creating or updating** Journey Optimizer **content templates** or **content fragments**, do **not** implement that flow through **Firebase** (no new Cloud Function whose job is to POST/PATCH authoring objects to AJO for this lab’s workflows).

Instead, call **`https://platform.adobe.io`** from **this machine** (terminal): use **`npm run ajo:create-content-template`** for HTML email templates, **`curl`** with a bearer token, or a small **Node/Python script** in `scripts/` (same pattern as Campaign Orchestration’s `07_AEP_Content_Fragments_Templates/`). Load IMS credentials from **`~/.config/adobe-ims/credentials.env`** (or env vars), mint **`client_credentials`** access tokens, and send the correct vendor **`Content-Type` / `Accept`** headers for the AJO content APIs.

**Rationale:** keeps authoring off the hosted surface, avoids coupling deploys to template experiments, and sidesteps header/proxy edge cases. Firebase Functions in this repo remain for **hosted lab features** (Profile Viewer, proxies the product needs in the browser); they are not the default pipe for bulk AJO authoring.

### Confidentiality (template metadata vs HTML body)

The **email HTML body** may use personalised, scenario, or brand-specific copy when you are building a realistic demo. In AJO and other UIs, fields such as **template `name`**, **`description`**, and (for `templateType` **content**) the **default `subject`** are often visible to people who should not infer which customers or competitors a sandbox is tied to.

For lab-created templates, keep **`name`**, **`description`**, and **default `subject`** (when applicable) **generic and operational** (for example the defaults in `scripts/create-ajo-content-template.mjs`). Put customer- or brand-specific wording in the **HTML body** (or journey/personalisation), not in those metadata defaults. Use the script’s **`--name`**, **`--description`**, and **`--subject`** flags only for **private/local** overrides when you need identifiable labels in your own sandbox.

**Fragments API base:** `https://platform.adobe.io/ajo/content/fragments` — use Adobe’s documented fragment media types and schemas (same direct-to-AEP rule).

## Endpoint and media type

- **URL:** `POST https://platform.adobe.io/ajo/content/templates`
- **Request `Content-Type` (exactly one value):** `application/vnd.adobe.ajo.template.v1+json`
- **Body:** JSON matching Adobe’s content-template schema (see [Journey Optimizer — Content templates API](https://developer.adobe.com/journey-optimizer-apis/) → content templates).

Minimal shape for an HTML email template:

```json
{
  "name": "My template name",
  "description": "Operational description (generic for demos; no customer/brand names, recipient names, or PII)",
  "templateType": "html",
  "channels": ["email"],
  "source": { "origin": "ajo", "metadata": {} },
  "template": {
    "html": "<!DOCTYPE html><html>…</html>",
    "editorContext": {}
  }
}
```

**List templates (GET):** send header `Accept: application/vnd.adobe.ajo.template-list.v1+json`.  
**Fetch one template (GET by id):** send header `Accept: application/vnd.adobe.ajo.template.v1+json`.

## Required HTTP headers (besides `Content-Type`)

Use the same pattern as any other Platform API call:

| Header | Value |
|--------|--------|
| `Authorization` | `Bearer <IMS access_token>` |
| `x-api-key` | OAuth client id (same as IMS `client_id` used for token) |
| `x-gw-ims-org-id` | IMS org id (e.g. `…@AdobeOrg`) |
| `x-sandbox-name` | Technical sandbox name (e.g. `apalmer`) |

IMS token: **client_credentials** against `ims-na1.adobelogin.com/ims/token/v3` (or your org’s token URL) with scopes that include Platform / AJO access — same credentials as the rest of this lab (`~/.config/adobe-ims/credentials.env` or Firebase secrets for deployed functions).

## Recommended ways to create templates from this repo

### 1. Local script (preferred for one-off HTML files)

Uses a **single** `Content-Type` and reads credentials the same way as other repo scripts:

```bash
npm run ajo:create-content-template -- \
  --html web/profile-viewer/premier-inn/hotel-hlv-reactivation-email.html \
  --sandbox apalmer

# Update an existing template in AJO by exact name (GET + If-Match + PUT):
npm run ajo:create-content-template -- \
  --html web/profile-viewer/premier-inn/hotel-hlv-reactivation-email.html \
  --sandbox apalmer --upsert

# Channel email with templateType **content** (email-variant-detail: subject + html.body):
npm run ajo:create-content-template -- \
  --html web/profile-viewer/premier-inn/hotel-hlv-reactivation-email.html \
  --sandbox apalmer --template-type content
```

Optional: `--name "…"`, `--description "…"`, and for `--template-type content` also `--subject "…"`. Prefer **generic, operational** wording in those fields for shared demos (see [Confidentiality (template metadata vs HTML body)](#confidentiality-template-metadata-vs-html-body) above); **no** customer or brand names, **no** recipient names or PII in `description`. The HTML file may still contain personalised body copy. Omit these flags to use the script’s demo-safe defaults, or set them for **local/private** sandbox labelling only.

Implementation: `scripts/create-ajo-content-template.mjs`.

### 2. Campaign Orchestration reference (historical / batch)

The lab’s earlier **Premier League** (and other) templates were created with Python under the separate **Campaign Orchestration** tree, for example:

`AI Projects/Campaign Orchestration/07_AEP_Content_Fragments_Templates/2025-11-06_AJO_Content_Templates/create_content_templates.py`

That script sets only `Content-Type: application/vnd.adobe.ajo.template.v1+json` and posts JSON — same contract as above.

## Using `/api/aep` (Cloud Function `aepProxy`) — optional

The hosted **POST `/api/aep`** proxy is for **in-browser** or **app-integrated** Platform calls from the lab UI. For **creating** AJO content templates or fragments, follow the **policy above** (terminal → AEP). If you still use `/api/aep` for a template create (e.g. a quick browser test), it must send **at most one** `Content-Type` value.

When you pass a custom type in `platform_headers`, use the key **`content-type`** (lowercase is fine). The proxy **collapses** `content-type` / `Content-Type` into a single `Content-Type` header before calling `fetch`, so Adobe does not see a merged invalid MIME like:

`application/vnd.adobe.ajo.template.v1+json, application/json`

Implementation: `functions/index.js` (`aepProxy` — look for the comment about collapsing `Content-Type`).

Example body to the lab proxy:

```json
{
  "method": "POST",
  "path": "/ajo/content/templates",
  "platform_headers": {
    "content-type": "application/vnd.adobe.ajo.template.v1+json"
  },
  "json": {
    "name": "My template",
    "description": "…",
    "templateType": "html",
    "channels": ["email"],
    "source": { "origin": "ajo", "metadata": {} },
    "template": { "html": "<!DOCTYPE html><html><body>…</body></html>", "editorContext": {} }
  }
}
```

If you omit `platform_headers.content-type` for this POST, the proxy defaults to `application/json`, which is **wrong** for this AJO endpoint.

## Local AEP lab Adobe MCP

The stdio MCP server (`tools/aep-lab-adobe-mcp/`) uses the same **Content-Type collapse** logic as `aepProxy`. Restart the MCP process after pulling changes so tooling picks up fixes.

If you add new code paths that set request headers, **never** set both lowercase `content-type` and `Content-Type` to different values on the same outbound request.

## Adobe error you should recognize

- **`InvalidMediaTypeException`** / message containing **`Invalid token character ',' in token`**  
  → Almost always **two `Content-Type` values** on one request. Fix header construction, not the JSON body.

## AJO export zip vs what the lab script sends

When you **export** an email template from the AJO UI, the zip is typically a single **`index.html`** plus an **`images/`** folder. That HTML is a **full document** produced by AJO’s html-converter (for example `<meta name="content-generated" content="html-converter">`, `acr-structure` / `acr-fragment` wrappers, and optional `data-source-uuid` on nodes). It is **not** the same string as `template.html.body` for `templateType: **content**`, which must be **inner body markup only** (no `<!DOCTYPE>`, no outer `<html>…</html>`). Putting a full document into `template.html.body` is a common way to hit **simulation / rendering errors** (for example **CJMRT-130015** / HTTP 400 on preview paths). A normal export therefore does **not** prove that failure mode: exports are expected to be one complete document; the break is usually **API payload shape** (full doc inside the **body** field), not the fact that AJO stores canonical converter HTML for **`templateType: html`**.

To **push disk HTML to an existing template by id** (no name list):  
`npm run ajo:create-content-template -- --html <path> --sandbox <name> --template-id <uuid>`  
(uses GET + `If-Match` + PUT — see `scripts/create-ajo-content-template.mjs`).

## Related files in this repo

| File | Role |
|------|------|
| `scripts/create-ajo-content-template.mjs` | CLI: token + POST; `--upsert` (by name) or `--template-id` (PUT by id); `--template-type content` strips `<body>` for `template.html.body` |
| `functions/index.js` | `aepProxy`: single `Content-Type` for POST/PUT/PATCH |
| `tools/aep-lab-adobe-mcp/src/server.mjs` | MCP platform request: same collapse |
