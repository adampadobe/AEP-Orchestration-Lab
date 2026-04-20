import logging
import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from utils.helpers import (
    generate_id, is_image_url, is_font_url, make_absolute,
    guess_image_category_from_url, extract_hex_colors, extract_rgb_colors,
)

logger = logging.getLogger(__name__)

# Minimum image URL length to filter out data URIs and tiny paths
MIN_URL_LENGTH = 10
# Skip tiny tracking pixels and spacer images
SKIP_PATTERNS = [
    "1x1", "pixel", "spacer", "blank", "tracking", "beacon",
    "analytics", ".gif?", "transparent",
]


def _should_skip_image(url):
    url_lower = url.lower()
    return any(pat in url_lower for pat in SKIP_PATTERNS)


def _extract_images_from_page(soup, page_url):
    """Extract all image URLs from a page's HTML."""
    images = set()

    # <img> tags: src, data-src, data-lazy-src, srcset
    for img in soup.find_all("img"):
        for attr in ["src", "data-src", "data-lazy-src", "data-original"]:
            val = img.get(attr)
            if val:
                abs_url = make_absolute(val, page_url)
                if abs_url and len(abs_url) > MIN_URL_LENGTH and not _should_skip_image(abs_url):
                    images.add(abs_url)

        srcset = img.get("srcset")
        if srcset:
            for part in srcset.split(","):
                url_part = part.strip().split()[0]
                if url_part:
                    abs_url = make_absolute(url_part, page_url)
                    if abs_url and len(abs_url) > MIN_URL_LENGTH:
                        images.add(abs_url)

    # <source> tags inside <picture>
    for source in soup.find_all("source"):
        srcset = source.get("srcset")
        if srcset:
            for part in srcset.split(","):
                url_part = part.strip().split()[0]
                abs_url = make_absolute(url_part, page_url)
                if abs_url and len(abs_url) > MIN_URL_LENGTH:
                    images.add(abs_url)

    # Open Graph and Twitter images
    for meta in soup.find_all("meta"):
        prop = meta.get("property", "") or meta.get("name", "")
        if prop in ("og:image", "twitter:image", "og:image:secure_url"):
            content = meta.get("content")
            if content:
                abs_url = make_absolute(content, page_url)
                if abs_url:
                    images.add(abs_url)

    # CSS background-image in inline styles
    for tag in soup.find_all(style=True):
        style = tag["style"]
        for match in re.finditer(r'url\(["\']?(.*?)["\']?\)', style):
            img_url = match.group(1)
            abs_url = make_absolute(img_url, page_url)
            if abs_url and is_image_url(abs_url):
                images.add(abs_url)

    # <style> blocks
    for style_tag in soup.find_all("style"):
        if style_tag.string:
            for match in re.finditer(r'url\(["\']?(.*?)["\']?\)', style_tag.string):
                img_url = match.group(1)
                abs_url = make_absolute(img_url, page_url)
                if abs_url and is_image_url(abs_url):
                    images.add(abs_url)

    return images


def _extract_favicons(soup, page_url):
    """Extract favicon and apple-touch-icon URLs."""
    favicons = set()
    for link in soup.find_all("link"):
        rel = " ".join(link.get("rel", []))
        if any(kw in rel.lower() for kw in ["icon", "shortcut", "apple-touch"]):
            href = link.get("href")
            if href:
                abs_url = make_absolute(href, page_url)
                if abs_url:
                    favicons.add(abs_url)
    return favicons


def _extract_fonts(soup, page_url):
    """Extract font information from CSS and link tags."""
    fonts = []
    seen_families = set()

    # Google Fonts / external stylesheet links
    for link in soup.find_all("link", rel="stylesheet"):
        href = link.get("href", "")
        if "fonts.googleapis.com" in href:
            families = re.findall(r"family=([^&:]+)", href)
            for fam in families:
                name = fam.replace("+", " ").split(":")[0]
                if name.lower() not in seen_families:
                    seen_families.add(name.lower())
                    fonts.append({"family": name, "source": "Google Fonts", "url": href})

    # @font-face in <style> blocks
    for style_tag in soup.find_all("style"):
        if not style_tag.string:
            continue
        for match in re.finditer(
            r"@font-face\s*\{[^}]*font-family\s*:\s*['\"]?([^'\";}]+)['\"]?[^}]*\}",
            style_tag.string, re.DOTALL
        ):
            name = match.group(1).strip()
            if name.lower() not in seen_families:
                seen_families.add(name.lower())
                url_match = re.search(r"url\(['\"]?(.*?)['\"]?\)", match.group(0))
                font_url = ""
                if url_match:
                    font_url = make_absolute(url_match.group(1), page_url) or ""
                fonts.append({"family": name, "source": "self-hosted", "url": font_url})

    # <link> to font files
    for link in soup.find_all("link"):
        href = link.get("href", "")
        if is_font_url(href):
            abs_url = make_absolute(href, page_url) or href
            name = href.split("/")[-1].split(".")[0].replace("-", " ").title()
            if name.lower() not in seen_families:
                seen_families.add(name.lower())
                fonts.append({"family": name, "source": "self-hosted", "url": abs_url})

    return fonts


