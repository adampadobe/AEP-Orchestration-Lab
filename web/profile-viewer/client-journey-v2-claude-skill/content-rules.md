# Content Rules — AEP One-Pager

Detailed rules for populating each content section of `generate_one_pager.py`.

---

## Client branding — logo first, text fallback

**Always try a PNG logo first.** Use `set_client_logo()` with a Clearbit URL as the primary
attempt. Fall back to text with `make_sp()` only if the logo cannot be found.

```python
# Primary: try Clearbit
set_client_logo('https://logo.clearbit.com/clientdomain.com',
                x_cm=67.0, y_cm=0.5, w_cm=7.0, h_cm=2.5)

# Optional second attempt with alternate domain
if _logo_data is None:
    set_client_logo('https://logo.clearbit.com/alternatedomain.com',
                    x_cm=67.0, y_cm=0.5, w_cm=7.0, h_cm=2.5)

# Fallback: text only
if _logo_data is None:
    make_sp('Client Name',
            1.36, 0.7, 73.5, 2.2, fontsize_pt=22, bold=True, color_hex='BRANDCOLOR', align='r')
```

**Logo sizing — adjust w_cm / h_cm to preserve aspect ratio:**
- Standard landscape logo: `w_cm=7.0, h_cm=2.5`
- Wide/banner logo: `w_cm=10.0, h_cm=2.0`
- Square/icon logo: `w_cm=2.5, h_cm=2.5`
- Aim for ~2–2.5 cm tall

**Never change** `x_cm=67.0, y_cm=0.5` on `set_client_logo` — these fix the position.
**Never change** `x_cm, y_cm, w_cm, h_cm, align` on the `make_sp` fallback line.

---

## STEP_LABELS (12 tuples)

```python
STEP_LABELS = [
    ('01  Step Name',   8.06, 18.20, 3.51, 2.00),
    ('02  Step Name',  14.41,  8.97, 3.80, 2.00),
    ('03  Step Name',  20.58, 10.42, 3.80, 2.00),
    ('04  Step Name',  27.07, 19.19, 3.80, 2.00),
    ('05  Step Name',  33.45, 14.50, 3.80, 2.00),
    ('06  Step Name',  40.17, 16.03, 3.80, 2.00),
    ('07  Step Name',  46.80, 15.60, 3.80, 2.00),
    ('08  Step Name',  52.87,  7.45, 3.80, 2.00),
    ('09  Step Name',  59.91, 10.61, 3.80, 2.00),
    ('10  Step Name',  66.07,  4.53, 3.80, 2.00),
    ('11  Step Name',  72.59, 18.44, 3.80, 2.00),
    ('12  Step Name',  79.42, 12.67, 4.50, 2.40),
]
```

- Keep labels **2–4 words**, prefixed with `NN  ` (number + two spaces)
- **Never change x, y, w, h values**
- All labels rendered with `fontsize_pt=11, bold=True, color_hex='1A1A1A'`

---

## DESCRIPTIONS (13 items — index 2 always `""`)

```python
DESCRIPTIONS = [
    "Step 1 text.",   # col 1
    "Step 2 text.",   # cols 2–3 merged (widest cell — use the space)
    "",               # col 3 hMerge — ALWAYS EMPTY STRING, NEVER CHANGE
    "Step 3 text.",   # col 4
    "Step 4 text.",   # col 5
    "Step 5 text.",   # col 6
    "Step 6 text.",   # col 7
    "Step 7 text.",   # col 8
    "Step 8 text.",   # col 9
    "Step 9 text.",   # col 10
    "Step 10 text.",  # col 11
    "Step 11 text.",  # col 12
    "Step 12 text.",  # col 13
]
```

- One or two sentences per step, bold, no bullets
- Step 2 description has the most room — write a fuller description
- Each description must align exactly with the DATA cell for the same step
- `desc_content` is built by filtering: `[desc_cell(d) for d in DESCRIPTIONS if d != ""]`

---

## DATA (12 items — one per step)

```python
data_cell(
    "Anonymous Customer",  # status line — shown underlined
    "Bullet one",          # bullet points, as many as needed
    "Bullet two",
)
```

