import json
import logging
import socket
import threading
import time
from ipaddress import ip_address
from urllib.parse import urlparse

from flask import (
    Flask, render_template, request, redirect, url_for,
    Response, send_file, jsonify, abort,
)

import config
from utils.db import init_db, create_project, get_project, get_all_projects, update_project, delete_project, get_project_assets
from utils.helpers import normalize_url, generate_id
from utils.export import build_assets_zip, build_full_zip, build_guidelines_doc, build_campaigns_csv, build_campaigns_json, build_personas_doc, build_segments_csv

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = Flask(__name__)
app.secret_key = config.FLASK_SECRET_KEY

init_db()

# In-memory store for SSE progress events per project
_progress_streams = {}

# In-memory store for cancel signals per project (threading events)
_cancel_events = {}


def _send_progress(project_id, step, status, message, data=None):
    """Push a progress event into the project's SSE queue."""
    event = {
        "step": step,
        "status": status,
        "message": message,
        "data": data or {},
        "timestamp": time.time(),
    }
    if project_id not in _progress_streams:
        _progress_streams[project_id] = []
    _progress_streams[project_id].append(event)


def _check_cancelled(project_id):
    """Raise if the user has cancelled this analysis."""
    event = _cancel_events.get(project_id)
    if event and event.is_set():
        raise RuntimeError("Analysis cancelled by user")


def _compute_quality_scores(analysis_data):
    """Return a dict of quality scores (0-100) for each analysis section."""
    scores = {}

    campaigns = analysis_data.get("campaigns", [])
    scores["campaigns"] = min(100, len(campaigns) * 25) if campaigns else 0

    personas = analysis_data.get("personas", [])
    if personas:
        filled = sum(1 for p in personas if p.get("bio") and p.get("goals"))
        scores["personas"] = int((filled / len(personas)) * 100) if personas else 0
    else:
        scores["personas"] = 0

    segments = analysis_data.get("segments", [])
    if segments:
        filled = sum(1 for s in segments if s.get("criteria") and len(s["criteria"]) >= 2)
        scores["segments"] = int((filled / len(segments)) * 100) if segments else 0
    else:
        scores["segments"] = 0

    g = analysis_data.get("guidelines")
    if g and isinstance(g, dict) and not g.get("_is_fallback"):
        section_count = sum(1 for k in ["tone_of_voice", "brand_values", "editorial_guidelines", "channel_guidelines"]
                           if g.get(k) and len(g[k]) > 0)
        scores["guidelines"] = int((section_count / 4) * 100)
    else:
        scores["guidelines"] = 0 if not g else 30

    return scores


