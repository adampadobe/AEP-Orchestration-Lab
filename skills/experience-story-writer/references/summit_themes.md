SUMMIT 2026 — THEMES, ENABLERS, AND MARKETER STORY CONVENTIONS
Last updated: April 2026
Retrieve this file alongside 08_marketer.md before generating any marketer story. Customer journey stories should reference the theme inference cues but follow 09_journey.md for narrative conventions.
═══════════════════════════════════════════════════════

PURPOSE OF THIS FILE
Adobe Summit 2026 introduced three pillars (Customer Engagement, Brand Visibility, Content Supply Chain) under a single flagship name (Adobe CX Enterprise). The plays (UCX, GTM, CSC) remain. This file defines:
— The three Summit themes and how the GPT infers them from a brief
— The enablers always present in marketer stories
— The Coworker convention
— The default-first behaviour
— What never changes across stories

This file is the source of truth for post-Summit story conventions. It does not change the story output structure, persona format, narrative flow, or export format.

═══════════════════════════════════════════════════════
THE THREE SUMMIT 2026 THEMES
═══════════════════════════════════════════════════════

Themes are pillars of Adobe CX Enterprise. They are inferred by the GPT from the brief — never asked. A single story may express a primary theme and a secondary theme.

CUSTOMER ENGAGEMENT
What it covers: personalisation, journeys, loyalty, retention, conversion, lifecycle, segments, decisioning, audiences, real-time response.
Inference cues in briefs: "personalised journey", "loyalty challenge", "lifecycle marketing", "retention campaign", "next-best-offer", "real-time decisioning", "segment activation", "lapsed customers", "engagement lift".
Maps most directly to: UCX play.
Adobe CX Enterprise products that typically appear: Real-Time CDP (with Re-imagined Audiences and Profile Expansion), Adobe Journey Optimizer (with new Journey Agent skills, AJO Loyalty, Engagement Intelligence, AJO Experimentation Accelerator), Customer Journey Analytics (with V2 Data Insights Agent, MCP connectivity), Brand Concierge (with Commerce/AJO/Semantic Profile/Knowledge Agent integrations), LLM Insights, Marketing Campaign Analytics.

BRAND VISIBILITY
What it covers: AI-mediated discovery, LLM citations, GEO, brand presence in AI answers, AI-driven product research, search visibility, conversational engagement on owned properties.
Inference cues in briefs: "AI-mediated discovery", "show up in ChatGPT/Gemini", "GEO", "LLM citations", "brand presence in AI answers", "conversational discovery", "voice of customer", "structured product data for AI", "LLM-referred traffic".
Maps to: any play, but Brand Visibility content currently lives inside the CSC file.
Adobe CX Enterprise products that typically appear: LLM Optimizer (with Verified Business Impact), AEM Sites Optimizer (with pre-flight recommendations), Brand Concierge, Adobe Commerce integrations into LLMO, LLM Insights, Adobe Marketing Agent in third-party AI surfaces.

CONTENT SUPPLY CHAIN
What it covers: content velocity, content at scale, brand consistency, asset reuse, creative workflows, content compliance, content production, briefing, review, asset management.
Inference cues in briefs: "content at scale", "creative production", "brand compliance", "content variation", "asset reuse", "campaign briefing", "review and approval", "creative workflow", "GenStudio", "brand governance", "agency dependency".
Maps most directly to: CSC play.
Adobe CX Enterprise products that typically appear: Adobe Brand Intelligence, NVIDIA 3D Digital Twins, Workfront with AI Collaborators / Content Reviewer, Firefly Services, GenStudio for Performance Marketing, GenStudio Content Marketing Insights, AEM Assets and Sites with Brand Experience Agent / Brand Governance Agent / Content Advisor Agent, CAFE / Content Credentials, Frame.io, Adobe Express.

THEME INFERENCE BEHAVIOUR
The GPT reads the brief and identifies which one or two themes apply. It does not ask the consultant which theme to use. The chosen theme(s) shape what gets emphasised in the story — but the four-section storyboard structure does not change. Themes inform the technology layer of marketer stories and the orchestration layer of customer journey stories.

If a brief is ambiguous and the theme is genuinely unclear, the GPT may surface the inferred theme in the opening default summary as part of the assumption ("…showing the marketer working across [products] to [outcome] — primarily expressing the Customer Engagement theme, with a Brand Visibility moment for the AI-mediated discovery start. Want to adjust the theme emphasis?").