**Customer status options — three states only:**
- `"Unknown Customer"` — no identifier at all; AEP has zero data on this person
- `"Anonymous Customer"` — ECID assigned but not yet identified; AEP can track behaviour anonymously
- `"Known Customer"` — at least one named identity resolved (email, account ID, phone)
- `"Known Supporter"` / `"Known Donor"` etc. — adapt label to suit the client relationship
- `"New [Product] Customer"` — just converted
- `"Active [Product] Customer"` — existing relationship

**Critical rules for Data Collected:**

1. **Determine the journey type first — this governs the starting state:**
   - **Acquisition journey** (cold start, no prior relationship) — customer begins as `Unknown Customer` or `Anonymous Customer`. Identity and data build as the journey progresses.
   - **Existing customer journey** (loyalty member, account holder, CRM record, renewal) — customer begins as `Known Customer` from step 1. The brand already holds their profile data (email, purchase history, loyalty status etc.) even before any digital touchpoint in this journey. Populate data from step 1 accordingly.

2. **If the customer is Unknown (no identifier, no prior relationship) — the cell must be completely blank.** No bullets, no context, no narrative. AEP cannot collect data without an identifier to associate it with.
3. **Never include off-platform behaviour as collected data.** If the customer is researching on competitor sites, comparison engines, or Google — AEP has no visibility of this. Do not list it.
4. **Only populate data bullets when there is a real client-side touchpoint or existing profile data** — a visit to the client's own website or app, an email click, a login event, a form submission, or pre-existing CRM/loyalty data for known customers.
5. **Do not include an Identity line** — identity is covered in the Adobe Platform row. Data Collected shows only the customer status and behavioural data bullets.
6. **Identity stitching requires a shared identity key.** ECID is tied to a browser session. Stitching (resolving an anonymous ECID to a known profile) happens when the customer authenticates on a brand-owned channel and a common identifier exists (email, loyalty ID, account ID) to match against. It does not require login on both web and app — it requires web authentication and a matchable known identifier. The case where stitching fails: anonymous web browse + app login with no prior web login, because there is no shared key to resolve against.
7. **Every item in a `dataActive` array must also exist in the `data` array of the same slide.** Never activate an item that has not been collected. A ghost `dataActive` entry (present in active list but absent from data list) is a content error.

**Row 1 col 3 note:** DATA[1] goes in col 2. Col 3 is always blank. DATA[2] goes in col 4.
This is handled automatically by the script's `DATA_FLAT` construction — just provide 12 items.

---

## ADOBE (12 items — one per step)

```python
adobe_cell(
    ('product', 'CDP'),              # underlined product name
    ('heading', 'Data ingestion:'),  # bold sub-heading
    ('bullet', 'Bullet text'),       # bullet point
    ('blank', ''),                   # spacing line
    ('heading', 'Identities:'),
    ('bullet', 'ECID (anonymous)'),
    ('blank', ''),
    ('heading', 'Segmentation:'),
    ('bullet', 'Segment name'),
)
```

**Type options:**
| type | renders as |
|------|-----------|
| `'product'` | Underlined product name |
| `'heading'` | Bold sub-heading |
| `'bullet'` | Bullet point |
| `'blank'` | Empty spacing line |

**Standard Adobe product names:**
- `CDP` or `Real-Time CDP`
- `Journey Optimizer`
- `Decision Management`
- `Customer Journey Analytics`

**AEM Assets — only include if the user explicitly requests it.** Do not include AEM Assets by default in any journey. If included, it must only be referenced inside an AJO bullet — never as a standalone product entry.

**Critical rule for Adobe Platform:**

