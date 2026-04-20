import logging
import re
import time
import xml.etree.ElementTree as ET
from collections import deque
from urllib.parse import urlparse, urljoin

import requests
from bs4 import BeautifulSoup

import config
from utils.helpers import normalize_url, get_domain, get_base_domain, is_same_domain, make_absolute

logger = logging.getLogger(__name__)

_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": config.USER_AGENT})


def _fetch(url, timeout=None):
    """Fetch a URL with requests. Returns (html, status_code) or (None, 0) on failure."""
    timeout = timeout or config.REQUEST_TIMEOUT
    try:
        resp = _SESSION.get(url, timeout=timeout, allow_redirects=True)
        resp.raise_for_status()
        return resp.text, resp.status_code
    except Exception as e:
        logger.debug("Failed to fetch %s: %s", url, e)
        return None, 0


def _fetch_with_playwright(url):
    """Fallback: fetch a JS-heavy page using Playwright."""
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(user_agent=config.USER_AGENT)
            page.goto(url, wait_until="networkidle", timeout=config.REQUEST_TIMEOUT * 1000)
            html = page.content()
            browser.close()
            return html
    except Exception as e:
        logger.debug("Playwright failed for %s: %s", url, e)
        return None


def _extract_brand_name(html, url):
    """Try to extract the brand name from the page."""
    soup = BeautifulSoup(html, "lxml")

    og_site = soup.find("meta", property="og:site_name")
    if og_site and og_site.get("content"):
        return og_site["content"].strip()

    title_tag = soup.find("title")
    if title_tag and title_tag.string:
        title = title_tag.string.strip()
        for sep in [" | ", " - ", " – ", " — ", " : ", " · "]:
            if sep in title:
                parts = title.split(sep)
                return min(parts, key=len).strip() or parts[0].strip()
        return title

    domain = get_domain(url)
    name = domain.replace("www.", "").split(".")[0]
    return name.capitalize()


def _parse_sitemap(url):
    """Try to discover URLs from sitemap.xml."""
    base = urlparse(url)
    sitemap_urls_to_try = [
        f"{base.scheme}://{base.netloc}/sitemap.xml",
        f"{base.scheme}://{base.netloc}/sitemap_index.xml",
    ]

    robots_url = f"{base.scheme}://{base.netloc}/robots.txt"
    robots_html, _ = _fetch(robots_url, timeout=10)
    if robots_html:
        for line in robots_html.splitlines():
            if line.lower().startswith("sitemap:"):
                sm_url = line.split(":", 1)[1].strip()
                if sm_url not in sitemap_urls_to_try:
                    sitemap_urls_to_try.insert(0, sm_url)

    discovered = set()
    for sm_url in sitemap_urls_to_try:
        xml_text, status = _fetch(sm_url, timeout=10)
        if not xml_text or status != 200:
            continue
        try:
            root = ET.fromstring(xml_text)
            ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
            for loc in root.findall(".//sm:loc", ns):
                if loc.text:
                    discovered.add(loc.text.strip())
            for loc in root.findall(".//loc"):
                if loc.text:
                    discovered.add(loc.text.strip())
        except ET.ParseError:
            continue
        if len(discovered) > 500:
            break

    return discovered


def _discover_subdomains(base_url):
    """Probe common subdomains and return those that respond."""
    base_domain = get_base_domain(base_url)
    scheme = urlparse(base_url).scheme
    live = set()
    for sub in config.COMMON_SUBDOMAINS:
        candidate = f"{scheme}://{sub}.{base_domain}"
        try:
            resp = _SESSION.head(candidate, timeout=5, allow_redirects=True)
            if resp.status_code < 400:
                live.add(candidate)
        except Exception:
            continue
    return live


def _extract_links(html, page_url, base_url):
    """Extract all internal links from a page."""
    soup = BeautifulSoup(html, "lxml")
    links = set()
    for a_tag in soup.find_all("a", href=True):
        href = make_absolute(a_tag["href"], page_url)
        if href and is_same_domain(href, base_url):
            links.add(normalize_url(href))
    return links


def _extract_page_text(html):
    """Extract readable text content from HTML."""
    soup = BeautifulSoup(html, "lxml")
    for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
        tag.decompose()
    text = soup.get_text(separator="\n", strip=True)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def _prioritize_urls(urls, base_url):
    """Sort URLs so key pages come first."""
    base_parsed = urlparse(base_url)
    priority_keywords = set(config.PRIORITY_PATHS)

    def score(u):
        parsed = urlparse(u)
        path = parsed.path.rstrip("/").lower()
        if path in priority_keywords or path == "":
            return 0
        for kw in priority_keywords:
            if kw and kw in path:
                return 1
        depth = path.count("/")
        return 2 + depth

    return sorted(urls, key=score)


def crawl_website(url):
    """
    Main crawl entry point. Discovers pages via sitemap and BFS,
    scrapes content, returns structured result.
    """
    url = normalize_url(url)
    logger.info("Starting crawl of %s", url)

    # Step 1: Discover URLs from sitemap
    sitemap_urls = _parse_sitemap(url)
    logger.info("Sitemap discovered %d URLs", len(sitemap_urls))

    # Step 2: Discover subdomains
    subdomain_roots = _discover_subdomains(url)
    logger.info("Found %d live subdomains", len(subdomain_roots))

    # Seed the BFS queue
    all_discovered = set()
    all_discovered.add(normalize_url(url))
    for su in sitemap_urls:
        if is_same_domain(su, url):
            all_discovered.add(normalize_url(su))
    for sr in subdomain_roots:
        all_discovered.add(normalize_url(sr))

    # Step 3: BFS crawl
    queue = deque(_prioritize_urls(all_discovered, url))
    visited = set()
    pages = []
    brand_name = ""

    while queue and len(pages) < config.MAX_PAGES:
        current_url = queue.popleft()
        if current_url in visited:
            continue
        visited.add(current_url)

        html, status = _fetch(current_url)
        if not html:
            html = _fetch_with_playwright(current_url)
            if not html:
                continue

        # On first page, determine if content is thin -> re-fetch with Playwright
        text = _extract_page_text(html)
        if len(text) < 200 and len(pages) == 0:
            pw_html = _fetch_with_playwright(current_url)
            if pw_html and len(_extract_page_text(pw_html)) > len(text):
                html = pw_html
                text = _extract_page_text(html)

        if not brand_name:
            brand_name = _extract_brand_name(html, url)

        links = _extract_links(html, current_url, url)
        for link in links:
            if link not in visited:
                all_discovered.add(link)

        pages.append({
            "url": current_url,
            "html": html,
            "text": text,
            "links": list(links),
        })

        # Add newly discovered links to the queue (prioritized)
        new_links = [l for l in links if l not in visited and l not in set(queue)]
        for nl in _prioritize_urls(new_links, url):
            queue.append(nl)

        if len(pages) < config.MAX_PAGES:
            time.sleep(config.CRAWL_DELAY)

    logger.info("Crawl complete: %d pages scraped, %d total URLs discovered", len(pages), len(all_discovered))

    return {
        "brand_name": brand_name or get_domain(url).replace("www.", "").split(".")[0].capitalize(),
        "pages": pages,
        "total_urls": len(all_discovered),
    }