═══════════════════════════════════════════════════════
THE ENABLERS (ALWAYS PRESENT IN MARKETER STORIES)
═══════════════════════════════════════════════════════

The following are always present in marketer stories post-Summit, placed as load-bearing infrastructure rather than as protagonist features:

ADOBE AI PLATFORM
The underlying platform Adobe CX Enterprise runs on. Reference when the story references where the work is happening at a platform level.

AGENT ORCHESTRATOR
Adobe's agentic system designed for CX. Wraps a reasoning engine with memory, trust controls, governance, and error recovery. Model-agnostic (works with Adobe's CX Small Language Models, Azure OpenAI, AWS Bedrock, others). Reference when the story shows an agent reasoning, planning, or coordinating with other agents — surface it as "Agent Orchestrator coordinates the agents…" rather than describing the mechanism abstractly.

AI ASSISTANT
The conversational layer inside Adobe applications. Reference when the marketer is in conversation with Adobe inside an application. New Summit capabilities can be referenced when the story benefits from them:
— Hybrid UI: bi-directional communication between AI Assistant and product UI
— File upload: users uploading files directly into AI Assistant
— Proactive automations: agent-led plans and automations
— Seamless modality transitions: fluid movement between AI Assistant and product UI

SKILLS CATALOG
Published, customisable units of CX capability that agents discover and invoke. Reference when the story features customisation or extension of agent behaviour for enterprise-specific business processes.

ENABLER PLACEMENT RULES
— Enablers appear underneath, not as the protagonist of a step
— Enablers are referenced when their presence makes a step feel grounded — not gratuitously name-checked
— Don't say "Agent Orchestrator orchestrated everything" — say "Coworker invoked the Audience Agent, then the Journey Agent, then Brand Intelligence — Agent Orchestrator coordinated the handoffs underneath"
— Never make enablers visible in customer journey stories

═══════════════════════════════════════════════════════
THE COWORKER CONVENTION
═══════════════════════════════════════════════════════

ADOBE CX ENTERPRISE COWORKER (NEW AT SUMMIT 2026, GA H2 2026)
A persistent, goal-oriented super-agent that orchestrates multiple purpose-built agents toward a business outcome. Has memory, can be invoked manually, triggered by a signal, or run on a schedule. Self-corrects when something fails. Accumulates knowledge over time.

ALWAYS ASK BEFORE FEATURING
The GPT must always ask the consultant whether to feature Coworker in a marketer story. The default is to feature Coworker — it represents the strongest post-Summit narrative shape and most marketer stories benefit from showing the orchestrating super-agent in action. The consultant can opt out and anchor on individual purpose-built agents instead.

The Coworker question is asked in the opening default summary alongside the mode question:
"Want to keep this multi-tool approach, or focus on a single tool? And — would you like to feature Adobe CX Enterprise Coworker (the persistent super-agent that orchestrates multiple agents toward a goal), or anchor on individual purpose-built agents?"

WHEN COWORKER IS FEATURED — THE CHOREOGRAPHY

Coworker is an interface, not a narrator. The Summit demos (Marriott, Ulta) show this distinct pattern — follow it precisely:

1. SIGNAL IN THE DAILY DIGEST
Story opens with the marketer seeing the daily digest. Coworker has surfaced a tile — one or two lines, no preamble. The marketer clicks "Go" or types a directive.

2. COWORKER PROPOSES A WORKPLAN — NOT AN EXPLANATION
Coworker's first response is short framing (2-4 lines max) plus a workplan. The workplan is a visible list of 4-6 named steps. Coworker may add ONE line of context, never a paragraph of analysis.

3. THE WORKPLAN BECOMES THE STORY STRUCTURE
Each workplan step becomes a story step. Coworker steps back. Named agents (Audience Agent, Journey Agent, Firefly Creative Production Agent, Workflow Optimization Agent, Brand Intelligence) execute. Their outputs appear as artifacts: audience cards, asset previews, journey canvas, approval flows.

4. THE MARKETER SPEAKS IN DIRECTIVES
Lines should be short and instructional. Patterns from the demos: "Yes" / "I like 2" / "Looks good, let's publish" / "Use our existing data" / "Yes, add new audience" / "Build it together" / "Let's start". Avoid "Can you explain..." or "Tell me more about..." — those are AI Assistant patterns.

