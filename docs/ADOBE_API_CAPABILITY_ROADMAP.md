# Adobe API capability roadmap

Reviewed snapshot: **Demo Emea AJO**, 11 September 2026.

The Developer Console project contains 35 API services. A connected service is configuration evidence only: it does not prove that a token can be issued, that the organization owns a tenant, or that a particular operation succeeds. The Lab records evidence in this order:

1. `connected`
2. `token_issued`
3. `tenant_verified`
4. `operation_verified`

The machine-readable registry is `functions/adobeApiCapabilityRegistry.js`. It owns the service names, service-specific scopes, risk labels, delivery phases, and candidate Lab use cases. Runtime code requests a narrow scope profile for each operation instead of one project-wide mega-token.

## Delivery plan

| Phase | Outcome | APIs emphasized |
|---|---|---|
| 1 | Inventory plus useful read-only operations | Developer Console registry, AJO suppression/allow list, GenStudio Experience API |
| 2 | Approval and event-driven orchestration | Frame.io, Adobe I/O Events, Commerce, Commerce Optimizer |
| 3 | Governed Firefly Video plus read-only measurement diagnostics | Firefly Video, Assurance, Launch/Reactor, Adobe Status |
| 4 | Isolated specialist, duplicate-sensitive, or administrative workflows | Privacy Service, Campaign, Fusion, I/O Management, App Builder Data, Places, Lightroom, audio workflows, Illustrator, InDesign, Substance 3D, Smart Content, Express Review |

## Phase 1 implementation

The focused MCP endpoint is `/mcp/adobe-capabilities`:

- `adobe_api_catalog` — returns all 35 services, scopes, risks, phases, and use cases.
- `ajo_suppression_addresses` — bounded read of the client suppression list or allowed list; address and domain values are redacted server-side.
- `genstudio_experience_list` — bounded summaries of approved GenStudio Experiences; signed rendition URLs are not retrieved.

The Firebase bridge is `GET /api/adobe-capabilities?action=...`. It requires a valid user-generated, single-sandbox MCP key. The route exposes no generic Adobe proxy and accepts no caller-supplied host or path.

## Phase 3 implementation

The existing `/mcp/firefly` endpoint owns Image 5, five-second Video, Text to Speech, audio/video transcription with optional translated SRT captions, and audio/video dubbing with optional video lip sync. The seven audio tools cover voice discovery plus preview/apply pairs for speech, transcription, and dubbing. Every mutation is hash-bound and confirmation-gated, submits once without automatic retry, accepts media only from supported HTTPS storage hosts, and shares `lab_firefly_job_status`. Generation cancellation remains limited to jobs for which Adobe provides a Firefly API cancel URL.

The new `/mcp/measurement-quality` endpoint groups five coherent read-only diagnostics:

- `assurance_session_list` and `assurance_event_inspect` use narrow session/event scopes and never return raw event payload values.
- `launch_property_audit` and `launch_environment_list` reuse the existing Reactor client and expose bounded configuration summaries only.
- `status_incident_correlate` reads a maximum 31-day Adobe Status window and performs optional keyword filtering locally.

The marketplace source now contains 15 connections: General plus 14 focused MCPs. The deployed Coworker count remains a separate fact until the branch is merged, Cloud Run and Firebase are deployed, and the marketplace is refreshed.

Duplicate capabilities deliberately not built in this slice include separate Firefly Video or Audio MCPs, a second job-status tool, Target wrappers already owned by product-native or Decisioning workflows, a content-supply-chain MCP already covered natively, and broad creative-production proxies. Avatar, reframe, and dynamic graphics remain later Firefly expansions. I/O Events, I/O Management, and App Builder Data remain backend infrastructure candidates rather than marketplace connections.

## Guardrails for later phases

- Read-only probes may establish current access; billable calls are never used merely to test entitlement.
- Creative generation and transformation require preview, exact confirmation, one non-retried submit, and job readback.
- AJO allow-list activation needs an additional warning because an active empty allow list prevents all email delivery.
- Frame.io review state should gate publication rather than mutate source creative automatically.
- I/O Events consumers must deduplicate event IDs and tolerate out-of-order delivery.
- Privacy requests belong in a separate administrative workflow and must never be used for load testing or demo cleanup.
- Express API remains a beta dependency until both entitlement and production suitability are confirmed.

## Official references

- [GenStudio Experience API](https://developer.adobe.com/genstudio-api/)
- [GenStudio Experience events](https://developer.adobe.com/genstudio-api/guides/experience-events/)
- [Journey Optimizer suppression list](https://experienceleague.adobe.com/en/docs/journey-optimizer/using/monitor/deliverability/suppression-list)
- [Journey Optimizer allowed list](https://experienceleague.adobe.com/en/docs/journey-optimizer/using/configuration/monitor-reputation/allow-list)
- [Adobe I/O Events](https://developer.adobe.com/events/docs/guides/)
- [Adobe Firefly API usage notes](https://developer.adobe.com/firefly-services/docs/firefly-api/getting-started/usage-notes/)
- [Adobe Assurance public API](https://developer.adobe.com/adobe-assurance-public-apis/)
- [Adobe Assurance usage](https://developer.adobe.com/adobe-assurance-public-apis/usage/)
- [Adobe Status API](https://developer.adobe.com/adobe-status/)