**If there is no client-side touchpoint at a step — the Adobe Platform cell must be completely blank.** No product names, no headings, nothing. Adobe can only ingest, segment, or activate based on data it has legitimately received from a client-owned channel. If the customer is off-platform (e.g. researching on competitor sites, not yet visited the client's site), Adobe has zero visibility and the cell should be empty.

---

## Decisioning — how and when to include it

Adobe's **Decision Management** (part of Journey Optimizer) is the engine that determines *what* content, offer, or experience a specific customer receives. It evaluates the customer's real-time AEP profile — their segments, intent signals, loyalty status, purchase history, propensity scores — against a centralised offer library, applying eligibility rules and ranking criteria to select the single best option for that individual.

**This is a critical narrative layer.** It explains WHY the customer receives a specific offer rather than a generic one. Include it wherever the journey delivers personalised content — not just "an email was sent" but "the decision engine evaluated her profile and selected the most relevant offer."

**Critical rule — Decision Management only appears when a decision is actively delivered.** If the step is collecting signals, building segments, or pre-computing — that is not a Decision Management moment. Signal collection belongs in the Segmentation block. Decision Management enters only when a specific piece of content, offer, or experience is chosen and delivered to the customer at that step.

**DM = primary offer decisions only.** Not every piece of personalisation is a DM call. Minor, rule-based display logic — a sustainability badge on a product tile, a loyalty tier label, a content tag — is not a Decision Management moment. Reserve DM for primary decisions: hero content selection, offer selection, upsell recommendation, channel selection. Keep the DM row tight; one or two bullets per step maximum.

**DM only operates on Adobe-owned surfaces.** Decision Management delivers decisions through Journey Optimizer on channels the brand controls — web, app, email, push, SMS. DM does not control paid media creative selection. When a segment is pushed to Meta or Google, the ad platform does its own creative selection and delivery. Never attribute paid media creative choices to DM.

**Brand Concierge conversational recommendations are not DM.** When a customer asks Brand Concierge a question ("what goes with this jacket?"), the answer is generated by BC's LLM using the brand's knowledge base and the customer's AEP profile. This is not a Decision Management call. DM can appear within a BC interaction only if a specific promotional offer from the offer catalogue is being surfaced (e.g. a loyalty discount applied to a recommended product) — not for general outfit guidance or product suggestions.

**Wrong — signal flagging masquerading as a decision:**
```python
('product', 'Decision Management'),
('bullet', 'High-intent profile flagged'),
('bullet', 'Sustainability affinity noted'),
```

**Correct — decision actively delivered with driving signal:**
```python
('product', 'Decision Management'),
('heading', 'Decisioning:'),
('bullet', 'Sustainability creative selected — B-Corp affinity signal'),
```

**When to include Decision Management:**

| Journey moment | Example |
|----------------|---------|
| Retargeting (paid media) | Deposit-match creative selected over rate-focus for her profile |
| Personalised offer step | Best mortgage rate matched to her deposit band and income |
| Web personalisation on return visit | Returning visitor banner personalised to her saved product |
| Re-engagement email/SMS | SMS chosen over email based on prior engagement |
| Post-conversion welcome | Home insurance identified as next best action |

**How to write it in an adobe_cell:**
```python
adobe_cell(
    ('product', 'Decision Management'),
    ('heading', 'Decisioning:'),
    ('bullet', 'Best mortgage rate matched to her deposit band'),
)
```

**How to write decisioning bullets — one line, outcome + signal:**
- State **what was selected** and **the signal that drove it**
- One bullet per decision — rarely more than two
- Do not describe the mechanism (eligibility rules, ranking algorithms, fallback logic)
- The product label `Decision Management` names the capability; the bullets show the outcome

**Key principle:** Always pair Decision Management with the Journey Optimizer cell that delivers the outcome. Decisioning answers "what was chosen and why?" — Journey Optimizer answers "how was it delivered?"

---

**Patterns by journey stage:**

| Stage | Typical cell content |
|-------|---------------------|
| Pre-digital trigger (no touchpoint yet) | **Blank** |
| First website visit (ECID assigned) | CDP: data ingestion + ECID anonymous + broad segments |
| Product comparison (on client site) | CDP: streaming WebSDK + identity enrichment + intent segments |
| Intent / basket | CDP: basket events + identity resolution initiated |
| First abandonment | CDP: abandonment event + full identity + Journey Optimizer entry triggered |
| Paid retargeting | CDP: Activation/Destinations — segments pushed to Facebook/Google/Meta |
| Return + login | CDP: login/account event + full identity + Journey Optimizer web personalisation + Decision Management: personalised content selected |
| Personalised offer | Decision Management: eligibility + ranking selects optimal offer; Journey Optimizer delivers it |
| Checkout start | CDP: checkout events + Journey Optimizer checkout abandon trigger |
| Re-engagement | Journey Optimizer: email + push + frequency rules; AEM Assets: content |
| Conversion | CDP: purchase event; Journey Optimizer: welcome journey; CJA: attribution |

---

## Customer Journey Analytics — when and how to include it

CJA is an active analytics layer, not just a final-step reporting tool. Include it wherever it genuinely contributes to the story — do not force it in at every step.

**Two patterns — use whichever fits the moment:**

**CDP-led:** CDP creates the segment; CJA explains the insight that supports it.
```python
adobe_cell(
    ('product', 'CDP'),
    ('heading', 'Segmentation:'),
    ('bullet', 'Pricing page exit cohort'),
    ('blank', ''),
    ('product', 'Customer Journey Analytics'),
    ('heading', 'Insight:'),
    ('bullet', 'Funnel analysis: pricing page confirmed as primary exit point'),
)
```

**CJA-led:** CJA analyses cross-channel behaviour and creates the segment itself, published back to AEP.
```python
adobe_cell(
    ('product', 'Customer Journey Analytics'),
    ('heading', 'Segment created:'),
    ('bullet', 'High-propensity trial-to-paid — 30-day usage pattern'),
    ('blank', ''),
    ('product', 'Journey Optimizer'),
    ('heading', 'Journey trigger:'),
    ('bullet', 'Re-engagement journey launched for cohort'),
)
```

**Where CJA typically applies:**
- Abandonment/stall steps — funnel analysis identifies exit point; feeds segment refinement
- Re-engagement steps — campaign attribution; which cohorts responded
- Conversion — multi-touch attribution; revenue per journey path
- Post-conversion — retention signals; expansion opportunity identification

CJA bullets are always insight-focused — what was identified or created. Never describe CJA as delivering a message or triggering a journey.

---

## TECH (12 items — one per step)

```python
tech_cell(
    "Category Name",   # underlined bold heading — 2–4 words
    "Platform name [confirmed]",   # confirmed via research — add source as inline comment
    "Platform name [assumed]",     # inferred — no source found
)
```

**Purpose of the TECH row — inventory, not endorsement:**

The TECH row acknowledges the client's existing stack for credibility. It is not a narrative
of what those tools do. The objective of these artefacts is to sell Adobe software — all
action, orchestration, personalisation, and delivery in the journey must be attributed to
Adobe products in the Adobe Platform row.

**Never write content that credits a competing platform with delivering an outcome.** For
example:
- Wrong: "Salesforce Marketing Cloud delivers the re-engagement email"
- Wrong: "Braze sends the push notification"
- Right: list "Salesforce Marketing Cloud [confirmed]" in the TECH cell — no further narrative

If a competing tool exists in the client's stack, name it in TECH and say nothing more.
The Adobe Platform row explains what delivers the outcome.

**Two-level filter — apply both before populating any cell:**

1. **Journey level:** Is this technology relevant to this journey at all? If a platform
   plays no part in the journey being described, exclude it entirely — don't list it at
   any step. A loyalty app in a cold acquisition journey, or a B2B CRM in a retail
   consumer journey, should simply not appear.

2. **Step level:** Of the journey-relevant tech, only show it at the step(s) where it is
   actually touched. If it plays no role at a particular step, leave that cell entry out.
   A step with no client-side touchpoint may have very few entries or none.

Ask at step level: "Is this platform actively involved in what happens at this moment?"
If no — omit it from this cell.

**TECH must only contain digital platforms and software systems the client owns or operates.**
Never include offline channels, media, or non-technology items — no magazines, print,
TV, radio, word-of-mouth, or any channel the client does not run as a software platform.
If a customer's inspiration or awareness comes from an offline source, that context belongs
in the Description or the right-panel story beat — never in the TECH row.

**Exception — paid media platforms at the awareness step:** If the customer's journey
begins via a brand-paid ad on a platform (e.g. TikTok, Instagram, Google), that platform's
ad management tool IS valid in the TECH row at that step — it is the channel the client
actively used to reach the customer. Only include it at the step(s) where it is actively
used; do not carry it forward to unrelated steps.

**This exception applies to the TECH row only.** A paid ad impression on a third-party platform (YouTube, Instagram, Google) gives the brand zero data in AEP. Data Collected, Data Ingestion, Segments, Adobe Platform, and Activation must all be blank at any step where the only activity is a paid ad impression on a channel the brand does not own. ECID is only assigned when the customer visits a brand-owned domain with WebSDK deployed.

**Paid media impression data is not available at the individual level.** Meta, Google, and other paid platforms provide aggregate campaign reporting — they do not send individual-level impression events to the brand. Never list "Meta ad impression" or "Google ad shown" as a data bullet in Data Collected or Data Ingestion. The brand knows they activated a segment to Meta; they do not know that a specific customer saw a specific ad.

**Never use "Email delivery platform" as a generic tech entry.** AJO is the email delivery mechanism in these journeys. If the client uses a specific third-party ESP (Braze, Dotdigital, Salesforce Marketing Cloud), name it explicitly with a `[confirmed]` or `[assumed]` label. A generic "Email delivery platform" entry implies a competing tool without naming it — omit it entirely if no specific tool is confirmed or assumed.

**Activation timing:** Activation/destination entries (segment pushes to Meta, Google etc.)
must appear at the step where the segment is actually pushed to the channel — not at the
step that triggered it. The abandonment step triggers the journey entry; the retargeting
step is where the activation to paid media happens. Do not place activation items one step
early.

**Never include a tech entry that is never activated.** If a platform is never `a: true`
at any step in the journey, it must be excluded entirely. A permanently dimmed entry
means the platform plays no active role in this journey — listing it is noise. This
applies even to well-known platforms in the client's stack (analytics tools, BI platforms,
data warehouses etc.) — if they are not touched in the journey being described, omit them.

