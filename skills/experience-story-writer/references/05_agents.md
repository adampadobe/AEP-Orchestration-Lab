ADOBE AI AGENT TAXONOMY
Last updated: May 2026 (tracker sync + availability markers added)
For use in story and storyboard generation — always reference agents with their product location.
═══════════════════════════════════════════════════════

RULE: Agents are an overlay across the solution stack. Never present as standalone products without naming the product they live in.

AVAILABILITY KEY
GA — Generally available now
Explorer Program — In controlled early access; not broadly GA
Coming soon — On the roadmap with a confirmed target window
Roadmap — Confirmed direction, no committed date

SUMMIT 2026 NOTE: This taxonomy has been updated to reflect Summit 2026 announcements. New entries: Adobe CX Enterprise Coworker (the persistent super-agent that orchestrates other agents), AI Collaborators (a new way agents show up inside Workfront), Brand Experience Agent (replaces/extends "Experience Production Agent"), Brand Governance Agent (replaces/extends "Governance Agent"), Content Advisor Agent (replaces/extends "Discovery Agent"), Knowledge and Support Agent. Existing agents have been refreshed where Summit announced new skills or expanded capabilities. The Adobe Marketing Agent has been expanded — it now spans M365 Copilot (GA), ChatGPT Enterprise, Claude CoWork, Gemini Enterprise, Amazon Quick, IBM watsonx Orchestrate (Q2 2026 beta).

═══════════════════════════════════════════════════════
ADOBE CX ENTERPRISE COWORKER (NEW AT SUMMIT 2026)
═══════════════════════════════════════════════════════

Adobe CX Enterprise Coworker
Product location: Adobe CX Enterprise (the unified surface), powered by an evolved Agent Orchestrator
Availability: Coming soon — GA H2 2026
Role: A persistent, goal-oriented super-agent that orchestrates multiple purpose-built agents toward a business outcome. Has memory, can be invoked manually, triggered by a signal, or run on a schedule. Self-corrects when something fails. Accumulates knowledge over time. Has a defined scope of expertise, enterprise permissions, and guardrails.

How Coworker differs from individual agents: Agents (Audience, Journey, Data Insights, etc.) handle specific tasks. Coworker sits above them and coordinates end-to-end workflows — takes a goal, decomposes it into a multi-step plan, invokes agents in the right sequence, course-corrects between steps.

How Coworker differs from AI Assistant: AI Assistant is conversational. Coworker reasons through complex tasks, runs autonomously on triggers/schedules, accumulates memory across sessions.

Autonomy levels: fully autonomous, semi-autonomous, human-in-the-loop. Customer configures the permissions, guardrails, and scope of expertise.

Goal categories Coworker can pursue: operational (system health, anomaly detection), engagement (1:1 personalisation, timing/channel optimisation), environmental (team productivity, brief-to-activation speed), corporate (brand integrity, compliance, governance).

USAGE IN MARKETER STORIES
Always ask the consultant before featuring Coworker. Default is to feature Coworker; the consultant can opt out and anchor on individual purpose-built agents instead.

When Coworker IS featured, follow the demo choreography (full detail in 08 and summit_2026_themes_and_enablers):
1. SIGNAL — story opens with daily digest tile (1-2 lines, no preamble)
2. PROPOSE — Coworker returns short framing (2-4 lines max) plus a workplan of 4-6 named steps
3. EXECUTE — Coworker steps back; named agents do the work; artifacts appear (audience cards, asset previews, journey canvas)
4. DIRECTIVES — marketer speaks in short directives ("Yes" / "I like 2" / "Looks good, let's publish")
5. RE-ENTER — Coworker only re-enters for memory, proactive insight, cross-reference, or final synthesis (1-3 sentences each)
6. CLOSE — story ends with Coworker still active as a state, not a summary speech

KEY RULE: Coworker does not narrate, explain, or commentate. If you find yourself writing paragraphs from Coworker explaining concepts, that is AI Assistant dialogue mislabelled — cut it. Coworker surfaces, proposes, remembers, synthesises. Agents and artifacts do the work.

