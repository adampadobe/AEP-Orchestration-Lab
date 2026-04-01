#!/usr/bin/env python3
"""
Fetch a full tenant schema from AEP Schema Registry (XED full) and print or save JSON.

  python scripts/fetch_schema.py "https://ns.adobe.com/demoemea/schemas/7fdc9de4101bde9186542920e0b021d164ef6602b8778e6a"
  python scripts/fetch_schema.py --out schemas/my-schema.json <schema_uri>

Requires adobe_ims_auth credentials (same as proxy_server.py).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.parse import quote

import requests

from adobe_ims_auth import AdobeAuth, aep_request_headers

BASE = "https://platform.adobe.io"
REGISTRY_PATH = "/data/foundation/schemaregistry/tenant/schemas/"


def main() -> int:
    p = argparse.ArgumentParser(description="GET XED full schema from Schema Registry")
    p.add_argument("schema_id", help="Schema $id URI, e.g. https://ns.adobe.com/.../schemas/...")
    p.add_argument(
        "--out",
        "-o",
        type=Path,
        help="Write JSON to this file (UTF-8)",
    )
    args = p.parse_args()
    schema_id = args.schema_id.strip()
    enc = quote(schema_id, safe="")
    url = BASE + REGISTRY_PATH + enc
    auth = AdobeAuth()
    headers = aep_request_headers(auth)
    headers["Accept"] = "application/vnd.adobe.xed-full+json; version=1"
    try:
        r = requests.get(url, headers=headers, timeout=120)
    except requests.RequestException as ex:
        print("Request failed:", ex, file=sys.stderr)
        return 1
    if r.status_code != 200:
        print("HTTP", r.status_code, file=sys.stderr)
        try:
            print(json.dumps(r.json(), indent=2), file=sys.stderr)
        except Exception:
            print(r.text[:2000], file=sys.stderr)
        return 1
    body = r.json()
    text = json.dumps(body, indent=2)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text + "\n", encoding="utf-8")
        print("Wrote", args.out)
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
