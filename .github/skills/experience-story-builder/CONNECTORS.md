# Connectors — what each user must set up themselves

The experience-story-builder needs three MCP connectors: **Firefly**, **Adobe for Creativity**, and **Claude_Preview** (built in — just switch it on). **Credentials are
per-user and cannot be shipped in the bundle** — there is no file that logs you
into Adobe or carries someone else's API key. This page tells each user exactly
what to connect. The Stage 0.0 preflight then verifies what's actually live.

> ⚠️ **Never paste another person's connector URL or key.** Brandfetch here is a
> *remote HTTP MCP whose URL carries a personal credential* — sharing it shares
> the owner's account and quota. Everyone uses their own.

## Required

| Connector | Tools | How to connect | If missing |
|---|---|---|---|
| **Claude_Preview** | `preview_*` | Built in — enable it in your client, no Adobe login needed. | No render/QA. Required. |
| **Firefly** | `firefly_generate_image` | Your **own Adobe login** via the Claude connector UI (Adobe employees have access). | Build STOPS at the first image (no-placeholder rule). Or drop your own images, see below. |
| **Adobe for Creativity** | `image_remove_background`, `image_crop_and_resize`, `image_adjust_*` (call `adobe_mandatory_init` first) | Your **own Adobe login** via the Claude connector UI. | No persona/logo cutouts or brand colour-matching. Pillow is a weaker fallback. |

Firefly and Adobe for Creativity are **per-user Adobe OAuth** — each person authorizes them
with their own Adobe credentials; they can't be pre-installed for anyone. Claude_Preview is
different: it's a built-in feature, not an Adobe login, so turning it on is a one-time toggle.

⚠ Firefly **Boards** being connected does **NOT** mean image *generation* is connected.
`firefly_generate_image` is a separate tool. Probe it by name.

## Optional


Everything below is genuinely optional. The build completes without any of it.

| Connector | Why | Notes |
|---|---|---|
| **Spectrum icons MCP** | full Spectrum icon coverage | Falls back to the bundled 34-label starter pack (`vision-experience-builder/components/icons/pack.json`). Any icon outside the pack must come from the MCP, never hand-drawn. Icons are embedded inline in the shipped deck either way. |
| **Adobe Stock** | a real licensed photo where generation will not do | Firefly covers imagery on its own. Licensing consumes entitlement and is a download, so **ask the user before licensing**. |
| **Adobe Express** (`image_*`) | extra image editing | Adobe for Creativity already covers the cutouts, crops and adjustments a build needs. |


| Connector | Why | Notes |
|---|---|---|
| **Brandfetch** | cleanest customer logo + palette | Use **your own** key/endpoint, or skip it entirely — Stage 3 scrapes the site (`scripts/brand_fetch.py`) + resolves the URL via WebSearch, or uses assets you drop in. **Never required.** |
| **Google Stitch** | AI **UI designer** for the embedded customer app/website mocks (§9) | Your own Google API key. Optional accelerator — hand-built mocks work without it. |

### Adding Google Stitch (optional UI designer)
Stitch generates realistic app/website UI you can adapt into the embedded
customer-app mocks. Add it with **YOUR OWN** key (never commit or share a real one):

```
claude mcp add stitch --transport http \
  --header "X-Goog-Api-Key: <YOUR_GOOGLE_STITCH_API_KEY>" \
  https://stitch.googleapis.com/mcp
```

Then prompt it with the **customer's brand palette + the screen you need** (home /
search results / checkout / app view) and **adapt** the output into the demo: embed
in a `browser-frame`, wire the `?p=` deep-link states, apply the brand role-tokens,
and correct nav labels / prices to the real site. Stitch designs the *screen*; it
doesn't know our deep-link flow or the customer's exact copy — that's your edit.

## You don't actually need Brandfetch

Customer branding has a degrade path (Stage 3), so Brandfetch is never required:

1. **Drop assets (best):** put the customer logo (`logo.svg`/`.png`) and a
   `brand.json` (`{"brand":"#RRGGBB","brand_deep":"#RRGGBB","accent":"#RRGGBB","accent_lt":"#RRGGBB"}`)
   into `assets/<slug>/`.
2. **Scrape:** `python scripts/brand_fetch.py <url> --slug <slug>` — keyless, pulls
   logo + palette from the live site.
3. **Your own Brandfetch**, if you have it.
4. **Ask:** the agent requests the logo + two hex values. Never guesses.

## The `.mcp.json` template

`mcp.template.json` in this folder shows the shape for the connectors that live
in a project `.mcp.json` (e.g. a Brandfetch HTTP server). **Copy it to your
project as `.mcp.json` and fill in YOUR values — placeholders only, no secrets
ship in the bundle.** The Adobe connectors and Claude_Preview are added through
the Claude connector UI, not by pasting secrets here.