def _extract_colors(soup, full_html):
    """Extract brand colors from meta tags, CSS, and inline styles."""
    colors = set()

    # <meta name="theme-color">
    theme_meta = soup.find("meta", attrs={"name": "theme-color"})
    if theme_meta and theme_meta.get("content"):
        val = theme_meta["content"].strip()
        if val.startswith("#"):
            colors.add(val.lower())

    # <meta name="msapplication-TileColor">
    tile_meta = soup.find("meta", attrs={"name": "msapplication-TileColor"})
    if tile_meta and tile_meta.get("content"):
        val = tile_meta["content"].strip()
        if val.startswith("#"):
            colors.add(val.lower())

    # Extract from style blocks and inline styles
    style_text = ""
    for style_tag in soup.find_all("style"):
        if style_tag.string:
            style_text += style_tag.string + "\n"
    for tag in soup.find_all(style=True):
        style_text += tag["style"] + "\n"

    hex_colors = extract_hex_colors(style_text)
    rgb_colors = extract_rgb_colors(style_text)
    colors.update(c.lower() for c in hex_colors)
    colors.update(c.lower() for c in rgb_colors)

    # Filter out very common non-brand colors
    noise = {"#ffffff", "#fff", "#000000", "#000", "#333333", "#333",
             "#666666", "#666", "#999999", "#999", "#cccccc", "#ccc",
             "#f5f5f5", "#eeeeee", "#eee", "#e5e5e5", "#d5d5d5",
             "#f0f0f0", "#fafafa", "#f8f8f8", "#e0e0e0", "#c0c0c0",
             "#808080", "#a0a0a0", "#b0b0b0", "#d0d0d0"}
    colors -= noise

    return [{"hex": c, "source": "css"} for c in sorted(colors)]


def extract_assets(pages):
    """
    Process all crawled pages and extract images, fonts, and colors.
    Returns deduplicated results.
    """
    all_images = {}  # url -> asset dict
    all_fonts = []
    all_colors = []
    seen_font_families = set()

    for page in pages:
        html = page.get("html", "")
        page_url = page.get("url", "")
        if not html:
            continue

        soup = BeautifulSoup(html, "lxml")

        # Images
        image_urls = _extract_images_from_page(soup, page_url)
        favicon_urls = _extract_favicons(soup, page_url)

        for img_url in image_urls:
            if img_url not in all_images:
                category = guess_image_category_from_url(img_url)
                all_images[img_url] = {
                    "id": generate_id(),
                    "url": img_url,
                    "category": category,
                    "source_page": page_url,
                }

        for fav_url in favicon_urls:
            if fav_url not in all_images:
                all_images[fav_url] = {
                    "id": generate_id(),
                    "url": fav_url,
                    "category": "favicon",
                    "source_page": page_url,
                }

        # Fonts (deduplicate by family)
        page_fonts = _extract_fonts(soup, page_url)
        for f in page_fonts:
            if f["family"].lower() not in seen_font_families:
                seen_font_families.add(f["family"].lower())
                all_fonts.append(f)

        # Colors
        page_colors = _extract_colors(soup, html)
        for c in page_colors:
            all_colors.append(c)

    # Deduplicate colors
    seen_hex = set()
    unique_colors = []
    for c in all_colors:
        if c["hex"] not in seen_hex:
            seen_hex.add(c["hex"])
            unique_colors.append(c)

    logger.info("Extracted %d images, %d fonts, %d colors", len(all_images), len(all_fonts), len(unique_colors))

    return {
        "assets": list(all_images.values()),
        "fonts": all_fonts,
        "colors": unique_colors,
    }
