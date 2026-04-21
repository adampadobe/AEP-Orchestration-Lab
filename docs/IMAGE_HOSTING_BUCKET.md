# Image hosting bucket — `aep-orchestration-lab-brand-scrapes`

This bucket holds two kinds of content with different lifecycles:

| Prefix | Contents | Retention |
| --- | --- | --- |
| `scrapes/<sandbox>/<scrapeId>/…` | Short-lived brand-scraper artifacts (crawled images, `record.json`) | Live versions deleted after 3 days; noncurrent versions deleted after 7 days. |
| `<sandbox>/library/**` | Curated per-sandbox assets served at `/cdn/<sandbox>/<path>` | **Never expires.** Only deleted by explicit user actions (Delete button, ZIP restore with replace, or in-place card replacement). |
| `<sandbox>/library_backups/**` | Reserved for future preset snapshots | Never expires. |

## Bucket settings

- **Uniform bucket-level access**: enabled (locked).
- **Public read**: `allUsers:objectViewer` IAM binding so
  `https://storage.googleapis.com/<bucket>/<path>` and the
  `/cdn/**` function proxy both resolve without signed URLs.
- **Object versioning**: enabled. Overwriting or deleting an object
  keeps the previous bytes as a noncurrent version, retained per the
  lifecycle rule below. This gives point-in-time rollback for library
  content and protects against accidental replacement via the
  drag-drop UX.

## Lifecycle JSON

```json
{
  "rule": [
    {
      "action": { "type": "Delete" },
      "condition": {
        "age": 3,
        "matchesPrefix": ["scrapes/"],
        "isLive": true
      }
    },
    {
      "action": { "type": "Delete" },
      "condition": {
        "age": 7,
        "matchesPrefix": ["scrapes/"],
        "isLive": false
      }
    },
    {
      "action": { "type": "Delete" },
      "condition": {
        "numNewerVersions": 2
      }
    }
  ]
}
```

**Rule 3 explained.** `numNewerVersions: 2` deletes any noncurrent
version that has 2+ newer versions of the same object. In practice
that means every object is allowed **one noncurrent version plus the
current one** — i.e. max 2 generations on disk at any time. Replace a
`logo.png` and yesterday's bytes are retained; replace it again
tomorrow and the oldest copy is collected.

## Reproducing the config

```bash
gsutil uniformbucketlevelaccess set on gs://aep-orchestration-lab-brand-scrapes
gsutil iam ch allUsers:objectViewer gs://aep-orchestration-lab-brand-scrapes
gsutil versioning set on gs://aep-orchestration-lab-brand-scrapes
gsutil lifecycle set ./docs/image-hosting-lifecycle.json \
  gs://aep-orchestration-lab-brand-scrapes
```

## Tuning the retained version count

Raise `numNewerVersions` if you want more rollback history (e.g. `3`
keeps two previous versions per object). Trade-off is storage cost —
with logo-sized assets (a few hundred KB each) even `5` is trivial.

## Inspecting versions

```bash
# All generations of a specific object:
gsutil ls -a gs://aep-orchestration-lab-brand-scrapes/apalmer/library/logo/logo.png

# Restore a specific previous generation to current:
gsutil cp "gs://…/logo.png#<generation>" gs://…/logo.png
```