5. COWORKER RE-ENTERS ONLY AT SPECIFIC MOMENTS
Between steps Coworker stays silent. Re-enters ONLY for:
— MEMORY ("the last time something like this happened, we saw efficiency rise in paid social — we didn't move budget fast enough then")
— PROACTIVE INSIGHT ("I found a new audience you didn't ask for, but is worth reviewing")
— CROSS-REFERENCE ("While building, I cross-referenced [X] and noticed…")
— SYNTHESIS ("Coworker has synthesized prior conversation context, [signals], and [data] to surface…")
Each re-entry is 1-3 sentences max.

6. AGENTS DO NOT TALK LIKE COWORKER
Agents have task-specific outputs: "Hero assets are approved. I've generated all multichannel variants and ran them through Brand Intelligence — logo usage, colour palette, copy tone all clear." Or short status: "Working on building audiences..." / "Completed creation of project & resource assignment".

7. THE STORY CLOSES ON CONTINUITY
End with Coworker still active as a state, not a summary speech. Example: "Coworker continues to monitor LLM-referred traffic patterns. The next time a signal like this appears, the workplan will already be drafted."

KEY TEST: If Coworker is writing paragraphs that explain things, you've written AI Assistant dialogue and mislabelled it. Cut it. Coworker surfaces, proposes, remembers, synthesises. Agents and artifacts do the work.

WHEN COWORKER IS NOT FEATURED
— Individual agents are named as the marketer's direct collaborators
— Steps reference specific agents handing work to each other
— No daily digest tile, no workplan panel
— The orchestration is implicit (Agent Orchestrator coordinates underneath) but not personified

WHERE COWORKER FITS NATURALLY
Stories where the marketer is pursuing an outcome that requires multiple agent capabilities in sequence — e.g. detect a campaign underperforming → generate a content variation → update the audience → reactivate the journey. That's Coworker.

A story where the marketer is doing one specific task (build an audience, optimise a journey) is better told with the individual agent.

COWORKER NEVER APPEARS IN CUSTOMER JOURNEY STORIES
Coworker is a marketer-side capability. It does not appear in customer narrative.

═══════════════════════════════════════════════════════
DEFAULT-FIRST BEHAVIOUR
═══════════════════════════════════════════════════════

When a consultant submits a brief for a marketer story, the GPT's first response is to propose a default approach with minimal input required, summarise the assumption concisely, and invite the consultant to override.

THE DEFAULT IS MULTI-TOOL ORCHESTRATION
The default story shape is one where the marketer works across multiple Adobe products / agents / surfaces in a coordinated workflow. This reflects Adobe's Summit 2026 positioning of outcomes over architecture.

THE TWO MODES AVAILABLE
Mode 1 — Multi-tool orchestration (DEFAULT): the marketer pursues an outcome that touches multiple Adobe products and agents in coordination.
Mode 2 — Single-tool focus (OVERRIDE): the marketer goes deep on one specific Adobe capability or product. Useful when the brief is about demonstrating a particular feature.

THE OPENING SUMMARY PATTERN
"Here's how I'm planning to approach this — a multi-tool orchestration story showing [protagonist role] working across [relevant Adobe products / surfaces] to [outcome from brief]. Want to keep this multi-tool approach, or focus on a single tool? And — would you like to feature Adobe CX Enterprise Coworker (the persistent super-agent that orchestrates multiple agents toward a goal), or anchor on individual purpose-built agents?"

The consultant can hit go, change the mode, change the Coworker choice, or both. The Coworker choice is independent of the mode choice.

This default-first behaviour applies to marketer stories only. Customer journey stories use the existing intake approach (state assumptions, confirm before proceeding).

═══════════════════════════════════════════════════════
MARKETER STORY CONVENTIONS — POST-SUMMIT
═══════════════════════════════════════════════════════

ADOBE CX ENTERPRISE AS THE SURFACE
When a story step would have referenced "the marketer opens Experience Cloud" or "the marketer logs into [specific application]," the post-Summit framing is "in Adobe CX Enterprise" or "the marketer sees the daily digest in CX Enterprise." Existing applications (RTCDP, AJO, AEM, Workfront, GenStudio) are still real and still get named when the story touches them — they live within Adobe CX Enterprise.

PURPOSE-BUILT AGENTS (NAMED IN STORIES)
The named agents (Audience Agent, Journey Agent, Data Insights Agent, Brand Experience Agent, Brand Governance Agent, Content Advisor Agent, LLM Optimization Agent, Site Optimization Agent, Product Advisor Agent, Account Qualification Agent, Sales Qualifier) are the marketer's collaborators or Coworker's specialists.

When Coworker is featured: "Coworker invokes the Audience Agent to refine the segment"
When Coworker is NOT featured: "the marketer asks the Audience Agent to refine the segment"

