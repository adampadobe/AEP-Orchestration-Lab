# Owner-only lab usage statistics

## Phase 1: existing signals

`/profile-viewer/usage-statistics.html` extends the Global values dashboard shell
and explicit light/dark theme. The sidebar link is visible only to
`apalmer@adobe.com`, in both sandbox and workspace access modes.

**Navigation filtering is not authorization.** The static HTML contains no usage
data. `GET /api/lab/usage?days=7|30|90` rewrites to `labUsageStats`, which verifies
the Firebase ID token with revocation checking, requires the exact owner email,
and checks the UID against the current enabled Firebase Auth account returned by
`getUserByEmail`. Email verification is not required: the exact current Firebase
account UID is the owner identity, and the lab's password sign-in account may be
unverified. MCP keys, IMS tokens and caller-supplied emails cannot authorize
this endpoint.

Firestore remains denied to clients. The handler uses the existing Admin
Firestore helper and secret-free function options in `us-central1`. Its runtime
identity needs existing Firestore read access and Firebase Auth user-read
permissions, including account listing. No IAM changes are made by this feature.
If permissions or a source query fail, it returns explicit HTTP 503 rather than
fictional zero statistics. Verify these permissions during the approved release.

| Source | Dashboard evidence | Not established |
|---|---|---|
| Firebase Auth | Email-linked accounts, creation and latest sign-in timestamps, disabled status | Login event history, all active users, time spent |
| `mcpApiKeys` | Active/revoked key counts, owners, latest key use | Number of calls; creating a key does not prove use |
| `mcpProfileAuditLog` | Observed audit events, safely attributed users, tools, reported errors/durations, daily and weekday/hour counts | Complete or one-to-one tool-call coverage; an audit may precede execution |

Audit events are joined to key records by key ID and then to the **current Firebase
directory by UID**. Profile email/identifier fields in audits are never operator
identities. Only minimal audit and key fields are projected from Firestore; key
hashes, key prefixes, secrets, profile identifiers, job payloads and raw audit rows
are not returned. IMS events, shared ops keys, deleted keys and unmapped accounts
remain unattributed rather than inferred from an email.

### Scope and limits

- Periods are rolling 7, 30 or 90 days; timestamps and day/hour grouping are UTC.
- Firebase account and key inventory are current snapshots regardless of period.
  "Latest sign-in in window" is not a historical login count; the separate website
  section uses the new event history described below.
- Reads are bounded to 1,000 accounts, 1,000 keys and the latest 5,000 audit
  records in the selected period. Sentinel records/page tokens flag truncation.
  The UI warns that counts, attribution and time distributions are incomplete.
- The timestamp range and ordering use the existing single-field Firestore index
  on `mcpProfileAuditLog.timestamp` (stored as an ISO string); no composite index
  or new collections are needed.
- Owner authorization happens on every request, including cache hits. A
  per-instance 60-second snapshot cache reduces repeated reads. Responses are
  `private, no-store`; the browser never persists usage payloads and clears
  rendered data on auth changes, failed requests and refresh.
- Empty MCP data is explicitly described as "no available records", not proof
  of no use. Existing account/audit snapshots cannot establish engagement. Website history is
  available only after the separate Phase 2 collection gate is enabled.
- Phase 1 performs read-only operations: no new visitor tracking, historical
  backfill, retention policy changes or Cloud Logging queries are enabled.

## Phased telemetry roadmap

### Phase 2: implemented locally, collection disabled by default

`GET /api/lab/usage/events` returns the version, collection status, route
allowlist and visitor notice, never usage data. `POST` accepts one event and
derives its UID from a revocation-checked, non-anonymous Firebase ID token with
an email-linked account. Client-supplied UID/email fields are rejected.
Pending lab accounts are excluded using the existing lab approval service;
enabled legacy accounts with a missing approval document retain the same access
as the existing onboarding gate. Email verification is not required for
collection or owner authorization; the owner read gate requires the exact owner
email and a matching UID from the current enabled Firebase Auth account.

Both usage functions explicitly set `LAB_USAGE_TELEMETRY_ENABLED: 'false'` in
their runtime options. Neither browser flags nor this dashboard can enable
collection. No deployment, telemetry writes, IAM changes or TTL policy changes
are part of local implementation.

#### Browser coverage and visitor notice