When Coworker is NOT featured: individual agents are referenced as the marketer's direct collaborators; Agent Orchestrator coordinates underneath but is not personified as a super-agent; no daily digest tile, no workplan panel.

═══════════════════════════════════════════════════════
CROSS-SURFACE AGENTS
═══════════════════════════════════════════════════════

AI Assistant
Product location: Adobe CX Enterprise (the unified surface), AEP, Real-Time CDP, AJO, CJA, AEM, Workfront
Availability: GA — core conversational layer; Summit 2026 capability updates rolling out H1–H2 2026
Role: Unified conversational interface that routes to the right underlying agent based on which product the user is working in. Answers natural language questions, returns specific insights with numbers, builds audiences, navigates users to the right place. Does not consume AI credits for how-to and navigation questions.

Summit 2026 capability updates:
— Hybrid UI: bi-directional communication between AI Assistant and product UI. AI Assistant understands the user's context and can take action in product UI on the user's behalf.
— File upload: users can upload files directly into AI Assistant to ground conversations, analysis, and agent actions in real data.
— Proactive automations: users can initiate agent-led plans and automations, shifting from reactive help to goal-driven execution.
— Seamless modality transitions: users can move fluidly between immersive cross-product AI Assistant experience and in-product UI — AI Assistant operates as a product companion.

Agent Orchestrator
Product location: Adobe Experience Platform (platform layer)
Availability: GA — Goal-Based Plans and Execution GA at Summit 2026; Agent Composer coming soon H2 2026
Role: Planning and coordination layer that chains multiple agents together to complete multi-step jobs across the Experience Cloud / Adobe CX Enterprise ecosystem. Operates with a human in the loop for approvals at key moments. Powers the Marketing Agent in third-party AI surfaces and underlies Adobe CX Enterprise Coworker.

Summit 2026 capability updates:
— Goal-Based Plans and Execution (GA at Summit): detects intent from prompts, devises end-to-end workflow plans, and invokes agents in the right order to execute.
— Agent Composer (H2 2026): design-time/configuration interface for practitioners and developers to configure agent behaviour via business context, customise skills and agents, and build multi-step orchestration workflows.
— Skills catalog: customers and partners can customise how skills are performed to match enterprise-specific business processes. Skills are editable, structured, human-readable.
— Open extensibility: built on MCP (Model Context Protocol) and A2A (Agent-to-Agent Protocol) — open standards that let any compliant AI harness call Adobe's capabilities and vice versa.

═══════════════════════════════════════════════════════
AUDIENCE AND JOURNEY AGENTS
═══════════════════════════════════════════════════════

Audience Agent (B2C)
Product location: Real-Time CDP + Adobe Journey Optimizer
Availability: GA — core audience management, size monitoring, duplicate detection; Audience Creation Explorer Program; goals-based/intent generation coming soon H2 2026; Activation Agent coming soon H2 2026
Role: Conversational audience discovery, creation, and optimisation on B2C customer profiles. Build, refine, and activate audiences through natural language. Shows estimated audience size updating in real time as rules are added.

Summit 2026 expanded skills:
— Goals-based and intent-based audience generation (H2 2026): describe an outcome rather than defining specific attributes and rules. Intent-based generation uses behavioural signals to identify audiences based on what customers appear to want, not just who they are.
— Embedded intelligence in Audience Builder UI (H1 2026): natural language field discovery, AI-powered recommendations, audiences from saved definitions.
— Automated audience operations: proactive alerting on audience size changes; automatic un-mapping of audiences from destinations when no longer needed; duplicate audience detection across teams.
— Roadmap: building ML propensity models on behalf of marketers, scoring profiles based on campaign-specific goals.
— Activation Agent (H2 2026): companion agent for streamlined activation across destinations.

Audience Agent (B2B)
Product location: AJO B2B Edition, Real-Time CDP B2B
Availability: GA — audience management, buying group creation, buying group ideation; Audience Creation Explorer Program
Role: Audience management and segmentation for B2B accounts, opportunities, and buying groups. Same Summit skill expansions as B2C apply, plus:
— Buying group creation (GA): Recommends and creates buying groups based on account context, product signals, and persona inference. Addresses the gap between knowing an account has intent and knowing which people to engage.
— Buying group ideation (GA): Infers personas based on product intent, assesses account-level intent, and ranks persona intent. Surfaces which accounts are showing intent and who within them is most active — so teams can prioritise outreach before coverage gaps stall the deal.

