# Adobe Journey Optimizer — HTML content templates (API)

This note explains how we **create** Journey Optimizer **content templates** of type `html` (email) against `platform.adobe.io`, and how to avoid a recurring pitfall: **invalid or duplicate `Content-Type` headers**.

## Endpoint and media type

- **URL:** `POST https://platform.adobe.io/ajo/content/templates`
- **Request `Content-Type` (exactly one value):** `application/vnd.adobe.ajo.template.v1+json`
- **Body:** JSON matching Adobe’s content-template schema (see [Journey Optimizer — Content templates API](https://developer.adobe.com/journey-optimizer-apis/) → content templates).

Minimal shape for an HTML email template:

```json
{
  "name": "My template name",
  "description": "Short description",
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
```

Optional: `--name "…"` and `--description "…"`.

Implementation: `scripts/create-ajo-content-template.mjs`.

### 2. Campaign Orchestration reference (historical / batch)

The lab’s earlier **Premier League** (and other) templates were created with Python under the separate **Campaign Orchestration** tree, for example:

`AI Projects/Campaign Orchestration/07_AEP_Content_Fragments_Templates/2025-11-06_AJO_Content_Templates/create_content_templates.py`

That script sets only `Content-Type: application/vnd.adobe.ajo.template.v1+json` and posts JSON — same contract as above.

## Using `/api/aep` (Cloud Function `aepProxy`)

The hosted **POST `/api/aep`** proxy forwards to `platform.adobe.io` and must send **at most one** `Content-Type` value.

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

## Related files in this repo

| File | Role |
|------|------|
| `scripts/create-ajo-content-template.mjs` | CLI: token + POST template |
| `functions/index.js` | `aepProxy`: single `Content-Type` for POST/PUT/PATCH |
| `tools/aep-lab-adobe-mcp/src/server.mjs` | MCP platform request: same collapse |
