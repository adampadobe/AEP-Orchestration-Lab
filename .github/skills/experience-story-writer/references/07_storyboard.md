STORYBOARD OUTPUT FORMAT
Last updated: April 2026 (Summit 2026 update)
Design brief format for customer journey stories and marketer stories. Every field must be specific enough for a designer to work from without asking clarifying questions.
═══════════════════════════════════════════════════════

SUMMIT 2026 NOTE: The storyboard structure is unchanged. The four mandatory sections (Persona, Background, Story Steps, Conclusion) and all visual direction fields stay exactly as specified below. What changes post-Summit is only the vocabulary used inside marketer story step references — the Adobe product UI visible in marketer scenes now references Adobe CX Enterprise as the surface, with named applications (RTCDP, AJO, AEM, Workfront, GenStudio, Brand Concierge) appearing within it. New product references to use when relevant: Adobe Brand Intelligence, AI Collaborators / Content Reviewer in Workfront, Adobe CX Enterprise Coworker (when consultant has opted in). See 06_products.md and summit_demos.md for vocabulary.

WHEN TO PRODUCE A STORYBOARD
— When the user explicitly requests it, or selects option (C) from the derivative
  outputs menu
— The storyboard always follows the story — it translates narrative into visual brief
— Note: the storyboard is one of the derivative output options. The animated HTML
  experience option now defers to the experience-story-builder plugin (which consumes
  the storyboard); the 1-pager summary produces a structured content pack, not a
  storyboard. See DERIVATIVE OUTPUTS in SKILL.md.

═══════════════════════════════════════════════════════
STORYBOARD STRUCTURE
═══════════════════════════════════════════════════════

Every storyboard contains four mandatory sections:
1. PERSONA — setting the scene
2. BACKGROUND — context and scene setting
3. STORY STEPS — one step card per scene
4. CONCLUSION — resolution

═══════════════════════════════════════════════════════
SECTION 1 — PERSONA (SETTING THE SCENE)
═══════════════════════════════════════════════════════

WHO:
[Name, role, household or work context]

DESCRIPTION:
[Lifestyle, behaviours, and brand relationship in 3–4 sentences. How do they interact with this brand? What does a typical week look like?]

NEEDS & CONSTRAINTS:
[Specific dietary, time, financial, emotional, or regulatory needs relevant to this story]

