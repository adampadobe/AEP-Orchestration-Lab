# Fake AJO Loyalty reward provider

Public HTTPS stub that accepts **reward fulfillment** calls from Adobe Journey Optimizer **Loyalty Challenges** (private beta). AJO calls your registered URL when a member earns a reward; this service logs the payload and returns an acceptance response.

This is **not** the same as AJO **Integrations** (read-only personalization). Fulfillment requires a write endpoint you control.

## Deployed service

**Cloud Run (aep-orchestration-lab, us-central1):**

```
https://fake-loyalty-provider-a5xduykcsq-uc.a.run.app
```

- Health: `GET /health`
- Fulfillment (register in AJO): `POST /v1/fulfill`

`FAKE_LOYALTY_API_KEY` is configured on the Cloud Run revision (not in git). Set the same value in AJO Loyalty admin headers when registering the provider.

| Endpoint | Method | Auth | Response |
|----------|--------|------|----------|
| `/health` | GET | None | `{ "status": "ok" }` |
| `/v1/fulfill` | POST | Header `X-API-Key` | `{ "status": "accepted", "transactionId": "<uuid>" }` |
| `/oauth/token` | POST | Optional client-credentials body | `{ "access_token", "expires_in": 3600 }` |

Idempotency: send `Idempotency-Key` or `x-idempotency-key`; duplicate keys return the same `transactionId`.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FAKE_LOYALTY_API_KEY` | Yes (prod) | Shared secret AJO sends in `X-API-Key`. **Set via env/Secret Manager — never commit.** |
| `PORT` | No | Listen port (default `8080`; Cloud Run sets this) |

Generate a key locally:

```bash
openssl rand -hex 32
```

## Local development

```bash
cd tools/fake-loyalty-provider
npm install
export FAKE_LOYALTY_API_KEY='your-local-test-key'
npm start
```

Smoke tests:

```bash
npm test
# or from repo root:
npm run fake-loyalty:test
```

## Deploy to Cloud Run

GCP project: **`aep-orchestration-lab`**, region: **`us-central1`**.

```bash
export FAKE_LOYALTY_API_KEY='your-secret'
npm run fake-loyalty:deploy
```

Or:

```bash
FAKE_LOYALTY_API_KEY='your-secret' node tools/fake-loyalty-provider/deploy-cloud-run.mjs
```

Requires `gcloud` authenticated with deploy permissions on the project.

## Register in AJO Loyalty admin (UI)

1. Open **Journey Optimizer → Loyalty admin → Reward providers → Create**.
2. **Name:** `AEP Lab Fake Loyalty` (or similar).
3. **URL:** `https://<your-cloud-run-host>/v1/fulfill`
4. **Header:** `X-API-Key` = same value as `FAKE_LOYALTY_API_KEY`.
5. Add a **reward definition** (e.g. denomination `Points`, key `points`).
6. Optional **auth token generator:** `https://<host>/oauth/token` with token key `access_token`.

Match **Global settings → identity namespace** to lab profiles (`loyaltyId` is generated in Profile Viewer — see `docs/AJO_LOYALTY_CHALLENGES.md`).

## Register via API (script)

From repo root (credentials in `~/.config/adobe-ims/credentials.env`):

```bash
export FAKE_LOYALTY_API_KEY='same-secret-as-cloud-run'
npm run ajo:loyalty-register-provider -- \
  --url https://<your-cloud-run-host>/v1/fulfill \
  --sandbox apalmer
```

## curl examples

Health:

```bash
curl -sS "https://<host>/health"
```

Fulfillment (synthetic):

```bash
curl -sS -X POST "https://<host>/v1/fulfill" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $FAKE_LOYALTY_API_KEY" \
  -H "Idempotency-Key: demo-001" \
  -d @tools/fake-loyalty-provider/fixtures/sample-fulfillment.json
```

OAuth token generator (if configured in AJO admin):

```bash
curl -sS -X POST "https://<host>/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials"
```

## Fulfillment payload

Adobe’s exact JSON shape is not fully documented in public beta docs. This provider **logs the raw body** so you can capture real traffic and update `fixtures/sample-fulfillment.json`.

## Related docs

- [docs/AJO_LOYALTY_CHALLENGES.md](../../docs/AJO_LOYALTY_CHALLENGES.md) — sandbox setup, API scripts, profile alignment
- [OpenAPI: loyalty-challenges.yaml](https://github.com/AdobeDocs/journey-optimizer-apis/blob/main/static/loyalty-challenges.yaml)
