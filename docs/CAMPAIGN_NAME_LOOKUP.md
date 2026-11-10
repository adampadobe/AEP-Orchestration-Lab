# Profile drawer campaign names

The Center Parcs and TUI drawers prefer the campaign name stored on an event.
When only `scopeDetails.activity.id` is present, they call the existing
`GET /api/campaign-name?id=<uuid>&sandbox=<sandbox>` endpoint. The response
contract remains `{ id, name }`. Repeated propositions show each campaign and
delivery label once per event.
The local Express endpoint uses the same server helper and honors the requested
sandbox, so local and hosted drawers resolve names consistently.

Edge events may identify an activity as `<campaign UUID>#<version UUID>`.
For `kirkham`, the resolver validates both UUIDs and queries/caches by the
lowercase campaign UUID only. The API still echoes the original activity ID,
and stored event attribution is not rewritten. A malformed version suffix is
rejected rather than silently discarded.

For sandbox `kirkham`, `functions/joLookups.js` resolves the UUID through
`POST https://platform.adobe.io/data/foundation/query/accelerated-queries`:

```sql
SELECT DISTINCT campaign_id, campaign_name
FROM qsaccel.ajo_lookup.ajo_campaign_names
WHERE campaign_id = '<validated campaign UUID>'
ORDER BY campaign_name
```

The database is `kirkham:qsaccel`. This table is verified only for `kirkham`;
other sandboxes retain their existing campaign API lookup. The server reuses
the Cloud Function's Adobe IMS credentials and never returns its access token.
No new secrets, browser credentials, or campaign/profile writes are required.

Successful names are cached in memory for five minutes, scoped by org, API
client, sandbox and campaign ID (up to 200 entries per instance). The drawer
also shares in-flight lookups for one minute. Empty results return `name: null`;
upstream errors, malformed results and conflicting names fail explicitly and
are not cached server-side. The drawer retains its visible unavailable state
and warning log rather than inventing a name.

The verified campaign `d360b9ce-7303-465d-93eb-d31c3f19a6c4` resolves to
`AEP-LAB-Decisioning-Hero-Banner`.

Run `node --test functions/test/joLookups.test.cjs` and
`npm run test:cp-decisioning`, plus the Profile Viewer route and environment-strip
verifiers. Sync the canonical UI to the Express mirror before committing.
Release through the normal PR/Validate/merge gates, then deploy the
`campaignNameProxy` function and Hosting from clean, exact `origin/main`.
