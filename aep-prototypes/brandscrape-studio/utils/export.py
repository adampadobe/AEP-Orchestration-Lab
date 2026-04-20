import csv
import io
import json
import os
import tempfile
import zipfile

import config


def _temp_path(filename):
    return os.path.join(tempfile.gettempdir(), filename)


def build_assets_zip(project_id, brand_name, assets):
    """Create a ZIP of all downloaded assets organized by category."""
    zip_path = _temp_path(f"{brand_name}-assets.zip")
    project_dir = os.path.join(config.PROJECTS_DIR, project_id)
    failed = []

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for asset in assets:
            local_path = asset.get("local_path")
            if not local_path:
                failed.append(asset.get("original_url", "unknown"))
                continue
            full_path = os.path.join(config.PROJECTS_DIR, local_path)
            if os.path.exists(full_path):
                arc_name = os.path.join(f"{brand_name}-assets", os.path.relpath(full_path, project_dir))
                zf.write(full_path, arc_name)
            else:
                failed.append(asset.get("original_url", "unknown"))

        if failed:
            content = "The following images could not be downloaded:\n\n" + "\n".join(failed)
            zf.writestr(f"{brand_name}-assets/failed-downloads.txt", content)

    return zip_path


def build_full_zip(project_id, brand_name, assets, analysis):
    """Create a full brand package ZIP with all data."""
    zip_path = _temp_path(f"{brand_name}-brand-package.zip")
    project_dir = os.path.join(config.PROJECTS_DIR, project_id)
    prefix = f"{brand_name}-brand-package"

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        # Assets
        for asset in assets:
            local_path = asset.get("local_path")
            if local_path:
                full_path = os.path.join(config.PROJECTS_DIR, local_path)
                if os.path.exists(full_path):
                    arc_name = os.path.join(prefix, "assets", os.path.relpath(full_path, project_dir))
                    zf.write(full_path, arc_name)

        # Guidelines HTML
        guidelines = analysis.get("guidelines")
        if guidelines:
            html = _render_guidelines_html(brand_name, guidelines)
            zf.writestr(f"{prefix}/brand-guidelines.html", html)

        # Campaigns
        campaigns = analysis.get("campaigns", [])
        if campaigns:
            zf.writestr(f"{prefix}/campaigns.json", json.dumps(campaigns, indent=2))
            zf.writestr(f"{prefix}/campaigns.html", _render_campaigns_html(brand_name, campaigns))

        # Personas
        personas = analysis.get("personas", [])
        if personas:
            zf.writestr(f"{prefix}/personas.json", json.dumps(personas, indent=2))
            zf.writestr(f"{prefix}/personas.html", _render_personas_html(brand_name, personas))

        # Segments
        segments = analysis.get("segments", [])
        if segments:
            zf.writestr(f"{prefix}/segments.json", json.dumps(segments, indent=2))
            zf.writestr(f"{prefix}/segments.html", _render_segments_html(brand_name, segments))

        # Brand info
        info = {
            "brand_name": brand_name,
            "url": analysis.get("url", ""),
            "colors": analysis.get("colors", []),
            "fonts": analysis.get("fonts", []),
        }
        zf.writestr(f"{prefix}/brand-info.json", json.dumps(info, indent=2))

    return zip_path


def build_guidelines_doc(brand_name, guidelines):
    """Create an HTML-based .doc file for brand guidelines."""
    path = _temp_path(f"{brand_name}-guidelines.doc")
    html = _render_guidelines_html(brand_name, guidelines)
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    return path


def build_campaigns_csv(brand_name, campaigns):
    """Create a CSV file of campaigns."""
    path = _temp_path(f"{brand_name}-campaigns.csv")
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Name", "Type", "Summary", "Headlines", "CTA", "Time Context", "Season", "Channel", "Is Recommendation"])
    for c in campaigns:
        writer.writerow([
            c.get("name", ""),
            c.get("type", ""),
            c.get("summary", ""),
            "; ".join(c.get("headlines", [])),
            c.get("cta", ""),
            c.get("time_context", ""),
            c.get("season", ""),
            c.get("channel", ""),
            "Yes" if c.get("is_recommendation") else "No",
        ])
    with open(path, "w", encoding="utf-8") as f:
        f.write(output.getvalue())
    return path