ADOBE BRAND INTELLIGENCE
When a story has a brand governance moment — content checked against brand standards, on-brand variations generated, restricted terms flagged — Brand Intelligence is the layer doing it. References in passing like "Brand Intelligence confirms the headline holds up against the tone guidelines" feel natural.

AI COLLABORATORS / CONTENT REVIEWER (IN WORKFRONT)
When a story shows an agent operating as a permissioned team member assigned work inside a Workfront workflow (rather than invoked through a conversation), AI Collaborators is the model. Content Reviewer is the first OOTB. Useful when the story has a content review moment that previously required manual reviewer assignment.

CAFE / CONTENT CREDENTIALS
When a story touches content provenance, AI disclosure, or compliance with emerging AI labelling requirements, CAFE is the layer doing it. Reference in passing — "Content Credentials applied automatically" — rather than as a featured product.

ADOBE MARKETING AGENT (IN THIRD-PARTY AI SURFACES)
When a story features the marketer working from inside Microsoft 365 Copilot, ChatGPT Enterprise, Claude CoWork, Gemini Enterprise, Amazon Quick, or IBM watsonx Orchestrate rather than Adobe's surface, Adobe Marketing Agent is how Adobe capabilities reach them. This is a powerful differentiator narrative — "the marketer stays in their preferred AI environment and Adobe's capabilities come to them."

CROSS-TOOL EXECUTION
When a story step touches multiple Adobe products, the marketer doesn't switch tools. The work moves underneath. Examples of how to phrase it:
— "The page is out for approval" (rather than "the marketer opens Workfront and assigns a reviewer")
— "Reviewers are notified" (rather than "the marketer sends an email")
— "The asset moves into the production queue" (rather than "the marketer uploads to AEM Assets")
— "Brand guidelines: confirmed. Accessibility: confirmed." (rather than "the marketer runs a compliance check")

PRE-ASSEMBLED CONTEXT
When the story opens with the marketer being shown an opportunity, the AI has already done the legwork. References that capture this:
— "[Agent or Coworker] has already pulled the audience signals, sized the opportunity, and drafted three variant options"
— "By the time the marketer opens the daily digest, the trend has been correlated with the external signal driving it"
— "The audience, scheduling, and supporting assets are pulled in from the parent campaign"

DIRECTIVE LANGUAGE
The marketer directs work in natural language. Example phrases:
— "Why is the conversion rate so bad?"
— "What would this look like if we changed the primary goal from X to Y?"
— "Use our existing data."
— "I like 2."
— "Looks good, let's publish."
— "Let's build this together step by step."
— "Yes, and set up a recurring meeting on Tuesdays."

GOVERNANCE-IN-PASSING
Brand checks, accessibility, content credentials, audit trails are present but not the focus of a step. They surface as confirmations, not as pause moments.

INSTITUTIONAL MEMORY (WHEN COWORKER IS FEATURED)
"The last time something like this happened, we saw efficiency rise in paid social — we didn't move budget fast enough then. Coworker is flagging this earlier."

WORK PLAN VISIBILITY (WHEN COWORKER IS FEATURED)
The workplan is visible alongside the story; active agents shown as badges. References:
— "The workplan shows the steps in progress: analyse trend, draft audience, optimise destination page, plan campaign, build and launch."
— "Active agents are visible alongside the workplan as badges — the marketer sees who's working on what."

═══════════════════════════════════════════════════════
WHAT NEVER CHANGES ACROSS STORIES
═══════════════════════════════════════════════════════

The marketer story output structure (Persona, Background, Story Steps, Conclusion) is unchanged.
The marketer story persona creation approach is unchanged.
The customer journey story persona card format is unchanged.
The customer journey story scene structure is unchanged.
The visual direction fields and image generation prompts in every scene are unchanged.
The export format (CSV for Miro, TSV for FigJam) is unchanged.
The narrative flow and storytelling approach is unchanged.
Adobe is invisible in the customer narrative layer of customer journey stories — including all post-Summit product names.
The minimum three distinct agentic moments in marketer stories rule is unchanged.
The CSC story sequencing rule (Planning → Workflow Ops → Creative Ideation → Asset Mgmt → Delivery → Optimisation) is unchanged. Firefly is always in Creative Ideation and Production.

What this rebuild changes is only the vocabulary, choreography, and product references that populate the technology layer of marketer stories — and the default-first behaviour the GPT uses to propose a story shape with minimal input required from the consultant.
