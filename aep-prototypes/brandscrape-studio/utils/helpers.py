import re
import uuid
from urllib.parse import urlparse, urljoin, urlunparse


def generate_id():
    return uuid.uuid4().hex[:12]


def normalize_url(url):
    """Ensure URL has a scheme and normalize it."""
    url = url.strip()
    if not url:
        return ""
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    parsed = urlparse(url)
    normalized = urlunparse((
        parsed.scheme,
        parsed.netloc.lower().rstrip("/"),
        parsed.path.rstrip("/") or "/",
        parsed.params,
        parsed.query,
        "",
    ))
    return normalized


def get_domain(url):
    """Extract the base domain from a URL."""
    parsed = urlparse(url)
    return parsed.netloc.lower()


def get_base_domain(url):
    """Extract the registrable domain (e.g., 'example.com' from 'shop.example.com')."""
    domain = get_domain(url)
    parts = domain.split(".")
    if len(parts) >= 2:
        return ".".join(parts[-2:])
    return domain


def is_same_domain(url, base_url):
    """Check if a URL belongs to the same base domain."""
    return get_base_domain(url) == get_base_domain(base_url)


def make_absolute(href, page_url):
    """Convert a relative URL to absolute."""
    if not href or href.startswith(("javascript:", "mailto:", "tel:", "data:", "#")):
        return None
    return urljoin(page_url, href)


def is_image_url(url):
    """Check if a URL points to an image based on extension."""
    image_extensions = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico", ".bmp", ".tiff"}
    parsed = urlparse(url.lower())
    path = parsed.path
    return any(path.endswith(ext) for ext in image_extensions)


def is_font_url(url):
    """Check if a URL points to a font file."""
    font_extensions = {".woff", ".woff2", ".ttf", ".otf", ".eot"}
    parsed = urlparse(url.lower())
    path = parsed.path
    return any(path.endswith(ext) for ext in font_extensions)


def guess_image_category_from_url(url):
    """Guess image category from URL patterns (heuristic, before AI classification)."""
    url_lower = url.lower()
    if any(kw in url_lower for kw in ["logo", "brand-logo", "site-logo"]):
        return "logo"
    if any(kw in url_lower for kw in ["favicon", "apple-touch-icon", "icon-"]):
        return "favicon"
    if any(kw in url_lower for kw in ["/icon", "sprite", "symbol"]):
        return "icon"
    if any(kw in url_lower for kw in ["banner", "hero", "slider", "carousel", "jumbotron"]):
        return "banner"
    if any(kw in url_lower for kw in ["product", "item", "sku", "catalog"]):
        return "product_image"
    return "other"


def sanitize_filename(name):
    """Remove or replace characters that are invalid in filenames."""
    name = re.sub(r'[<>:"/\\|?*]', "_", name)
    name = re.sub(r"\s+", "_", name)
    return name[:100]


def truncate_text(text, max_chars):
    """Truncate text to max_chars, trying to break at a sentence boundary."""
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars]
    last_period = truncated.rfind(".")
    if last_period > max_chars * 0.8:
        return truncated[: last_period + 1]
    return truncated


def extract_hex_colors(text):
    """Extract hex color codes from text."""
    pattern = r"#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b"
    return list(set(re.findall(pattern, text)))


def extract_rgb_colors(text):
    """Extract rgb/rgba color values from text and convert to hex."""
    pattern = r"rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})"
    colors = set()
    for match in re.finditer(pattern, text):
        r, g, b = int(match.group(1)), int(match.group(2)), int(match.group(3))
        if all(0 <= c <= 255 for c in (r, g, b)):
            colors.add(f"#{r:02x}{g:02x}{b:02x}")
    return list(colors)
