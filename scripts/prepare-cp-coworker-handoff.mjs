import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const model = require(path.join(root, 'web', 'profile-viewer', 'cp-decisioning-model.js'));
const planPath = path.join(root, 'web', 'profile-viewer', 'cp-decisioning-catalog-plan.json');
const outputPath = path.join(root, 'docs', 'CP_COWORKER_HANDOFF.md');
const docsBase = 'https://experienceleague.adobe.com/en/docs/journey-optimizer/using/decisioning/experience-decisioning/experience-decisioning-api-reference/';
const verifiedTextFields = ['agentScript', 'briefMessage', 'compactDescription', 'compactSubtitle',
  'compactTitle', 'fullCTA', 'title', 'fullDescription', 'fullSubtitle'];
const offerSchemaEvidence = {
  id: 'https://ns.adobe.com/demoemea/schemas/5d5eedc2795d4dd54a076473b4b16a468953af983b80ee6',
  version: '1.1', sandbox: 'kirkham', verifiedOn: '2026-11-09',
  source: 'Read-only Coworker Schema Registry GET of the schema resolved by lab_decisioning_catalog_schema.',
  responseSha256: 'd4d3c39eaa9a59242b63484468f2e7507d1df2a31cfda3e08d33c262ebacf379',
  textLeafTypes: Object.fromEntries(verifiedTextFields.map(key => ['_demoemea.content.textContent.' + key, 'string'])),
  availableImageSourcePaths: ['imageHighRes', 'image', 'imageSmallRes', 'thumbnail'].map(key =>
    '_demoemea.content.mediaAssets.' + key + '.sourceURL'),
  imageSlotValuesResolved: false,
  imageAltCustomAttributeExists: false,
};
const historicalIds = [
  ['1d6ab9450b41c09c', '1d6ab98e204b531b', '1d6ab9e1f6ff9661'],
  ['1d6ab9477f81c09d', '1d6ab990908b531c', '1d6ab9e54c1fe121'],
  ['1d6ab949a4b677e6', '1d6ab99444cb531d', '1d6ab9e86bbf9662'],
  ['1d6ab94d2ec1c09e', '1d6ab99cb459afa3', '1d6ab9eaac5fe122'],
  ['1d6ab951123677e7', '1d6ab9a0da99afa4', '1d6ab9ee7d3f9663'],
  ['1d6ab953faf677e8', '1d6ab9a413cb531e', '1d6ab9f2639fe123'],
  ['1d6ab957333677e9', '1d6ab9a88e99afa5', '1d6ab9f59c7f9664'],
];

