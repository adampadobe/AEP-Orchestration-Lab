# Adobe Coworker prompt: cross-reference Adobe APIs against existing MCP capabilities

Copy everything below the separator into Adobe Coworker.

---

## Objective

Audit the Adobe APIs connected to the **Demo Emea AJO** Adobe Developer Console project against the MCP integrations and native Adobe capabilities currently available in this Coworker session.

The goal is to identify genuine capability gaps without creating duplicate MCP servers or duplicate tools.

This is a **read-only architecture review**. Do not create, update, delete, publish, deploy, generate billable media, rotate credentials, or make configuration changes.

## Mandatory rules

1. Inspect the capabilities and tools actually available in this Coworker session. Do not assume that a marketplace manifest has already been refreshed.
2. If `aep-lab-entry` is available, begin with `lab_mcp_access_info`, `lab_mcp_contexts`, and `lab_mcp_recommend_context`.
3. If `aep-lab-adobe-capabilities` or `adobe_api_catalog` is available, use it for the 35-service inventory. If it is not available, use the inventory in this prompt and label it as a supplied snapshot.
4. Coworker may expose only 13 Lab connections until pending marketplace updates are deployed. The reviewed source target is 15 connections, adding `aep-lab-adobe-capabilities` and `aep-lab-measurement-quality`; absence in the installed plugin is not proof that either must be designed again.
5. Prefer a focused Lab MCP for ordinary work. Use `aep-lab-general` only when an exact tool is missing from a focused connection.
6. Also inspect the native **Adobe CX Coworker Gateway** tools. Prefer a native Adobe tool when it already performs the required product-native operation safely.
7. Match by **business outcome**, not merely by API or tool name. Two tools are duplicates when they produce substantially the same result with the same authority and guardrails.
8. A connected Console service or issued token is not proof of tenant access. Keep these evidence states separate:
   - `connected`
   - `token_issued`
   - `tenant_verified`
   - `operation_verified`
9. Use a harmless, bounded read to verify tenant access. Never use a billable, destructive, administrative, or non-idempotent operation as an entitlement test.
10. Do not recommend one MCP per API. Recommend a new MCP only when several APIs form a coherent user workflow that is not already owned by an existing MCP.
11. Never recommend a generic proxy that accepts a caller-supplied Adobe host, URL, path, HTTP method, GraphQL mutation, or arbitrary request body.
12. For writes use: inspect -> preview -> exact confirmation -> one apply -> readback.
13. For billable creative work use: capabilities -> preview -> exact confirmation -> one non-retried submit -> job status.
14. Do not expose client secrets, bearer tokens, signed asset URLs, suppression addresses, private customer data, or other credentials in the report.

## Known Lab MCP connections to check

The target marketplace configuration contains the following 15 connections, but the installed Coworker plugin may still expose only 13. Verify what is actually callable.

| Connection | Existing responsibility |
|---|---|
| `aep-lab-entry` | Capability directory and workflow recommendation |
| `aep-lab-general` | Complete Lab catalog and advanced fallback |
| `aep-lab-profiles` | AEP profile lifecycle, events, and Snowflake enrichment |
| `aep-lab-demo-prep` | Brand research, assets, customer switching, and demo configuration |
| `aep-lab-pdf-prep` | HTML/document-to-PDF, storage, and templates |
| `aep-lab-audiences` | Governed audience inventory, audit, and deletion |
| `aep-lab-decisioning` | AEP Edge decision evaluation, explanation, and catalog diagnostics |
| `aep-lab-ajo-cleanup` | Governed AJO journey and campaign cleanup |
| `aep-lab-command-centre` | User-scoped engagements, tasks, and meetings |
| `aep-lab-weather` | Weather and map context for demos |
| `aep-lab-commerce` | Adobe Commerce as a Cloud Service storefront and governed administration |
| `aep-lab-commerce-optimizer` | Commerce Optimizer reads and governed ingestion |
| `aep-lab-firefly` | Governed Firefly image, video, Text to Speech, transcription/captions, dubbing/lip sync, and shared asynchronous job handling |
| `aep-lab-adobe-capabilities` | Read-only 35-service catalog plus bounded AJO and GenStudio probes |
| `aep-lab-measurement-quality` | Read-only Assurance metadata, Tags property/environment audit, and Adobe Status correlation |