VISUAL GUIDANCE:

  Environment:
  [Physical world description — apartment style, neighbourhood, workspace, commute. Enough detail for a set designer or image prompt. Not aspirational — real and lived-in.]

  Appearance & Styling:
  [Age range, build, style, day-to-day dress. Description of a real person, not a stock photo. Include heritage, build, typical clothing.]

  Tone & Atmosphere:
  [Emotional register of this person's world. e.g. "Busy but optimistic. Warm and domestic, not glossy."]

═══════════════════════════════════════════════════════
SECTION 2 — BACKGROUND (CONTEXT / SCENE SETTING)
═══════════════════════════════════════════════════════

WHO:
[Persona name]

SCENARIO:
[What is happening right now — the specific moment this story begins. One concrete situation.]

MOTIVATION:
[Why are they engaging right now? What triggered this moment? What do they want to achieve?]

CHANNEL:
[First touchpoint — be specific. e.g. "Tesco mobile app — home screen"]

KEY MESSAGE:
[What the brand is communicating at this moment — the core idea the customer should feel]

VISUAL DIRECTION:

  Environment:
  [Physical setting for this opening scene]

  Time of Day:
  [Specific time, light quality]

  Device / Platform Visible:
  [What screen is visible, how it is held or viewed, what is on screen]

  Mood:
  [Emotional quality of this opening scene]

═══════════════════════════════════════════════════════
SECTION 3 — STORY STEPS (JOURNEY)
═══════════════════════════════════════════════════════

Produce one step block per scene. Never skip or combine steps.
Every step MUST follow this exact format:

────────────────────────────────────────
STEP [NUMBER]: [STEP TITLE]
────────────────────────────────────────

WHO:
[Persona name]

INTENT (MESSAGE):
[What the persona wants or is thinking at this exact moment — written in their internal voice. Not a brand message. e.g. "I just need to know what I can make with what I've already got."]

ACTION (WHAT):
[What they are physically doing — one specific, filmable action. e.g. "Hannah taps the shopping assistant icon and types: 'I have courgette, chickpeas, and eggs — what can I make for dinner this week?'"]

CHANNEL / TOUCHPOINT:
[Where this happens — specific. e.g. "Tesco mobile app — AI shopping assistant chat interface"]

VISUAL DIRECTION:

  What Is Shown On Screen:
  [Full description of the screen state — UI elements visible, content displayed, layout. e.g. "Chat interface. Hannah's typed message in a right-aligned bubble. Below it, a typing indicator appears briefly, then three recipe cards — each showing dish name, prep time, and a small food image."]

  Primary Focus:
  [What the viewer's eye goes to first]

  Action On Screen:
  [What is moving, being typed, tapped, or transitioning — specific and filmable]

  UI / Product Visibility:
  [FOR CUSTOMER SCENES: "Brand app UI visible. No Adobe product shown."
   FOR MARKETER/PRODUCT SCENES: "Adobe [Product] within Adobe CX Enterprise — [screen state description]. Adobe CX Enterprise navigation visible. [Specific application name] in focus."]

  Mood / Tone:
  [Emotional quality of this scene]

  Key Highlight:
  [The single most important visual or interaction moment in this step — the thing a designer must get right]

════════════════════════════════════════

STEP RULES:
— Every step must have all Visual Direction fields completed — no exceptions
— Copy shown on screen must be exact words — never write "[message text]" or "[notification copy]"
— Data in Adobe product screens must exactly match the story — never invent numbers
— Persona behaviour, appearance, and environment must stay consistent across all steps
— Adobe product UI never appears in customer journey story steps — only in marketer story steps
— Mood must shift naturally across steps — not every scene has the same emotional register
— The Key Highlight field is the art direction note — treat it as the single thing a designer cannot get wrong

═══════════════════════════════════════════════════════
SECTION 4 — CONCLUSION (RESOLUTION)
═══════════════════════════════════════════════════════

OUTCOME:
[What was concretely achieved — specific and measurable where possible]

EMOTIONAL PAYOFF:
[How the persona feels at the end — one honest sentence]

BRAND ROLE:
[How the brand made this possible — the role it played in this person's life, not a product list]

VISUAL DIRECTION:

  What Is Shown:
  [The final image of the story — what does the viewer see last?]

  Primary Focus:
  [Where the viewer's eye goes]

  Action:
  [What is happening in this final moment — one specific, filmable action]

  Mood:
  [Emotional quality of the closing image]

  Key Highlight:
  [The visual that should linger — the closing image that ties the story together]

═══════════════════════════════════════════════════════
STORYBOARD CLOSING BLOCK
═══════════════════════════════════════════════════════

DESIGN NOTES FOR THE TEAM

Recurring visual elements:
[List UI components, icons, brand elements, or data panels that appear in multiple steps and should be built as reusable Figma components. e.g. "Real-time profile panel — appears in steps 2, 4, 6, 8. Build as a component with variable data slots."]

Steps requiring custom asset generation:
[List steps where stock photography is insufficient and Firefly or Midjourney generation is recommended]

Steps requiring real product screenshots:
[List steps where an actual Adobe product screenshot should be used rather than a designed mock. Note which product and which screen state.]

Suggested Figma frame structure:
[e.g. "One frame per step card. Group Panel A and Panel B within each frame. Use auto-layout. Label frames with step number and heading."]

Image generation prompt style guide:
[The consistent style reference to use across ALL image prompts in this storyboard to ensure visual consistency. e.g. "All lifestyle photography: candid, natural light, shallow depth of field, warm neutral tones, no text, no logos, no stock photo feel, real environments. Aspect ratio 9:16 for mobile scenes, 16:9 for desktop scenes."]

═══════════════════════════════════════════════════════
STORYBOARD RULES (STRICT)
═══════════════════════════════════════════════════════

— Always include Visual Direction in every step — no exceptions
— Every action must be filmable — if you cannot picture someone doing it, rewrite it
— Copy on screen must be exact text — never use placeholders
— Data in Adobe product screens must exactly match the story — never invent numbers
— Persona behaviour, appearance, and environment must stay consistent throughout
— Adobe product UI is never shown in customer journey story steps
— Mood and tone must shift naturally across steps
— The Key Highlight field is the most important art direction note in each step
— Never use abstract language — "user engages with content" is not acceptable; "Hannah taps the notification and the recipe loads in under a second" is
— Every image generation prompt must include: subject, setting, mood, lighting, composition, aspect ratio, negative prompts

═══════════════════════════════════════════════════════
IMAGE GENERATION PROMPT FORMAT
═══════════════════════════════════════════════════════

Every step's Visual Direction block must include a ready-to-use image generation prompt. Use this format:

"[Photography style], [subject description with age/appearance], [setting and environment], [time of day and lighting], [mood and emotional quality], [composition notes], [aspect ratio], [negative prompts]"

Example:
"Candid lifestyle photograph, woman late 20s South Asian heritage in casual activewear, small bright London kitchen morning light through window, natural golden morning light, warm and relaxed not posed, phone in hand at waist height screen partially visible, shallow depth of field, 9:16 vertical, no text no logos no heavy makeup not staged not stock photo"


═══════════════════════════════════════════════════════
EXPORT TO FIGMA OR MIRO
═══════════════════════════════════════════════════════

After completing a storyboard, always offer an export:

"Would you like me to export this as a markdown file for Figma or Miro? It includes the full storyboard — persona, all scene cards with visual direction, conclusion, and design notes — in one clearly sectioned document."

When the user confirms, retrieve 10_export.md for the full export specification, column and row structure, colour coding, and Miro/FigJam import instructions.
