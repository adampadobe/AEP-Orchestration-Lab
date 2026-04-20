import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
PROJECTS_DIR = os.path.join(DATA_DIR, "projects")
DB_PATH = os.path.join(DATA_DIR, "brandscrape.db")

AI_PROVIDER = os.getenv("AI_PROVIDER", "openai")
AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_MODEL = os.getenv("AI_MODEL", "gpt-4o")
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")

MAX_PAGES = int(os.getenv("MAX_PAGES", "30"))
CRAWL_DELAY = float(os.getenv("CRAWL_DELAY", "1.0"))
REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "30"))

DEFAULT_LIMITS = {
    "logo": int(os.getenv("LIMIT_LOGOS", "10")),
    "favicon": int(os.getenv("LIMIT_FAVICONS", "5")),
    "icon": int(os.getenv("LIMIT_ICONS", "20")),
    "banner": int(os.getenv("LIMIT_BANNERS", "10")),
    "product_image": int(os.getenv("LIMIT_PRODUCT_IMAGES", "20")),
    "hero_image": int(os.getenv("LIMIT_HERO_IMAGES", "10")),
    "other": int(os.getenv("LIMIT_OTHER_IMAGES", "30")),
}

ASSET_CATEGORIES = list(DEFAULT_LIMITS.keys())

FLASK_SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "dev-secret-key")
FLASK_DEBUG = os.getenv("FLASK_DEBUG", "true").lower() == "true"

PRIORITY_PATHS = [
    "", "/", "/about", "/about-us", "/products", "/services",
    "/campaigns", "/offers", "/deals", "/press", "/news",
    "/blog", "/media", "/gallery", "/contact", "/shop",
    "/store", "/collections", "/brands", "/our-story",
]

COMMON_SUBDOMAINS = ["www", "shop", "store", "blog", "media", "cdn", "images", "news"]

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)
