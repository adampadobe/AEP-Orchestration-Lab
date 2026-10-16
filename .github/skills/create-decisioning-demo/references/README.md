# Operational schema sample references

Supplied by the demo owner for generic field reuse:

- `operational-profile-sample.json`: original
  `schema-sample-Operational - Profile - Schema (4).json`.
- `operational-event-sample.json`: original
  `schema-sample-Operational - Event Schema (5).json`.

These are preserved sample XDM payloads, **not** full schema definitions.
Example values are synthetic and may be implausible (including scores, dates,
counts and proposition event flags). Never use them as customer facts, defaults,
enums, permitted ranges, required-field declarations or event flag values.
Use the latest user-supplied files in preference to these references and resolve
the selected live schema before an explicit write.

`_demoemea` is the sample tenant key, not a portable hardcoded namespace.
Use existing brand-neutral paths. Legacy branded sections in the samples,
including `britishAirwaysDecisioning`, are not recommended for future demos.
Do not create another brand-specific subtree. Do not confuse the profile's
`experience.decisioning` history with the event's standard root
`_experience.decisioning` proposition telemetry.

For banking profile controls use the mapping in
`docs/NATWEST_DECISIONING_DEMO.md`. The event sample also provides tenant
`interactionDetails.core.channel`, `interactionDetails.fsi.application.*`,
`interactionDetails.fsi.contract.*` and `public.fsi.*`; these are event-only
unless independently present in the profile schema. Adding these optional event
details requires an explicit use case, correct identity and configured datastream;
do not send an event merely to populate a drawer or test a layout.