The navigation script loads `aep-lab-usage-telemetry.js` once on top-level
documents. The collector uses the public configuration's strict route allowlist
and the live Firebase SDK identity, **never stored email hints**. It does not
sign in anonymously or instrument the AEP demo profile.

The inventory at implementation time contained 111 top-level HTML files:
83 used the shared navigation and 72 also loaded Firebase Auth compat.
The initial allowlist deliberately covers **19 core lab pages**:

`home.html`, `home-new.html`, `global-settings.html`, `profile.html`,
`schema-viewer.html`, `audience-membership.html`, `profile-generation.html`,
`consent.html`, `journeys.html`, `event-tool.html`, `webhooks.html`,
`live-activities.html`, `brand-scraper.html`, `image-hosting.html`,
`firebase-database.html`, `audit-events.html`, `mcp-servers.html`,
`usage-statistics.html`, and `journey-arbitration-v3.html`.

Global values and Journey arbitration now load the existing Firebase Auth
compat/config pattern so these two core pages can use the real signed-in
identity. The inventory test requires every allowlisted route to exist, load
the shared nav/Auth scripts, and not be a redirect.

When enabled, the collector inserts a visible, theme-token-based usage notice
in the main content **before sending any event**, after auth and visible content
are ready. Onboarding also shows the notice before credentials are submitted.
Deferred home-shell mounting is supported. Anonymous/signed-out
visitors and embedded documents do not produce events.

- A page view is one visible, authenticated core document view per UID.
  Repeated auth callbacks/token refreshes do not produce views or logins.
  Reloads produce new views marked `reload`; BFCache returns produce views
  marked `back_forward`. Auth changes clear the pending identity.
- A `sign_in` event comes only from the successful password-login flow after
  its normal lab-access check succeeds. Account creation, auth restoration,
  token refresh, failed login and failed/fallback access checks are not login
  events. The endpoint additionally requires a recent Firebase `auth_time`;
  the client occurrence time must be within 60 seconds of it.
- Iframes, redirect stubs, dynamically generated demos, other login flows and
  React SPA transitions remain **explicit coverage gaps**. No historic visits
  are backfilled. Counts are observed client reports, not security/access logs.
- Events are not stored in localStorage, sessionStorage or an offline queue.
  One transient/network/server-error retry reuses the identical event/UUID;
  4xx failures are not retried. Collection failures emit a sanitized console
  warning and `aep-lab-usage-status` event without blocking lab use. Sign-out
  while a token is pending prevents the subsequent request.

#### Collection, privacy, rate limits and reporting

The strict v1 payload is `{version, id, type, route, occurredAt, navigation?}`.
`id` is a v4 UUID; types are `page_view` and `sign_in`; navigation is required
only for views. JSON payloads are capped at 1 KB and timestamps at five minutes
of server clock skew. Routes are exact allowlisted pathnames: query strings,
fragments, profile identifiers, referrers, browser content, credentials, arbitrary
event properties and caller identity fields are rejected.

`labUsageEvents` stores the server-derived UID, normalized event, ISO server
receipt timestamp, event fingerprint and server-controlled `expiresAt` (90 days).
The document ID hashes UID + UUID to scope deduplication to the actor; raw UUIDs
and emails are not persisted. A Firestore transaction atomically deduplicates
retries and enforces **60 new events per UID per 60-second window** (the window
starts at the first new event), using
`labUsageRateLimits` with a one-day expiry. Conflicting UUID reuse returns 409;
over-quota requests return 429 plus `Retry-After: 60`. Persistence/auth
infrastructure failures return explicit 503. Firebase's ordinary request logging
is unchanged; the application does not add IP/user-agent fields to event storage.

The owner snapshot reads the latest 5,000 website events plus a truncation
sentinel, using receipt-time range/order and safe field projection. The existing
owner-only read gate, 60-second snapshot cache and non-cacheable HTTP response
also apply to website summaries. Expired events are excluded in the application
even before eventual physical deletion. No new client Firestore permissions or
composite indexes are required.

The website section shows per-user counts/latest events and visited routes,
page totals/reloads/current-directory visitors, and UTC daily/hourly usage.
Website identity attribution uses current Firebase directory UIDs only; deleted
or clipped directory accounts remain unattributed. No raw events, fingerprints
or event IDs are returned. Read caps are disclosed. Disabled collection with
no retained records is **Not collected**, not zero visits; retained history
remains readable when collection is turned off.

