# Adobe Journey Optimizer — Loyalty Challenges (lab setup)

This note explains how the **AEP Orchestration Lab** simulates **AJO Loyalty Challenges** (private beta): a sandbox-aware **reward fulfillment gateway** on Cloud Run, metadata API scripts, and alignment with existing profile loyalty fields.

## Policy — metadata APIs from the terminal

Follow the same rule as [AJO content templates](AJO_CONTENT_TEMPLATE_API.md): call **`https://platform.adobe.io/ajo`** from **this machine** (terminal scripts or `curl`), not via Firebase Functions, when registering reward providers or creating challenges.

Firebase in this repo proxies **health** and **ledger** reads for the Tools UI. The reward provider itself runs on **Cloud Run** so Adobe can reach fulfillment over HTTPS.

## What AJO expects from a reward provider

AJO Loyalty Challenges use a **standard challenge pattern** (not BYOD):

| Responsibility | Who handles it |
|----------------|----------------|
| Task progress (e.g. buy 3 coffees) | **AEP experience events + AJO** — event definitions map incoming XDM to task counters |
| Reward fulfillment when goal met | **Your reward provider URL** — AJO POSTs a fulfillment payload; you accept and act |
| Audience eligibility | **AEP segment** on the challenge |
| Member identity | **Loyalty admin namespace** aligned with profile `loyaltyId` |

**You are a reward gateway / fulfillment endpoint**, not a passive log collector. When a member earns a reward, AJO calls your registered URL with a fulfillment payload. A production provider would credit points in a loyalty system, issue coupon codes, update member balances, or call downstream APIs. The lab provider accepts the payload, returns `{ "status": "accepted", "transactionId": "<uuid>" }`, and logs to an in-memory ledger. Syncing fulfillment to AEP profile `loyalty.points` is noted as a future enhancement.

Progress tracking happens entirely in **AJO + AEP events** — the reward provider is invoked only at fulfillment time.

## Lab reward provider (Cloud Run)

Source: [`tools/loyalty-reward-provider/`](../tools/loyalty-reward-provider/)

Single service **`loyalty-reward-provider`** with **path-based sandboxes**:

| Endpoint | Method | Auth | Response |
|----------|--------|------|----------|
| `/health` | GET | None | Service health |
| `/{sandbox}/health` | GET | None | Sandbox ledger stats |
| `/{sandbox}/v1/fulfill` | POST | `X-API-Key` | `{ "status": "accepted", "transactionId", "sandbox" }` |
| `/{sandbox}/v1/ledger` | GET | `X-API-Key` | In-memory ledger for that sandbox |
| `/oauth/token` | POST | Optional | OAuth token generator stub |

Example fulfillment URL for **apalmer**:

```
https://loyalty-reward-provider-<hash>-uc.a.run.app/apalmer/v1/fulfill
```

Register in AJO as **`apalmer loyalty provider`** (not “fake loyalty”).

Deploy:

```bash
export LOYALTY_PROVIDER_API_KEY="$(openssl rand -hex 32)"
npm run loyalty-provider:deploy
```

Local smoke tests:

```bash
npm run loyalty-provider:test
```

Legacy aliases `npm run fake-loyalty:*` still work.

See [`tools/loyalty-reward-provider/README.md`](../tools/loyalty-reward-provider/README.md) for curl examples.

## Required HTTP headers (Platform / AJO loyalty metadata)

| Header | Value |
|--------|--------|
| `Authorization` | `Bearer <IMS access_token>` |
| `x-api-key` | OAuth client id |
| `x-gw-ims-org-id` | IMS org id |
| `x-sandbox-name` | Technical sandbox (e.g. `apalmer`) |

