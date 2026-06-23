# Coworker — Edge datastreams after Lab MCP event infra

Adobe AI Coworker has **dx-api** (Edge Configuration / Datastream API) but no lab MCP tool that creates datastreams. Use the **AEP Orchestration Lab MCP** for ExperienceEvent schema + dataset, then **dx-api** for the Edge datastream, then **lab MCP** to persist the ID for Event tool sends.

## Division of labor

| Step | Tool | What it creates |
|------|------|-----------------|
| ExperienceEvent schema + field groups + dataset | Lab MCP `lab_setup_event_infra` (or Event tool **Set up event infrastructure**) | Catalog schema **AEP Lab - Event Generic - Schema**, dataset **AEP Lab - Event Generic - Dataset** |
| Profile enable (identityMap alternate primary) | Lab MCP `lab_enable_event_profile` or `lab_setup_event_infra` with `enable_for_profile:true` | Schema union tag + dataset `unifiedProfile` |
| Edge datastream + AEP extension | **Coworker dx-api** (Edge Configuration API) | Datastream mapped to event schema + dataset |
| Save datastream ID for lab sends | Lab MCP `lab_save_event_datastream` or Event tool **Save configuration** | Firestore `eventEdgeConfig` → preset `lab-event-tool-edge` |

Lab MCP **does not** create Edge datastreams today. The Cloud Function probes `edge.adobe.io` but UI/Data Collection (or Coworker dx-api) is the supported path.

**Not the same as profile HTTP flows:** Event tool sends use **Edge** (`POST https://server.adobedc.net/ee/v2/interact?dataStreamId=…`), not Flow Service DCS inlet URLs. See [`docs/COWORKER_HTTP_STREAMING_FLOWS.md`](COWORKER_HTTP_STREAMING_FLOWS.md) for profile-class HTTP API dataflows only.

## Lab MCP first — schema and dataset

```text
lab_setup_event_infra sandbox {sandbox}
lab_enable_event_profile sandbox {sandbox}
# or one shot:
lab_setup_event_infra sandbox {sandbox} enable_for_profile true
```

Capture from the response:

| Field | Example | Use in dx-api |
|-------|---------|---------------|
| **Sandbox** | `prisacar` | Header `x-sandbox-name` |
| **schema_id** | `https://ns.adobe.com/…/schemas/…` | `mappingSchemaId` + AEP service `datasets[].schema` |
| **dataset_id** | UUID | AEP service `datasets[].id` |
| **schema_title** | `AEP Lab - Event Generic - Schema` | Confirm correct catalog object |
| **dataset_name** | `AEP Lab - Event Generic - Dataset` | Confirm target dataset |

Verify with `lab_get_event_config` — `has_datastream` is false until step 4 below.

## Coworker dx-api — create Edge datastream

Base URL (v2): `https://edge.adobe.io/ee/v2/datastreamConfigs`

Headers on every call: `Authorization`, `x-api-key`, `x-gw-ims-org-id`, **`x-sandbox-name`** (lab sandbox).

### Sequence

1. **List** — `GET /ee/v2/datastreamConfigs` — check for an existing datastream named e.g. `AEP Lab - Event Generic - Datastream` (idempotent reuse).
2. **Create** — `POST /ee/v2/datastreamConfigs` with payload shaped like the lab’s working probe (see below).
3. **Copy** the returned datastream / Edge configuration **ID** (UUID).

### Required AEP service mapping

Enable **Adobe Experience Platform** and map the Event tool dataset to the Event tool schema:

```json
{
  "title": "AEP Lab - Event Generic - Datastream",
  "name": "AEP Lab - Event Generic - Datastream",
  "description": "Event tool — created via Coworker dx-api for AEP Orchestration Lab",
  "mappingSchemaId": "<schema_id from lab_setup_event_infra>",
  "services": [
    {
      "name": "Adobe Experience Platform",
      "enabled": true,
      "settings": {
        "datasets": [
          {
            "id": "<dataset_id from lab_setup_event_infra>",
            "schema": "<schema_id from lab_setup_event_infra>"
          }
        ]
      }
    }
  ]
}
```