def _run_analysis(project_id, url, business_type="b2c", persona_country="Germany"):
    """Run the full analysis pipeline in a background thread."""
    from scraper.crawler import crawl_website
    from scraper.extractor import extract_assets
    from scraper.classifier import classify_images
    from scraper.downloader import download_assets
    from ai.brand_analysis import analyze_brand
    from ai.campaign_analysis import analyze_campaigns
    from ai.persona_generation import generate_personas
    from ai.segment_generation import generate_segments
    from utils.crosslink import crosslink_personas_segments, crosslink_campaigns_segments

    analysis_data = {
        "url": url,
        "brand_name": "",
        "pages": [],
        "assets": [],
        "colors": [],
        "fonts": [],
        "guidelines": None,
        "campaigns": [],
        "personas": [],
        "segments": [],
    }

    try:
        # Step 1: Crawl
        _check_cancelled(project_id)
        _send_progress(project_id, 1, "running", "Crawling website...")
        crawl_result = crawl_website(url)
        analysis_data["brand_name"] = crawl_result["brand_name"]
        analysis_data["pages"] = crawl_result["pages"]
        _send_progress(project_id, 1, "completed", f"Crawled {len(crawl_result['pages'])} pages", {
            "pages_scanned": len(crawl_result["pages"]),
            "total_urls": crawl_result["total_urls"],
        })
        update_project(project_id, brand_name=crawl_result["brand_name"],
                       pages_scanned=len(crawl_result["pages"]),
                       total_urls=crawl_result["total_urls"])

        # Step 2: Extract assets
        _check_cancelled(project_id)
        _send_progress(project_id, 2, "running", "Extracting assets, colors, and fonts...")
        extract_result = extract_assets(crawl_result["pages"])
        analysis_data["assets"] = extract_result["assets"]
        analysis_data["colors"] = extract_result["colors"]
        analysis_data["fonts"] = extract_result["fonts"]
        _send_progress(project_id, 2, "completed", f"Found {len(extract_result['assets'])} assets", {
            "asset_count": len(extract_result["assets"]),
            "color_count": len(extract_result["colors"]),
            "font_count": len(extract_result["fonts"]),
        })

        # Step 2b: Classify & download
        _check_cancelled(project_id)
        _send_progress(project_id, 2, "running", "Classifying and downloading assets...")
        classified = classify_images(extract_result["assets"], crawl_result["brand_name"], url)
        analysis_data["assets"] = classified
        download_assets(project_id, classified)
        _send_progress(project_id, 2, "completed", f"Downloaded {len(classified)} assets")

        combined_text = "\n\n".join(p.get("text", "") for p in crawl_result["pages"] if p.get("text"))

        # Step 3: Brand voice
        _check_cancelled(project_id)
        _send_progress(project_id, 3, "running", "Analyzing brand voice...")
        guidelines = analyze_brand(crawl_result["brand_name"], combined_text, url)
        analysis_data["guidelines"] = guidelines
        _send_progress(project_id, 3, "completed", "Brand guidelines generated")

        # Step 4: Campaigns
        _check_cancelled(project_id)
        _send_progress(project_id, 4, "running", "Detecting campaigns...")
        links = []
        for page in crawl_result["pages"]:
            links.extend(page.get("links", []))
        campaigns = analyze_campaigns(crawl_result["brand_name"], combined_text, url, links[:50])
        analysis_data["campaigns"] = campaigns
        _send_progress(project_id, 4, "completed", f"Found {len(campaigns)} campaigns")

        # Step 5: Personas
        _check_cancelled(project_id)
        _send_progress(project_id, 5, "running", "Generating customer personas...")
        personas = generate_personas(
            crawl_result["brand_name"], combined_text, url, campaigns,
            country=persona_country, business_type=business_type,
        )
        analysis_data["personas"] = personas
        _send_progress(project_id, 5, "completed", f"Created {len(personas)} personas")

        # Step 6: Segments
        _check_cancelled(project_id)
        _send_progress(project_id, 6, "running", "Suggesting audience segments...")
        segments = generate_segments(crawl_result["brand_name"], combined_text, campaigns, personas)
        analysis_data["segments"] = segments
        _send_progress(project_id, 6, "completed", f"Generated {len(segments)} segments")

        # Cross-link personas and segments bidirectionally
        crosslink_personas_segments(personas, segments)
        # Cross-link campaigns and segments bidirectionally
        crosslink_campaigns_segments(campaigns, segments)
        analysis_data["personas"] = personas
        analysis_data["segments"] = segments
        analysis_data["campaigns"] = campaigns

        # Step 7: B2B Accounts (conditional)
        if business_type == "b2b":
            from ai.account_generation import generate_accounts
            from utils.crosslink import crosslink_accounts
            _check_cancelled(project_id)
            _send_progress(project_id, 7, "running", "Generating B2B accounts...")
            accounts = generate_accounts(
                crawl_result["brand_name"], combined_text, url,
                campaigns, personas, segments, persona_country,
            )
            crosslink_accounts(accounts, personas, campaigns, segments)
            analysis_data["accounts"] = accounts
            _send_progress(project_id, 7, "completed", f"Created {len(accounts)} accounts")

        # Compute quality scores per section
        analysis_data["quality_scores"] = _compute_quality_scores(analysis_data)

        # Strip raw page data before persisting (too large)
        save_data = {k: v for k, v in analysis_data.items() if k != "pages"}
        # Also strip asset raw data, keep only metadata
        save_data["assets"] = [
            {"id": a["id"], "url": a["url"], "category": a["category"], "source_page": a.get("source_page", "")}
            for a in analysis_data.get("assets", [])
        ]
        update_project(project_id, status="completed", analysis_data=json.dumps(save_data))
        _send_progress(project_id, 0, "done", "Analysis complete!")

    except Exception as e:
        error_msg = str(e)
        error_data = json.dumps({"error": error_msg})
        update_project(project_id, status="failed", analysis_data=error_data)
        _send_progress(project_id, 0, "error", f"Analysis failed: {error_msg}")
    finally:
        _cancel_events.pop(project_id, None)


# --- Routes ---

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/analyze", methods=["POST"])
def analyze():
    url = request.form.get("url", "").strip()
    if not url:
        return redirect(url_for("index"))

    url = normalize_url(url)
    business_type = request.form.get("business_type", "b2c").strip().lower()
    persona_country = request.form.get("persona_country", "Germany").strip()
    if business_type not in ("b2b", "b2c"):
        business_type = "b2c"

    project_id = generate_id()
    create_project(project_id, url, business_type=business_type, persona_country=persona_country)

    _progress_streams[project_id] = []
    _cancel_events[project_id] = threading.Event()
    thread = threading.Thread(
        target=_run_analysis,
        args=(project_id, url, business_type, persona_country),
        daemon=True,
    )
    thread.start()

    return redirect(url_for("analysis_progress", project_id=project_id))


@app.route("/analyze/<project_id>/progress")
def analysis_progress(project_id):
    project = get_project(project_id)
    if not project:
        abort(404)
    return render_template("analysis.html", project=project)


