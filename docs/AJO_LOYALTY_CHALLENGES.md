# Adobe Journey Optimizer — Loyalty Challenges (lab setup)

This note explains how the **AEP Orchestration Lab** simulates **AJO Loyalty Challenges** (private beta): a public **reward provider**, metadata API scripts, and alignment with existing profile loyalty fields.

## Policy — metadata APIs from the terminal

Follow the same rule as [AJO content templates](AJO_CONTENT_TEMPLATE_API.md): call **`https://platform.adobe.io/ajo`** from **this machine** (terminal scripts or `curl`), not via Firebase Functions, when registering reward providers or creating challenges.

Firebase in this repo remains for hosted lab features (Profile Viewer, `/api/aep` proxies). The fake reward provider itself runs on **Cloud Run** so Adobe can reach it over HTTPS.

## What Loyalty Challenges need

| Component | Role |
|-----------|------|
| **Reward provider** | Public HTTPS URL AJO calls for **fulfillment** when members earn rewards |
| **Loyalty admin config** | Identity namespace, event definitions, product inventory (optional) |
| **AEP audience** | Eligibility segment UUID on each challenge |
| **Experience events** | Purchase/spend/custom events drive task progress (not the reward provider) |
| **Profile loyalty attrs** | `loyaltyId`, `loyalty.points`, `loyalty.tier` in generated profiles |

This is **not** AJO **Integrations** (read-only personalization at send time).

## Fake reward provider

Source: [`tools/fake-loyalty-provider/`](../tools/fake-loyalty-provider/)

| Endpoint | Method | Auth | Response |
|----------|--------|------|----------|
| `/health` | GET | None | `{ "status": "ok" }` |
| `/v1/fulfill` | POST | `X-API-Key` header | `{ "status": "accepted", "transactionId": "<uuid>" }` |
| `/oauth/token` | POST | Optional | `{ "access_token", "expires_in": 3600 }` |

Deploy:

```bash
export FAKE_LOYALTY_API_KEY="$(openssl rand -hex 32)"
npm run fake-loyalty:deploy
```

Local smoke tests:

```bash
npm run fake-loyalty:test
```

See [`tools/fake-loyalty-provider/README.md`](../tools/fake-loyalty-provider/README.md) for curl examples and registration steps.

## Required HTTP headers (Platform / AJO loyalty metadata)

Same pattern as other Platform APIs:

| Header | Value |
|--------|--------|
| `Authorization` | `Bearer <IMS access_token>` |
| `x-api-key` | OAuth client id |
| `x-gw-ims-org-id` | IMS org id |
| `x-sandbox-name` | Technical sandbox (e.g. `apalmer`) |

IMS token: **client_credentials** from `~/.config/adobe-ims/credentials.env`.

