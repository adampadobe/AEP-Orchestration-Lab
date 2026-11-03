# H&M UAE website demo

Open `/profile-viewer/hm-demo.html` from the Lab. The **H&M UAE → Web** navigation
entry is marked in development. Canonical files are in `web/profile-viewer/`;
the Express prototype is a one-way mirror maintained by
`npm run sync-profile-viewer-ui`.

## Scope and reference fidelity

This is an independently implemented, reference-led demonstration, not the live
H&M service. User-supplied homepage and Women/Men department captures provide the
reference imagery and layout. The homepage reproduces the captured sale banner,
campaign poster, editorial pairs, New In grid, collections and footer. Women
shopping, product details, bag and checkout are original demo screens because no
captures of those screens were supplied. Product descriptions, prices, sizes,
availability and orders are illustrative, not live catalog facts.

No captured scripts, trackers, cookies, account state or proprietary font binaries
are shipped. System typography approximates the captured font. The captured
campaign has a poster but no playable video; the demo uses that poster without
pretending playback is available. The dated promotion reproduces a reference,
not a current offer. Asset attribution is recorded under `hm-assets/`.

## Preview and Adobe recording

The storefront starts in **preview**. Browsing, bag and simulated
checkout work without Adobe configuration. Shopping actions do not call the SDK
or event generator in preview. Local state is scoped to the current mode, sandbox
and browser visitor in session storage; changing context selects a separate bag.
Do not enter real payment details, passwords or customer data. Checkout is local
and synthetic; no payment is taken and no H&M order is placed.

The Women catalogue is the implemented department. Men, Kids, Home, Beauty and
Favourites display explicit scope notices; they do not imply working shopping
flows. Search filters the local catalogue. Each product has one captured photo;
the second gallery view is a crop, not an additional product photograph.

The shared environment strip remains available for Tags, profile lookup,
decisioning, Brand Concierge, web push and New visitor. Injecting Tags, stitching
a profile, or explicitly using those controls can contact Adobe independently of
preview shopping. Presenter controls start with **Record interactions to Adobe**
unchecked. Preview actions are never replayed when recording is enabled.

To record subsequent actions:

1. Select the intended sandbox and inject its Tags configuration.
2. Select the configured `lab-event-tool-edge` generator target and matching
   Event tool datastream in the Lab Adobe Target override.
3. Optionally connect an existing synthetic profile using the account screen or
   Lab profile lookup. The live browser ECID is stitched to that verified email;
   a previous device ECID is not substituted.
4. Enable **Record interactions to Adobe** in Presenter controls. This reads the
   saved Event tool configuration and resolved schema; it does not provision or
   modify infrastructure. Incompatible configuration leaves recording off.

Another customer requires **New visitor** once this browser is bound to an email.
Changing an identifier invalidates verification. A sandbox change disables
recording and requires fresh SDK resolution. Never use one Adobe visitor to
impersonate different people.

## Hosted concierge chat

The black bottom-right chat bubble opens the supplied CloudFront H&M concierge
in a cross-origin iframe. It has no unread-count badge. The iframe is created only
on first open and retained when closed so the remote conversation can continue
while browsing the storefront. The header's **Docked / Modal** toggle switches
between the bottom-right panel and a large, centred overlay with more space for
the hosted app's images and cards. It resizes the same iframe without reloading
the conversation. Modal mode blocks interaction and scrolling behind the chat;
Docked restores storefront interaction. The selection lasts until page reload.
This changes the available space, not the hosted app's content or capabilities.
The panel has a close button and a new-tab link
for browsers or networks that block framing. Escape closes it when focus is in
the parent page; when focus is inside the remote frame, use the visible close
button (or the bubble in Docked mode).

The embedded app owns its chat session, network calls and data handling. No Lab
profile identifier, sandbox, credentials or shopping data is passed to it.
Lab preview mode and New visitor do not configure or reset that separate chat
session. Opening the bubble contacts the hosted service even in shopping preview
mode. Use synthetic demo information only. The existing Lab Brand Concierge
injection controls remain separate.

## Event contract and schema boundary

`hm-events.js` validates and builds the generator request. The generator is called
with explicit `xdmStyle: 'full'`, `_id` and `timestamp`. Supported types are
`commerce.productViews`, `commerce.productListAdds`,
`commerce.productListRemovals`, `commerce.checkouts` and `commerce.purchases`.
These are event types carried by the existing Lab transport, not a claim that
the standard root `commerce` metrics are populated.

The resolved schema must expose the adapter's `REQUIRED_PATHS`: browser identity,
web name/URL/viewName, `_demoemea.public.generic` CTA fields, existing
`_demoemea.public.retail` fields, `_demoemea.message.currencyCode`, and
`_demoemea.message.productListItems` with SKU, name, quantity and priceTotal.
Prices are AED; totals are computed in integer fils. Size and colour remain
local storefront state, not invented schema leaves. A missing measurement leaf
blocks recording rather than silently dropping dimensions. Standard Retail v1
alone is insufficient for the product-list/currency fields. No field group,
dataset, datastream, identity graph or cloud resource is provisioned by this
implementation.

The browser SDK owns route page views; the generator owns business interactions.
The Tags initial page view is not mirrored by this demo. Subsequent route changes
send one page view only when recording is enabled. Rerenders and filters do not
count as new views.

Business actions wait for a positive generator acknowledgement before advancing
the local bag/order. HTTP 4xx rejects the action. Network failure, 5xx, malformed
acknowledgement, or context changes after submission are uncertain: the local
action does not advance, automatic replay is blocked, and Presenter controls
retain a redacted attempt reference. Inspect Profile activity and explicitly
allow another attempt only after reconciliation; the earlier event might already
exist. Acceptance is not proof of AEP ingestion, audience qualification, AJO
execution or notification delivery.

## Development

Run `npm run test:hm`, the shared environment/mount/version verifiers and
`npm run verify:profile-viewer-routes`. Use `npm run sync-profile-viewer-ui` after
editing the canonical files. No backend changes are required.

The customer storefront deliberately retains its light H&M reference palette in
both Lab themes. Its scoped brand tokens do not override the Lab shell. Semantic
parent-document sections and the standard ribbon/hero/card mounts support AJO
visual authoring; the storefront is not buried in an iframe.

Implementation approval does not authorize publishing. Hosting preview and
production releases follow `CONTRIBUTING.md` and require separate authorization.
