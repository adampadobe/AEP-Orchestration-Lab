#!/usr/bin/env python3
"""Infer optional `tags` on architecture-logos.json entries (Phase 1 taxonomy).

Run from repo root: python3 scripts/tag-architecture-logos.py
Writes web/profile-viewer/data/architecture-logos.json
"""

from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
JSON_PATH = REPO / "web/profile-viewer/data/architecture-logos.json"

CORE_ADOBE_FILES = frozenset(
    {
        "images/adobe-experience-platform-logo-tags.png",
        "images/adobe-logo-spectrum-site.svg",
        "images/adobe-brand-mark.png",
        "images/creative-cloud-app-icon.png",
    }
)

# Creative / design products — not tagged experience-cloud when from Corporate Express.
_EXP_CLOUD_NEG = (
    "photoshop",
    "illustrator",
    "premiere",
    "lightroom",
    "express",
    "firefly",
    "creative cloud",
    "acrobat",
    "substance",
    "fresco",
    "audition",
    "animate",
    "after effects",
    "media encoder",
    "character animator",
    "xd",
    "dreamweaver",
    "incopy",
    "indesign",
    "frame.io",
    "premiere rush",
    "audition",
)

# Digital Experience / Experience Cloud–adjacent products (Corporate Express chart).
_EXP_CLOUD_POS = (
    "experience cloud",
    "experience platform",
    "journey optimizer",
    "customer journey analytics",
    "real-time cdp",
    "marketo",
    "target",
    "campaign manager",
    "audience manager",
    "advertising cloud",
    "experience manager",
    "magento",
    "commerce",
    "workfront",
    "learning manager",
    "event forwarding",
    "tags",
    "genstudio",
    "advertising",
    "analytics",
    "audience hub",
)


def _is_experience_cloud_label(label: str) -> bool:
    lab = (label or "").lower()
    if any(n in lab for n in _EXP_CLOUD_NEG):
        return False
    return any(p in lab for p in _EXP_CLOUD_POS)


def infer_tags(entry: dict) -> list[str]:
    f = entry.get("file") or ""
    lab = entry.get("label") or ""

    if "corporate-express-product-logos" in f:
        tags = ["adobe-catalog"]
        if _is_experience_cloud_label(lab):
            tags.append("experience-cloud")
        return tags

    if f in CORE_ADOBE_FILES:
        tags = ["adobe-core"]
        if "experience platform" in lab.lower():
            tags.append("experience-cloud")
        return tags

    if "cruk-logo" in f:
        return ["partner"]

    if any(
        x in f
        for x in (
            "smock-device",
            "smock-events",
            "smock-data-add",
        )
    ):
        return ["data-collection"]

    if any(
        x in f
        for x in (
            "smock-realtime-customer-profile",
            "smock-image-profile",
            "smock-segmentation",
        )
    ):
        return ["profile-audiences"]

    if "smock-journey" in f:
        return ["journeys"]

    if "smock-" in f:
        return ["presentation-icons"]

    if "vendor/spectrum-workflow-icons" in f or "adobe-presentation-template-icons" in f:
        return ["presentation-icons"]

    if "aep-architecture" in f:
        return ["diagram-reference"]

    return []


def main() -> None:
    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    logos = data.get("logos")
    if not isinstance(logos, list):
        raise SystemExit("Invalid logos array")

    for entry in logos:
        if not isinstance(entry, dict):
            continue
        entry["tags"] = infer_tags(entry)

    note = data.get("note", "")
    tag_hint = (
        " Optional `tags` array per entry (Phase 1): adobe-catalog, adobe-core, experience-cloud, "
        "data-collection, profile-audiences, journeys, diagram-reference, presentation-icons, partner."
    )
    if tag_hint.strip() not in note:
        data["note"] = (note.rstrip() + tag_hint).strip()

    JSON_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Updated {len(logos)} entries in {JSON_PATH}")


if __name__ == "__main__":
    main()