export function buildSpecification() {
  const saved = JSON.parse(readFileSync(planPath, 'utf8'));
  const current = model.catalogPlan(saved.evidence);
  const consent = { operator: 'and', conditions: ['emailConsent', 'personalize'].map(key => ({
    path: model.fields.find(field => field.key === key).path, op: 'eq', value: 'y',
  })) };
  assert.deepEqual(model.rulePayload('CP - Consent gate', consent), saved.consentGate);
  const sources = [
    ['web', 'profile-viewer', 'cp-decisioning-model.js'],
    ['web', 'profile-viewer', 'cp-decisioning-catalog-plan.json'],
    ['web', 'profile-viewer', 'cp-decisioning-demo.html'],
    ['web', 'profile-viewer', 'cp-decisioning-visualiser.html'],
    ['web', 'profile-viewer', 'tui-decisioning-demo.js'],
    ['web', 'profile-viewer', 'tui-decisioning-visualiser.js'],
    ['web', 'profile-viewer', 'tui-decisioning-runtime.js'],
    ['web', 'profile-viewer', 'content-decision-edge-mounts.js'],
  ].map(parts => ({ path: parts.join('/'),
    sha256: createHash('sha256').update(readFileSync(path.join(root, ...parts), 'utf8').replace(/\r\n/g, '\n')).digest('hex') }));
  return {
    formatVersion: 1,
    scope: { customerAssetPrefix: 'CP', sandbox: 'kirkham',
      orgId: 'BF9C27AA6464801C0A495FD0@AdobeOrg', lifecycle: 'draft',
      liveMutationsAuthorizedByThisDocument: false, activationAllowed: false,
      profileChangesAllowed: false, deploymentAllowed: false },
    sources,
    historicalSchemaEvidence: saved.evidence,
    schemaEvidenceRequiresFreshRead: true,
    offerSchemaEvidence,
    catalogIdHint: 'xcore:decision-catalog:18c6b876319b00e4',
    eligibilityDesign: { attachment: 'combined-per-offer',
      approvedChoice: 'Combined eligibility on each CP offer (Recommended)',
      approvalScope: 'Attachment design only; exact mutations still need preview and explicit approval.',
      composition: 'consent AND objective AND optional item condition',
      standaloneConsentOrObjectiveRulesToCreate: 0,
      combinedOfferRulesToCreate: 21, strategyProfileConstraintType: 'none' },
    profileControls: model.fields.map(({ fromProfile, toProfile, ...field }) => ({
      ...field, storageType: field.schemaType || field.type,
      choicesAreLocalPresetsNotSchemaEnums: !!field.values,
      usedInEligibility: !['ready', 'points'].includes(field.key),
      ...(field.key === 'days' ? { conversion: 'Whole UTC calendar-day countdown <-> YYYY-MM-DD checkInDate; never store the countdown.' } : {}),
    })),
    ordering: { localObjectiveEvaluation: model.objectives.map(objective => objective.key),
      localItemEvaluation: 'Descending numeric item priority within the first eligible objective with an eligible item.',
      scenarioPresentation: model.demoScenarios.map(scenario => scenario.rank),
      adobePolicyOrderVerified: false, adobeStaticPriorityDirectionVerified: false,
      warning: 'Source strategy rank.priority values are 1..7. These values alone do not implement the local stop-first policy ladder.' },
    objectives: model.objectives.map((objective, index) => {
      const source = current.objectives[index];
      const [tagId, collectionId, strategyId] = historicalIds[index];
      const tagRef = '{{UNIFIED_TAG_UUID:' + objective.key + '}}';
      const uiModel = JSON.parse(source.collection.constraints[0].uiModel);
      uiModel.value.right = [tagRef];
      return {
        key: objective.key, rank: index + 1,
        tag: { name: source.tag.name, category: 'Uncategorized', id: null,
          createCandidate: { name: source.tag.name }, taxonomyScope: 'Adobe organization, not sandbox-isolated' },
        historicalAssets: { evidenceDate: '2026-11-09', notFreshlyVerified: true,
          legacyDpsTagId: 'dps:tag:' + tagId,
          collectionId: 'dps:item-collection:' + collectionId,
          strategyId: 'dps:selection-strategy:' + strategyId,
          warning: 'Existing collections reference legacy DPS tags. Inspect exact definitions; do not reuse as correct, overwrite, or duplicate silently.' },
        collectionCreateCandidate: { name: source.collection.name,
          constraints: [{ itemCatalogId: '{{LIVE_RESOLVED_CATALOG_ID}}', uiModel: JSON.stringify(uiModel) }] },
        collectionContractRequiresSandboxVerification: true,
        tagMembershipPredicate: { path: '_experience.decisioning.decisionitem.itemTags',
          operator: 'in', uuids: [tagRef] },
        strategyCreateCandidate: { name: source.strategy.name, rank: source.strategy.rank,
          optionSelection: { filter: '{{COLLECTION_ID:' + objective.key + '}}' },
          profileConstraint: { profileConstraintType: 'none' } },
        offers: objective.offers.map(offer => {
          assert.deepEqual(Object.keys(offer.content).sort(), [...verifiedTextFields].sort(),
            'New source content fields need explicit offer-schema verification.');
          const combined = { operator: 'and', conditions: [consent, objective.rule, ...(offer.rule ? [offer.rule] : [])] };
          const itemConstraints = { profileConstraintType: 'eligibilityRule',
            eligibilityRule: '{{OFFER_RULE_ID:' + offer.key + '}}' };
          return {
            key: offer.key, name: offer.name, lifecycleStatus: 'draft', itemPriority: offer.priority,
            itemDescription: 'CP decisioning demo offer.',
            itemTags: [tagRef],
            itemConstraints,
            sourceContent: offer.content,
            sourceImage: { localPreviewPath: 'web/profile-viewer/' + offer.image,
              sha256: createHash('sha256').update(readFileSync(path.join(root, 'web', 'profile-viewer', offer.image))).digest('hex'),
              alt: offer.imageAlt, verifiedPublicUrl: null },
            destinationUrl: null,
            customAttributeApiMapping: Object.fromEntries(verifiedTextFields.map(key =>
              [key, '_demoemea.content.textContent.' + key])),
            offerCreateCandidate: {
              _experience: { decisioning: {
                decisionitem: { itemCatalogID: '{{LIVE_RESOLVED_CATALOG_ID}}', itemName: offer.name,
                  itemDescription: 'CP decisioning demo offer.', itemPriority: offer.priority,
                  itemTags: [tagRef], itemConstraints },
                offeritem: { lifecycleStatus: 'draft' },
              } },
              _demoemea: { content: { textContent: offer.content } },
            },
            mediaOmittedPendingApprovedUrlAndSlotMapping: true,
            combinedEligibilityAst: combined,
            combinedEligibilityRuleCreateCandidate: model.rulePayload(offer.name + ' eligibility', combined),
          };
        }),
      };
    }),
    scenarios: model.demoScenarios.map(scenario => ({ ...scenario,
      profileWriteInstructions: 'Reference presets only. No profile creation or update is authorized. Convert days at execution date only after separate profile approval.' })),
    pageIntegration: {
      shellPath: '/profile-viewer/cp-decisioning-demo.html',
      visualiserPath: '/profile-viewer/cp-decisioning-visualiser.html',
      envPrefix: 'cpDecisioning', iframeId: 'cp-visualiser', mountLayoutPreset: 'generic',
      runtimeScript: 'tui-decisioning-runtime.js', viewName: 'CP Decisioning', eventTenantNamespace: '_demoemea',
      autoRunDecisioning: false,
      channels: [{ query: 'email', label: 'Email Desktop', container: 'email-preview' },
        { query: 'mobile', label: 'Mobile App', container: 'mobile-preview' },
        { query: 'web', label: 'Full-width Web', container: 'web-preview' }],
      delivery: 'One returned live hero is rendered into all three preview channels; these are not three independent AJO delivery surfaces.',
      requiredReturnedFragment: 'hero-banner',
      supportingDefaultFragments: ['TopRibbon', 'ContentCardContainer'],
      surfaceTemplateNotResolvedValue: 'web://{{APPROVED_PREVIEW_HOST}}/profile-viewer/cp-decisioning-visualiser.html#hero-banner',
      surfaceResolution: 'Runtime strips query/hash and requests placements for effective iframe URL, saved lab targetPageUrl and shell URL, deduplicated. Inspect saved placements: they can override defaults.',
      verifiedHost: null, datastreamId: null, decisionPolicyId: null,
      liveContract: 'Exactly one fresh non-default hero proposition with original id/scope/scopeDetails, item IDs and a loadable HTTP(S) image. Prepare image, commit visible content, send one attributed display event. Retain the previous successful decision on a failed Run.',
      ctaBehavior: 'Preview button only: reports that it is not connected to a booking service. No destination URL is sourced.',
    },
    resultMappingTemplate: {
      sandbox: 'kirkham', orgId: 'BF9C27AA6464801C0A495FD0@AdobeOrg',
      catalogComplete: false, edgeReady: false, unresolved: [],
      offerSchema: { id: null, version: null }, catalogId: null,
      objectives: model.objectives.map(objective => ({
        key: objective.key, tag: { uuid: null, etag: null, createdAt: null, reused: null, readbackVerified: false },
        collection: { id: null, etag: null, memberOfferIds: [], membershipVerified: false },
        strategy: { id: null, etag: null, collectionId: null, readbackVerified: false },
        offers: objective.offers.map(offer => ({
          key: offer.key, offerId: null, offerEtag: null, ruleId: null, ruleEtag: null,
          tagUuids: [], itemPriority: offer.priority, lifecycleStatus: null,
          ruleAttachmentVerified: false, pqlVerified: false, visualModelVerified: false,
          contentMapping: {}, imageUrl: null, destinationUrl: null, readbackVerified: false,
        })),
      })),
      page: { host: null, datastreamId: null, policyId: null, orderedStrategyIds: [],
        placements: [], surfaces: [], liveOfferIds: [], liveStrategyIds: [], actualEdgeValidation: 'not-run' },
    },
  };
}

