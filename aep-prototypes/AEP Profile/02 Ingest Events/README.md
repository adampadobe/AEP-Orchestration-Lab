# Ingest experience events (API Operational Events schema)

Sends experience events to Adobe Experience Platform using the **API Operational Events** schema and tenant **\_demoemea** (XDM_TENANTID_PLACEHOLDER = `demoemea`).

- **Schema ID:** `https://ns.adobe.com/demoemea/schemas/9bc433dd59aeea8231b6d1a25a9d1f6de0cd3ea609aa1ebb`
- **Primary identity:** `/_demoemea/identification/core/email` (Email namespace)
- **Required fields per event:** `@id`, `xdm:timestamp`

## Event payload structure (ExperienceEvent Core v2.1)

Each event must conform to the schema:

| Location | Fields |
|----------|--------|
| Root | `identityMap` (Email primary), `@id`, `_id`, `xdm:timestamp` (or `timestamp`) |
| `_demoemea.identification.core` | `email`, `crmId`, `ecid`, `loyaltyId`, `phoneNumber` |
| `_demoemea.demoEnvironment` | `brandName`, `brandIndustry`, `brandLogo`, `ldap`, `tms` |
| `_demoemea.interactionDetails.core` | `form` (name, category, action), `channel`, `campaignChannel` |
| `_demoemea.loyaltyDetails` | `level` (optional) |
| Root | `commerce`, `productListItems` |
| `productListItems[]._demoemea.core` | `description`, `imageURL`, `mainCategory`, `productURL`, `subCategory` |

The script normalizes events (e.g. copies `timestamp` → `xdm:timestamp`, moves root `loyaltyDetails` into `_demoemea`) before sending.

## Mortgage purchase events

The sample file `events/mortgage-purchase-events.json` contains three events for **kirkham+media-1@adobetest.com**:

1. **Mortgage product viewed** – eligibility check started, product view (5 Year Fixed Rate Mortgage).
2. **Mortgage application submitted** – form submit for “Mortgage Application”.
3. **Mortgage purchased** – order completed (purchaseID, payments, productListItems).

All events use the same JSON structure as the schema: `_demoemea.identification.core`, `_demoemea.demoEnvironment`, `_demoemea.interactionDetails.core` (form, channel, campaignChannel), `_demoemea.loyaltyDetails`, `commerce`, `productListItems` with `_demoemea.core` (mainCategory, subCategory, description, productURL, imageURL).

## Prerequisites

- A dataset in AEP created from the schema above (and enabled for Profile/Identity if you want the events on the profile).
- Auth configured in `../00 Adobe Auth` (`.env` or vault).

## Usage

From the `02 Ingest Events` folder:

### HTTP Streaming (recommended – uses your dataflow)

Uses your HTTP dataflow collection endpoint. One event per POST; auth from `00 Adobe Auth`.

```bash
# Send the 3 mortgage events (uses built-in payloads if file is missing/partial)
node ingest-events-streaming.js

# Send events from an NDJSON file (one event per line)
node ingest-events-streaming.js path/to/events.json
```

Endpoint and flow are set in the script: collection URL, `x-adobe-flow-id`, `datasetId`, `sandbox-name: kirkham`.

### Batch ingestion (file upload)

```bash
# Ingest default mortgage events (events/mortgage-purchase-events.json)
node ingest-events.js

# Ingest a specific file (one XDM event per line, NDJSON)
node ingest-events.js path/to/events.json
```

**Optional env:**

- `AEP_DATASET_ID` – dataset ID for the API Operational Events schema. If not set, the script looks up a dataset by schema ID via the Catalog API.

## Streaming vs batch

- **Streaming** (`ingest-events-streaming.js`): POSTs each event to `https://dcs.adobedc.net/collection/{connectionId}` with the header/body format (schemaRef, imsOrgId, datasetId, source; xdmMeta + xdmEntity). Uses Bearer token from `00 Adobe Auth`. Best when you have an HTTP dataflow already set up.
- **Batch** (`ingest-events.js`): Creates a batch, uploads an NDJSON file, completes the batch. Data typically appears in the Data Lake and Profile within about 15 minutes.