**Every bullet must end with `[confirmed]` or `[assumed]`** — no exceptions.
Add an inline `# confirmed — <source>` comment for confirmed items, e.g.:
```python
tech_cell("CRM & Billing",
          "Salesforce CRM [confirmed]",   # confirmed — LinkedIn job posting
          "Billing system [assumed]"),
```

**Research sources to use (in order):**
1. BuiltWith — `"<Client>" site:builtwith.com`
2. LinkedIn job postings — `"<Client>" marketing technology jobs site:linkedin.com`
3. Vendor case studies — `"<Client>" "Salesforce" OR "Braze" OR "Tealium"` etc.
4. Company tech/engineering blog

**If research finds nothing — fallback rules:**

Do not leave TECH cells empty or invent specific platforms. Instead:
1. Infer likely tools based on the client's sector and company size — mark all as `[assumed]`
2. Add an inline comment explaining the basis: `# assumed — typical for [sector] at this scale`
3. Use the sector defaults below as a starting point:

| Sector | Likely stack (assumed) |
|--------|----------------------|
| Retail / e-commerce | Google Analytics, Salesforce Commerce Cloud or Shopify, email platform |
| Financial services | Salesforce CRM, Adobe Campaign or Braze, SSO/IAM platform |
| Telecoms | BSS/OSS billing platform, Salesforce or SAP CRM, Braze or Dotdigital |
| B2B SaaS / developer tools | HubSpot or Salesforce, Google Analytics, Stripe billing, engineering blog CMS |
| Travel / hospitality | CRM, booking engine, loyalty platform, email platform |
| Charity / non-profit | Salesforce NPSP or Raiser's Edge, email platform, donation platform |

