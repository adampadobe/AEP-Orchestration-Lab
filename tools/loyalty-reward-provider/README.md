# AJO Loyalty reward provider

Sandbox-aware public HTTPS **reward fulfillment gateway** for Adobe Journey Optimizer **Loyalty Challenges** (private beta). AJO calls your registered URL when a member earns a reward; this lab service accepts the fulfillment payload, logs it to an in-memory ledger, and returns an acceptance response.

This is **not** AJO **Integrations** (read-only personalization). Fulfillment requires a write endpoint you control.

## Architecture

Single Cloud Run service **`loyalty-reward-provider`** with **path-based sandboxes**:

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/health` | GET | None | Service health |
| `/{sandbox}/health` | GET | None | Sandbox ledger stats |
| `/{sandbox}/v1/fulfill` | POST | `X-API-Key` | **Register this URL in AJO** |
| `/{sandbox}/v1/ledger` | GET | `X-API-Key` | Lab ledger (via Firebase proxy) |
| `/oauth/token` | POST | Optional | OAuth token generator stub |
| `/v1/fulfill` | POST | `X-API-Key` | Legacy — defaults to `apalmer` |

Example fulfillment URL for **apalmer** sandbox:

```
https://loyalty-reward-provider-<hash>-uc.a.run.app/apalmer/v1/fulfill
```

Each sandbox key gets an isolated in-memory ledger (resets on redeploy).

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LOYALTY_PROVIDER_API_KEY` | Yes (prod) | Shared secret AJO sends in `X-API-Key`. **Never commit.** |
| `LOYALTY_DEFAULT_SANDBOX` | No | Default for legacy `/v1/fulfill` (default `apalmer`) |
| `FAKE_LOYALTY_API_KEY` | — | Legacy alias for `LOYALTY_PROVIDER_API_KEY` |
| `PORT` | No | Listen port (default `8080`) |

Generate a key locally:

```bash
openssl rand -hex 32
```

## Local development

```bash
cd tools/loyalty-reward-provider
npm install
export LOYALTY_PROVIDER_API_KEY='your-local-test-key'
npm start
```

Smoke tests:

```bash
npm test
# or from repo root:
npm run loyalty-provider:test
```

## Deploy to Cloud Run

GCP project: **`aep-orchestration-lab`**, region: **`us-central1`**.

```bash
export LOYALTY_PROVIDER_API_KEY='your-secret'
npm run loyalty-provider:deploy
```

Requires `gcloud` authenticated with deploy permissions.

## Register in AJO Loyalty admin (UI)

1. Open **Journey Optimizer → Loyalty admin → Reward providers → Create**.
2. **Name:** `{sandbox} loyalty provider` (e.g. **apalmer loyalty provider**).
3. **URL:** `https://<cloud-run-host>/apalmer/v1/fulfill`
4. **Header:** `X-API-Key` = same value as `LOYALTY_PROVIDER_API_KEY`.
5. Add a **reward definition** (e.g. denomination `Points`, key `points`).

Match **Global settings → identity namespace** to lab profiles (`loyaltyId`).

## Register via API (script)

```bash
export LOYALTY_PROVIDER_API_KEY='same-secret-as-cloud-run'
npm run ajo:loyalty-register-provider -- \
  --url https://<host>/apalmer/v1/fulfill \
  --sandbox apalmer \
  --name "apalmer loyalty provider"
```

## curl examples

Health:

```bash
curl -sS "https://<host>/health"
curl -sS "https://<host>/apalmer/health"
```

Fulfillment (sandbox path):

```bash
curl -sS -X POST "https://<host>/apalmer/v1/fulfill" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $LOYALTY_PROVIDER_API_KEY" \
  -H "Idempotency-Key: demo-001" \
  -d @tools/loyalty-reward-provider/fixtures/sample-fulfillment.json
```

## Related docs

- [docs/AJO_LOYALTY_CHALLENGES.md](../../docs/AJO_LOYALTY_CHALLENGES.md) — sandbox setup, coffee challenge, reward provider role
- [OpenAPI: loyalty-challenges.yaml](https://github.com/AdobeDocs/journey-optimizer-apis/blob/main/static/loyalty-challenges.yaml)

## Migration from `fake-loyalty-provider`

| Old | New |
|-----|-----|
| Service `fake-loyalty-provider` | `loyalty-reward-provider` |
| `/v1/fulfill` | `/{sandbox}/v1/fulfill` |
| `FAKE_LOYALTY_API_KEY` | `LOYALTY_PROVIDER_API_KEY` (alias still works) |
| `npm run fake-loyalty:*` | `npm run loyalty-provider:*` (aliases kept) |
