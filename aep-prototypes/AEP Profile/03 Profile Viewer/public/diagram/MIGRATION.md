# Diagram layout JSON (v8+)

## Version 8

- **`version`**: `8`
- **`scene`**: unified snapshot (parallel to legacy arrays):
  - `scene.nodes[id]` — custom boxes (`kind: 'customBox'`) and future shapes
  - `scene.edges[id]` — user connectors (`kind: 'connector'`)
  - `scene.guides[id]` — Sources dividers (`kind: 'sourceDivider'`)
  - `scene.groups[id]` — reserved for grouping (empty until implemented)

Legacy fields **`nodes`**, **`customBoxes`**, **`userLines`**, **`sourcesDividers`** remain the **source of truth** for `aep-architecture-apps.js` today. They are still applied by `archMasterApply`. The **`scene`** object is populated on save for forward compatibility and normalized on import via `AEPDiagram.model.migrateLayout`.

## Import

- v7 and older JSON: `migrateLayout` deep-clones, builds `scene` from legacy fields, sets `version: 8`.
- v8 without `scene`: rebuilt from legacy fields the same way.

## Tests

Append `?diagramTests=1` to the page URL to run `console.assert` checks in the browser console.

## Phased work (roadmap)

See the implementation plan in the product brief: tidy tools, grouping, orthogonal edges, animation HUD, edit/presentation modes — each phase should extend `scene`, wire `selection` + `undo`, and keep `migrateLayout` backward-compatible.
