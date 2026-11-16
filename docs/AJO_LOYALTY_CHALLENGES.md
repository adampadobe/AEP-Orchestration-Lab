# Adobe Journey Optimizer — Loyalty Challenges (lab setup)

This note explains how the **AEP Orchestration Lab** simulates **AJO Loyalty Challenges** (private beta): a sandbox-aware **reward fulfillment gateway** on Cloud Run, metadata API scripts, and alignment with existing profile loyalty fields.

## Policy — metadata APIs from the terminal

Follow the same rule as [AJO content templates](AJO_CONTENT_TEMPLATE_API.md): call **`https://platform.adobe.io/ajo`** from **this machine** (terminal scripts or `curl`), not via Firebase Functions, when registering reward providers or creating challenges.

Firebase in this repo proxies **health** and **ledger** reads for the Tools UI. The reward provider itself runs on **Cloud Run** so Adobe can reach fulfillment over HTTPS.

The read-only Loyalty MCP workflow below also uses a dedicated authenticated
Firebase backend for metadata and member-state **GETs only**. This does not change
the terminal-only policy for registering providers, creating or editing challenges.

## Read-only Loyalty MCP workflow

The source registers these tools in General (`/mcp`) and the existing Decisioning
connection (`/mcp/decisioning`, Coworker `lab-dps`). No browser-held Adobe token or
new credential is needed.

| Tool | Adobe GET |
|------|-----------|
| `lab_ajo_loyalty_config` | `/ajo/loyalty/metadata/config` (safe identity/event summary only) |
| `lab_ajo_loyalty_challenge_list` | `/ajo/loyalty/metadata/challenges?limit=25` (1-100; optional `start` cursor) |
| `lab_ajo_loyalty_challenge_get` | `/ajo/loyalty/metadata/challenges/{challenge_id}` |
| `lab_ajo_loyalty_profile_state` | `/ajo/loyalty/challenges/state?pid={profile_id}&v=2` (optional `challenge_id` as `cid`, and explicit `test`) |
| `lab_ajo_loyalty_profile_challenges` | `/ajo/loyalty/challenges/{profile_id}?state=active` (or `complete`) |

1. Call `lab_mcp_access_info` and choose an authorized sandbox.
2. Read `lab_ajo_loyalty_config` to confirm `data.namespace`. Do not assume it
   matches the coffee lab's `loyaltyId`, Email, ECID or an internal UPS ID. Provider
   and sink definitions are omitted because they can contain authentication.
3. List a bounded challenge page; follow Adobe's returned cursor explicitly.
   Read the exact challenge ID for tasks, dates, reward definitions and completion
   rules. Metadata publication alone is not member eligibility or participation.
   The observed Postman response uses `data.children`, `data._page` and
   `data._links`, with each challenge's ID in `_id`. The adapter also accepts the
   published OpenAPI's `data.challengeList` format (`get_id` on metadata).
   Both formats are preserved, not renamed or flattened.
4. Confirm the existing test member's identifier in that namespace and the
   sandbox's Adobe region. State reads default to `va7`, as the published State
   API production server does. Set `region` to a confirmed regional suffix (for
   example `nld2`) or `global` for `platform.adobe.io`; do not probe regions to guess.
   Metadata always uses `platform.adobe.io`.
5. Read member state; optionally filter to the exact challenge. Use
   `state:"complete"` on `lab_ajo_loyalty_profile_challenges` for completed
   participation. Tasks, zero counters, missing values, completion history and
   returned pagination are preserved rather than synthesized. Member-state reads
   still require `data.challengeList`; a metadata `children` response cannot
   establish progress. Missing or invalid collections are errors, not "no challenges".

The Function `ajoLoyaltyProxy` independently checks a user-generated MCP key or
validated Adobe IMS enrollment, the exact sandbox and configured Adobe org.
Shared operational keys and caller-supplied platform URLs, paths, methods or
authorization overrides are not accepted. Adobe calls use the existing
`adobeAuth.js` token cache and `aepHeaders()`. All API operations are GET-only,
make one attempt, reject redirects, time out after 60 seconds and cap response
bodies at 2 MiB. Adobe status and structured error bodies are returned to the
authorized caller, not written to tool audits. Configuration errors retain only
allowlisted scalar diagnostics, not embedded settings. Stop on 401/403; entitlement and
Loyalty permissions are separate from a successful Decisioning call.

There are no signup, withdrawal, event-send, reward-fulfillment, challenge-write or
balance-update tools. Challenge completion does not prove provider fulfillment or
a credited points balance. This is inspection support for later demo work, not a
new customer-facing or unrestricted proxy.

**Release boundary:** offline contract tests do not call Adobe. Live verification
requires the normal feature branch / PR / Validate / merge / exact-main release
of the named Function and MCP service, preserving all runtime secret bindings.
Refresh the existing MCP connection and start a new chat after release. The
optional Hosting rewrite `/api/ajo-loyalty` needs its normal Hosting release; MCP
uses the named Function directly. Do not describe a locally registered tool or
mock response as a successful live Loyalty test.