Journey Agent (B2C)
Product location: Adobe Journey Optimizer
Availability: GA — journey analysis, channel content creation; Journey creation Explorer Program; simulation coming soon H1 2026
Role: Designs, analyses, and optimises B2C customer journeys. Identifies drop-off points, suggests improvements, recommends send times and channel splits, adjusts journeys based on behavioural signals.

Summit 2026 expanded skills:
— Creation skills for multi-step journeys, action campaigns, and decisioning objects. (Explorer Program)
— Simulation: test journeys with AI-generated users before going live. (Coming soon H1 2026)
— Analysis skills: fallout detection, conflict detection, anomaly detection. (GA)
— Channel content creation (GA): Generate, edit, and manage channel-specific content (email, push, SMS) for journeys using AI-powered content generation. Solves the content production bottleneck inside journey orchestration — practitioners can add, update, and template channel content without leaving the journey canvas.

Journey Agent (B2B)
Product location: AJO B2B Edition
Availability: GA — Journey Ideation, Journey analysis; Journey creation Explorer Program
Role: Audience-based and account-based journey orchestration for B2B marketing. Same Summit skill expansions as B2C apply, plus:
— Journey Ideation (GA): Translates marketing briefs into journey variations using text prompts, drawing on previously created journeys. Designed for B2B teams who need to quickly explore journey designs without rebuilding from scratch — brief in, structured variations out.
— Journey creation (Explorer Program): Generate multi-step B2B journeys from text prompts with events, conditions, and actions.

Engagement Intelligence / AI Decisioning
Product location: Adobe Journey Optimizer
Availability: Coming soon — H1 2026
Role: AI ranking models that arbitrate channels, journey paths, and journeys for more intelligent decisioning. Replaces hand-coded decisioning rules with ranking models that pick the best path per customer based on goals like LTV, retention depth, and product attachment.

Experimentation Agent
Product location: Adobe Target, AJO, CJA, AJO Experimentation Accelerator
Availability: GA — core experimentation; AJO Experimentation Accelerator coming soon H2 2026
Role: Helps design experiments, define success metrics, analyse test results, propose the next hypothesis based on what was learned.

Summit 2026 update:
— AJO Experimentation Accelerator with feature flagging and new experimentation modalities (H2 2026): brings progressive feature rollouts and experimentation to AJO and AEP.

═══════════════════════════════════════════════════════
DATA AND ANALYTICS AGENTS
═══════════════════════════════════════════════════════

Data Insights Agent (V2 at Summit 2026)
Product location: Customer Journey Analytics (CJA), Adobe Content Analytics
Availability: GA — core analysis and visualisation, Data Storytelling skill; MCP connectivity coming soon Q2 2026; root cause analysis roadmap
Role: Conversational data analysis. Auto-builds CJA Workspace projects and visualisations from natural language questions without requiring an analyst to write the query. Surfaces anomalies and interprets performance patterns.

Summit 2026 V2 enhancements:
— Improved accuracy of answers (GA)
— Better summarisation of complex datasets (GA)
— Data Storytelling skill: exports analytics highlights into PowerPoint with native editable visualisations (Q1 2026)
— MCP server connectivity (Q2 2026): Adobe Analytics and CJA available via MCP. Any AI agent or orchestrator can query and act on Adobe analytics data directly without navigating product UI.
— Root cause analysis (roadmap): users understand not just what happened but why.

Data Engineering Agent
Product location: AEP and CJA
Availability: GA
Role: Assists with data quality, ingestion, schema mapping, and validation. Makes the underlying data layer more reliable without specialist intervention.