**Activation boundary:** before changing the server flag, separately approve
person-level collection and the visitor notice, configure/verify deletion
policies on `expiresAt` for both new collections, confirm runtime Firestore
read/write/transaction and Auth permissions, and deploy through the reviewed
release process. TTL configuration is an external mutation and has not been
performed. Do not promise physical 90-day deletion until TTL is configured;
query-time exclusion alone is not a retention policy. No MCP operational audit
retention changes are implied.

### Phase 3: implemented locally, collection disabled by default

`tools/aep-lab-profile-mcp/src/usageTelemetry.mjs` wraps the SDK's public
`setRequestHandler(CallToolRequestSchema, ...)` and `registerTool` boundaries
before endpoint registration. It covers existing and dynamically loaded tools,
not discovery, session initialization or individual tools' internal calls.
Collection is disabled unless the Cloud Run server environment
`AEP_LAB_MCP_USAGE_ENABLED` is exactly `true`; browser configuration and the
owner dashboard cannot enable it. Existing operational audits are unchanged.

Each completed dispatch attempts one `mcpUsageInvocations/{randomUUID}` create:
version, authenticated actor UID or null, auth source, endpoint/connected
toolset, registered tool name or null, allowlisted **requested** sandbox or
null, server start/completion timestamps, monotonic duration, handler-started
flag, protocol response kind, outcome and 90-day server `expiresAt`.
Unknown caller-supplied tool names are not persisted. No arguments/results,
profile identifiers, emails, keys/key IDs, tokens, sessions, referrers or
user-agent/IP fields are added. Requested sandbox is not proof that an operation
ran there; it may be null or differ from a tool's default behavior.

Actor identity comes from request-local verified authentication, not headers or
tool arguments. User keys use their stored Firebase UID. IMS uses the UID only
when **all active enrollment records agree on one nonempty UID**; ambiguous or
missing UIDs remain unattributed without changing existing sandbox access.
Shared ops/unknown auth sources never claim a person. Reporting joins these
UIDs to the current bounded Firebase directory, not the current key inventory,
so revoking/deleting a key does not relabel recorded invocation history.

Outcomes are `result` (SDK result without `isError`, **not business success**),
`tool_error` (SDK tool error after handler entry), `rejected` (SDK failure before
handler entry, including input validation and disabled/unknown tools),
`protocol_error` (exception escaping dispatch), and `cancelled` (request signal
aborted at dispatch completion). A successful async/batch submit is not job
completion; cancelled calls may still have side effects. Output validation can
turn a handler result into a tool error. HTTP 200 is not an outcome.

Persistence is awaited before returning the SDK response, with a maximum
two-second wait. Failures/deadlines emit sanitized
`USAGE_PERSISTENCE_FAILED`/`USAGE_PERSISTENCE_TIMEOUT` structured warnings
without altering the result or exception. No retry is made. A timed-out write
may subsequently persist. Process crashes, uncompleted calls, revoked/invalid
authentication and malformed protocol requests rejected before this dispatch
boundary are **not recorded**; loss of delivery to the client cannot be inferred.
This is improved observed coverage, not an exactly-once security/access ledger.

The existing owner-only API projects safe fields, reads at most the latest 5,000
records plus a sentinel by completion time, excludes expired/future/unsupported
records and returns aggregates only. The dashboard separates dispatch totals,
current-directory users, per-person latest use, tool outcomes/mean durations,
endpoints and UTC day/hour distributions from operational audit figures.
Truncation is disclosed. No retained records means **Not recorded**, not proof
of no use; the dashboard does not inspect the live Cloud Run collection flag.
Collection being turned off does not hide retained history.

**Activation boundary:** separately approve person-level MCP statistics and an
appropriate MCP-user notice, configure/verify TTL on
`mcpUsageInvocations.expiresAt`, verify Cloud Run write and Functions read
permissions, then follow reviewed merge/release gates. No TTL, IAM, Cloud Run
environment or production deployment changes have been performed. As with
website events, query-time exclusion is not physical deletion. A reviewed
configuration change is needed to enable collection; code-only releases must
preserve existing Cloud Run environment/secrets/settings.

### Phase 4: sessions and active-time estimates implemented locally

Configuration now advertises version 2. The collector remains compatible with
v1 configuration (views/logins only); v1 events remain accepted. Heartbeats
require v2 with `{version, id, type: "heartbeat", route, occurredAt, activeMs}`.
The endpoint rejects navigation, extra properties and non-integer durations
outside 1-30,000 milliseconds, using the same authentication, clock-skew,
deduplication, size, retention and rate-limit checks as other website events.
Heartbeats never increment page-view or login counts.