def build_campaigns_json(brand_name, campaigns):
    """Create a JSON file of campaigns."""
    path = _temp_path(f"{brand_name}-campaigns.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(campaigns, f, indent=2)
    return path


def build_personas_doc(brand_name, personas):
    """Create an HTML-based .doc file for personas."""
    path = _temp_path(f"{brand_name}-personas.doc")
    html = _render_personas_html(brand_name, personas)
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    return path


def build_segments_csv(brand_name, segments):
    """Create a CSV file of audience segments."""
    path = _temp_path(f"{brand_name}-segments.csv")
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Name", "Description", "Evaluation Type", "Criteria", "Estimated Size", "Suggested Campaigns", "Use Cases"])
    for s in segments:
        writer.writerow([
            s.get("name", ""),
            s.get("description", ""),
            s.get("evaluation_type", ""),
            "; ".join(s.get("criteria", [])),
            s.get("estimated_size", ""),
            "; ".join(s.get("suggested_campaigns", [])),
            "; ".join(s.get("use_cases", [])),
        ])
    with open(path, "w", encoding="utf-8") as f:
        f.write(output.getvalue())
    return path


# --- HTML renderers for DOC export ---

_DOC_STYLE = """
<style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1a1a2e; line-height: 1.6; }
    h1 { color: #16213e; border-bottom: 3px solid #0f3460; padding-bottom: 10px; }
    h2 { color: #0f3460; margin-top: 30px; }
    h3 { color: #533483; }
    .card { background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 12px 0; border-left: 4px solid #0f3460; }
    .tag { display: inline-block; background: #e8eaf6; color: #283593; padding: 2px 10px; border-radius: 12px; font-size: 13px; margin: 2px; }
    .tag.edge { background: #fff3e0; color: #e65100; }
    .tag.streaming { background: #e3f2fd; color: #1565c0; }
    .tag.batch { background: #f3e5f5; color: #6a1b9a; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f0f0f0; }
</style>
"""


def _render_guidelines_html(brand_name, guidelines):
    if not guidelines:
        return f"<html><body><h1>{brand_name} - Brand Guidelines</h1><p>No guidelines available.</p></body></html>"

    sections = []
    sections.append(f"<h2>About</h2><p>{guidelines.get('about', '')}</p>")

    tov = guidelines.get("tone_of_voice", [])
    if tov:
        items = "".join(f'<div class="card"><strong>{r.get("rule", "")}</strong>'
                        f'{"<br><em>" + r["example"] + "</em>" if r.get("example") else ""}</div>'
                        for r in tov)
        sections.append(f"<h2>Tone of Voice</h2>{items}")

    values = guidelines.get("brand_values", [])
    if values:
        items = "".join(f'<div class="card"><strong>{v.get("value", "")}</strong>: {v.get("description", "")}</div>'
                        for v in values)
        sections.append(f"<h2>Brand Values</h2>{items}")

    editorial = guidelines.get("editorial_guidelines", [])
    if editorial:
        items = "".join(f'<div class="card"><strong>{r.get("rule", "")}</strong>'
                        f'{"<br><em>" + r["example"] + "</em>" if r.get("example") else ""}</div>'
                        for r in editorial)
        sections.append(f"<h2>Editorial Guidelines</h2>{items}")

    img_guidelines = guidelines.get("image_guidelines", [])
    if img_guidelines:
        items = "".join(f'<div class="card"><strong>{r.get("rule", "")}</strong>'
                        f'{"<br><em>" + r["example"] + "</em>" if r.get("example") else ""}</div>'
                        for r in img_guidelines)
        sections.append(f"<h2>Image Guidelines</h2>{items}")

    channels = guidelines.get("channel_guidelines", [])
    if channels:
        rows = ""
        for ch in channels:
            rows += f"""<tr>
                <td><strong>{ch.get('channel', '')}</strong></td>
                <td>{ch.get('subject_line', '')}</td>
                <td>{ch.get('headline', '')}</td>
                <td>{ch.get('body', '')}</td>
                <td>{ch.get('cta', '')}</td>
            </tr>"""
        sections.append(f"""<h2>Channel Guidelines</h2>
            <table><tr><th>Channel</th><th>Subject Line</th><th>Headline</th><th>Body</th><th>CTA</th></tr>{rows}</table>""")

    body = "\n".join(sections)
    return f"""<html><head><meta charset="utf-8">{_DOC_STYLE}</head>
    <body><h1>{brand_name} - Brand Guidelines</h1>{body}</body></html>"""


def _render_campaigns_html(brand_name, campaigns):
    cards = ""
    for c in campaigns:
        badge = "Recommended" if c.get("is_recommendation") else "Detected"
        badge_color = "#4caf50" if c.get("is_recommendation") else "#2196f3"
        headlines = "".join(f"<li>{h}</li>" for h in c.get("headlines", []))
        cards += f"""<div class="card">
            <span class="tag" style="background:{badge_color};color:#fff">{badge}</span>
            <span class="tag">{c.get('type', '')}</span>
            {f'<span class="tag">{c["season"]}</span>' if c.get("season") else ""}
            <h3>{c.get('name', '')}</h3>
            <p>{c.get('summary', '')}</p>
            {"<ul>" + headlines + "</ul>" if headlines else ""}
            {f"<p><strong>CTA:</strong> {c['cta']}</p>" if c.get("cta") else ""}
        </div>"""
    return f"""<html><head><meta charset="utf-8">{_DOC_STYLE}</head>
    <body><h1>{brand_name} - Campaigns</h1>{cards}</body></html>"""


def _render_personas_html(brand_name, personas):
    cards = ""
    for p in personas:
        goals = "".join(f"<li>{g}</li>" for g in p.get("goals", []))
        pains = "".join(f"<li>{pp}</li>" for pp in p.get("pain_points", []))
        behaviors = "".join(f"<li>{b}</li>" for b in p.get("behaviors", []))
        channels = " ".join(f'<span class="tag">{ch}</span>' for ch in p.get("preferred_channels", []))
        cards += f"""<div class="card">
            <h3>{p.get('name', '')} ({p.get('age', '')}, {p.get('location', '')})</h3>
            <p><strong>{p.get('occupation', '')}</strong> | {p.get('income_range', '')}</p>
            <p>{p.get('bio', '')}</p>
            <p><strong>Brand Affinity:</strong> {p.get('brand_affinity', '')}</p>
            {"<h4>Goals</h4><ul>" + goals + "</ul>" if goals else ""}
            {"<h4>Pain Points</h4><ul>" + pains + "</ul>" if pains else ""}
            {"<h4>Behaviors</h4><ul>" + behaviors + "</ul>" if behaviors else ""}
            <p><strong>Preferred Channels:</strong> {channels}</p>
        </div>"""
    return f"""<html><head><meta charset="utf-8">{_DOC_STYLE}</head>
    <body><h1>{brand_name} - Customer Personas</h1>{cards}</body></html>"""


def _render_segments_html(brand_name, segments):
    cards = ""
    for s in segments:
        eval_type = s.get("evaluation_type", "batch")
        criteria = " ".join(f'<span class="tag">{c}</span>' for c in s.get("criteria", []))
        campaigns = ", ".join(s.get("suggested_campaigns", []))
        use_cases = "".join(f"<li>{u}</li>" for u in s.get("use_cases", []))
        cards += f"""<div class="card">
            <span class="tag {eval_type}">{eval_type.upper()}</span>
            <h3>{s.get('name', '')}</h3>
            <p>{s.get('description', '')}</p>
            <p><strong>Estimated Size:</strong> {s.get('estimated_size', 'N/A')}</p>
            <p><strong>Criteria:</strong> {criteria}</p>
            {f"<p><strong>Suggested Campaigns:</strong> {campaigns}</p>" if campaigns else ""}
            {"<h4>Use Cases</h4><ul>" + use_cases + "</ul>" if use_cases else ""}
        </div>"""
    return f"""<html><head><meta charset="utf-8">{_DOC_STYLE}</head>
    <body><h1>{brand_name} - Audience Segments</h1>{cards}</body></html>"""
