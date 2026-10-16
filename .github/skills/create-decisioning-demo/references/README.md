# Operational schema references

Supplied by the demo owner for generic field reuse:

- `operational-profile-schema-export.json`: **Operational - Profile - Schema**
  v1.11 export; 14 data types, 16 field groups, one schema and one descriptor.
- `operational-event-schema-export.json`: **Operational - Event Schema** v1.22
  export; 13 data types, 16 field groups, one schema and three descriptors.
  The two event attachments supplied were identical; only one is retained.
- `operational-profile-sample.json`: original
  `schema-sample-Operational - Profile - Schema (4).json`.
- `operational-event-sample.json`: original
  `schema-sample-Operational - Event Schema (5).json`.

The `*-schema-export.json` files contain actual Schema Registry resources. Resolve
their `$ref` and `allOf` links by resource ID to inspect field definitions.
Adobe standard dependencies may not be bundled, so they are not self-contained
resolved schemas. Preserve root versus tenant paths and resolve the
`<XDM_TENANTID_PLACEHOLDER>` for the selected sandbox, never use it literally.
Declared `type`, `format`, numeric bounds and `enum` constrain the applicable
field; `meta:enum` describes UI labels, not necessarily enforced allowed values.
Event identity descriptors declare tenant identification ECID primary and Email
secondary. Use the selected live schema/configuration for actual ingestion.
These exports are reference snapshots, not permission to import/provision them.

The `*-sample.json` files are sample XDM payloads, **not** full schema definitions.
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
