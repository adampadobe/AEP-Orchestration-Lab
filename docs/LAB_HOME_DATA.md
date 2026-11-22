# Lab home page data: usage heat map and What's new

Backend contracts for the home page "Most used" heat map and the "What's new"
section. The UI is consumed from `web/profile-viewer/home-new.html`.

| Data | Source | Endpoint / file | Auth |
|------|--------|-----------------|------|
| Usage heat map | `labUsageEvents` → hourly roll-up → `labUsageAggregates` | `GET /api/lab/usage/heatmap?window=7d\|30d` | Signed-in, approved lab user |
| What's new (shipped) | Merged-PR git history at deploy time | `GET /whats-new.json` (static Hosting file) | Public |
| What's new (in progress) | Open GitHub pull requests, cached every 30 min | `GET /api/lab/whats-new/in-progress` | Public |

## Shared nav catalogue

`scripts/lab-nav-catalogue.mjs` parses the `NAV` array in
`web/profile-viewer/aep-lab-nav.js`. `npm run build:lab-nav-catalogue` writes
`functions/labNavCatalogue.json` (committed): `{route, label, navGroup,
navGroupId, subgroup, inNav, tracked}` per page. It drives the telemetry route
allowlist, heat-map labels and What's new page mapping, so new nav pages are
picked up after regenerating. CI fails when it is stale
(`npm run verify:lab-nav-catalogue`).

Pages are `tracked` (counted) only if they load the shared nav and Firebase Auth
compat scripts and are not redirects. Currently untracked nav pages:
`loyalty-reward-provider`, `decisioning-visualiser`, `experience-decisioning`,
`aep-architecture-apps`, `eds-quickstart` (no Firebase Auth compat) and
`call-centre-demo-v1` (no shared nav).

## Usage heat map

### `GET /api/lab/usage/heatmap?window=7d|30d`

- `Authorization: Bearer <Firebase ID token>`; same gate as usage collection:
  non-anonymous, revocation-checked token and lab access `approved`, `missing`
  or `not_applicable`. 401 without a valid token, 403 for anonymous or pending
  users, 400 for any other `window`, 405 for non-GET, 503 on backend failure.
- `window` defaults to `7d`. Responses are `private, no-store`; the function
  caches each window in memory for 5 minutes.

```json
{
  "ok": true,
  "collectionEnabled": false,
  "window": "7d",
  "from": "2026-09-30",
  "to": "2026-10-06",
  "minViews": 5,
  "daysWithData": 7,
  "computedAt": "2026-10-06T09:00:04.120Z",
  "belowThreshold": 3,
  "items": [
    {
      "route": "/profile-viewer/index.html",
      "navGroup": "Profiles",
      "label": "Profile Viewer",
      "views": 128,
      "uniqueUsersBucket": "10-24",
      "trendPct": 12
    }
  ]
}
```

- `items` is sorted by `views` descending. Routes with fewer than `minViews`
  (5) page views in the window are omitted and only counted in
  `belowThreshold`.
- `uniqueUsersBucket` is one of `<5`, `5-9`, `10-24`, `25-49`, `50+`.
- `trendPct` compares with the previous window of equal length, rounded to an
  integer; `null` when the previous window had fewer than `minViews` views.
- `navGroup` is `null` for pages outside the sidebar (for example the classic
  home page). Days are UTC; the current day is partial.
- `collectionEnabled` mirrors the `LAB_USAGE_TELEMETRY_ENABLED` constant in `functions/index.js`
  (switched on in production since 2026-11-22). When it is `false` the map only
  shows historical data and the UI shows an empty state.
- No UIDs, emails, digests or per-person data are ever returned.

### Roll-up (`labUsageRollup`, every 60 minutes)

Recomputes today and yesterday (UTC) from `labUsageEvents` `page_view` events on
allowlisted routes, then backfills up to 7 missing or incomplete days within
the last 60. Each day is written to `labUsageAggregates/{YYYY-MM-DD}`:

```text
{ day, pageViews, complete, computedAt, expiresAt,
  routes: [{ route, views, actors: [16-hex purpose-salted SHA-256 digest] }] }
```

`actors` lets window unique counts be exact without re-reading raw events; it is
server-only and never leaves the function. `expiresAt` is day + 91 days. Configure
a Firestore TTL policy on `labUsageAggregates.expiresAt` (the same as for
`labUsageEvents.expiresAt`) before relying on automatic deletion.

## What's new

### Shipped: `web/whats-new.json`

`npm run build:whats-new` (`scripts/build-whats-new.mjs`) runs automatically at
predeploy after the version stamp, and the file is gitignored. It reads the
last 90 days of `git log` and keeps squash-merge subjects of the form
`[handle] Subject (#NNN)`. Commits with `[skip-whats-new]` in the subject or body
are skipped, as are commits without a PR number. Production deploys check out
full history (`fetch-depth: 0`); without git history the feed is empty.

```json
{
  "generatedAt": "2026-10-06T09:00:00.000Z",
  "gitSha": "87c9d21a…",
  "windowDays": 90,
  "items": [
    {
      "title": "Refresh Loyalty card and Featured Offers together",
      "prNumber": 465,
      "mergedAt": "2026-10-05T16:12:03+01:00",
      "author": "kirkside-bit",
      "pages": [{ "route": "/profile-viewer/lloyds-loyalty.html", "label": "Lloyds – Loyalty" }],
      "kind": "updated"
    }
  ]
}
```

- At most 50 items, newest first. `author` is the handle from the subject.
- `pages` (max 8) maps changed files under `web/profile-viewer/` to catalogue
  pages: an exact `.html` match, a file stem equal to a page stem or starting
  with `stem-` (longest wins), or a top-level directory containing or named after
  a page. Backend-only PRs have `pages: []`.
- `kind` is `new` when the PR added a catalogue page's `.html`, otherwise
  `updated`.

### In progress: `GET /api/lab/whats-new/in-progress`

Public (the repository is public); `Cache-Control: public, max-age=300`.

```json
{
  "ok": true,
  "repo": "adampadobe/AEP-Orchestration-Lab",
  "fetchedAt": "2026-10-06T09:00:00.000Z",
  "stale": false,
  "items": [
    {
      "title": "Home page heat map backend",
      "number": 466,
      "url": "https://github.com/adampadobe/AEP-Orchestration-Lab/pull/466",
      "author": "adampadobe",
      "updatedAt": "2026-10-06T08:41:00Z",
      "draft": true,
      "labels": ["home"]
    }
  ]
}
```

- Up to 50 open PRs, most recently updated first. Only the fields above are
  stored or returned.
- `labWhatsNewRefresh` runs every 30 minutes and writes
  `labWhatsNew/inProgress`. On GitHub errors it keeps the previous items and
  records `lastError`. `stale` is true when the last successful fetch is older
  than 60 minutes. A cold cache is refreshed once inline; if that fails the
  endpoint returns 503.
- GitHub is called without credentials (public repository, 60 requests/hour).
  If the repository becomes private, add `defineSecret('GITHUB_READ_TOKEN')` to
  both functions and pass it to `refreshInProgress({ token })`; set it with
  `firebase functions:secrets:set GITHUB_READ_TOKEN`.

## Privacy notice

The telemetry notice (`functions/labUsageTelemetry.js`) adds: "Signed-in lab
users can also see anonymous, aggregate page-view counts (never names, emails or
per-person activity) in the home page heat map."