@app.route("/analyze/<project_id>/stream")
def analysis_stream(project_id):
    def event_generator():
        sent = 0
        while True:
            events = _progress_streams.get(project_id, [])
            while sent < len(events):
                event = events[sent]
                yield f"data: {json.dumps(event)}\n\n"
                sent += 1
                if event.get("status") in ("done", "error"):
                    return
            time.sleep(0.5)

    return Response(event_generator(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.route("/analyze/<project_id>/cancel", methods=["POST"])
def cancel_analysis(project_id):
    """Signal the background analysis thread to stop."""
    event = _cancel_events.get(project_id)
    if event:
        event.set()
    return jsonify({"ok": True})


@app.route("/project/<project_id>/retry", methods=["POST"])
def retry_analysis(project_id):
    """Re-run a failed analysis from scratch."""
    project = get_project(project_id)
    if not project:
        abort(404)
    update_project(project_id, status="analyzing", analysis_data=None)
    _progress_streams[project_id] = []
    _cancel_events[project_id] = threading.Event()
    thread = threading.Thread(
        target=_run_analysis,
        args=(project_id, project["url"], project.get("business_type", "b2c"), project.get("persona_country", "Germany")),
        daemon=True,
    )
    thread.start()
    return redirect(url_for("analysis_progress", project_id=project_id))


@app.route("/project/<project_id>")
def project_detail(project_id):
    project = get_project(project_id)
    if not project:
        abort(404)
    assets = get_project_assets(project_id)
    analysis = {}
    if project["analysis_data"]:
        try:
            analysis = json.loads(project["analysis_data"])
        except json.JSONDecodeError:
            pass
    return render_template("project.html", project=project, assets=assets, analysis=analysis)


@app.route("/projects")
def projects_list():
    projects = get_all_projects()
    # Extract error message from analysis_data for failed projects
    for p in projects:
        if p.get("status") == "failed" and p.get("analysis_data"):
            try:
                err = json.loads(p["analysis_data"])
                p["error_message"] = err.get("error", "")
            except (json.JSONDecodeError, TypeError):
                p["error_message"] = ""
    return render_template("projects.html", projects=projects)


@app.route("/project/<project_id>/delete", methods=["POST"])
def project_delete(project_id):
    delete_project(project_id)
    return redirect(url_for("projects_list"))


@app.route("/project/<project_id>/export/<fmt>")
def project_export(project_id, fmt):
    project = get_project(project_id)
    if not project:
        abort(404)

    analysis = {}
    if project["analysis_data"]:
        analysis = json.loads(project["analysis_data"])

    brand = analysis.get("brand_name", "brand")
    assets = get_project_assets(project_id)

    if fmt == "assets-zip":
        path = build_assets_zip(project_id, brand, assets)
        return send_file(path, as_attachment=True, download_name=f"{brand}-assets.zip")
    elif fmt == "full-zip":
        path = build_full_zip(project_id, brand, assets, analysis)
        return send_file(path, as_attachment=True, download_name=f"{brand}-brand-package.zip")
    elif fmt == "guidelines-doc":
        path = build_guidelines_doc(brand, analysis.get("guidelines"))
        return send_file(path, as_attachment=True, download_name=f"{brand}-guidelines.doc")
    elif fmt == "campaigns-csv":
        path = build_campaigns_csv(brand, analysis.get("campaigns", []))
        return send_file(path, as_attachment=True, download_name=f"{brand}-campaigns.csv")
    elif fmt == "campaigns-json":
        path = build_campaigns_json(brand, analysis.get("campaigns", []))
        return send_file(path, as_attachment=True, download_name=f"{brand}-campaigns.json")
    elif fmt == "personas-doc":
        path = build_personas_doc(brand, analysis.get("personas", []))
        return send_file(path, as_attachment=True, download_name=f"{brand}-personas.doc")
    elif fmt == "segments-csv":
        path = build_segments_csv(brand, analysis.get("segments", []))
        return send_file(path, as_attachment=True, download_name=f"{brand}-segments.csv")
    else:
        abort(400)


def _is_safe_url(url_string):
    """Validate that a URL is safe to fetch (public HTTPS only, no internal IPs)."""
    try:
        parsed = urlparse(url_string)
        if parsed.scheme not in ("http", "https"):
            return False
        hostname = parsed.hostname
        if not hostname:
            return False
        resolved = socket.getaddrinfo(hostname, None)
        for _, _, _, _, addr in resolved:
            ip = ip_address(addr[0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
                return False
        return True
    except Exception:
        return False


@app.route("/proxy-image")
def proxy_image():
    """Proxy external images to avoid CORS issues when displaying in browser."""
    image_url = request.args.get("url")
    if not image_url:
        abort(400)
    if not _is_safe_url(image_url):
        abort(403)
    import requests as req
    try:
        resp = req.get(image_url, timeout=15, headers={"User-Agent": config.USER_AGENT}, stream=True)
        resp.raise_for_status()
        content_type = resp.headers.get("Content-Type", "image/jpeg")
        return Response(resp.content, content_type=content_type)
    except Exception:
        abort(502)


if __name__ == "__main__":
    app.run(debug=config.FLASK_DEBUG, port=5000)