LLM Insights (NEW AT SUMMIT 2026)
Product location: Adobe CX Analytics
Availability: Coming soon — Q2–Q3 2026
Role: Unified analytics view bringing together data from LLM conversations, owned chat experiences, and brand AI visibility. Lets brands measure AI-driven surfaces (chatbots, LLM apps, AI search) with the same rigour as web and mobile.
Components:
— LLM App SDK (Q1 2026): instrument and measure how consumers interact with brand-built LLM applications.
— LLMO + CJA Integration (Q2 2026): connects LLM Optimizer data with CJA for unified view across AI-driven and traditional discovery channels.
— Conversation Insights (Q3 2026): measures how consumers interact with brand AI chatbots and assistants throughout the customer journey.

═══════════════════════════════════════════════════════
CONTENT AND EXPERIENCE AGENTS
═══════════════════════════════════════════════════════

Brand Experience Agent (RENAMED FROM EXPERIENCE PRODUCTION AGENT AT SUMMIT 2026)
Product location: AEM Sites Cloud Services (Experience Modernisation), AEM Sites (Experience Production), AEM Forms (Form Creation), all cloud-based AEM applications (Development Support)
Availability: GA
Role: Accelerates migration and modernisation of digital experiences by automatically restructuring, enriching, and validating existing sites. Takes on high-volume experience creation and updates. Speeds creation of optimised, on-brand forms. Helps AEM CS developers troubleshoot build-step failures in the Cloud Manager pipeline.

Content Advisor Agent (RENAMED FROM DISCOVERY AGENT AT SUMMIT 2026)
Product location: AEM Assets, Dynamic Media (Cloud Services)
Availability: GA
Role: Prepares and generates channel-ready image variants from source assets using natural language. Handles resizing, smart cropping, format conversion, and image adjustments (sharpen, background colour change, mirror) without requiring specialist tooling or manual handoffs.

Story usage: Feature when the story has a moment where the team needs existing assets prepared for specific channels or partner specs — producing renditions, smart-cropping for multiple formats, transforming file types for digital shelf. The Content Advisor Agent acts on an asset once it has been identified; Brand Governance Agent's content discovery job finds it.

Brand Governance Agent (RENAMED FROM GOVERNANCE AGENT AT SUMMIT 2026)
Product location: AEM Assets, AEM Sites (Brand Policy)
Availability: GA
Role: Two distinct jobs:
— Brand governance: Safeguards brand integrity and compliance with automated brand policy checks, permissions, and DRM intelligence. Enforces access rules, tracks asset rights and expiry dates, manages permissions in real time across AEM.
— Content discovery: Extracts intent from a brief or natural language prompt, identifies key concepts (taxonomy, tags, themes), and runs semantic and taxonomy-based searches across AEM repositories to return 5–10 brand-approved assets. This is the "find me the right asset" job — the upstream step before Content Advisor Agent prepares it for channel use.

Story usage: Feature for brand compliance moments (flagging expired rights, enforcing access rules, checking brand policy before content ships) and for the asset discovery moment — a practitioner describing what they need and the agent returning approved options from the brand library.

Content Optimisation Agent
Product location: AEM Assets and Content Hub
Availability: GA
Role: Generates channel-ready asset variants automatically — smart cropping, renditions, format transformations, Dynamic Media operations.

Adobe Brand Intelligence (NEW AT SUMMIT 2026)
Product location: Adobe CX Enterprise (governance layer across content workflows)
Availability: Coming soon — Q2 2026
Role: The world's first fine-tuned LLM with integrated vision-language capabilities, purpose-built to scale creative production, validation, and performance of enterprise content. Anchored in a dynamic brand ontology that continuously ingests and updates brand data — brand evolves from static snapshot to living, adaptive system. Encodes brand identity (guidelines, tone, design system, visual standards) and enforces it across every piece of content generated by humans or agents. Augments human brand stewardship rather than replacing reviewers — handles high-volume repeatable compliance checks so reviewers focus on judgment calls.
Trained on: brand's own assets, guidelines, historical content; combined with the Brand Context Protocol (BCP) launching with ecosystem partners including Black Forest Labs (Flux).
Story usage: When a marketer story has a brand governance moment — content checked against brand standards, on-brand variations generated, restricted terms flagged — Brand Intelligence is the layer doing it.

═══════════════════════════════════════════════════════
SALES, COMMERCE, AND BRAND VISIBILITY AGENTS
═══════════════════════════════════════════════════════