The native `adobe-cx-coworker-gateway` may already expose product-native AEP, RTCDP, AJO, CJA, Analytics, Workfront, or other Adobe tools. Record exact native tool evidence before recommending a Lab wrapper.

## API-to-workflow cross-reference baseline

Use this table as the starting hypothesis. Confirm or correct every row using the tools available in the current session.

| Connected API | Check for existing ownership first | Default disposition if a gap remains |
|---|---|---|
| Adobe Experience Platform API | `aep-lab-profiles`, `aep-lab-audiences`, `aep-lab-decisioning`, native Adobe gateway | Extend an existing focused MCP only for a missing governed use case |
| Adobe Journey Optimizer | `aep-lab-ajo-cleanup`, `aep-lab-adobe-capabilities`, native Adobe gateway | Extend the existing AJO or decisioning workflow; do not create a general AJO duplicate |
| Adobe Target | `aep-lab-decisioning`, native Adobe gateway | Extend Decisioning with bounded Target delivery evaluation and AEP-versus-Target comparison |
| Adobe Campaign | Native Adobe gateway and existing AJO capabilities | Defer unless a concrete Campaign coexistence or migration workflow is required |
| Adobe Places | Existing profile/event tools and native Adobe gateway | Defer until a location-aware mobile journey has a real requirement |
| Adobe Firefly API | `aep-lab-firefly` | Already owns governed Image 5 and text/keyframe-to-video generation; do not create a separate video MCP |
| Adobe Firefly Audio and Video API | `aep-lab-firefly` | Already owns voice listing, Text to Speech, transcription/translated SRT captions, and dubbing/lip sync; only add reframe, avatar, or dynamic graphics when a concrete use case is approved |
| Adobe Photoshop API | `aep-lab-firefly`, `aep-lab-demo-prep`, any native creative tool | Add curated Photoshop v2 production operations to a Creative Production workflow |
| Adobe Lightroom API | `aep-lab-demo-prep`, any native creative tool | Add auto-tone, straighten, preset, and controlled edit operations to Creative Production |
| Adobe Content Tagging API | `aep-lab-demo-prep`, Firefly asset outputs, AEM/GenStudio tools | Add tagging as a supply-chain step, not as its own MCP |
| Adobe Express API beta | Native Express capabilities and template tools | Add tagged-document variations to Creative Production only after entitlement is verified; keep visibly beta |
| Adobe Express Review API | Frame.io/native review tools | Use only if it fills a review gap not already covered by Frame.io |
| Adobe Illustrator API | Existing PDF/demo-prep tools and native creative tools | Add selected data merge, rendition, or image trace operations to Creative Production |
| Adobe InDesign API | `aep-lab-pdf-prep`, native document tools | Add data merge or rendition only when it extends, rather than duplicates, PDF preparation |
| Adobe Substance 3D API | Commerce product media and Firefly creative tools | Add 3D product rendering/compositing to Creative Production as a specialist later phase |
| Adobe PDF Services | `aep-lab-pdf-prep` | Already owned; extend the existing PDF MCP only |
| GenStudio for Performance Marketing API | `aep-lab-adobe-capabilities`, native GenStudio tools | Place approved-experience discovery in a Content Supply Chain workflow |
| Frame.io API | Native Frame.io tools, GenStudio and review capabilities | Use as the human review/approval gate in Content Supply Chain |
| AEM Assets Author API | Native AEM tools and demo asset handling | Add governed DAM inventory and publish operations to Content Supply Chain |
| AEM Dynamic Media API | Native AEM tools and demo asset delivery | Add rendition and delivery URL resolution to Content Supply Chain |
| AEM Cloud Service Sites Content Management | Native AEM tools | Add content-fragment synchronization to Content Supply Chain |
| AEM Content AI | AEM asset metadata and Content Tagging | Add enrichment only if it provides distinct metadata or discovery value |
| Adobe Smart Content | AEM/GenStudio search and Content Tagging | Prefer reuse inside Content Supply Chain; do not create a standalone MCP |
| AEM Edge Delivery Services | Existing demo publishing and native AEM tools | Add governed publication only when it is not already available natively |
| Customer Journey Analytics | Native Adobe gateway and any existing reporting tools | Add bounded journey reports to a Measurement and Quality workflow only when native tools do not cover the Lab use case |
| Adobe Assurance API | Existing profile/event diagnostics and native Adobe gateway | Add session and event diagnostics to Measurement and Quality |
| Experience Platform Launch API | Existing event infrastructure and native Tags tools | Add read-only property/environment audit to Measurement and Quality; gate configuration writes separately |
| Adobe Status API | Existing health/readiness tools | Add relevant incident correlation to Measurement and Quality, not a standalone MCP |
| Adobe Commerce as a Cloud Service | `aep-lab-commerce` | Already owned; extend the existing Commerce MCP only |
| Adobe Commerce Optimizer Ingestion | `aep-lab-commerce-optimizer` | Already owned; extend the existing Commerce Optimizer MCP only |
| Adobe I/O Events | Existing job polling, GenStudio/Frame.io/AEM events | Use as shared event infrastructure behind workflows; expose only bounded readiness or journal tools if users need them |
| Adobe I/O Management API | Existing capability/access inspection | Keep as backend administration; do not expose secret-management operations through an ordinary MCP |
| Adobe App Builder Data Services | Existing Firestore/job state | Use internally for event cursors or deduplication only if it solves a demonstrated state-management need |
| Adobe Fusion | Existing orchestration and event capabilities | Defer unless a specific third-party handoff cannot be handled by the existing workflow |
| Adobe Privacy Service API | Native privacy tools, if any | Keep isolated as a future governed Privacy Administration MCP; never mix with demo cleanup |

