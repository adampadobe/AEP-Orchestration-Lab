"""
HTTP entrypoint for the full AgenticAI travel data generator (Phase 1–3 +
enrichment). Intended for Cloud Run or a trusted private host: the AEP
Orchestration Lab Cloud Function verifies Firebase auth, then forwards a
signed payload here with Snowflake connection material.

Security: set RUNNER_HMAC_SECRET in the runner environment; the caller must
send header X-Runner-Signature = HMAC-SHA256(secret, raw_body_bytes).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import sys
from pathlib import Path

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
from fastapi import FastAPI, HTTPException, Request, Response

_PY_DIR = Path(__file__).resolve().parent / "py"
sys.path.insert(0, str(_PY_DIR))

import snowflake_settings  # noqa: E402

app = FastAPI(title="Agentic Travel Snowflake Runner")


def _runner_secret() -> str:
    return (os.environ.get("RUNNER_HMAC_SECRET") or "").strip()


def _verify_signature(body: bytes, signature_header: str | None) -> None:
    secret = _runner_secret()
    if not secret:
        raise HTTPException(500, "RUNNER_HMAC_SECRET is not configured on the runner")
    if not signature_header:
        raise HTTPException(401, "Missing X-Runner-Signature")
    expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature_header.strip()):
        raise HTTPException(403, "Invalid X-Runner-Signature")


def _snowflake_kwargs_from_json(d: dict) -> dict:
    """Map JSON from the lab Cloud Function into snowflake.connector.connect kwargs."""
    account = str(d.get("account") or "").strip()
    user = str(d.get("username") or d.get("user") or "").strip()
    if not account or not user:
        raise ValueError("account and username are required")

    out: dict = {
        "account": account,
        "user": user,
        "role": (str(d.get("role")).strip() or None) if d.get("role") else None,
        "warehouse": (str(d.get("warehouse")).strip() or None) if d.get("warehouse") else None,
        "database": (str(d.get("database")).strip() or None) if d.get("database") else None,
        "schema": (str(d.get("schema")).strip() or None) if d.get("schema") else None,
        "application": str(d.get("application") or "AEP_ORCHESTRATION_LAB").strip() or "AEP_ORCHESTRATION_LAB",
    }

    auth = str(d.get("authenticator") or "").strip().upper()
    if auth == "SNOWFLAKE_JWT":
        pem = str(d.get("privateKeyPem") or "").strip()
        if not pem:
            raise ValueError("privateKeyPem is required for SNOWFLAKE_JWT")
        passphrase = d.get("privateKeyPassphrase")
        pw = (
            str(passphrase).encode("utf-8")
            if passphrase and str(passphrase).strip()
            else None
        )
        p_key = serialization.load_pem_private_key(
            pem.encode("utf-8"),
            password=pw,
            backend=default_backend(),
        )
        der = p_key.private_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        out["authenticator"] = "SNOWFLAKE_JWT"
        out["private_key"] = der
    else:
        pwd = d.get("password")
        if pwd is None or str(pwd) == "":
            raise ValueError("password is required for non-JWT auth")
        out["password"] = str(pwd)

    return out


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "agentic-travel-runner"}


@app.post("/internal/generate")
async def internal_generate(request: Request) -> Response:
    body = await request.body()
    _verify_signature(body, request.headers.get("X-Runner-Signature"))

    data = json.loads(body.decode("utf-8"))
    count = int(data.get("count") or 0)
    if count < 1 or count > 1000:
        raise HTTPException(400, "count must be between 1 and 1000")

    sf = data.get("snowflake") or {}
    kwargs = _snowflake_kwargs_from_json(sf)
    snowflake_settings.set_connection_kwargs(kwargs)

    import web_app as wa

    wa.generation_status["running"] = False
    wa.generation_status["progress"] = 0
    wa.generation_status["message"] = "Starting..."
    wa.generation_status["last_result"] = None

    # Synchronous (no background thread) so Cloud Run / single worker semantics match one job.
    wa.generate_data_background(count)

    lr = wa.generation_status.get("last_result")
    ok = isinstance(lr, dict) and lr.get("success") is not False

    return Response(
        content=json.dumps({"success": ok, "generation_status": wa.generation_status}),
        media_type="application/json",
    )


@app.post("/internal/enrich")
async def internal_enrich(request: Request) -> Response:
    body = await request.body()
    _verify_signature(body, request.headers.get("X-Runner-Signature"))

    data = json.loads(body.decode("utf-8"))
    profiles = data.get("profiles") or []
    event_types = data.get("event_types") or []
    if not profiles:
        raise HTTPException(400, "profiles is required")
    if not event_types:
        raise HTTPException(400, "event_types is required")

    sf = data.get("snowflake") or {}
    kwargs = _snowflake_kwargs_from_json(sf)
    snowflake_settings.set_connection_kwargs(kwargs)

    import web_app as wa

    wa.enrichment_status["running"] = False
    wa.enrichment_status["progress"] = 0
    wa.enrichment_status["message"] = "Starting enrichment..."
    wa.enrichment_status["last_result"] = None

    wa.enrich_profiles_background(profiles, event_types)

    lr = wa.enrichment_status.get("last_result")
    ok = isinstance(lr, dict) and lr.get("success") is not False

    return Response(
        content=json.dumps({"success": ok, "enrichment_status": wa.enrichment_status}),
        media_type="application/json",
    )
