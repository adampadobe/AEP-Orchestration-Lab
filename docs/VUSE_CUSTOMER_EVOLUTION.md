# Vuse Italia customer evolution

The Vuse demo is a synthetic, adult-customer demonstration. Account authentication,
payments, fulfilment and confirmation email delivery are simulated. Do not enter
real customer data, passwords used elsewhere, or payment credentials.

## Presenter flow

1. Select the intended sandbox, configured Lab Event tool Edge target, and matching
   Adobe Tags environment in the shared environment bar. Inject Tags and wait for
   a live browser ECID before interacting with the storefront. Select that same
   Lab Event tool datastream in the Adobe Target override; mismatched or missing
   overrides block identity and profile submission rather than splitting the data.
2. Complete the age gate, browse categories and open products. Page views use the
   Web SDK, while product and commerce interactions use the event generator.
   The same page view is never mirrored through both transports.
3. Use **Create account** for a synthetic adult customer, or **Sign in** for an
   existing synthetic profile. Sign in shows only email and a required, masked
   demo-password field. Enter any made-up password: it is not checked, sent or
   saved, and has no role in identity resolution. Create account separately shows
   customer details and explicit preferences; the inactive form stays hidden.
   Registration and deliberately submitted profile/checkout details are written
   through the generic profile dataflow. An identity event links the submitted
   email to the **current browser ECID**, not an ECID copied from the profile.
4. Inspect the profile drawer to distinguish accepted writes from attributes and
   activity actually visible in AEP. Allow for ingestion delay. Audience membership
   and AJO execution require their own verification.
5. Continue browsing or reload the site to demonstrate a returning visitor.
   Shopper state is scoped to the sandbox and browser visitor. Logout clears the
   simulated account session, but cannot undo an identity link already sent to AEP.
6. To demonstrate a different person, use **New visitor**. This resets the browser
   identity and local shopper state while retaining lab configuration and recent
   email suggestions. It does not delete the previous customer's AEP history.

## Data and consent boundaries

Only allowlisted, validated fields explicitly submitted by the customer may be
written: names, email, supported birth-date, phone and address fields, and supported
brand/channel choices. Keystrokes and abandoned forms are not profile submissions.
Passwords, card details, payment tokens and arbitrary payload fields are excluded.

Existing profiles use a full writable generic snapshot with the submitted fields
overlaid. Unrelated attributes and existing consent are preserved. A lookup error
is not treated as a new customer. Missing consent must never become implicit
marketing permission; choices and unknown values are handled explicitly by the
safe submission path. No industry-specific attributes are invented just to make
the profile look richer.

The nine brand-specific choices use optional boolean leaves under
`preferences.brands.{vuse,velo,glo}.{email,sms,whatsapp}` in the Generic Profile
Core manifest. They are separate from global marketing permission. Before live
registration, the sandbox's Generic schema must receive the reviewed additive
step-2 field-group top-up and a fresh schema read must confirm these fields.
The adapter refuses unsupported fields; a Hosting release alone is insufficient.
The safe profile-read/write backend must also be released before the new client;
the client's capability check rejects an older backend.

The storefront waits for a submission acknowledgement before advancing the
account or checkout flow. A successful response means ingestion was accepted,
not that Profile, Identity Service, audiences or journeys have finished processing.
If a write may have reached Adobe but its response is uncertain, the flow stops.
Use Presenter controls to inspect/reconcile activity before explicitly allowing
another attempt; automatic retries can create duplicate events.
Navigation and modal dismissal wait while a customer submission is pending.
If a browser reload interrupts the acknowledgement, the storefront reports its
persisted uncertainty to Presenter controls. After checking AEP activity, **I
checked activity; allow retry** clears both shell and storefront locks. It does
not automatically replay the interrupted action.

## Measurement semantics

Page views represent actual page or virtual-screen navigation after the age gate.
Canonical Vuse URLs exclude query strings, hashes and customer data. Resolving an
ECID does not itself generate a shell page view. Product interest, add-to-cart,
submitted preferences and simulated purchases are separate business events.
Presenter-triggered events are simulations, not evidence of natural navigation.
Closing a cart or leaving a page does not prove abandonment.

The event dataset's schema must also declare the emitted dimensions. The
`apalmer` Event Tool schema has Adobe **Web Details** plus **AEP Lab - Vuse
Customer Journey Events v1**: optional `_demoemea.public` context and
`_demoemea.message.productListItems` fields matching `vuse-italia-events.js`.
Generic Event Tool provisioning alone does not install this demo-specific group.
After a schema change, verify newly stored events contain page names/URLs,
product items and order totals; accepted receipts and event types alone do not
prove measurement readiness. Previously discarded dimensions are not recovered
retroactively. CJA also needs its own verified connection and data-view mapping.

## Local checks and release

Use the Vuse fixture tests and shared visitor-reset/Riyadh regression checks.
Fixtures must not send requests to live Adobe endpoints. The Express public
directory mirrors the canonical `web/profile-viewer/` files; preserve unrelated
untracked work when synchronizing.

Shipping still requires a focused commit, push, reviewed PR, required validation
and merge before production deployment from exact clean `origin/main`.
Live synthetic-data verification is a separate, explicitly approved step.