OpenAPI: [loyalty-challenges.yaml](https://github.com/AdobeDocs/journey-optimizer-apis/blob/main/static/loyalty-challenges.yaml)

## Reset lab config (idempotent)

Clears prior lab challenges, event definitions, and reward providers in a sandbox:

```bash
npm run ajo:loyalty-reset -- --sandbox apalmer
```

Implementation: [`scripts/ajo-loyalty-reset.mjs`](../scripts/ajo-loyalty-reset.mjs)

Deletes (when present):

- Challenges: `AEP Lab Standard Challenge`, `Buy 3 Coffees — Lab Challenge`
- Events: `AEP Lab Purchase Event`, `AEP Lab Coffee Purchase Event`
- Providers: guid `15b4d932-9d69-4c3a-b6bd-f8daa5656fdd`, names `AEP Lab Fake Loyalty`, `apalmer loyalty provider`

Global config (identity namespace) is retained.

## End-to-end setup — coffee challenge (script)

Idempotent orchestration: config namespace, sandbox provider URL, coffee event definition, audience, **buy 3 coffees** task, challenge publish:

```bash
npm run ajo:loyalty-reset -- --sandbox apalmer   # optional clean slate
npm run ajo:loyalty-setup -- --sandbox apalmer
```

Use `--dry-run` to print planned steps. Journey auto-create may return **403003** — finish **Generate journey → Publish** in Loyalty admin if API key lacks journey authoring.

Implementation: [`scripts/ajo-loyalty-setup.mjs`](../scripts/ajo-loyalty-setup.mjs)

### Coffee use case (apalmer)

| Item | Value |
|------|--------|
| Challenge | **Buy 3 Coffees — Lab Challenge** |
| Task | `aep-lab-coffee-purchase-task` — purchase qty goal **3** |
| Event | `loyalty.coffee.purchase` (`AEP Lab Coffee Purchase Event`) |
| Reward | 100 points via registered provider |
| Provider name | `apalmer loyalty provider` |
| Fulfillment URL | `https://loyalty-reward-provider-<hash>-uc.a.run.app/apalmer/v1/fulfill` |

After setup, update IDs in [`web/profile-viewer/loyalty-reward-provider-config.js`](../web/profile-viewer/loyalty-reward-provider-config.js) under `sandboxProfiles.apalmer`.

## Register reward provider (script)

```bash
export LOYALTY_PROVIDER_API_KEY='same-secret-as-cloud-run'
npm run ajo:loyalty-register-provider -- \
  --url https://<cloud-run-host>/apalmer/v1/fulfill \
  --sandbox apalmer \
  --name "apalmer loyalty provider"
```

Implementation: [`scripts/ajo-loyalty-register-provider.mjs`](../scripts/ajo-loyalty-register-provider.mjs)

## Tools UI

Profile Viewer → **Loyalty reward provider** (`loyalty-reward-provider.html`):

- Sandbox picker (global lab pattern)
- Sandbox-scoped fulfillment URL
- Reward provider role explanation
- Health + ledger via `/api/loyalty-provider/*` Firebase proxy

## Profile generator — loyalty fields

| UI / generator | Profile path |
|----------------|--------------|
| Loyalty ID | `_demoemea.identification.core.loyaltyId` |
| Points | `loyalty.points`, `loyaltyDetails.points` |
| Tier | `loyalty.tier` |

Align Loyalty admin **Global settings → identity namespace** with **`loyaltyId`**.

## API sequence (reference)

Base: `https://platform.adobe.io/ajo`

| Step | Method | Path |
|------|--------|------|
| Get org config | GET | `/loyalty/metadata/config` |
| Create reward provider | POST | `/loyalty/metadata/config/rewards/providers` |
| Delete reward provider | DELETE | `/loyalty/metadata/config/rewards/providers/{providerId}` |
| Create event definition | POST | `/loyalty/metadata/config/events` |
| Delete event | DELETE | `/loyalty/metadata/config/events/{eventId}` |
| Create challenge | POST | `/loyalty/metadata/challenges` |
| Delete challenge | DELETE | `/loyalty/metadata/challenges/{challengeId}` |
| Publish | POST | `/loyalty/metadata/challenges/{id}/publish` |
| Journey from challenge | PUT | `/loyalty/metadata/journeys/from-challenge/{id}` |

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| 403/404 on metadata APIs | Beta not enabled or missing IMS scopes |
| Journey initialize **403003** | OAuth client lacks journey authoring — create journey in Loyalty admin UI |
| AJO cannot reach provider | Cloud Run not public; wrong sandbox path in URL |
| Tasks never progress | Event definition / XDM mismatch; profile not in audience |
| Fulfillment 401 | `X-API-Key` mismatch between AJO admin and `LOYALTY_PROVIDER_API_KEY` |

## Migration from `fake-loyalty-provider`

| Old | New |
|-----|-----|
| `https://fake-loyalty-provider-a5xduykcsq-uc.a.run.app/v1/fulfill` | `https://loyalty-reward-provider-<hash>-uc.a.run.app/apalmer/v1/fulfill` |
| Service `fake-loyalty-provider` | `loyalty-reward-provider` |
| `/api/fake-loyalty/*` | `/api/loyalty-provider/*` (legacy path still works) |
| `FAKE_LOYALTY_API_KEY` | `LOYALTY_PROVIDER_API_KEY` (Firebase secret name unchanged: `FAKE_LOYALTY_API_KEY`) |

## Related

- [tools/loyalty-reward-provider/README.md](../tools/loyalty-reward-provider/README.md)
- [AJO_CONTENT_TEMPLATE_API.md](AJO_CONTENT_TEMPLATE_API.md)
