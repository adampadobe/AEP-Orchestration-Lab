# Adobe voice — full rules + before/after pairs

## Voice pillars (how Adobe copy reads)

1. **Plain and confident.** Short declarative sentences. No hedging ("might", "could well"),
   no drama ("Here's the thing"). If a sentence works without a word, cut the word.
2. **Benefit first, proof second.** Open with what the customer gets; follow with the
   specific that makes it credible — a number, a named moment, a real trigger.
3. **Active voice, present tense.** "Journey Optimizer sends the offer" — not "the offer
   is sent" or "the offer would be sent".
4. **Second person where natural.** Talk to the reader ("your customers see…"), about the
   persona by name ("Jordan sees…"). Never "the user".
5. **Sentence case everywhere.** Headlines, slide titles, labels, buttons. Proper nouns and
   product names keep their capitals; nothing else does.
6. **Product names are exact.** Adobe Real-Time CDP, Adobe Journey Optimizer, Customer
   Journey Analytics, Adobe Express, Adobe Firefly. Never abbreviate on first use
   (then RT-CDP, AJO, CJA are fine in tables/labels).
7. **Numbers beat adjectives.** "three nudges, zero missed payments" beats "incredibly
   proactive support". If you reach for an intensifier, look for the number instead.

## AI-tells — the full catch list (mirrors voice_lint.py)

**Structural tells**
- Antithesis pairs: "X, not Y" / "not X — Y" / "less X, more Y". One per deck maximum;
  zero is better. This is the single strongest Claude-tell.
- "isn't just / doesn't just / more than just / not only… but"
- Triplet negation: "no X, no Y, just Z"
- Em-dashes: **target ZERO in deck copy.** Replace with a period (usually) or a comma.
  voice_lint only *detects* density (>3 per 100 words) — that is a detector threshold, NOT a
  budget to spend. A deck can score 1.2/100w, print [GATE OK], and still carry 33 em dashes.
  Passing the gate is not evidence of following this rule; count them yourself.
- Rhetorical question + snappy answer ("The result? Loyalty.")
- Drama openers: "Here's the thing", "The best part?", "Put simply", "In short",
  "Think of it as", "The kicker"
- Sweeping openers: "In today's <anything> world/market/landscape", "In a world where…",
  "In an era of…" — cut the throat-clearing and start with the specific.
- One-word-sentence emphasis. ("Early. Plain-spoken. Yours.")

**Word watchlist** (each occurrence must justify itself; default = replace)

_Promotional warmth:_
seamless(ly) · effortless(ly) · magical · delightful · supercharge · game-changing ·
unlock · elevate · empower · transform(ative) · revolutionize · quietly · beautifully ·
frictionless · "just works" · journey (when it means "experience", not a mapped journey) ·
"peace of mind" · robust · leverage (as a verb)

_Cursed vocabulary_ (words AI overuses that a human rarely picks — replace, don't soften):
delve · tapestry · pivotal · underscore · testament · paradigm · myriad · plethora · realm ·
beacon · bustling · treasure trove · symphony · cutting-edge · state-of-the-art ·
ever-evolving/-changing · meticulous · intricate · embark · nestled · whimsical · watershed ·
"harness the…" · "when it comes to…"

(Deliberately NOT flagged, because they're real Adobe terms or plain copy: journey,
orchestrate, navigate, showcase, landscape, foster. Use them normally.)

**Format tells**
- Title Case Headlines (Adobe is sentence case)
- Bold-word-per-clause emphasis patterns
- Emoji in body copy (client decks: none, ever)

## Before / after (real examples from the Monzo deck)

| Before (AI-tell) | After (Adobe voice) |
|---|---|
| "A Heads-Up, Not a Nasty Surprise" | "A heads-up, three days early" |
| "The heads-up arrives before the shortfall — relief, not a fee." | "The heads-up lands three days before the shortfall. Jordan moves £200 in one tap." |
| "Money stopped feeling like an ambush." | "A month with no surprises" |
| "clarity he didn't have to chase" | "the answer was waiting in the feed" |
| "saving feels like a win, not a sacrifice" | "the offer lands the day two invoices clear — so he takes it" |
| "Invisible to Jordan. Orchestrated by Adobe." | Keep — it's a genuine contrast doing real work, and it's the one allowed per deck. |
| "a bank that behaves like a level-headed friend — early, plain-spoken, on your side" | "a bank that spots the problem early and says it plainly" |

The last-but-one row is the judgment call the lint can't make: **one** deliberate contrast
per deck is a rhetorical choice; five is a fingerprint. The lint flags them all — you keep
the one that earns its place and note it with `<!-- voice-keep -->` (HTML) or `[voice-keep]`
(markdown) on the same line, which the lint honours.

## Where this runs in the pipeline

- experience-story-writer: apply while drafting story + storyboard copy (cheaper to fix at
  the source than after render).
- experience-story-builder Stage 4.5 (render QA): `voice_lint.py` on the built deck is a
  required gate — `reviewed` cannot be set until it passes.
- Standalone: "declaude this file/paragraph" runs the same lint + rewrite loop on anything.
