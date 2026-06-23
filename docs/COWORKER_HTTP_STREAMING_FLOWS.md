# Coworker — HTTP streaming dataflows after Lab MCP setup

Adobe AI Coworker has **dx-api** (Experience Platform Flow Service) but no dedicated lab MCP tool for creating HTTP API ingestion flows. Use the **AEP Orchestration Lab MCP** for schema/field-group/dataset work, then **dx-api** for the Flow Service wiring.

## Division of labor

| Step | Tool | What it creates |
|------|------|-----------------|
| Schema + field groups + dataset | Lab MCP (`lab_provision_profile_infra_step`, `lab_enable_profile`) or Profile Viewer wizard | Catalog schema, attached FGs, Profile-enabled dataset |
| HTTP API streaming dataflow | **Coworker dx-api skill** (Flow Service API) | Base connection → source connection → target connection → dataflow |
| Save inlet URL + flow ID | Profile Viewer Profile generation page **or** `POST /api/{industry}-profile-connection` | Firestore connection doc the lab reads at generate time |

Lab MCP **does not** create Flow Service entities today. Steps `createSchema`, `attachFieldGroups`, and `createDataset` are automated; step `httpFlow` returns manual instructions — that gap is what dx-api fills.

## Flow Service sequence (dx-api)

Base URL: `https://platform.adobe.io/data/foundation/flowservice`

Headers on every call: `Authorization`, `x-api-key`, `x-gw-ims-org-id`, **`x-sandbox-name`** (your lab sandbox).

1. **Resolve connection spec** — `GET /connectionSpecs`; pick the **HTTP API streaming** source spec; record `connectionSpec.id`.
2. **Base connection** — `POST /connections` referencing the spec; store `baseConnectionId` (and `inletUrl` if returned).
3. **Source connection** — `POST /sourceConnections` linking `baseConnectionId` to the HTTP API source side.
4. **Target connection** — `POST /targetConnections` pointing at the **dataset** from MCP (`dataSetId` / equivalent per spec).
5. **Dataflow** — `POST /flows` wiring source → target with streaming schedule. Prefer idempotent **list-by-name** before create. Store **`flowId`** and DCS **inlet URL** (`https://dcs.adobedc.net/collection/...`).

Detailed API notes: [`docs/SCHEMA_SERVICE_MCP_PLAN.md`](SCHEMA_SERVICE_MCP_PLAN.md) §15.

## IDs and names to pass from Lab MCP

After `lab_provision_profile_infra_step` (steps `createSchema` / `attachFieldGroups` / `createDataset`) or `lab_profile_infra_status`:

| Field | Where to read it | Use in dx-api |
|-------|------------------|---------------|
| **Sandbox** | MCP `sandbox` argument | Header `x-sandbox-name` |
| **Schema `$id`** | Response `schemaId` or status `naming.schema` lookup | Source connection / mapping to XDM schema |
| **Dataset id** | Response `datasetId` | Target connection `dataSetId` |
| **Schema title** | Status `naming.schema` | Confirm correct catalog object |
| **Dataset name** | Status `naming.dataset` | Confirm target dataset |
| **Dataflow name** | Status `naming.httpDataflow` | Name the flow for idempotent reuse + Profile Viewer **Fetch URL & Flow ID** |
| **Tenant XDM key** | Response `xdmKey` (e.g. `_demoemea`) | Saved on Firestore connection as `streaming.xdmKey` |

Per-industry catalog names (when MCP has not run yet):

| Industry | Schema | Dataset | HTTP dataflow |
|----------|--------|---------|---------------|
| generic | AEP Lab - Generic Profile - Schema | AEP Lab - Generic Profile - Dataset | AEP Lab - Generic Profile - Dataflow |
| travel | AEP Lab - Travel Profile - Schema | AEP Lab - Travel Profile - Dataset | AEP Lab - Travel Profile - Dataflow |
| fsi | AEP Lab - FSI Profile - Schema | AEP Lab - FSI Profile - Dataset | AEP Lab - FSI Profile - Dataflow |
| retail | AEP Lab - Retail Profile - Schema | AEP Lab - Retail Profile - Dataset | AEP Lab - Retail Profile - Dataflow |
| telecom | AEP Lab - Telecom Profile - Schema | AEP Lab - Telecom Profile - Dataset | AEP Lab - Telecom Profile - Dataflow |
| media | AEP Lab - Media Profile - Schema | AEP Lab - Media Profile - Dataset | AEP Lab - Media Profile - Dataflow |
| sports | AEP Lab - Sports Profile - Schema | AEP Lab - Sports Profile - Dataset | AEP Lab - Sports Profile - Dataflow |

**Experience events** (Event tool): `lab_setup_event_infra` returns `schema_id` and `dataset_id` for schema **AEP Lab - Event Generic - Schema**. Event *sends* in the lab use **Edge datastreams** (`lab_save_event_datastream`), not HTTP API profile-style flows — only create an HTTP event flow if your demo explicitly needs DCS streaming for events. For Edge datastream creation via Coworker **dx-api**, see [`docs/COWORKER_EDGE_DATASTREAMS.md`](COWORKER_EDGE_DATASTREAMS.md).

## After dx-api creates the flow

1. Profile Viewer → **Profile generation** for that industry → **Fetch URL & Flow ID from AEP** (uses Flow Service lookup by dataflow name) → **Save connection**.
2. Or verify with **`lab_sandbox_profile_config`** — industry should show `ready: true` once `streaming.url`, `streaming.flowId`, `streaming.datasetId`, `streaming.schemaId`, and `streaming.xdmKey` are saved.
3. **`lab_preflight_profile_generate`** then **`lab_generate_profile`**.

## Related

- Coworker skill: `.cursor/skills/aep-lab-profile-mcp-coworker/SKILL.md`
- **Edge datastreams (Event tool):** [`docs/COWORKER_EDGE_DATASTREAMS.md`](COWORKER_EDGE_DATASTREAMS.md)
- MCP README: `tools/aep-lab-profile-mcp/README.md`
- MCP execution framework: `lab_get_execution_framework` → `workflows.http_streaming_dx_api`, `workflows.edge_datastream_dx_api`
