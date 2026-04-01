#!/usr/bin/env python3
"""
Build samples/ajo-webhook-xdm-definitions-bundle.json with:
  webhookName + xdmSchemaDefinitions[] (Offer Metadata mixin, Offer Content mixin, Personalized Offer Items schema).

  python scripts/fetch_webhook_schema_bundle.py
  python scripts/fetch_webhook_schema_bundle.py --tenant demoemea --out samples/my-bundle.json

For a small instance payload (_demoemea.content / offerMetadata / thresholds only), edit samples/ajo-webhook-payload-with-webhookName.json.

Tenant IDs must match your org (demoemea in this repo’s examples).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.parse import quote

import requests

from adobe_ims_auth import AdobeAuth, aep_request_headers

BASE = "https://platform.adobe.io/data/foundation/schemaregistry/tenant"


def fetch_resource(kind: str, resource_id: str, headers: dict) -> dict:
    url = f"{BASE}/{kind}/{quote(resource_id, safe='')}"
    r = requests.get(url, headers=headers, timeout=120)
    if r.status_code != 200:
        print(f"HTTP {r.status_code} {url}", file=sys.stderr)
        try:
            print(json.dumps(r.json(), indent=2), file=sys.stderr)
        except Exception:
            print(r.text[:1500], file=sys.stderr)
        raise SystemExit(1)
    return r.json()


def main() -> int:
    p = argparse.ArgumentParser(description="Fetch XED bundle for webhook sample")
    p.add_argument("--tenant", default="demoemea", help="XDM tenant id (ns segment)")
    p.add_argument(
        "--out",
        type=Path,
        default=Path("samples/ajo-webhook-xdm-definitions-bundle.json"),
    )
    args = p.parse_args()
    t = args.tenant.strip()
    ids = [
        ("mixins", f"https://ns.adobe.com/{t}/mixins/8825960ce6b43fc1b13b314dc0cb6a8945ede3019ee0861b"),
        ("mixins", f"https://ns.adobe.com/{t}/mixins/80a529a16f2bb5916fae6b8a891d9c6071af372d575433d8"),
        ("schemas", f"https://ns.adobe.com/{t}/schemas/7fdc9de4101bde9186542920e0b021d164ef6602b8778e6a"),
    ]
    auth = AdobeAuth()
    headers = aep_request_headers(auth)
    headers["Accept"] = "application/vnd.adobe.xed-full+json; version=1"
    bundle = []
    for kind, rid in ids:
        bundle.append(fetch_resource(kind, rid, headers))
    wrapper = {
        "_readme": "Full XED exports for Registry-style use. For a minimal webhook instance (_demoemea.content, "
        "offerMetadata, thresholds only) see samples/ajo-webhook-payload-with-webhookName.json.",
        "webhookName": "Replace with journey / custom action label",
        "xdmSchemaDefinitions": bundle,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(wrapper, indent=2) + "\n", encoding="utf-8")
    print("Wrote", args.out, args.out.stat().st_size, "bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
