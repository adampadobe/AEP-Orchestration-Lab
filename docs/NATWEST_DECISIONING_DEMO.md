# NatWest decisioning demo

Open `/profile-viewer/natwest-decisioning-demo.html`. The existing `?channel=email`,
`?channel=mobile`, and `?channel=web` links remain supported. Mobile is a phone
preview of the same responsive email, not a mobile application.

The visualiser has three resizable panes: collapsible banking signals, a
seven-step local objective ladder with expandable NBA scores, and customer
previews. The uploaded NatWest logo and photography are local assets. The Web
view is a reconstruction, not a running copy of the captured site. Product copy
is illustrative; no email, application, or live product offer is delivered.

## Live controls and setup

The shell uses the shared Spectrum environment strip, Tags injection, profile
drawer and decisioning runtime. Select the sandbox and identity, configure/inject
the existing Tags environment, enable Decisioning, and look up a **test profile**.
Local signal edits are staged. **Apply profile changes** re-fetches the latest
profile, validates the resolved schemas, and submits full writable snapshots for
the affected industry dataflows. It never provisions infrastructure.

NatWest-specific controls use `_<tenant>.natwestDecisioning.*` in the **FSI**
profile dataflow. Propensity uses the existing generic
`_<tenant>.scoring.core.propensityScore` (1, 2, or 3). Account Type can initially
be inferred from existing FSI product holdings. Missing NatWest fields are shown
as illustrative defaults, not as confirmed profile values.

The FSI extension in `functions/profileCoreV2Manifest.js` declares every streamed
NatWest leaf. After that backend change has passed review, merged, and been
released through the normal Functions workflow, run **FSI Profile Generation
setup step 2: Attach field groups / Profile Core v2 top-up** for the selected
sandbox. The demo blocks Apply if a required field is absent or incompatible.
**A Hosting preview does not deploy Functions or provision these fields.**

**Run live image decision** refuses staged edits and verifies accepted changes
against AEP readback before evaluating. Ingestion lag blocks evaluation rather
than pretending the new profile is available. Failed or partial writes are
explicit; there is no automatic write retry. Look up again to verify accepted
dataflows before retrying the remaining changes.

The optional `manualDisplay: true` mode in the shared runtime disables automatic
rendering. This demo accepts one fresh, explicitly hero-scoped proposition,
ignores default-content/fallback items, and waits for its HTTP(S) image to load
in the selected visible channel before sending a display notification with the
original proposition metadata and request identity. Channel switches do not
send another display. Existing runtime consumers retain automatic rendering.

The objective ladder and scores remain a **local simulation**, independent of
the live hero image/title/description. Local safety/consent holds hide previews.
Changing identity or sandbox clears the previous live hero.

## Development

Run `node --test scripts/test-natwest-decisioning.cjs` for model, compatibility,
browser layout and fixture-only profile/decision lifecycle coverage. The test
server mocks all platform operations; it never contacts AEP. Also run the
Profile Viewer route, environment strip, mount-zone, and environment-version
verifiers. Mirror canonical UI changes using the documented sync workflow.

The reusable upload-first workflow is
`.github/skills/create-decisioning-demo/SKILL.md`; it defaults to this three-pane
experience without requiring another customer's demo as an input.
