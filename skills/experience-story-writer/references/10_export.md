STORY EXPORT FORMAT
Last updated: April 2026 (Summit 2026 update)
Retrieve this file when a user requests an export of a completed story.
Applies to Customer Journey Stories and Marketer Stories only.
═══════════════════════════════════════════════════════

SUMMIT 2026 NOTE: The export format is unchanged. The transposed layout, the column structure, the row structure, the visual direction requirements, and the colour coding all remain as specified below. What changes post-Summit is only the content that populates the Adobe Product field in marketer story exports — references now use Adobe CX Enterprise as the surface, with specific applications (RTCDP, AJO, AEM, Workfront, GenStudio) named within it. New product references that may appear: Adobe Brand Intelligence, AI Collaborators / Content Reviewer in Workfront, Adobe CX Enterprise Coworker, Marketing Campaign Analytics, LLM Insights, GenStudio Content Marketing Insights, NVIDIA 3D Digital Twins.

WHEN AN EXPORT IS REQUESTED — PRODUCE IN FULL, NO CONFIRMATION NEEDED
═══════════════════════════════════════════════════════

When the user asks for an export, a download, "the files", "the CSV", "the TSV", "the storyboard files", or any equivalent phrase — produce both files in full, in the same response, immediately. Do NOT ask for confirmation, do NOT ask which level of detail they want, do NOT offer a "summary version" or "preview", do NOT split across multiple responses.

The full export is the ONLY export. There is no short version. There is no preview version. Every row, every column, every visual direction field, every image generation prompt — all populated, all in one response.

If a story has been completed in this session and the user requests an export, the GPT has everything it needs. Generate both files now.

After completing any Customer Journey Story or Marketer Story, the GPT may inform the user that exports are available with a single short line: "Files for Miro and FigJam are ready when you want them — just say 'export'." But do NOT ask if they want them, do NOT pose questions about format, level of detail, or fields. Wait for the request, then produce both files in full immediately.

═══════════════════════════════════════════════════════
TWO FILES — ALWAYS GENERATE BOTH
═══════════════════════════════════════════════════════

Always generate two files when an export is requested:

FILE 1: [BrandName]_[PersonaName]_miro.csv
For Miro. Import via Insert → Table → Upload CSV. Lands as a structured table on the board. All columns visible, all data readable, fully editable.

FILE 2: [BrandName]_[PersonaName]_figjam.txt
For FigJam. Open file, select all, copy, paste onto FigJam board. Each column becomes a sticky note. All fields visible per scene.

File naming examples:
Tesco_Hannah_miro.csv
Tesco_Hannah_figjam.txt
Nationwide_Priya_miro.csv
Nationwide_Priya_figjam.txt

═══════════════════════════════════════════════════════
TRANSPOSED LAYOUT — CRITICAL
═══════════════════════════════════════════════════════

Both files use a TRANSPOSED layout:
— COLUMNS = scenes (Persona, Background, Step 1, Step 2... Conclusion)
— ROWS = fields (Title, Channel, Intent, Action, Narrative, Visual Direction fields etc.)

This means the reader scans LEFT TO RIGHT across the story arc, and TOP TO BOTTOM through the detail of each scene. This is how a storyboard reads — scene by scene, not field by field.

NEVER use a row-per-scene layout. Scenes are always columns.

═══════════════════════════════════════════════════════
COLUMN STRUCTURE — MANDATORY
═══════════════════════════════════════════════════════

Every export must have these columns in this exact order:

Column 1: Field
— The row label. This is the leftmost column.
— Lists every field name top to bottom.
— Never leave this blank in any row.

Column 2: Persona
— The persona card.
— Contains character overview, life situation, goal, segments, risk signal, visual guidance.

Column 3: Background
— The opening context card.
— Contains scenario, motivation, channel, key message, visual direction for the opening scene.

Columns 4 onwards: Step 1, Step 2, Step 3... (one column per scene)
— Named exactly as they appear in the story: "Step 1 — [Step Title]"
— In chronological order, never rearranged.

Final column: Conclusion
— The resolution card.
— Contains outcome, emotional payoff, brand role, final visual direction.

═══════════════════════════════════════════════════════
ROW STRUCTURE — MANDATORY
═══════════════════════════════════════════════════════

Every export must have these rows in this exact order.
Every row must be populated for every column where the field applies.
Never leave a field blank unless it genuinely does not apply to that scene.

STORY FIELDS:
Row 1: Field (this is the label column — contains the field names)
Row 2: Step Title
Row 3: Time Marker
Row 4: Who
Row 5: Channel
Row 6: Intent
Row 7: Action
Row 8: Narrative

VISUAL DIRECTION FIELDS (mandatory — never omit):
Row 9: Environment
Row 10: Device / Format
Row 11: What Is Shown On Screen
Row 12: Primary Focus
Row 13: Action On Screen
Row 14: Mood / Tone
Row 15: Key Highlight
Row 16: Image Generation Prompt

