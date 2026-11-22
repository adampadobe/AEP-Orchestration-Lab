# Lab feeds API

`GET /api/lab/feeds/tech-news` and `GET /api/lab/feeds/adobe-releases`
read Firestore-cached data only; requests do not start a refresh.

```json
{
  "feedId": "tech-news",
  "items": [
    {
      "relevance": 0.9,
      "category": "CRM",
      "competitors": ["Salesforce"],
      "products": [],
      "headline": "Example headline",
      "soWhat": "A concise explanation of its relevance.",
      "sourceUrl": "https://example.com/article",
      "publishedAt": "2026-11-21T10:00:00.000Z",
      "demoableInLab": false
    }
  ],
  "meta": {
    "fetchedAt": "2026-11-22T10:00:00.000Z",
    "source": "live",
    "lastRunStatus": "success"
  }
}
```

`items` are sorted newest first and `soWhat` contains at most 25 words.
Strings are untrusted: render them as text and validate links before use.
`sourceUrl` and `publishedAt` come from the fetched source, not the model;
when a release supplies only a month, `publishedAt` is `YYYY-MM` rather than
inventing a day. For AdobeDocs, an explicit last-update date may be used when
provided rather than a publication date.
The model's `demoableInLab` is a suggestion, not proof that a demo exists.

`meta.source` is `live` after a successful recent run, `stale` when the last
run is partial, failed or overdue, and `fallback` with an empty list before
the first run. `fetchedAt` is the latest attempted run, not necessarily the
age of every item. `lastRunStatus` is `not-run`, `success`, `partial`, or
`failed`. A 503 indicates the cache could not be read; it is not an empty
successful feed. Unknown feeds return 404 and other methods return 405.
Responses have `Cache-Control: public, max-age=60, must-revalidate` and an
ETag; `If-None-Match` can return 304.

## Operation

Schedules run the news feed every two hours and releases daily. Gemini Flash
classifies only newly observed URLs and changed AdobeDocs revisions; invalid
model output is rejected. Source data is treated as untrusted input.
Classifications below the relevance threshold remain hidden. Failed
classifications can be retried on a later run. A daily UTC cap counts attempts,
including failed attempts, and partial runs are reported as such. A
Firestore lease prevents overlapping refreshes. The initial result appears
only after a scheduled run; deployment does not execute one.

`labFeedConfig/{feedId}` is seeded on first run, never overwritten by the
service, and may be edited by an authorized Firestore administrator:

```json
{
  "sources": ["techcrunch", "verge", "venturebeat", "cmswire", "martech", "salesforce", "microsoft", "google"],
  "watchlist": ["Salesforce", "Oracle", "SAP", "Braze", "Twilio Segment", "Bloomreach", "Optimizely", "Contentsquare", "HubSpot", "Microsoft", "Google"],
  "threshold": 0.6,
  "promptVersion": "1",
  "dailyCap": 40
}
```

The releases defaults select `aep`, `ajo`, `cja`, `target`, `aem` and
`genstudio`, threshold 0.5 and cap 30. Sources are curated IDs in
`functions/labFeedsService.js`, not arbitrary URLs; adding a new URL requires a
reviewed code change to protect server-side fetches. The Adobe blog advertises
an RSS URL that currently returns 404, so it is not included. Individual
publishers can also block or rate-limit fetches.

`labFeeds/{feedId}/items/{sha256-of-source-url}` holds classifications with
`expiresAt`. Configure Firestore's TTL policy for the `items` collection
group and `expiresAt` field separately; until then the read endpoint filters
expired items but Firestore will not delete them automatically. Latest run
counts, source status, errors, budget, and lease state are stored in
`labFeeds/{feedId}`. Existing `/api/release-notes/summary` fallback responses
remain explicitly labelled `fallback`; live responses no longer blend in
bundled product highlights.
