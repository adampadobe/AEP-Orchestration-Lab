#!/usr/bin/env python3
"""
Local dev server: static UI + authenticated proxy to platform.adobe.io,
POST /api/streaming-collect to HTTP API streaming inlets (dcs.adobedc.net/collection/…),
plus an allowlisted GET proxy to your public webhook listener (no Adobe auth).
Run from repo root: python proxy_server.py
"""
from __future__ import annotations

import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlencode, urlparse

import requests

try:
    from adobe_ims_auth import AdobeAuth, aep_request_headers
except ImportError as e:
    raise SystemExit(
        "Install deps: pip install -r requirements.txt\n" + str(e)
    ) from e

WEB_ROOT = Path(__file__).resolve().parent / "web"
BASE_PLATFORM = "https://platform.adobe.io"
# Serve web/index.html for this path so the lab URL matches AJO “path contains aep-decisioning-lab”.
LAB_PATH_PREFIX = "/aep-decisioning-lab"
# SSRF guard: only this host may be fetched by /api/webhook-listener
WEBHOOK_LISTENER_ALLOWED_NETLOC = "webhooklistener-pscg5c4cja-uc.a.run.app"


def _streaming_collect_url_allowed(url: str) -> bool:
    """SSRF guard: only HTTPS Adobe DCS collection inlets."""
    try:
        p = urlparse(url)
    except Exception:
        return False
    if p.scheme != "https":
        return False
    host = (p.hostname or "").lower()
    if not host:
        return False
    if host != "dcs.adobedc.net" and not host.endswith(".dcs.adobedc.net"):
        return False
    path = p.path or ""
    return path.startswith("/collection/") and len(path) > len("/collection/")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        path_only = parsed.path
        if path_only == "/api/webhook-listener":
            self._serve_webhook_listener()
            return
        q = ("?" + parsed.query) if parsed.query else ""
        if path_only == LAB_PATH_PREFIX or path_only == LAB_PATH_PREFIX + "/" or path_only.startswith(
            LAB_PATH_PREFIX + "/"
        ):
            suffix = path_only[len(LAB_PATH_PREFIX) :].lstrip("/")
            if suffix:
                try:
                    candidate = (WEB_ROOT / suffix).resolve()
                    candidate.relative_to(WEB_ROOT.resolve())
                except ValueError:
                    self.send_error(403, "Forbidden")
                    return
                if candidate.is_file():
                    # Map /aep-decisioning-lab/foo.html → web/foo.html (handler directory is WEB_ROOT).
                    self.path = "/" + suffix + q
                    return super().do_GET()
            self.path = "/index.html" + q
            return super().do_GET()
        return super().do_GET()

    def log_message(self, fmt, *args):
        print(f"[{self.address_string()}] {fmt % args}")

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/streaming-collect":
            self._post_streaming_collect()
            return
        if parsed.path != "/api/aep":
            self.send_error(404, "Not Found")
            return
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._json_response(400, {"error": "Invalid JSON body"})
            return

        method = (body.get("method") or "GET").upper()
        path = body.get("path") or ""
        params = body.get("params") or {}
        json_body = body.get("json")
        extra = body.get("platform_headers")
        if extra is not None and not isinstance(extra, dict):
            self._json_response(400, {"error": "platform_headers must be an object"})
            return

        if not path.startswith("/"):
            self._json_response(400, {"error": "path must start with /"})
            return

        url = BASE_PLATFORM.rstrip("/") + path
        if params:
            url = url + ("&" if "?" in url else "?") + urlencode(params)

        try:
            auth = AdobeAuth()
            headers = aep_request_headers(auth)
            if isinstance(extra, dict):
                allowed = (
                    "x-schema-id",
                    "accept",
                    "content-type",
                    "if-match",
                    "if-none-match",
                )
                for key, val in extra.items():
                    if val is None or str(val).strip() == "":
                        continue
                    lk = key.lower()
                    if lk in allowed:
                        headers[key] = str(val)
            if method in ("POST", "PUT", "PATCH"):
                headers.setdefault("Content-Type", "application/json")
        except Exception as ex:
            self._json_response(500, {"error": "Auth failed", "detail": str(ex)})
            return

        try:
            resp = requests.request(
                method,
                url,
                headers=headers,
                json=json_body if json_body is not None else None,
                timeout=60,
            )
        except requests.RequestException as ex:
            self._json_response(502, {"error": str(ex)})
            return

        ct = resp.headers.get("Content-Type", "")
        out_body = None
        if "json" in ct.lower():
            try:
                out_body = resp.json()
            except json.JSONDecodeError:
                out_body = {"raw": resp.text}
        else:
            out_body = {"raw": resp.text[:50000]}

        self._json_response(
            resp.status_code,
            {
                "status": resp.status_code,
                "platform_response": out_body,
                "request_url": url,
            },
        )

    def _post_streaming_collect(self):
        """Forward xdmEntityCreate-style JSON to an HTTP API inlet (DCS). Uses IMS + x-api-key."""
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._json_response(400, {"error": "Invalid JSON body"})
            return
        url = (body.get("url") or "").strip()
        json_body = body.get("json")
        if not url or not _streaming_collect_url_allowed(url):
            self._json_response(
                400,
                {
                    "error": "Invalid or disallowed streaming URL",
                    "detail": "Expected https://dcs.adobedc.net/collection/{inletId} (from Flow Service base connection inletUrl).",
                },
            )
            return
        if json_body is None or not isinstance(json_body, dict):
            self._json_response(400, {"error": "json must be an object (header/body envelope)"})
            return
        try:
            auth = AdobeAuth()
            headers = aep_request_headers(auth)
        except Exception as ex:
            self._json_response(500, {"error": "Auth failed", "detail": str(ex)})
            return
        try:
            resp = requests.post(url, headers=headers, json=json_body, timeout=60)
        except requests.RequestException as ex:
            self._json_response(502, {"error": str(ex)})
            return
        ct = resp.headers.get("Content-Type", "")
        out_body = None
        if "json" in ct.lower():
            try:
                out_body = resp.json()
            except json.JSONDecodeError:
                out_body = {"raw": resp.text}
        else:
            out_body = {"raw": (resp.text or "")[:50000]}
        self._json_response(
            resp.status_code,
            {
                "status": resp.status_code,
                "platform_response": out_body,
                "request_url": url,
            },
        )

    def _json_response(self, status: int, obj: dict):
        data = json.dumps(obj, indent=2).encode("utf-8")
        self.send_response(status if status != 502 else 200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _serve_webhook_listener(self):
        default = "https://webhooklistener-pscg5c4cja-uc.a.run.app/"
        raw = (os.environ.get("WEBHOOK_LISTENER_URL") or default).strip()
        try:
            parts = urlparse(raw)
        except Exception:
            self._json_response(500, {"ok": False, "error": "Invalid WEBHOOK_LISTENER_URL"})
            return
        if parts.scheme != "https" or parts.netloc != WEBHOOK_LISTENER_ALLOWED_NETLOC:
            self._json_response(
                403,
                {
                    "ok": False,
                    "error": "Webhook listener URL must be HTTPS and host allowlisted",
                    "allowed_netloc": WEBHOOK_LISTENER_ALLOWED_NETLOC,
                },
            )
            return
        try:
            resp = requests.get(
                raw,
                timeout=45,
                headers={"Accept": "application/json", "User-Agent": "aep-decisioning-lab-proxy"},
            )
        except requests.RequestException as ex:
            self._json_response(502, {"ok": False, "error": str(ex)})
            return
        ct = resp.headers.get("Content-Type", "")
        if "json" not in ct.lower():
            self._json_response(
                502,
                {
                    "ok": False,
                    "error": "Upstream did not return JSON",
                    "upstream_status": resp.status_code,
                    "snippet": (resp.text or "")[:500],
                },
            )
            return
        try:
            payload = resp.json()
        except json.JSONDecodeError:
            self._json_response(
                502,
                {"ok": False, "error": "Invalid JSON from webhook listener", "upstream_status": resp.status_code},
            )
            return
        self._json_response(
            200,
            {"ok": True, "upstream_status": resp.status_code, "listener_url": raw, "data": payload},
        )


def main():
    port = int(os.environ.get("PORT", "8765"))
    if not WEB_ROOT.is_dir():
        raise SystemExit(f"Missing web folder: {WEB_ROOT}")
    httpd = HTTPServer(("127.0.0.1", port), Handler)
    print(f"Serving http://127.0.0.1:{port}/ (web root: {WEB_ROOT})")
    print("POST /api/aep with JSON: { method, path, params?, json?, platform_headers? }")
    print("POST /api/streaming-collect with JSON: { url, json } — DCS inlet only (see lab §1)")
    print(f"GET /api/webhook-listener — fetch allowlisted webhook index ({WEBHOOK_LISTENER_ALLOWED_NETLOC})")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