Product Advisor Agent
Product location: Adobe Brand Concierge (web and app product discovery experiences)
Availability: GA — core recommender; AJO integration coming soon H1 2026; Semantic Profile and Knowledge and Support Agent coming soon Q2–Q3 2026
Role: Conversational recommender that guides customers to the right product or offer. Powers Brand Concierge.

Summit 2026 expansion — Brand Concierge becomes a full-funnel customer engagement surface:
— Adobe Commerce integration: real-time pricing, inventory, promotions; frictionless checkout in conversation. (GA)
— AJO integration (H1 2026): real-time engagement signals from Brand Concierge feed into AJO for personalised journey orchestration.
— Semantic Profile integration (Q3 2026): connects to RTCDP Semantic Profiles so every conversation is informed by rich, real-time customer context.
— Knowledge and Support Agent (Q2 2026): trusted support experiences through Brand Concierge.
— Partner agent interoperability: Brand Concierge can connect to existing CX infrastructure via partner agents (24/7.ai, Algolia, PayPal, ServiceNow, Genesys — TBC).

Knowledge and Support Agent (NEW AT SUMMIT 2026)
Product location: Adobe Brand Concierge
Availability: Coming soon — Q2 2026
Role: Enables brands to deliver accurate, trusted support experiences through Brand Concierge. Brings post-sale and customer service moments into the conversational layer.

Account Qualification Agent
Product location: AEP B2B and sales workflows
Availability: GA
Role: Scores and qualifies B2B accounts and leads based on behavioural and firmographic signals. Surfaces the right accounts for sales to prioritise.

Sales Qualifier
Product location: Marketo Engage and AJO B2B
Availability: Roadmap
Role: AI Business Development for B2B prospect qualification and SDR-augmenting use cases. Referenced as part of the Marketo + AJO B2B roadmap.

═══════════════════════════════════════════════════════
WEB, SEO, AND BRAND VISIBILITY AGENTS
═══════════════════════════════════════════════════════

Site Optimisation Agent
Product location: AEM Sites Optimizer (only used alongside AEM Sites)
Availability: GA — core optimisation; pre-flight recommendations coming soon H1 2026
Role: Detects performance, quality, and SEO issues across AEM Sites pages. Recommends or applies specific fixes — headings, metadata, structured data, Core Web Vitals.

Summit 2026 expansion:
— Pre-flight recommendations (H1 2026): catch and address SEO, accessibility, content, and technical issues in AEM before a page goes live. Fix at authoring time, not after launch.

LLM Optimization Agent
Product location: LLM Optimizer and AEM Sites
Availability: GA — core visibility monitoring; verified business impact coming soon H1 2026
Role: Monitors brand visibility in AI-generated search results. Identifies content gaps. Recommends specific page-level changes to improve citation rates across major LLMs. Shows brand visibility scores against named competitors.

Summit 2026 expansion:
— Verified business impact (H1 2026): turn every optimisation into an end-to-end experiment to identify what actions truly move the needle. Stops guessing whether GEO/LLMO actions worked.

═══════════════════════════════════════════════════════
WORKFLOW AGENTS AND AI COLLABORATORS
═══════════════════════════════════════════════════════

Workflow Optimisation Agent
Product location: Adobe Workfront
Availability: GA
Role: Analyses project workflows, task routing, and approval bottlenecks. Surfaces recommendations to keep campaigns on track and on budget.

AI Collaborators (NEW AT SUMMIT 2026)
Product location: Adobe Workfront
Availability: GA — Content Reviewer; broader AI Collaborator framework (additional Adobe and third-party agents) coming soon H2 2026
Role: A new way for AI agents to show up inside Workfront — not as a conversational assistant but as a permissioned team member that can be assigned work. An AI Collaborator invokes an agent to execute tasks within marketing workflows in Workfront. Operates with defined permissions, leverages project instructions and context, and can be assigned to execute a task, resolve an issue, or perform a review just like a human team member.

