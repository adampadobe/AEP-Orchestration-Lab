# Brand Concierge — Capability Reference

Adobe Brand Concierge is a conversational AI assistant embedded on a brand's website or
app. Built on AEP Agent Orchestrator, it responds to questions the customer initiates —
they open the widget, ask something in natural language, and the concierge answers using
the brand's knowledge base and the customer's real-time AEP profile.

**Brand Concierge is customer-initiated. It is not an outbound message, push notification,
or proactive outreach tool.** Do not write it as if it contacts the customer. The customer
opens it and asks a question. Journey Optimizer handles outbound messages.

---

## Core capabilities

- **Natural language product discovery** — customer asks "what jacket would work for
  winter?" and receives contextually relevant answers from the brand's catalogue
- **Guided comparison** — customer asks to compare two products side-by-side
- **Pre-purchase consultation** — high-consideration guidance: sizing, compatibility,
  suitability for the customer's stated need
- **Site navigation** — helps customers find pages, policies, store locations
- **Post-purchase support** — setup guidance, order tracking questions, returns
- **Human handoff** — escalation to a live agent when the conversation requires it

---

## AEP integration

| Integration point | What happens |
|------------------|-------------|
| Real-time profile lookup | Concierge accesses the customer's live AEP profile during the conversation — segments, purchase history, loyalty status, propensity scores — to personalise responses |
| Profile enrichment | Conversation signals (intent, sentiment, product affinity) written back to the unified profile as computed attributes for downstream use |
| ExperienceEvent capture | Every interaction captured as an XDM ExperienceEvent — feeds analytics and downstream personalisation |
| CJA dashboard | Conversation analytics (engagement rate, sentiment, conversion, unique users) surface in Customer Journey Analytics |

---

## When to include in a journey (Advanced tier only)

Include Brand Concierge at steps where the customer is on the brand's website or app
and actively considering a product or needing guidance. The story should describe what
the customer asked and what the concierge helped them with.

| Journey moment | Story narrative |
|---------------|----------------|
| Product/plan comparison | Customer opens concierge and asks to compare two products; guided to the right choice using their profile |
| High-intent but hesitating | Customer asks about sizing, compatibility, or suitability; concierge answers and reduces friction |
| Return visit after abandonment | Customer opens concierge and asks about their saved item; guided back toward purchase |
| Calculator / quote step | Customer asks a follow-up question about their quote result |
| Post-conversion onboarding | Customer asks about setup, delivery, or next steps |

---

## How to write it in an adobe_cell and orch array

The story beat should describe **what the customer asked** and **what the concierge
helped them with**, followed by what data was captured.

```python
adobe_cell(
    ('product', 'Brand Concierge'),
    ('heading', 'Conversational AI:'),
    ('bullet', 'Customer opens concierge: asks about jacket sizing and fabric'),
    ('bullet', 'Guided to correct size based on profile; conversation intent captured'),
)
```

In the HTML `orch` array:
```javascript
orch: [
  'Brand Concierge: asked about jacket sizing — guided to size M',
  'Conversation intent + product affinity written to AEP profile',
]
```

**Writing rules:**
- Always frame from the customer's perspective: what did they ask, what did they get
- One or two bullets maximum
- Do not write it as outbound/proactive ("concierge messaged Sofia about her saved look")
- Always pair with CDP (profile lookup feeds the response)
- **Brand Concierge cannot appear at any step where the customer is off the brand's channel.** This includes abandonment steps, email/SMS steps, retargeting steps, and any step where the customer has left the site or app. If the customer is not actively on a brand-owned channel, they cannot open the widget.
- **Brand Concierge cannot personalise outbound content** such as emails or SMS. Email/SMS personalisation is a Decision Management call, not Brand Concierge.
- **Brand Concierge must have a clear narrative reason.** The story must show what the customer asked and what they got. Do not include it just because the customer is on the website and it technically could be there. A Brand Concierge bullet without a specific customer question is noise — omit it.

---

## Foundation vs Advanced

Brand Concierge is an **Advanced tier only** capability. Do not include it in Foundation
journeys. Decision Management is also Advanced tier only.

| Tier | Adobe products included |
|------|------------------------|
| Foundation | Real-Time CDP, Journey Optimizer, AEM Assets, Customer Journey Analytics |
| Advanced | Foundation + Decision Management + Brand Concierge |
