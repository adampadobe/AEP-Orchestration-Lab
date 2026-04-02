# AEP Profile

Adobe Experience Platform (AEP) profile tools: authentication, query, ingestion, and Profile Viewer web app.

## Folders

| Folder | Description |
|--------|-------------|
| **00 Adobe Auth** | Adobe IMS authentication (token, config). Used by all other modules. |
| **01 Profile Query** | Scripts to query profiles, datasets, and schemas. |
| **02 Ingest Events** | Stream experience events to AEP via HTTP. |
| **03 Profile Viewer** | Web app: search profiles, view details, generate profiles, event generator. |

## Quick start

1. **Auth** – Configure `00 Adobe Auth/.env` with your Adobe I/O credentials.
2. **Profile Viewer** – From this folder:
   ```bash
   cd "03 Profile Viewer"
   copy .env.example .env
   # Edit .env with AEP_QUERY_PROFILE_DATASET_ID, AEP_PROFILE_STREAMING_URL, etc.
   npm start
   ```
3. Open **http://localhost:3333** in your browser.

See [03 Profile Viewer/README.md](./03%20Profile%20Viewer/README.md) for full setup.