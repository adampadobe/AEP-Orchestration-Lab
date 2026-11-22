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
      "demoableInLab": false,
      "id": "<64-hex sha256 of sourceUrl>",
      "votes": { "up": 3, "down": 0 }
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
including failed attempts. Items beyond the cap are recorded as `deferred` and
picked up on a later run; reaching the cap does not make a run partial. Runs
with source or classification errors are reported as partial. Gemini does not
echo source metadata: `sourceUrl` and `publishedAt` are always taken from the
source, and summaries longer than 25 words are trimmed rather than rejected. A
Firestore lease prevents overlapping refreshes. The initial result appears
only after a scheduled run; deployment does not execute one.

`labFeedConfig/{feedId}` is seeded on first run, never overwritten by the
service, and may be edited by an authorized Firestore administrator. Stored
sources that no longer exist in code are skipped, so retiring a source (for
example `venturebeat`) does not break refreshes; raise other changed defaults,
such as `dailyCap`, in the stored document too:

```json
{
  "sources": ["techcrunch", "verge", "cmswire", "martech", "salesforce", "microsoft", "google"],
  "watchlist": ["Salesforce", "Oracle", "SAP", "Braze", "Twilio Segment", "Bloomreach", "Optimizely", "Contentsquare", "HubSpot", "Microsoft", "Google"],
  "threshold": 0.6,
  "promptVersion": "1",
  "dailyCap": 100
}
```

The releases defaults select `aep`, `ajo`, `cja`, `target`, `aem`,
`genstudio`, `adobeBlog` and `adobeNewsroom`, threshold 0.5 and cap 30.
Adobe blog and newsroom entries come from Adobe's first-party CaaS
collection API because the blog's advertised RSS endpoint returns 404.
The collection is bounded to 5,000 cards and fails explicitly if that
limit is reached, rather than silently presenting a truncated selection.
Sources are curated IDs in
`functions/labFeedsService.js`, not arbitrary URLs; adding a new URL requires a
reviewed code change to protect server-side fetches. Individual publishers can
also block or rate-limit fetches.

`labFeeds/{feedId}/items/{sha256-of-source-url}` holds classifications with
`expiresAt`. A Firestore TTL policy on the `items` collection group's
`expiresAt` field deletes expired items; the read endpoint also filters them. Latest run
counts, source status, errors, budget, and lease state are stored in
`labFeeds/{feedId}`. Existing `/api/release-notes/summary` fallback responses
remain explicitly labelled `fallback`; live responses no longer blend in
bundled product highlights.

## Feedback

`POST /api/lab/feeds/{feedId}/feedback` with
`Authorization: Bearer <Firebase ID token>` and body
`{"id": "<item id>", "vote": "up" | "down" | "none"}` records one vote per
signed-in, approved, non-anonymous user and item (`none` withdraws it). It
returns `{ok, id, vote, votes: {up, down}}`; 400 for invalid input, 401/403
for auth failures, 404 for unknown feeds or items, and 503 otherwise.

Votes are stored at `labFeeds/{feedId}/feedback/{sha256(uid:itemId)}` with the
item headline and category only, and counted on the item document. Items whose
down-votes exceed up-votes by two or more are hidden from the read endpoint.
Each refresh passes up to 15 liked and 15 disliked headlines from the last 90
days to Gemini as `labFeedback`, so future classifications calibrate relevance
toward what lab users found useful. Already-classified items are not rescored.
