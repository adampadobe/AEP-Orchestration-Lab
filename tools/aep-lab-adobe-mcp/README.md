# AEP Lab Adobe MCP

Local stdio MCP for the AEP Orchestration Lab. It uses one Adobe IMS OAuth
server-to-server credential for Experience Platform calls and for the attached
Adobe Commerce as a Cloud Service API.

## Commerce configuration

Copy `.env.mcp.example` to the gitignored `.env.mcp`. Set the REST and GraphQL
URLs shown by Commerce Cloud Manager's instance information panel:

```dotenv
ADOBE_COMMERCE_REST_ENDPOINT=https://na1-sandbox.api.commerce.adobe.com/YOUR_INSTANCE_ID
ADOBE_COMMERCE_GRAPHQL_ENDPOINT=https://na1-sandbox.api.commerce.adobe.com/YOUR_INSTANCE_ID/graphql
ADOBE_COMMERCE_STORE=default
```

The configured OAuth credential must have the **Adobe Commerce as a Cloud
Service** API attached. Token requests automatically include `commerce.accs`,
`org.read`, and the required IMS identity scopes. Tokens and client secrets are
never returned by MCP tools.

## Commerce demo-prep tools

The first release is intentionally read-only:

| Tool | Purpose |
|---|---|
| `commerce_access_info` | Verify tenant, org access, stores, region, and environment |
| `commerce_capabilities` | Discover the supported safe workflow |
| `commerce_store_configs` | List store-view configuration |
| `commerce_catalog_summary` | Product count, small sample, and category tree |
| `commerce_product_search` | Bounded name/SKU search |
| `commerce_product_get` | Fetch one exact SKU |
| `commerce_category_tree` | Browse bounded category hierarchy |
| `commerce_inventory_status` | Read stock status for one SKU |
| `commerce_graphql_query` | Run read-only storefront queries; mutations are rejected |

REST calls are fixed to `GET /V1/*` and require the IMS bearer token. Storefront
GraphQL queries use the ACCS GraphQL endpoint without forwarding the
server-to-server token; protected customer operations are outside this phase.

Future catalog imports or cleanup must follow inspect → preview → exact
confirmation → one idempotent apply → readback verification.

## Run and test

```bash
npm test --prefix tools/aep-lab-adobe-mcp
npm run mcp:aep-lab-adobe
```
