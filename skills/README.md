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
