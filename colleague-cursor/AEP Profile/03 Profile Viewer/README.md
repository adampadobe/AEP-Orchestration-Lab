# AEP Profile Viewer

Local web app to search and view Adobe Experience Platform profiles.

## Recommended setup

1. **Auth** – Use the same `.env` as the rest of the project (in `00 Adobe Auth`). Ensure `00 Adobe Auth/.env` has your Adobe I/O credentials and `ADOBE_SANDBOX_NAME` (e.g. `kirkham`).

2. **Search dataset** – In this folder, copy the example env and set the profile dataset:
   ```bash
   cd "03 Profile Viewer"
   copy .env.example .env
   ```
   Edit `.env` and set:
   - **`AEP_QUERY_PROFILE_DATASET_ID`** = `demo_system_website_profile_dataset_global_v1_2`  
   (or your profile dataset name/ID). Search uses `_demoemea.identification.core.email` with a **contains** (LIKE) query.

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Open in your browser:**
   - **http://localhost:3333** — Look up by email  
   - **http://localhost:3333/search.html** — Search profiles (partial email, e.g. "media" or "kirkham")

Do **not** open the HTML files with Live Server or via `file://`; the API only works when the page is served from this server.

## Search (AEP Query Service, contains)

Search runs against AEP Query Service: a SQL query with `LIKE '%searchterm%'` on `_demoemea.identification.core.email` in the dataset you set.

- **`AEP_QUERY_PROFILE_DATASET_ID`** — Required. Dataset name or ID (e.g. `demo_system_website_profile_dataset_global_v1_2`). Quoted in SQL so IDs starting with a digit work.
- **`AEP_QUERY_SEARCH_SQL`** — Optional. Custom SQL; use `$search` for the term and `$table` for the quoted table. Default uses `_demoemea.identification.core.email` and `LIKE '%' || $search || '%'` (case-insensitive).

The Query Service API may not return result rows in the response; if the query stays SUBMITTED or returns only metadata, the app shows a message. Running the same query in AEP Query Editor will show results there.

## Profile attribute updates (streaming)

The **Update profile** button on the Profile Viewer sends changed attributes to AEP using **streaming ingestion with Data Prep merge**. That way only the edited fields are updated and the rest of the profile is left unchanged.

### Steps to set up streaming profile updates

1. **Create an HTTP API source (if you don’t have one)**  
   In AEP: **Sources** → **Catalog** → **Adobe** (or **Streaming**) → **HTTP API**. Create a new connection and name it (e.g. “Profile updates”). Save. You’ll get a **streaming ingestion URL** (collection URL) like `https://dcs.adobedc.net/collection/XXXXXXXX` — copy the full URL.

2. **Create a dataflow from that source**  
   Open your HTTP API source → **Set up dataflow**. Choose the **Profile** dataset (or the dataset that backs your profile). Configure the **Data Prep mapping**: map incoming fields to your profile schema (e.g. `identityMap`, `_demoemea.*`). Save/run the dataflow.

3. **Get the Dataflow ID and Dataset ID**  
   In the dataflow, open **API Usage** (or the flow’s details). Note:
   - **Dataflow ID** (e.g. `138c3dc7-85f8-4f51-9ac2-37b61004f2a2`)
   - **Dataset ID** (e.g. `67fcd98bfbb6632aee0c6b2e`)

4. **Configure the app**  
   In `03 Profile Viewer/.env` set (same values you use in Postman):
   - **`AEP_PROFILE_STREAMING_URL`** = the collection URL (e.g. `https://dcs.adobedc.net/collection/...`)
   - **`AEP_PROFILE_FLOW_ID`** = the Dataflow ID (`x-adobe-flow-id` in Postman)
   - **`ADOBE_SANDBOX_NAME`** (in `00 Adobe Auth/.env`) = sandbox for `sandbox-name` (e.g. `kirkham`)
   - Optional: **`AEP_PROFILE_STREAMING_API_KEY`** if Postman’s `x-api-key` is not your OAuth client ID

   **Envelope mode (optional):** only if your dataflow requires DCS envelope instead of bare JSON, set **`AEP_PROFILE_STREAMING_ENVELOPE=1`** and then **`AEP_PROFILE_DATASET_ID`** / **`AEP_PROFILE_SCHEMA_ID`** as in your dataflow.

5. **Restart the server**  
   Stop and start `npm start` in `03 Profile Viewer` so the new env vars are loaded.

6. **Use Update profile in the app**  
   - Open **Profile Viewer** (http://localhost:3333).  
   - Enter an email and click **Get profile**.  
   - In the table, edit one or more attribute values.  
   - Click **Update profile**.  
   The app sends a **POST** to your DCS URL with the same headers as Postman (`Content-Type`, `sandbox-name`, `x-adobe-flow-id`, `Authorization`, `x-api-key`) and a **body** with **`_demoemea`** (identification, tenant fields), **`consents`** / **`optInOut`**, and root mixins when used (**`loyalty`**, **`telecomSubscription`**, **`person`**, addresses, phones). Retail/travel fields are under **`_demoemea.individualCharacteristics`**. See **`schema/operational-profile-schema-sample.json`**. Refresh the profile to see changes.

### Payload shape (for reference)

- **Default (Postman-style):** bare JSON with **`_demoemea`** plus **`consents`** and **`optInOut`** (and optional root mixins such as **`loyalty`**, **`telecomSubscription`**) — no DCS `header`/`body` wrapper unless you enable envelope mode. Dataset/schema IDs are not in the body for bare mode.
- **Envelope:** set **`AEP_PROFILE_STREAMING_ENVELOPE=1`** to send `header` + `body.xdmEntity` (and use **`AEP_PROFILE_DATASET_ID`** / **`AEP_PROFILE_SCHEMA_ID`** as in your dataflow).

Env: **`AEP_PROFILE_STREAMING_URL`** and **`AEP_PROFILE_FLOW_ID`** (required for Update profile), optional **`AEP_PROFILE_STREAMING_API_KEY`**, **`AEP_PROFILE_XDM_KEY`**, **`AEP_PROFILE_DATASET_ID`**, **`AEP_PROFILE_SCHEMA_ID`**, **`AEP_PROFILE_STREAMING_ENVELOPE`**.

## Requirements

- Node.js
- `.env` (or Azure Key Vault) configured for `00 Adobe Auth` (same as the rest of the AEP Profile project)