Reference implementation: `functions/eventEdgeService.js` → `createDatastreamConfig` (same payload the lab tries when `createDatastream` infra step is invoked).

### Recommended optional services (Web SDK / anonymous demos)

| Service | When to enable |
|---------|----------------|
| **Experience Cloud ID Service** (Identity) | Web SDK / Tags demos that need ECID from Alloy |
| **Real-time Customer Profile** | When schema + dataset are Profile-enabled (`lab_enable_event_profile`) — events update UPS |
| **Adobe Journey Optimizer** | Only if you route AJO Edge personalization on the same datastream |

Event tool **direct Edge sends** (`lab_send_profile_event` → `lab-event-tool-edge`) need the **AEP** service with the correct dataset; Profile service helps once `enable_for_profile` ran.

## Lab MCP last — save and verify

```text
lab_save_event_datastream sandbox {sandbox} datastream_id {uuid} \
  schema_id {schema_id} schema_title "AEP Lab - Event Generic - Schema" \
  dataset_name "AEP Lab - Event Generic - Dataset"
lab_list_event_targets sandbox {sandbox}
lab_preflight_profile_event sandbox {sandbox} email … ecid …
lab_send_profile_event … target_id lab-event-tool-edge
```

`lab_list_event_targets` should show preset **`lab-event-tool-edge`** with `dataStreamId` and `transport: edge`.

Portal alternative: [Event tool](https://aep-orchestration-lab.web.app/profile-viewer/event-tool.html) → Step 2 → paste ID → **Save configuration**.

## What the Event tool expects

Firestore doc `eventEdgeConfig/{sandbox}` (shared) stores:

- **`datastreamId`** (required) — Edge configuration UUID used in `?dataStreamId=` on interact
- **`schemaId`**, **`schemaTitle`**, **`datasetName`** (metadata for UI + event-type discovery)
- **`datastreamTitle`** (optional label)

Sends use `POST https://server.adobedc.net/ee/v2/interact?dataStreamId={datastreamId}` with full XDM (`identityMap`, `_demoemea.identification.core`, `eventType`, etc.) — see `docs/ANONYMOUS_EDGE_DEMO_PATTERN.md`.

Profile enable: schema must use **alternate primary identity** from `identityMap` per event; run `lab_enable_event_profile` before relying on UPS event counts.

## Paste-ready Coworker prompt

> **Event tool datastream for sandbox `{sandbox}`**
>
> 1. Call **lab_setup_event_infra** for sandbox `{sandbox}` with **enable_for_profile** true. Save **schema_id**, **dataset_id**, **schema_title**, **dataset_name**.
> 2. Using **dx-api** (Edge Configuration API, header **x-sandbox-name: {sandbox}**): list datastreams; if none named **AEP Lab - Event Generic - Datastream**, **POST** to `https://edge.adobe.io/ee/v2/datastreamConfigs` with **mappingSchemaId** = schema_id and **Adobe Experience Platform** service **datasets** `[{ "id": dataset_id, "schema": schema_id }]`. Enable Identity + Profile services if this datastream will back Web SDK demos.
> 3. Call **lab_save_event_datastream** with **datastream_id** from step 2 plus schema/dataset metadata from step 1.
> 4. **lab_list_event_targets** — confirm **lab-event-tool-edge** has **dataStreamId**. Then **lab_generate_profile** → **lab_send_profile_event** with email + ecid.

## Related

- Coworker skill: `.cursor/skills/aep-lab-profile-mcp-coworker/SKILL.md` → Workflow 5c
- MCP execution framework: `lab_get_execution_framework` → `workflows.event_infra_setup`, `workflows.edge_datastream_dx_api`
- Profile HTTP flows (different path): [`docs/COWORKER_HTTP_STREAMING_FLOWS.md`](COWORKER_HTTP_STREAMING_FLOWS.md)
- Anonymous Web SDK pattern: [`docs/ANONYMOUS_EDGE_DEMO_PATTERN.md`](ANONYMOUS_EDGE_DEMO_PATTERN.md)