OpenAPI reference: [loyalty-challenges.yaml](https://github.com/AdobeDocs/journey-optimizer-apis/blob/main/static/loyalty-challenges.yaml)


## End-to-end setup (script)

Idempotent orchestration for **apalmer** (config namespace, provider, event definition, audience, challenge publish):

```bash
npm run ajo:loyalty-setup -- --sandbox apalmer
```

Use `--dry-run` to print planned steps. Journey auto-create may require journey authoring API access; if initialize fails with **403003**, finish **Generate journey → Publish** in Loyalty admin.

Implementation: [`scripts/ajo-loyalty-setup.mjs`](../scripts/ajo-loyalty-setup.mjs)

## Register reward provider (script)

```bash
export FAKE_LOYALTY_API_KEY='same-secret-as-cloud-run'
npm run ajo:loyalty-register-provider -- \
  --url https://<cloud-run-host>/v1/fulfill \
  --sandbox apalmer
```

Dry-run payload only:

```bash
npm run ajo:loyalty-register-provider -- --dry-run --url https://example.com/v1/fulfill
```

Implementation: [`scripts/ajo-loyalty-register-provider.mjs`](../scripts/ajo-loyalty-register-provider.mjs)

**Beta note:** if the API returns **403** or **404**, Loyalty Challenges may not be enabled on the org. Register manually in **Loyalty admin → Reward providers** using the same URL and `X-API-Key`.

## Create challenge (script)

Requires an AEP **audience/segment UUID** and the **provider guid** from registration:

```bash
npm run ajo:loyalty-create-challenge -- \
  --sandbox apalmer \
  --audience-id <segment-uuid> \
  --provider-guid <provider-guid> \
  --reward-definition points
```

Creates a **draft** Standard challenge with one **purchase** task. Publish via UI or:

`POST /ajo/loyalty/metadata/challenges/{challengeId}/publish`

Implementation: [`scripts/ajo-loyalty-create-challenge.mjs`](../scripts/ajo-loyalty-create-challenge.mjs)

## Full setup (idempotent script)

Runs config, event definition, audience resolution, task, challenge, publish, and optional journey linking in one pass:

```bash
npm run ajo:loyalty-setup -- --sandbox apalmer
# alias:
npm run ajo:loyalty-configure -- --sandbox apalmer
```

Options:

| Flag | Purpose |
|------|---------|
| `--audience-id <uuid>` | Skip audience auto-pick; use this AEP segment |
| `--provider-guid <uuid>` | Override default lab provider guid |
| `--skip-journey` | Skip `challenges/initialize` + journey from challenge |
| `--skip-segments` | Do not list UPS segments (requires `--audience-id`) |
| `--dry-run` | Print planned lab constants only |

The script lists UPS segment definitions and prefers lab hotel edge audiences (e.g. **Hotel - Known email for orchestration**). If none exist, run `npm run aep:create-hotel-edge-segments -- --sandbox apalmer --tenant demoemea --upsert` first.

Implementation: [`scripts/ajo-loyalty-setup.mjs`](../scripts/ajo-loyalty-setup.mjs) (`npm run ajo:loyalty-setup` or alias `npm run ajo:loyalty-configure`).

### apalmer reference IDs (non-secret)

| Resource | ID / value |
|----------|------------|
| Identity namespace | `loyaltyId` |
| Reward provider | `15b4d932-9d69-4c3a-b6bd-f8daa5656fdd` |
| Purchase event definition | `f1fcdc05-17be-4b01-bd40-2a7ba54db385` (`commerce.purchases.value`) |
| Task | `aep-lab-purchase-task` |
| Challenge | `e07ca362-4d53-42cc-a6d5-0e78e8015a26` (**published**) |
| Audience | `7a22b088-cff4-4ecc-824f-856bc3c15746` — Hotel - Elevated modelled churn risk |

Journey auto-creation may return **500** (`Api Key is invalid` on `journey-private.adobe.io`) until Journey Optimizer authoring API access is fixed for the OAuth client — create/publish the journey in Loyalty admin UI if needed.

## Profile generator — loyalty fields (already present)

No code changes required for MVP. The Profile Viewer generator already writes loyalty attributes, including:

| UI / generator | Profile path |
|----------------|--------------|
| Loyalty ID | `_demoemea.identification.core.loyaltyId` |
| Points | `loyalty.points`, `loyaltyDetails.points` |
| Tier | `loyalty.tier` |

Source: [`web/profile-viewer/profile-generation.js`](../web/profile-viewer/profile-generation.js)

**Align** Loyalty admin **Global settings → identity namespace** with the namespace you use in lab profiles (commonly **`loyaltyId`**).

## UI setup sequence (`apalmer` sandbox)

1. Confirm **Loyalty Challenges private beta** and **Loyalty admin** in AJO left nav.
2. **Global settings** — set identity namespace to match lab profiles.
3. **Reward providers** — register Cloud Run URL + `X-API-Key` (or use register script).
4. **Event definitions** — map lab commerce / custom events to task types.
5. **Challenges → Create** — Standard challenge, audience, tasks, link provider.
6. **Publish challenge → Generate journey → Publish journey**.
7. Send qualifying **experience events** for a profile in the audience; verify fulfillment logs on Cloud Run.

Experience League (when entitled): [Get started with Loyalty Challenges](https://experienceleague.adobe.com/en/docs/journey-optimizer/using/loyalty-challenges/get-started)

## API sequence (reference)

Base: `https://platform.adobe.io/ajo`

| Step | Method | Path |
|------|--------|------|
| Get org config | GET | `/loyalty/metadata/config` |
| Create reward provider | POST | `/loyalty/metadata/config/rewards/providers` |
| Create task | POST | `/loyalty/metadata/tasks` |
| Create challenge | POST | `/loyalty/metadata/challenges` |
| Publish | POST | `/loyalty/metadata/challenges/{id}/publish` |
| Journey from challenge | PUT | `/loyalty/metadata/journeys/from-challenge/{id}` |
| Initialize journey shell | POST | `/loyalty/metadata/challenges/initialize` |
| Health | GET | `/loyalty/journeys/health` |

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| 403/404 on metadata APIs | Beta not enabled or missing IMS scopes |
| AJO cannot reach provider | Cloud Run not public; wrong URL; firewall |
| Tasks never progress | Event definition / XDM mismatch; profile not in audience |
| Fulfillment 401 | `X-API-Key` mismatch between AJO admin and `FAKE_LOYALTY_API_KEY` |

Capture the **first real fulfillment payload** from AJO test mode and update `tools/fake-loyalty-provider/fixtures/sample-fulfillment.json` — public docs do not yet specify the wire format.

## Related

- [AJO_CONTENT_TEMPLATE_API.md](AJO_CONTENT_TEMPLATE_API.md) — content template authoring policy
- [tools/fake-loyalty-provider/README.md](../tools/fake-loyalty-provider/README.md) — provider deploy and curl
- [Loyalty Details XDM](https://experienceleague.adobe.com/en/docs/experience-platform/xdm/field-groups/profile/loyalty-details)
