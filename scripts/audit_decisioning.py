#!/usr/bin/env python3
"""
Inventory Experience Decisioning resources (and optionally legacy offers) in the current sandbox.

Requires adobe_ims_auth credentials (see /Users/apalmer/.cursor/skills/adobe-ims-auth/SKILL.md).

Usage:
  python scripts/audit_decisioning.py
  AEP_AUDIT_LEGACY=1 python scripts/audit_decisioning.py   # also call legacy /offers

Optional for decision items:
  export AEP_DECISION_ITEM_SCHEMA_ID=<schema URI id>
"""
from __future__ import annotations

import json
import os
import sys

import requests

try:
    from adobe_ims_auth import AdobeAuth, aep_request_headers
except ImportError:
    print("pip install -r requirements.txt", file=sys.stderr)
    raise

BASE = "https://platform.adobe.io/data/core/dps"


def get_json(path: str, params: dict | None = None, extra_headers: dict | None = None) -> tuple[int, object | None, str]:
    auth = AdobeAuth()
    headers = aep_request_headers(auth)
    if extra_headers:
        headers.update(extra_headers)
    r = requests.get(
        BASE + path,
        headers=headers,
        params=params or {},
        timeout=60,
    )
    text = r.text[:2000]
    try:
        return r.status_code, r.json(), text
    except json.JSONDecodeError:
        return r.status_code, None, text


def count_items(payload) -> int | str:
    if payload is None:
        return "n/a"
    if isinstance(payload, dict):
        if "results" in payload and isinstance(payload["results"], list):
            return len(payload["results"])
        if "children" in payload and isinstance(payload["children"], list):
            return len(payload["children"])
        if "items" in payload and isinstance(payload["items"], list):
            return len(payload["items"])
        if "_embedded" in payload:
            return f"_embedded keys: {list(payload['_embedded'].keys())}"
    if isinstance(payload, list):
        return len(payload)
    return "see raw"


def main():
    schema_id = os.environ.get("AEP_DECISION_ITEM_SCHEMA_ID", "").strip()
    item_headers = {"x-schema-id": schema_id} if schema_id else None

    experience_checks: list[tuple[str, dict | None, dict | None]] = [
        ("/offer-items", {"limit": 50}, item_headers),
        ("/item-collections", {"limit": 50}, None),
        ("/selection-strategies", {"limit": 50}, None),
    ]

    print("Experience Decisioning audit (GET /data/core/dps …)\n")
    if not schema_id:
        print(
            "Tip: export AEP_DECISION_ITEM_SCHEMA_ID=… if /offer-items returns 400 requiring x-schema-id.\n"
        )

    for path, params, xh in experience_checks:
        status, data, snippet = get_json(path, params, xh)
        label = f"{path} {params or {}}"
        if status >= 400:
            print(f"[{status}] {label}\n  {snippet[:600]}\n")
        else:
            print(f"[{status}] {label} -> {count_items(data)}\n")

    if os.environ.get("AEP_AUDIT_LEGACY"):
        print("Legacy Offer Decisioning (optional):\n")
        legacy = [
            ("/offers", {"offer-type": "personalized", "limit": 20}),
            ("/offers", {"offer-type": "fallback", "limit": 20}),
        ]
        for path, params in legacy:
            status, data, snippet = get_json(path, params)
            label = f"{path} {params}"
            if status >= 400:
                print(f"[{status}] {label}\n  {snippet[:400]}\n")
            else:
                print(f"[{status}] {label} -> {count_items(data)}\n")


if __name__ == "__main__":
    main()