DATA / ORCHESTRATION FIELDS:
Row 17: Adobe Product (marketer stories) / Profile Events (customer journey stories)
Row 18: Agent / AI Moment (marketer stories) / Segments Added (customer journey stories)
Row 19: Business Value (marketer stories only)

═══════════════════════════════════════════════════════
VISUAL DIRECTION — MANDATORY IN EVERY SCENE
═══════════════════════════════════════════════════════

The visual direction fields are the most important part of the export for designers.
Every single one must be populated for every scene column.
Never summarise, abbreviate, or drop any visual direction field.
Copy the full content from the storyboard output exactly — do not paraphrase.

Fields that must never be empty in any scene column:
— What Is Shown On Screen: full description of the screen state
— Primary Focus: what the viewer's eye goes to first
— Action On Screen: what is moving, being tapped, or transitioning — specific and filmable
— Mood / Tone: the emotional quality of this scene
— Key Highlight: the single most important visual moment — the thing a designer must get right
— Image Generation Prompt: full ready-to-use prompt including subject, setting, mood, lighting, composition, aspect ratio, and negative prompts

If a storyboard was not produced before the export is requested, generate the visual direction fields as part of the export process — do not leave them empty. Retrieve 07_storyboard.md for the visual direction rules.

═══════════════════════════════════════════════════════
COLOUR CODING — MIRO CSV ONLY
═══════════════════════════════════════════════════════

The Miro CSV includes a Colour row (Row 20). This maps to Miro's card colour on import.
Use this mapping based on the primary channel of each scene:

In-app → Green
Email → Blue
Push notification → Yellow
SMS / WhatsApp → Orange
In-store / Physical → Purple
Web / Desktop → Teal
All channels / Multi-channel → Grey
Persona → Grey
Background → Grey
Conclusion → Grey

The Colour row is not included in the FigJam TSV.

═══════════════════════════════════════════════════════
STORY TYPE VARIATIONS
═══════════════════════════════════════════════════════

CUSTOMER JOURNEY STORIES
— Rows 17–18 contain: Profile Events and Segments Added
— Row 19 (Business Value) is omitted
— No Adobe product names appear anywhere in the export
— Visual direction describes the customer-facing experience only — never Adobe product UI

MARKETER STORIES
— Rows 17–19 contain: Adobe Product, Agent / AI Moment, Business Value
— Adobe products are named explicitly in every scene column where they appear
— Visual direction for Adobe product scenes describes the specific screen state, screen layout, data visible, and the marketer action
— Include the layer for every product: e.g. "Adobe Journey Optimizer (Application — runs on AEP)"

═══════════════════════════════════════════════════════
RULES — STRICT
═══════════════════════════════════════════════════════

— Always generate both files — CSV and TSV — never just one
— Always produce the export IN FULL in a single response — no snippets, no previews, no "let me know if you want more", no "I can expand any of these if needed"
— Never truncate, abbreviate, or summarise any field to save tokens
— Never ask the user to confirm fields, format, level of detail, or any other parameter before generating — the format is fixed, just produce it
— Never break the export across multiple responses — all rows, all columns, all scenes, all visual direction, all image generation prompts in ONE response
— Always use the transposed layout — columns are scenes, rows are fields
— Always include all visual direction rows — never omit any
— Never leave Image Generation Prompt blank for any scene
— Never summarise or abbreviate the storyboard visual direction content
— Copy exact text from the story and storyboard — never rewrite or paraphrase
— All copy shown on screen must be exact words — never placeholders like [message text]
— All data in Adobe product screens must exactly match the story — never invent numbers
— Scene columns must be in chronological order — never rearrange
— File names must follow the naming convention: [BrandName]_[PersonaName]_miro.csv and [BrandName]_[PersonaName]_figjam.txt
— The Colour row appears only in the Miro CSV, never in the FigJam TSV

ANTI-PATTERN — DO NOT DO THIS:
— Producing only the first 2-3 scenes and asking "want me to continue with the rest?"
— Producing a "structure preview" with row labels but no scene content
— Producing one file (CSV or TSV) and asking if the user wants the other
— Listing the fields without populating them
— Asking "would you like a more detailed version?" — there is only one version, the full one
— Splitting the export into "core fields" and "extended fields" — there is no such split, every field is mandatory

═══════════════════════════════════════════════════════
HOW TO IMPORT
═══════════════════════════════════════════════════════

MIRO:
1. Open your Miro board
2. Click the + button (or press I)
3. Select Table
4. Choose Upload CSV
5. Select the [BrandName]_[PersonaName]_miro.csv file
6. The story lands as a structured table — all scenes as columns, all fields as rows
7. Use Miro's table tools to colour-code columns by channel using the Colour row values

FIGJAM:
1. Open the [BrandName]_[PersonaName]_figjam.txt file
2. Select all (Cmd+A / Ctrl+A)
3. Copy (Cmd+C / Ctrl+C)
4. Open your FigJam board
5. Paste (Cmd+V / Ctrl+V)
6. FigJam creates one sticky note per column
7. Arrange sticky notes in a horizontal row to recreate the storyboard layout
