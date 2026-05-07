# AEP Client Journey Skill (v2)

Use this skill in Claude to generate a 12-step Adobe Experience Platform client
journey with two deliverables:

1. A standalone interactive HTML journey.
2. A one-pager PPTX narrative structure.

## Input shape

Provide a JSON payload with:

- `client` (required)
- `clientDomain`
- `brandColor`
- `journeyType`
- `personaName`
- `personaGender` (`female` or `male`)
- `marketerPersonaName`
- `tier` (`Foundation` or `Advanced`)
- `techStack`
- `additionalContext`

## Tier behavior

- **Foundation**: Real-Time CDP, Journey Optimizer, Customer Journey Analytics
- **Advanced**: Foundation + Decision Management + Brand Concierge

## Required output shape

Return one strict JSON object (no markdown fences, no extra commentary) with:

- `meta`
- `stepLabels` (12)
- `descriptions` (13, with index 2 as empty string)
- `pptxData` (12)
- `pptxAdobe` (12)
- `pptxTech` (12)
- `slides` (13; index 0 overview, then 12 steps)
- `icons` (12)

## Guardrails

- Exactly 12 journey steps.
- Step 2 is the pivotal comparison/decision moment.
- No invented Adobe capabilities.
- No Decision Management in Foundation tier.
- Brand Concierge only in Advanced tier and only on brand-owned channels where
  customer-initiated conversation is plausible.
- Keep content consistent across description, Adobe row, and slide-level data.

## Suggested prompt scaffold

Use this starter with Claude:

```text
Generate a 12-step AEP client journey JSON using the AEP Client Journey Skill v2 rules.

Client: <name>
Domain: <domain>
Tier: <Foundation|Advanced>
Journey type: <type>
Persona: <name>, <female|male>
Brand color: <hex without #>
Tech stack: <one per line, optional>
Additional context: <optional>

Return only valid JSON in the required shape.
```

## Reference docs (recommended)

For the full rule set used by this lab implementation, review:

- `content-rules.md`
- `html-rules.md`
- `brand-concierge.md`

These are available in the source repo under:

`functions/assets/client-journey-v2-skill/`