API contracts: [metadata](https://developer.adobe.com/journey-optimizer-apis/references/loyalty-challenges)
and [member state](https://developer.adobe.com/journey-optimizer-apis/references/loyalty-challenges-state).

### Authentication and deployment configuration

The two authentication hops have different purposes:

1. **Client to lab:** the existing `lab-decisioning` connection supplies its
   sandbox-scoped MCP key, or Coworker forwards its Adobe IMS session. The
   backend independently verifies the Portal principal and exact sandbox.
2. **Lab to Adobe:** `ajoLoyaltyProxy` uses `createAdobeAuth()` to obtain/cache a
   server-to-server IMS token. `aepHeaders()` supplies `Authorization`,
   `x-api-key` and `x-gw-ims-org-id`; the route sets the principal's
   `x-sandbox-name`. Caller credentials are never reused as Adobe API overrides.

The Function inherits `profileFnOpts`: region `us-central1`, 120-second Function
timeout, and the existing Secret Manager bindings `ADOBE_CLIENT_ID`,
`ADOBE_CLIENT_SECRET`, `ADOBE_IMS_ORG` and `ADOBE_SCOPES`. The Adobe read itself
has a 60-second timeout. There is no new Postman environment, MCP connection,
credential file or token-pasting step. A credential that works for Decisioning
is not proof of Loyalty entitlement; stop and review the existing Adobe
integration/product permissions if the Loyalty read returns 401/403. Do not
silently add scopes or change secret values.

The metadata host is `platform.adobe.io`. The state region, configured identity
namespace and existing member ID must be confirmed before a member read.
Neither sandbox `kirkham` nor a challenge ID determines the state region.
The exported Postman `x-schema-id` belongs to schema-oriented APIs and is not
required by the published Loyalty contracts; this adapter does not forward it.

For a release owner, the rollout is:

1. Commit/push the focused feature branch, open a PR, and complete required
   Validate checks and review. Do not deploy the worktree.
2. After merge and release approval, deploy only `ajoLoyaltyProxy` through the
   existing Firebase workflow from clean `main` at freshly fetched `origin/main`.
   Preserve the four Adobe secret bindings and verify the Function's region.
3. Release the MCP image for that exact merged SHA with the existing guarded
   `tools/aep-lab-profile-mcp/scripts/release-main.sh`, retaining the running
   service's configuration. The release script's account/project guard is
   intentional: use the authorized release owner, never change the guard to
   accommodate a different account.
4. Verify revision/build identity, refresh the existing connection and start a
   new chat. Confirm all five Loyalty tools appear. Hosting is not needed for
   MCP's direct Function call; publish the optional rewrite separately only if
   a caller needs the Hosting URL.
5. Run configuration, one metadata page and one exact member-state read.
   Confirm Adobe status and actual returned task fields, not just tool discovery.

### Retrieving a member's task status

After release, the read-only sequence on the existing connection is:

```text
lab_ajo_loyalty_config(sandbox="kirkham")
lab_ajo_loyalty_challenge_list(sandbox="kirkham", limit=25)
lab_ajo_loyalty_challenge_get(sandbox="kirkham", challenge_id="<metadata _id or get_id>")
lab_ajo_loyalty_profile_state(
  sandbox="kirkham",
  profile_id="<existing ID in the confirmed namespace>",
  challenge_id="<same challenge ID>",
  region="<confirmed Adobe region>"
)
```

The last tool performs a bodyless
`GET /ajo/loyalty/challenges/state?pid=<member>&cid=<challenge>&v=2`.
Without `cid`, Adobe documents the response as active challenges, not the
member's complete history. Use `lab_ajo_loyalty_profile_challenges` with
`state:"complete"` when completed participation is needed. The optional State
API `test` flag is separate from the AEP profile's `testProfile` attribute; do
not infer it from that attribute or silently switch modes.

| State response field | Interpretation |
|----------------------|----------------|
| `challengeList[].challenge_id` | Join to the selected metadata `_id` / `get_id`. |
| `challengeList[].optedIn` | Member opt-in as returned by Adobe; preserve `false` and distinguish missing. |
| `challengeList[].tasks[].taskId` | Join to the metadata task by ID, not array order or display name. |
| `tasks[].taskState` | Adobe's task status, not the metadata's draft/published state. |
| `tasks[].variables` | Goal, accumulation type and filters; retain actual values rather than guessing units. |
| `tasks[].accumulators` | Returned `qty`, `spend`, `days` and item details; zero is meaningful. Select the measure only after checking the task definition. |
| `tasks[].taskCompletions` | Completion history for that task; repeating tasks may reset their current counters. |
| `challengeList[].challengeCompletions`, `completionDate` | Challenge completion evidence, not proof of reward delivery or points credited. |

For example, "buy three items" can be **one task** with a goal of three:
`tasksToComplete:1` is not a purchase counter. Report the task's actual goal,
accumulator and returned state. Do not fabricate "0 of 3" when the accumulator
is missing, mark a member eligible from publication alone, or treat an empty
active page as proof they never completed a challenge.

The saved metadata response can validate parsing locally, but does not contain
a member's task status. Live namespace, region, member read and Loyalty
entitlement remain separate acceptance checks.

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

### Coffee use case (kirkham — Alan Kirkham)

Same challenge pattern as apalmer; audience is **Loyalty Members** (no hotel segment in kirkham yet):

```bash
npm run ajo:loyalty-reset -- --sandbox kirkham   # optional clean slate
npm run ajo:loyalty-setup -- --sandbox kirkham --skip-journey
```

| Item | Value |
|------|--------|
| Challenge | **Buy 3 Coffees — Lab Challenge** |
| Task | `aep-lab-coffee-purchase-task` — purchase qty goal **3** |
| Event | `loyalty.coffee.purchase` (`AEP Lab Coffee Purchase Event`) |
| Reward | 100 points via registered provider |
| Provider name | `kirkham loyalty provider` |
| Fulfillment URL | `https://loyalty-reward-provider-a5xduykcsq-uc.a.run.app/kirkham/v1/fulfill` |
| Audience | **Loyalty Members** |

After setup, update IDs in [`web/profile-viewer/loyalty-reward-provider-config.js`](../web/profile-viewer/loyalty-reward-provider-config.js) under `sandboxProfiles.kirkham`.

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