Trusted pointer, keyboard, wheel or touch interaction starts a 15-second timer.
Only the interaction timestamp is retained in memory: no keystrokes, text,
pointer coordinates or event contents are collected. Reports require a visible,
focused page and interaction within 60 seconds. Hidden/blurred pages, auth
changes/errors and page exits reset the baseline. Timer suspensions over 30
seconds and intervals before idle-resume interaction are discarded. There is no
exit flush or offline queue; partial final intervals, shutdown and delivery gaps
can undercount usage. This is **estimated active time**, not exact time spent,
proof of attention or a security/access log.

Sessions are derived at read time by current-directory UID from server receipt
timestamps, splitting at gaps **of at least 30 minutes**. No persistent session
identifier is added. Valid heartbeat occurrence intervals are clipped to the
reporting window/current time and unioned per user, avoiding overlapping-tab
double counting. Missing heartbeat history shows **Not recorded**, never
duration inferred from page views. Directory/read caps and window boundaries
can omit actors, split sessions and undercount time. Heartbeats also consume the
shared 5,000-record website read budget, shortening available view/login history
under heavy use; all figures remain bounded and partial.

`excludeOwner=true|false` on the owner API defaults to false. The owner-only UI
provides "Exclude my activity"; the server derives the owner UID from the
authorized current Auth account, not a client-supplied identity. Exclusion is
applied before aggregating account/key inventory, identifiable key-linked audits,
website events, sessions, active time and MCP dispatches. Shared-key,
deleted-key or otherwise unattributed history cannot reliably be excluded.
Caches are separated by owner UID, window and exclusion; authorization still
runs on every request. Exclusion changes reporting only, not stored records.

**Remaining Phase 4 work:** deduplicated long-term rollups and their deletion
policies are not implemented. Recommended aggregate retention remains 13 months,
subject to separate approval. Phase 2 already supplies
server-side 90-day `expiresAt` and query-time expiry exclusion for new detailed
events, but physical TTL deletion remains a separately approved activation
requirement. Future rollups need aggregate expiry and deduplication tests.
TTL is eventual deletion and not authorization. Do not retroactively delete
operational MCP audit data without a separate retention decision.

## Validation and release

Run `node --test functions/test/labUsage.test.cjs functions/test/labUsageTelemetry.test.cjs functions/test/labUsageInvocations.test.cjs functions/test/labUsageEngagement.test.cjs` and
`npm run verify:profile-viewer-routes`; sync the canonical UI using
`npm run sync-profile-viewer-ui` (preserve unrelated pre-existing mirror drift).
With the locked root Playwright dependency and
Chromium installed, run `node scripts/test-lab-usage-ui.mjs` for offline synthetic
fixtures, theme/layout checks and auth-change clearing. Run
`node scripts/test-lab-usage-telemetry-ui.mjs` for offline actual login flow,
notice ordering, restored-auth deduplication, retries, iframe exclusion and
sign-out race and capped interaction/heartbeat coverage. Check owner access, other users, anonymous users,
missing/expired/revoked tokens, disabled owner, direct function access, cache
reauthorization, empty data, limits, unavailable sources and both themes.
With locked MCP dependencies installed, run
`node --test tools/aep-lab-profile-mcp/test/usageTelemetry.test.mjs tools/aep-lab-profile-mcp/test/imsAuth.test.mjs tools/aep-lab-profile-mcp/test/toolAnnotations.test.mjs tools/aep-lab-profile-mcp/test/focusedToolsets.test.mjs`.
The dispatch tests use the real SDK over in-memory transports with synthetic
identities and storage, including SDK rejection, errors, dynamic tools,
concurrency, unattributed shared/IMS identities, persistence failure and timeout.

Release through the normal feature branch / PR / Validate / merge sequence.
Hosting automation does not deploy Functions: the designated release owner must
deploy `labUsageStats` and `labUsageEvents` intentionally from exact clean `origin/main`, without
changing IAM unless separately approved. Deploy the endpoint before or alongside
Hosting and verify the owner can read it while a non-owner gets 403. Verify
collection remains disabled until its activation boundary is approved. No production
user data is needed in fixtures, screenshots or test logs.