Distinction: AI Assistant is a conversational interface for prompts and information retrieval. Agents are purpose-built specialists that handle specific tasks. CX Enterprise Coworker is a persistent super-agent that orchestrates multiple agents toward a business goal. An AI Collaborator is a specific way an agent shows up inside Workfront — as a permissioned participant that can be assigned work within a structured workflow rather than invoked through a conversation.

Content Reviewer (FIRST AI COLLABORATOR — GA AT SUMMIT 2026)
Product location: Adobe Workfront
Availability: GA
Role: First out-of-the-box AI Collaborator. Can be assigned to review content within a Workfront workflow, reducing the manual review burden on creative and marketing teams. Replaces or extends the older "AI Reviewer" capability with a new permissioned-team-member model. Ability to invoke additional Adobe agents and third-party agents as AI Collaborators targeted for H2 2026.

AI Reviewer (LEGACY — SUPERSEDED BY CONTENT REVIEWER)
Product location: Workfront and asset review flows
Availability: GA (legacy — use Content Reviewer for new stories)
Role: Automated content and asset review that checks for compliance with brand standards before human reviewers see it. Use Content Reviewer references in new stories; AI Reviewer remains valid for compatibility with older stories already in production.

═══════════════════════════════════════════════════════
ADOBE MARKETING AGENT (THIRD-PARTY AI SURFACES)
═══════════════════════════════════════════════════════

Adobe Marketing Agent
Product location: Microsoft 365 Copilot (GA), ChatGPT Enterprise (Q2 2026 beta), Claude CoWork (Q2 2026 beta), Gemini Enterprise (Q2 2026 beta), Amazon Quick (Q2 2026 beta), IBM watsonx Orchestrate (Q2 2026 beta) — powered by Agent Orchestrator
Availability: GA on M365 Copilot; other platforms coming soon Q2 2026 beta
Role: The way marketers access Adobe CX Enterprise capabilities from inside third-party AI platforms. Marketers stay in their preferred AI environment; Adobe's capabilities come to them. Brings Adobe's audiences, journeys, content, insights, and operational intelligence into their natural flow of work without context-switching.

Capabilities accessible via Adobe Marketing Agent in M365 Copilot today: Data Insights Agent, Audience Agent, Journey Agent, Operational Insights. Coverage across other platforms confirmed post-Summit.

Architecture: Built on MCP and A2A open protocols. Adobe's capabilities are accessible from any compliant AI harness, not just the named partners. Adobe also publishes MCP servers so Adobe's CX skills are accessible from Claude Code, OpenAI Codex, and other developer-centric AI environments.

Story usage: When a marketer story features the practitioner working from inside their preferred AI environment rather than Adobe's surface, Adobe Marketing Agent is how Adobe capabilities reach them. This is a powerful differentiator narrative — "the marketer stays in their preferred AI environment and Adobe's capabilities come to them."

═══════════════════════════════════════════════════════
USAGE IN STORIES
═══════════════════════════════════════════════════════

In marketer stories:
— Always name the agent AND its product location when it appears
— Show the agent doing something specific — not "AI assisted" but "Journey Agent surfaces a 34% drop-off at the confirmation step and recommends shortening the wait from 3 days to 1 day"
— Include example dialogue or output where the agent is a key moment
— Minimum two agents per marketer story
— Default story shape is multi-tool orchestration: multiple agents and surfaces working together. Always retrieve summit_demos.md for the post-Summit choreography between products and agents.
— Always ask the consultant whether to feature Adobe CX Enterprise Coworker before generating a marketer story. Default is to feature Coworker; consultant can opt out and anchor on individual purpose-built agents.
— When Coworker IS featured: workplan visible, active agents shown as badges, Coworker invokes specific agents in sequence, story closes with Coworker continuing to monitor.
— When Coworker is NOT featured: individual agents are direct collaborators, Agent Orchestrator coordinates underneath but is not personified as a super-agent.

In customer journey stories:
— Agents are never named or visible in the narrative
— Their effects are visible through the customer's experience (personalised push, timely recommendation, relevant offer)
— Agents appear in the Orchestration Layer only
— Adobe CX Enterprise Coworker never appears in customer journey stories
— Adobe Marketing Agent in third-party AI surfaces never appears in customer journey stories
