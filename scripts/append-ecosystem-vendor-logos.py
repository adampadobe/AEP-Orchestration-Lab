#!/usr/bin/env python3
"""Append Simple Icons–sourced ecosystem vendor rows to architecture-logos.json (Phase 2).

SVGs live under web/profile-viewer/images/ecosystem-vendor-logos/ (download separately).
Re-run: python3 scripts/tag-architecture-logos.py after adding files so `tags` stay consistent.
"""

from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
JSON_PATH = REPO / "web/profile-viewer/data/architecture-logos.json"
SVG_DIR = REPO / "web/profile-viewer/images/ecosystem-vendor-logos"

# Display names (slug → label). Source icons: Simple Icons (CC0), https://github.com/simple-icons/simple-icons
LABELS: dict[str, str] = {
    "snowflake": "Snowflake",
    "databricks": "Databricks",
    "googlebigquery": "Google BigQuery",
    "amazonaws": "Amazon Web Services",
    "googlecloud": "Google Cloud",
    "microsoftazure": "Microsoft Azure",
    "mongodb": "MongoDB",
    "postgresql": "PostgreSQL",
    "mysql": "MySQL",
    "elasticsearch": "Elasticsearch",
    "redis": "Redis",
    "apachekafka": "Apache Kafka",
    "googleanalytics": "Google Analytics",
    "looker": "Looker",
    "tableau": "Tableau",
    "salesforce": "Salesforce",
    "hubspot": "HubSpot",
    "twilio": "Twilio",
    "zendesk": "Zendesk",
    "kubernetes": "Kubernetes",
    "docker": "Docker",
    "meta": "Meta",
    "facebook": "Facebook",
    "instagram": "Instagram",
    "linkedin": "LinkedIn",
    "tiktok": "TikTok",
    "microsoftsqlserver": "Microsoft SQL Server",
}


def main() -> None:
    if not SVG_DIR.is_dir():
        raise SystemExit(f"Missing directory: {SVG_DIR}")

    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    logos: list = data.get("logos")
    if not isinstance(logos, list):
        raise SystemExit("Invalid logos array")

    existing = {e.get("file") for e in logos if isinstance(e, dict)}

    added = 0
    for svg in sorted(SVG_DIR.glob("*.svg")):
        rel = f"images/ecosystem-vendor-logos/{svg.name}"
        if rel in existing:
            continue
        slug = svg.stem
        label = LABELS.get(slug, slug.replace("-", " ").title())
        desc = (
            f"{label} — vendor mark for architecture diagrams. "
            "Icon from Simple Icons (CC0); confirm brand use against your org’s guidelines."
        )
        logos.append({"file": rel, "label": label, "description": desc})
        added += 1

    JSON_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Appended {added} logo(s); total entries {len(logos)}")


if __name__ == "__main__":
    main()