At minimum every journey should have a Web & CMS entry and an Engagement Channels entry — even if both are `[assumed]`.

**Typical category names:** Web & CMS, Commerce, Auth & CMS, Paid Media, Engagement Channels,
Billing & CRM, Data Science / ML, Analytics, CRM & Fundraising, Commerce & Ticketing

**Typical technology examples by category:**
- **CRM & Billing:** Salesforce, SAP, billing platform, contract management
- **Web & CMS:** company website, WebSDK, Drupal/WordPress/Sitecore, UTM tracking
- **Commerce:** e-commerce platform, basket management, checkout system
- **Paid Media:** Facebook/Meta Ads, Google Ads, DV360, programmatic DSPs
- **Auth & CMS:** SSO, customer account portal, personalisation engine
- **Engagement Channels:** Braze, Dotdigital, Marketo, SMS gateway, Genesys/Cisco call centre
- **Billing & CRM:** billing system, plan activation platform, Salesforce

---

## DEST path convention

```python
DEST = r'c:\Users\dennison\AppData\Local\Temp\{client-slug}-one-pager.pptx'
```

Use the client name slugified (lowercase, hyphens), e.g.:
- `vodafone-ireland-one-pager.pptx`
- `zsl-one-pager.pptx`

---

## set_row rows[3] label

```python
set_row(rows[3], 'Existing [Client Name] Technology', TECH)
```

Always update this to include the actual client name.
