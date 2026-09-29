# skills/

These skills were migrated from the Claude Code `experience-design-chain` marketplace
plugin (`OneAdobe/experience-design-chain`) as part of the Codex/Claude → GitHub Copilot
migration. They are wired up here as a project-scoped Copilot plugin via
`.github/plugin/plugin.json`.

The three top-level pipeline stages, previously invoked in Claude Code as slash commands:

- `/experience-story-writer` → `skills/experience-story-writer/`
- `/experience-story-builder` → `skills/experience-story-builder/`
- `/experience-story-editor` → `skills/experience-story-editor/`

`experience-story-builder` bundles supporting helper skills it depends on:
`absorb`, `adobe-brand-fetcher`, `adobe-voice`, `frontend-slides`, and
`vision-experience-builder`.

Content is copied verbatim from the original Adobe-authored plugin sources — treat it as
reference IP, not something to summarize or rewrite.

## Cursor-convention skills also mirrored here

Copilot's documented project-skill discovery paths are `.github/skills/`, `.claude/skills/`,
and `.agents/skills/` — **not** `.cursor/skills/`. So the following existing Cursor project
skills are copied verbatim here (additive only; the `.cursor/skills/` originals are untouched
and remain canonical for Cursor):

- `aep-demo-use-case-assets-v1`
- `aep-lab-profile-mcp-coworker`
- `profile-viewer-lab-demo-strip`
- `sync-with-origin-main`

`aep-lab-profile-mcp` (the Codex-convention skill under `.agents/skills/`) is **not** duplicated
here — Copilot already discovers `.agents/skills/` natively, so it's already Copilot-visible
without copying.
