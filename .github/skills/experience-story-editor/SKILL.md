---
name: experience-story-editor
description: Opens a finished experience-story deck in the Experience Story Editor, a self-contained in-browser tool for hand-editing a built deck (reword copy, swap or nudge images, reposition and resize elements, replay animations) and exporting the result, with no rebuild. Use when the user wants to manually edit, tidy, restyle a single scene, fix a typo, or adjust layout on an already-built deck. Third and final stage of the Experience Design Chain (writer to builder to editor).
---

# Experience Story Editor

The Editor is the third plugin in the Adobe Experience Design Chain. The Writer drafts the
story, the Builder renders the deck, and the Editor lets a person open that finished deck and
adjust it directly, with no rebuild.

It is a single self-contained HTML tool: `tool/experience-story-editor.html`. It runs entirely
in the browser, loads a deck, and edits it in place. It is offline: nothing leaves the browser.

## When to use it
- Fix a typo or reword a line on a built deck.
- Swap, replace, or nudge an image.
- Move or resize an element on a scene.
- Drop in a logo, fetch one for the brand, or recolour the icons and marks on a scene.
- Restyle or tighten one scene without re-running the Builder.

## How to run it
1. Open `tool/experience-story-editor.html` in a browser (via the preview surface, or just open
   the file). It sits next to this SKILL.md.
2. Load the finished deck with **Upload ZIP**, **Upload HTML**, or **Upload Folder** (the folder
   holding its `index.html` and assets).
3. Read it in **Navigate** mode: single-click steps through the story; use Previous / Next for
   slides; **Replay** restarts a screen's animations. Toggle **Slides / Flow** for how it reads.
   The **Screens** panel lists every scene, so you can jump straight to one.
4. Turn on **Edit** mode to change it. Single-click selects any element; **double-click text** to
   retype it (changes save automatically); drag a selection to move it, drag the red dot to
   resize. Use Text +/- and the colour swatches for type, Delete to remove, Undo to step back.
   Use **Icon/Logo** to recolour marks, **Add Logo** to place one, and **Fetch** or
   **Upload logo file** to bring in the customer's own.
5. Export when done: **Export Playable HTML** (single self-contained file) or **Export ZIP**.

## What it does not do
- It does not write new narrative (that is the Writer) or render scenes from a storyboard (that
  is the Builder).
- It does not fetch brand assets or run the gated build pipeline.

## Notes
- Bundled as a plugin so the installer can install it and it appears alongside the Writer and
  Builder in the plugin list, as the third of three.
- The tool is fully self-contained and offline. No network calls.