export function renderHandoff(spec = buildSpecification()) {
  const rows = spec.objectives.flatMap(objective => objective.offers.map(offer =>
    `| ${objective.rank} | ${objective.tag.name} | ${offer.name} | ${offer.itemPriority} |`)).join('\n');
  return `# CP Coworker creation handoff

Copy this entire document into Coworker, or attach it and ask Coworker to follow it.
The embedded specification is self-contained; no access to the local repository is assumed.
Generated by \`node scripts/prepare-cp-coworker-handoff.mjs\`; do not hand-edit the generated appendix.

## Prompt

Using your already-authorized Adobe DX API connection, prepare the **CP** Experience
Decisioning catalog in sandbox **kirkham**, org **BF9C27AA6464801C0A495FD0@AdobeOrg**.
Use CP for every new asset name and demo-safe name/description metadata. Preserve
the exact customer-facing source content below, including brand references inside
body copy. Do not copy another customer's offers or content.

**Start read-only. This handoff is not approval to mutate.** Inspect, reconcile,
show the exact payloads/dependencies and blockers, then wait for my explicit
confirmation of that scoped preview before creating or modifying anything.
Do not activate assets, change profiles, extend schemas, edit TUI assets, change
policies/campaigns/datastreams, deploy, or create unrelated Thursday/Thurs-T assets.
Never ask me to paste access tokens, keys or secrets.

### Exact design and content

Use the embedded 7 objectives, 21 offers and 21 combined rules, not a generic site
clone. The confirmed attachment design is **consent AND objective AND optional
item condition on each offer**. Its original approval covered design only.
Attach each returned rule ID to that offer's
\`_experience.decisioning.decisionitem.itemConstraints\` using
\`{profileConstraintType:"eligibilityRule",eligibilityRule:<returned rule ID>}\`
on initial creation. Leave strategies at \`profileConstraintType:"none"\`.
Do not create the separate consent/objective rule fragments as extra assets.
Do not replace this with strategy-only or both-level targeting.

Each combined rule candidate below contains exact PQL AND the full matching
\`segmentModel\` visual attribute tree. POST rules to
\`https://platform.adobe.io/data/core/dps/offer-rules\` with \`exdRule:true\`.
Verify current sandbox acceptance and read back both PQL and visual attributes.
The model's \`lifecycleState:"published"\` is editor metadata, not permission to
approve/activate an offer. Do not silently drop visual metadata on rejection.

The local simulator checks objectives 1 -> 7, then descending numeric item
priority within the first eligible objective containing an eligible item.
Scenarios are presented 7 -> 1. The source strategy priorities are 1..7 with static
ordering, but neither their live interpretation nor stop-first policy composition
is verified. Do not invent exclusivity rules, reverse priorities, add a ranking
formula, frequency caps, or infer a live policy from these numbers.

| Rank | Objective/tag | Offer | Source item priority |
|---|---|---|---|
${rows}

### Inspect before proposing writes

1. Verify the signed-in org/sandbox. Re-resolve the full offer schema URI and
   catalog ID; embedded IDs are historical hints, not defaults. Read the current
   Operational Profile schema pinned to its actual minor version, and verify all
   14 paths/types. The evidence snapshot is not a fresh verification.
2. Paginate existing Unified Tags, offers, rules, collections and strategies.
   Reuse only an exact, unambiguous definition match, including membership scope,
   priority, lifecycle, content and eligibility. Inspect all historical IDs below.
   Existing CP collections reference legacy DPS tags and may be empty; do not
   treat them as correct. Conflicting definitions need a separately reviewed
   correction plan, not silent updates, duplicate names, deletion or overwrites.
3. Use Unified Tags at **https://experience.adobe.io/unifiedtags/tags**, not
   \`/data/core/dps/tags\`. Resolve/create the seven exact names under Uncategorized
   through your authorized connection. Their IDs must be actual Unified Tag UUIDs,
   never invented UUIDs or \`dps:tag:\` IDs. Names in \`itemTagDetails\` do not create
   tags. Preview any creation before confirmation. Unified Tags are org-owned:
   the sandbox header does not make the taxonomy sandbox-isolated. The minimal
   create candidates contain the exact name only; verify the live contract and
   Uncategorized readback rather than submitting the surrounding specification
   metadata as a tag API body.
4. Freshly verify the collection API contract against current sandbox/schema or
   a known-good collection. The current official create example uses
   \`constraints:[{itemCatalogId,uiModel:"<JSON-serialized operator/value model>"}]\`
   and **does not contain a SQL constraint field**. The candidates below follow
   that shape, with the source tag operator/value model. Older CP plan SQL is not
   an executable contract. Verify UUID-based tag matching, not merely a 2xx.
5. Recheck the embedded offer-schema evidence (version 1.1, read-only verified on
   2026-11-09). All nine source text properties map exactly to existing string
   leaves at \`_demoemea.content.textContent.<source property>\`, including
   \`agentScript\` and \`fullCTA\`. The initial-create candidates below include all
   nine unchanged values plus the schema-backed draft/name/priority/tag/rule fields.
   Media values remain unresolved: the schema has imageHighRes, image, imageSmallRes
   and thumbnail sourceURL leaves, but no image-alt custom attribute. Do not invent
   an alt leaf, pick an unverified delivery slot, or silently drop source alt text
   from the later treatment review. Show the complete mapping in the preview.

### Mandatory blockers and boundaries

- Media are seven local preview files with exact hashes/alt text, not public URLs.
  Discover an already-approved hosted match or ask for an approved URL. Do not use
  localhost, fabricate production URLs, upload media or deploy without approval.
  The CTA is deliberately a local feedback button; there is no sourced destination
  URL. Do not invent one. Review omission of optional fields explicitly; an omitted
  image cannot satisfy this page's live hero contract.
- Verify the relative-date PQL and visual editor's **today anchor**, UTC calendar
  semantics, missing/past-date behavior and inclusive bounds before creating
  date-dependent rules. Prepare means Booked + 0..14 days; its arrival item means
  0..1 day. Grow means Booked + 15..365 days. The source rolling model is a
  candidate, not proof Adobe's editor/evaluator matches it.
- Strings use case-insensitive comparison in the source condition models.
  Simulation requires consent values exactly lowercase \`y\`; its consent check is
  case-sensitive while exported PQL uses the common case-insensitive string
  comparator. Verify actual schema-stored consent values stay lowercase \`y/n/u\`
  for parity; do not normalize/write profiles or change rules silently.
- Control choices/defaults and scenario presets are local demo examples, NOT schema
  enums/defaults/suggested values. The six approved hospitality fields already
  exist; no schema additions or suggested values are requested. Lodge-ready and
  loyalty-points controls are informational, not eligibility or CP rewards.
- Source plan/UI statements saying no assets exist or attachment is undecided are
  stale. The embedded historical receipt and confirmed per-offer design supersede
  those statements, but do not replace fresh live inventory.
- A CP-only policy is not yet verified. Profiles may still qualify for unrelated
  TUI offers. Catalog work cannot prove CP isolation. Policy/campaign, placement,
  host, datastream and activation wiring are separate approval boundaries.

### After the exact preview is explicitly confirmed

Create/reuse dependencies serially, recording each result immediately. For every
new Unified Tag capture its UUID and creation time, then wait **at least 120 seconds**
before submitting a dependent offer. This is an observed propagation delay,
not a readiness guarantee. Read the tag back and stop on rejection; do not probe
formats or automatically replay a mutation.

Use POST \`https://platform.adobe.io/data/core/dps/offer-items\` with the freshly
resolved full tenant schema URI in \`x-schema-id\` and the confirmed scope headers.
Use the inspected schema for the actual body. Preserve each exact offer name,
source copy, source priority and draft lifecycle. Include real Unified Tag UUIDs
in \`_experience.decisioning.decisionitem.itemTags\` and the actual combined rule
reference on INITIAL create. Never submit unresolved placeholders or null mapping
entries from this specification.

Never experiment on existing tag sets: invalid-tag PATCH has been observed to
clear tags even on failure. No replacing the set and no JSON Patch \`add\` at an
existing tag property. Conflicting existing assets require an approved, non-probing
plan; if safe reconciliation is not available, stop rather than patching.

Substitute only real returned IDs into collection catalog/tag references, offer
rule references and strategy collection filters. Preserve the source static rank
payloads, subject to the reviewed contract. GET every asset after each mutation,
including offer \`itemTags\` AND \`itemTagDetails\`, exact content/priority/draft state,
rule attachment, PQL and visual tree. Verify collections actually contain the
intended three CP offer IDs and report any additional members; prove customer
exclusivity rather than assuming it from a tag name.

On timeout, lost response, partial creation or ambiguous result, preserve request
time/scope/payload hash and any IDs, then reconcile inventory/readback. Never
blindly replay, claim rollback or infer success from a tool envelope.

### Return and page-integration checklist

Return the filled \`resultMappingTemplate\` below, plus raw validation outcomes and
every blocked, reused, created or conflicting asset. Capture UUIDs/IDs, etags,
creation timestamps, exact dependency links, resolved schema/custom-attribute map,
media/CTA decisions and membership evidence. Use \`unknown\`/unverified explicitly;
never fill a missing result with an example ID.

Report **catalog-complete** separately from **Edge-ready**. Drafts are not
deliverable. No live Run or test-profile mutation is authorized by this prompt.
For a separately approved integration, the returned mapping must support:

- all 21 source offer keys -> returned offer IDs -> their combined rule IDs;
- all seven objective keys -> Unified UUID -> collection -> strategy;
- verified CP-only policy strategy ordering/fallback -> actual datastream ->
  actual approved page host, configured placements and exact surface strings;
- Email Desktop \`channel=email\` / \`#email-preview\`, Mobile App \`channel=mobile\` /
  \`#mobile-preview\`, Web \`channel=web\` / \`#web-preview\`, all inside
  \`cp-visualiser\`; one live hero treatment is shared across these views;
- the source \`#hero-banner\` contract and original proposition/item/strategy
  metadata, one attributed display notification after the image is visible,
  explicit Apply/Run and retention of the last successful live decision;
- independent confirmation of profile ingestion and actual Edge propagation,
  overlap/service-first, consent/no-content and date/score boundary scenarios.
  Local scenario predictions must remain labeled simulation, not live results.

The runtime builds surfaces from the effective iframe URL first, also saved lab
target URL and shell URL, stripping query/hash and deduplicating. Inspect configured
placements (defaults are TopRibbon, hero-banner, ContentCardContainer); the host and
saved config remain unresolved. Do not register three invented channel surfaces,
point CP at a TUI policy, or substitute example IDs in page configuration.

### Contract references

- Unified Tags: https://experienceleague.adobe.com/en/docs/experience-platform/administrative-tags/api/tags
- Collections: ${docsBase}items-collections/create
- Strategies: ${docsBase}selection-strategies/create
- Rules: ${docsBase}eligibility-rules/create

Official create examples confirm shapes, not current sandbox acceptance, editor
date semantics or approval of an unspecified eligibility attachment.

## Embedded source-derived specification

All \`{{...}}\` references are unresolved dependency markers, not literal API values.
Null media/config/mapping values are blockers or explicitly optional decisions to
review, not success-shaped defaults. Source hashes permit later drift checks.

\`\`\`json
${JSON.stringify(spec)}
\`\`\`
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const content = renderHandoff();
  if (process.argv.includes('--check')) {
    assert.equal(readFileSync(outputPath, 'utf8').replace(/\r\n/g, '\n'), content, 'Regenerate the CP Coworker handoff after source changes.');
    console.log('CP handoff matches its source model, content and runtime.');
  } else {
    writeFileSync(outputPath, content);
    console.log('Generated ' + path.relative(root, outputPath));
  }
}
