import io
import logging
import os
from collections import Counter
from urllib.parse import urlparse

import requests
from PIL import Image

import config
from utils.db import save_asset
from utils.helpers import sanitize_filename

logger = logging.getLogger(__name__)


def _get_extension(url, content_type=""):
    """Determine file extension from URL or content-type."""
    path = urlparse(url).path.lower()
    for ext in [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico", ".bmp"]:
        if path.endswith(ext):
            return ext

    ct_map = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "image/svg+xml": ".svg",
        "image/x-icon": ".ico",
        "image/bmp": ".bmp",
    }
    for ct, ext in ct_map.items():
        if ct in content_type:
            return ext

    return ".jpg"


def _download_image(url):
    """Download a single image. Returns (bytes, content_type) or (None, None)."""
    try:
        resp = requests.get(url, timeout=config.REQUEST_TIMEOUT,
                            headers={"User-Agent": config.USER_AGENT}, stream=True)
        resp.raise_for_status()
        content_type = resp.headers.get("Content-Type", "")
        if "image" not in content_type and "svg" not in content_type and "icon" not in content_type:
            return None, None
        data = resp.content
        if len(data) < 100:
            return None, None
        return data, content_type
    except Exception as e:
        logger.debug("Failed to download %s: %s", url, e)
        return None, None


def _get_image_dimensions(data, ext):
    """Get image width and height using Pillow."""
    if ext == ".svg":
        return None, None
    try:
        img = Image.open(io.BytesIO(data))
        return img.size  # (width, height)
    except Exception:
        return None, None


def download_assets(project_id, assets):
    """
    Download assets to the local project directory, respecting per-category limits.
    Saves records to the database.
    """
    project_dir = os.path.join(config.PROJECTS_DIR, project_id)

    # Count per category and apply limits
    category_counts = Counter()
    limits = dict(config.DEFAULT_LIMITS)

    for asset in assets:
        cat = asset.get("category", "other")
        if cat not in limits:
            cat = "other"

        limit = limits.get(cat, 30)
        if category_counts[cat] >= limit:
            continue

        url = asset["url"]
        data, content_type = _download_image(url)
        if not data:
            save_asset(
                asset_id=asset["id"],
                project_id=project_id,
                category=cat,
                original_url=url,
                source_page=asset.get("source_page", ""),
            )
            continue

        ext = _get_extension(url, content_type)
        width, height = _get_image_dimensions(data, ext)

        # Build filename
        filename = sanitize_filename(urlparse(url).path.split("/")[-1] or f"image_{asset['id']}")
        if not filename.lower().endswith(ext):
            filename = f"{filename}{ext}"

        cat_dir = os.path.join(project_dir, cat)
        os.makedirs(cat_dir, exist_ok=True)
        filepath = os.path.join(cat_dir, filename)

        # Avoid filename collisions
        counter = 1
        base, extension = os.path.splitext(filepath)
        while os.path.exists(filepath):
            filepath = f"{base}_{counter}{extension}"
            counter += 1

        with open(filepath, "wb") as f:
            f.write(data)

        # Store path relative to project dir
        rel_path = os.path.relpath(filepath, config.PROJECTS_DIR)

        save_asset(
            asset_id=asset["id"],
            project_id=project_id,
            category=cat,
            original_url=url,
            local_path=rel_path,
            fmt=ext.lstrip("."),
            width=width,
            height=height,
            file_size=len(data),
            source_page=asset.get("source_page", ""),
        )
        category_counts[cat] += 1

    logger.info("Downloaded assets for project %s: %s", project_id, dict(category_counts))
