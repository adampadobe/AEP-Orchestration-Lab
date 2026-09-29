SUMMIT 2026 MARKETER DEMOS — PRODUCT AND SURFACE REFERENCE FOR MARKETER STORIES
Last updated: April 2026

Source: Figma demo exports from Summit 2026 (DICK'S Sporting Goods, Sevoi Resorts, Marriott, Ulta Beauty)
Tag applied to all items: source: Summit 2026 Demos

PURPOSE OF THIS FILE

This file is the reference for what populates the technology layer of marketer stories post-Summit 2026. It does NOT change the structure, persona format, narrative flow, or output format of marketer stories — those remain as defined in 08_marketer.md and 07_storyboard.md. What changes is the vocabulary and choreography used when a story step needs to show how the marketer interacts with Adobe technology.

For the framework concepts (default-first behaviour, two-mode system, theme inference, Coworker convention, what never changes), retrieve summit_themes.md. This file focuses on the post-Summit product vocabulary and the demo-specific texture used inside story steps.

==============================================================
THE NEW PRODUCT AND SURFACE VOCABULARY
==============================================================

Marketer stories should use the post-Summit vocabulary. The following references replace or refine older framings.

ADOBE CX ENTERPRISE
The unified surface the marketer works in. When a story step would have referenced "the marketer opens Experience Cloud" or "the marketer logs into [specific application]," the post-Summit framing is "in Adobe CX Enterprise" or "the marketer sees the daily digest in CX Enterprise." It is the surface, not a product to buy. Existing applications (RTCDP, AJO, AEM, Workfront, GenStudio) are still real and still get named when the story touches them — they just live within CX Enterprise.

ADOBE CX ENTERPRISE COWORKER (when opted in)
A persistent super-agent that orchestrates multiple purpose-built agents toward a business goal. Has memory, can be triggered by signals or scheduled, self-corrects, accumulates knowledge over time.

CRITICAL: Coworker is an interface, not a narrator. Do NOT write Coworker as a chatty collaborator that explains things at every turn. The Summit demos show Coworker as restrained — it surfaces a signal, proposes a workplan, and then steps back while named agents and artifacts do the work. The marketer speaks in directives. Coworker only re-enters for memory, proactive insight, cross-reference, or final synthesis.

The full choreography pattern is in the "COWORKER CHOREOGRAPHY — THE DEMO PATTERN" section below. Read it before writing any Coworker scene.

AI ASSISTANT
The conversational layer inside Adobe applications. When a story step shows the marketer asking a natural-language question and getting an answer or action, AI Assistant is the surface that conversation is happening in. Post-Summit it has new capabilities (hybrid UI, file upload, proactive automations, seamless modality transitions) — these can be referenced when the story benefits from it but shouldn't be name-checked gratuitously.

PURPOSE-BUILT AGENTS
The named agents (Audience Agent, Journey Agent, Data Insights Agent, Brand Experience Agent, Brand Governance Agent, Content Advisor Agent, LLM Optimization Agent, Site Optimization Agent, Product Advisor Agent, etc.) are still real and still appear in stories. When Coworker is featured, agents execute the workplan steps and their outputs appear as artifacts (audience cards, asset previews, journey canvas). Show them as badges next to the workplan ("/AudienceAgent", "/JourneyAgent", "/FireflyCreativeProductionAgent"). Do NOT have Coworker narrate which agent is being invoked — agents simply work the step and produce the artifact. When Coworker is NOT featured, agents are referenced as the marketer's direct collaborators ("the marketer asks the Audience Agent to refine the segment").

AGENT ORCHESTRATOR AND ADOBE AI PLATFORM
These are enablers — they're always present in marketer stories but appear as the load-bearing infrastructure underneath, not as products the marketer interacts with. Reference them when the story shows agents reasoning, coordinating, or self-correcting ("Agent Orchestrator coordinates the agents to handle the audience update and journey adjustment in sequence"). Don't make them protagonist in the narrative.

SKILLS CATALOG
When a story shows agent customisation or extension to match enterprise-specific business processes, Skills are the mechanism. References like "the team has customised the Audience skill to include their loyalty tier eligibility logic" reflect the post-Summit reality.

ADOBE BRAND INTELLIGENCE
A new fine-tuned LLM with vision-language capabilities that encodes brand identity and enforces it across content. When a story has a brand governance moment — content being checked against brand standards, on-brand variations being generated, restricted terms being flagged — Brand Intelligence is the layer doing it. References in passing like "Brand Intelligence confirms the headline holds up against the tone guidelines" feel natural.

LLM OPTIMIZER, BRAND CONCIERGE, AEM SITES OPTIMIZER
These are Brand Visibility products. When a story touches AI-mediated discovery, brand presence in LLM-generated answers, on-site conversational engagement, or pre-flight content optimisation, these products show up. They can be referenced specifically (LLM Optimizer for AI search visibility, Brand Concierge for owned-property conversational engagement, AEM Sites Optimizer for pre-flight SEO/content/accessibility checks).

ADOBE MARKETING AGENT (in third-party AI surfaces)
When a story features the marketer working from inside Microsoft 365 Copilot, ChatGPT Enterprise, Claude CoWork, or Gemini Enterprise rather than Adobe's surface, Adobe Marketing Agent is how Adobe capabilities reach them. This is a powerful differentiator narrative — "the marketer stays in their preferred AI environment and Adobe's capabilities come to them."

AI COLLABORATORS (in Workfront)
When a story shows an agent operating as a permissioned team member assigned work inside a Workfront workflow (rather than invoked through a conversation), AI Collaborators is the model. Content Reviewer is the first out-of-the-box one — useful when the story has a content review moment that previously required manual reviewer assignment.

CONTENT AUTHENTICITY FOR ENTERPRISES (CAFE)
When a story touches content provenance, AI disclosure, or compliance with emerging AI labelling requirements, CAFE is the layer doing it. Embedded into Content Supply Chain, AJO, AEM, Firefly Services. Reference in passing — "Content Credentials applied automatically" — rather than as a featured product.

==============================================================
HOW PRODUCTS AND AGENTS APPEAR IN MARKETER STORIES POST-SUMMIT
==============================================================

These are illustrative examples of how the new vocabulary lands inside story steps. They're not templates — they're the texture and choreography to draw on.

CROSS-TOOL EXECUTION
When a story step touches multiple Adobe products, the marketer doesn't switch tools. The work moves underneath. Examples of how to phrase it:
- "The page is out for approval" (rather than "the marketer opens Workfront and assigns a reviewer")
- "Reviewers are notified" (rather than "the marketer sends an email")
- "The asset moves into the production queue" (rather than "the marketer uploads to AEM Assets")
- "Brand guidelines: confirmed. Accessibility: confirmed." (rather than "the marketer runs a compliance check")

PRE-ASSEMBLED CONTEXT
When the story opens with the marketer being shown an opportunity, the AI has already done the legwork. References that capture this:
- "[Agent or Coworker] has already pulled the audience signals, sized the opportunity, and drafted three variant options"
- "By the time the marketer opens the daily digest, the trend has been correlated with the external signal driving it"
- "The audience, scheduling, and supporting assets are pulled in from the parent campaign"

DIRECTIVE LANGUAGE
The marketer directs work in natural language. Phrases that feel right post-Summit:
- "Why is the conversion rate so bad?"
- "What would this look like if we changed the primary goal from X to Y?"
- "Use our existing data."
- "I like 2."
- "Looks good, let's publish."
- "Let's build this together step by step."
- "Yes, and set up a recurring meeting on Tuesdays."

GOVERNANCE-IN-PASSING
Brand checks, accessibility, content credentials, audit trails are present but not the focus of a step. They surface as confirmations, not as pause moments. References:
- "Brand guidelines: confirmed."
- "Content credentials applied."
- "Audit trail visible alongside the workplan."

INSTITUTIONAL MEMORY
Coworker and the platform learn over time. When a story benefits from showing this:
- "The last time something like this happened, we saw efficiency rise in paid social — we didn't move budget fast enough then. Coworker is flagging this earlier."
- "The system has captured the marketer's preference patterns from previous campaigns and is starting from those defaults."

COWORKER CHOREOGRAPHY — THE DEMO PATTERN

This is the choreography drawn from the Summit demos (Marriott "Catalyze" and Ulta). Follow it precisely whenever Coworker is featured.

1. SIGNAL IN THE DAILY DIGEST
The story opens with the marketer seeing the daily digest in Adobe CX Enterprise. Coworker has surfaced a signal as a tile — one or two lines, no preamble. Direct examples from the demos:
- "Spike in organic traffic on ulta.com mascara product pages. Organic traffic up 340%. Acquisition opportunity."
- "Dig into this traffic spike in Southern France. Can we spin up a new acquisition campaign to take advantage of the trend?"
- Tile shows assignment ("Amy assigned this to you 42 minutes ago"), category ("Anomaly Detection / Campaign Performance"), and a "Go" button.
The marketer clicks Go or types a directive ("Why is the conversion rate so bad?").

2. COWORKER PROPOSES A WORKPLAN — NOT AN EXPLANATION
Coworker's first response is short framing (2-4 lines max) plus a workplan. The workplan is a visible list of 4-6 named steps. Example from Marriott:
"Workplan:
— Analyze Riviera traffic spike
— Draft Real-Time CDP audience segments
— Optimize Southern France landing page
— Plan acquisition campaign
— Build & launch campaign"
Coworker may add ONE line of context ("If we want to target 15-25% incremental enrollment, here are two options to reallocate existing budget"). Never a paragraph of analysis.

3. THE WORKPLAN BECOMES THE STORY STRUCTURE
Each workplan step becomes a scene. Coworker steps back. Named agents do the work and their outputs appear as artifacts:
- Audience cards (segment name, size, suppression rules, decision intelligence applied)
- Asset previews (hero, carousel variants, channel adaptations, brand-checked)
- Journey canvas with nodes
- Approval flows in Workfront

Status lines as agents work: "Working on building audiences..." / "Completed creation of project & resource assignment" / "Completed hero asset approval".

Active agents appear as badges next to the workplan — e.g. /AudienceAgent, /JourneyAgent, /WorkflowOptimizationAgent, /FireflyCreativeProductionAgent, /CampaignBriefCreator.

4. THE MARKETER SPEAKS IN DIRECTIVES — DIRECT QUOTES FROM THE DEMOS
- "Yes"
- "I like 2"
- "Looks good, let's publish"
- "Use our existing data"
- "This looks great, but will you suggest a new headline?"
- "Yes, add new audience"
- "yes have her look at this and action on it today"
- "Let's start"
- "Build it together"
- "Why is the conversion rate so bad?"
- "What would this look like if we changed the primary goal from bookings to new Bonvoy member enrollment?"

DO NOT write the marketer asking "Can you explain why..." or "Tell me more about the data behind..." — those are AI Assistant patterns. The marketer in a Coworker story directs and decides; they don't request explanations.

5. COWORKER RE-ENTERS ONLY AT FOUR MOMENT TYPES
Between steps Coworker stays silent. Re-entry is justified only when the moment fits one of these:

— MEMORY: "The last time something like this happened, we saw efficiency go up in paid social, but we didn't move budget fast enough to see impact."
— PROACTIVE INSIGHT: "I found a new audience you didn't ask for, but is worth reviewing."
— CROSS-REFERENCE: "While building, I cross-referenced [data point] and noticed [pattern]."
— SYNTHESIS at the end: "Coworker has synthesized prior conversation context, [signals], and [data] to surface the most relevant audience insights for this campaign. The canvas now reflects key drivers of [outcome], shifting [segments], and [patterns]."

Each re-entry is 1-3 sentences max. Never a paragraph.

6. AGENTS DO NOT TALK LIKE COWORKER
Agents have task-specific outputs, not narration. Examples from the demos:
- "Hero assets are approved. I've generated all multichannel variants and ran them through the Marriott Brand Intelligence System before surfacing them — logo usage, color palette, copy tone and voice all clear."
- "Created autonomously by /FireflyCreativeProductionAgent /ContentProducerAgent"
- "Optimized messaging hierarchy and CTA clarity by channel / Adjusted copy length to meet platform constraints / Maintained accessibility contrast and safe text zones / Preserved brand consistency aspect ratios and specs"

7. THE STORY CLOSES ON CONTINUITY
End with Coworker still active as a state, not a summary speech. Example: "Coworker continues to monitor LLM-referred traffic patterns. The next time a signal like this appears, the workplan will already be drafted."

KEY TEST FOR ANY COWORKER SCENE
Re-read what Coworker is saying. If Coworker is writing paragraphs that explain, walk through analysis, describe its own reasoning, or commentate on what's happening — that's AI Assistant dialogue mislabelled. Cut it. Coworker surfaces, proposes, remembers, synthesises. Agents and artifacts do the work.

THIRD-PARTY AI SURFACE (when relevant to the brief)
When the story shows the marketer working from inside their preferred AI environment:
- "The marketer is in Microsoft 365 Copilot. Adobe Marketing Agent surfaces the audience data and the journey draft inside the same conversation thread."
- "From Claude CoWork, the marketer asks for the campaign performance summary — Adobe Marketing Agent pulls it from CJA."

==============================================================
KEY DEMO PATTERNS BY MODE
==============================================================

These notes describe what the demos show in each mode, for reference when the GPT is choosing how to populate technology layers in a story.

MODE 1 — MULTI-TOOL ORCHESTRATION
Examples drawn from: Marriott (French Riviera traffic spike), Ulta Beauty (Platinum loyalty challenge), DICK'S Sporting Goods (marathon launch).

What's typical:
- Trigger surfaces in a daily digest, not a planned task
- Pre-assembled context: audience pulled, opportunity sized, options drafted
- Cross-product flow: CX Analytics, RTCDP, AEM, AJO, Workfront, Express touched in one conversation
- Marketer collaborates step by step, asks "why," requests rewrites, runs simulations
- Brand Intelligence runs governance underneath; CAFE applies content credentials
- Closing moment: work moves into recurring rhythm (scheduled report, recurring meeting, learned preference)

When Coworker is opted in within Mode 1:
- Coworker is named explicitly as the orchestrator
- Workplan visible; active agents shown as badges
- Coworker invokes specific agents in sequence; self-corrects between steps
- Story closes with Coworker continuing to monitor for the next moment that looks similar

When Coworker is NOT opted in within Mode 1:
- Individual agents are named as the marketer's direct collaborators
- Steps reference specific agents handing work to each other
- The orchestration is implicit (Agent Orchestrator coordinates underneath) but not personified as a super-agent

MODE 2 — SINGLE-TOOL FOCUS
Example drawn from: Sevoi Resorts (Brand Intelligence synthetic persona testing and assembly).

What's typical:
- Story goes deep on one product's specific capability
- Multi-step interaction within that one product (configuration, simulation, output, refinement)
- Other Adobe products may be referenced as inputs or outputs but stay in the background
- Useful when the brief calls for showcasing a feature rather than cross-product workflow

Coworker rarely fits in Mode 2 because there's no multi-agent orchestration to do. If opted in, Coworker would be referenced as having scheduled or triggered the focused work, but the body of the story stays in the single product.

==============================================================
WHAT NEVER CHANGES
==============================================================

The marketer story output structure (Persona, Background, Story Steps, Conclusion) is unchanged.
The persona creation approach is unchanged.
The visual direction fields and image generation prompts in every scene are unchanged.
The export format (CSV for Miro, TSV for FigJam) is unchanged.
The narrative flow and storytelling approach is unchanged.
Customer journey stories continue to keep Adobe invisible in the customer narrative layer — none of the post-Summit product names appear in customer journey stories.

What this file changes is only the vocabulary, choreography, and product references that populate the technology layer of marketer stories — and the default-first behaviour the GPT uses to propose a story shape with minimal input required from the consultant.