## Candidate MCP topology if genuine gaps are confirmed

Do not treat these as already deployed. Recommend them only after the duplicate-capability audit.

### Extend `aep-lab-firefly`

- Firefly Generate Video.
- Audio/video transcription and captions.
- Translation, dubbing, and optional lip-sync.
- Later: reframe, text-to-speech, avatar, and dynamic graphics rendering.
- Reuse the existing preview, confirmation, job-status, cancellation, audit, and non-retry guardrails.

### Extend `aep-lab-decisioning`

- Bounded Adobe Target delivery evaluation.
- Explanation of Target decisions.
- Side-by-side AEP Edge and Target outcome comparison using the same approved context.

### Potential new `aep-lab-content-supply-chain`

Coherent outcome:

`approved GenStudio experience -> Frame.io review -> AEM Assets -> Dynamic Media -> AEM Sites or Edge Delivery -> AJO/Target activation`

Create this only if native Coworker tools do not already support the complete governed handoff.

### Potential new `aep-lab-creative-production`

Coherent outcome:

`approved brief or source asset -> deterministic edit/template variation -> tagging -> review-ready output`

Begin with Photoshop v2, Lightroom, Content Tagging, and Express beta. Add Illustrator, InDesign, and Substance 3D only for demonstrated use cases.

### Verify planned `aep-lab-measurement-quality`

Coherent outcome:

`validate collection -> inspect Assurance events -> measure the journey in CJA -> correlate Adobe service incidents`

The first source release is read-only. Reuse it if callable; do not propose another measurement MCP with the same outcome.

### Shared infrastructure, not a marketplace MCP by default

- Adobe I/O Events for completion and content-change notifications.
- Adobe I/O Management for bounded registration readiness.
- App Builder Data for event positions and deduplication when needed.

## Required audit output

Return one consolidated table with these columns:

| Adobe API | Connected evidence | Exact existing MCP/native tool evidence | Existing business outcome | Remaining gap | Decision | Target owner |
|---|---|---|---|---|---|---|

Allowed values for **Decision**:

- `reuse existing`
- `extend existing MCP`
- `new focused MCP justified`
- `backend capability only`
- `defer`
- `blocked pending entitlement`

After the table, provide:

1. **Duplicate capabilities avoided** — name every proposed tool or MCP that should not be built because an existing capability already owns the outcome.
2. **Confirmed gaps** — rank only the gaps supported by exact tool evidence.
3. **Recommended implementation order** — smallest useful read-only slice first; billable, write-heavy, and deployment work last.
4. **Access evidence gaps** — APIs that are merely connected or token-issued but not tenant-verified.
5. **Marketplace result** — state which existing connections change, which new focused connections are justified, and the resulting connection count. Do not count backend-only adapters as marketplace MCPs.

Do not implement anything during this audit. End by asking for approval of the consolidated change list before any code or deployment work begins.
