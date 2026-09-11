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
| 3 | Governed content-to-activation pipeline | Firefly, Express beta, Photoshop, Content Tagging, AEM Assets/Dynamic Media/Sites, Target, CJA, Assurance, Launch |
| 4 | Isolated specialist or administrative workflows | Privacy Service, Campaign, Fusion, I/O Management, App Builder Data, Status, Places, Lightroom, audio/video, Illustrator, InDesign, Substance 3D, Smart Content, Express Review |

## Phase 1 implementation

The focused MCP endpoint is `/mcp/adobe-capabilities`:

- `adobe_api_catalog` — returns all 35 services, scopes, risks, phases, and use cases.
- `ajo_suppression_addresses` — bounded read of the client suppression list or allowed list; address and domain values are redacted server-side.
- `genstudio_experience_list` — bounded summaries of approved GenStudio Experiences; signed rendition URLs are not retrieved.

The Firebase bridge is `GET /api/adobe-capabilities?action=...`. It requires a valid user-generated, single-sandbox MCP key. The route exposes no generic Adobe proxy and accepts no caller-supplied host or path.

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
