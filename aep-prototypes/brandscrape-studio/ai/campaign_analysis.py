import logging

from ai.provider import generate_json
from ai.prompts import CAMPAIGN_ANALYSIS_SYSTEM, CAMPAIGN_ANALYSIS_USER
from utils.helpers import truncate_text, generate_id

logger = logging.getLogger(__name__)


def analyze_campaigns(brand_name, combined_text, url, links):
    """Detect active campaigns and suggest demo campaigns using AI."""
    content = truncate_text(combined_text, 12000)
    links_text = "\n".join(links[:50]) if links else "No links available"

    user_prompt = CAMPAIGN_ANALYSIS_USER.format(
        brand_name=brand_name,
        url=url,
        content=content,
        links=links_text,
    )

    try:
        result = generate_json(CAMPAIGN_ANALYSIS_SYSTEM, user_prompt)
        campaigns = result.get("campaigns", [])

        for c in campaigns:
            if "id" not in c:
                c["id"] = generate_id()
            c.setdefault("name", "Unnamed Campaign")
            c.setdefault("type", "Core Brand Platform")
            c.setdefault("summary", "")
            c.setdefault("headlines", [])
            c.setdefault("cta", "")
            c.setdefault("time_context", "")
            c.setdefault("season", "")
            c.setdefault("channel", "")
            c.setdefault("images", [])
            c.setdefault("source_urls", [])
            c.setdefault("is_recommendation", False)
            c.setdefault("target_segments", [])

        return campaigns
    except Exception as e:
        logger.error("Campaign analysis failed: %s", e)
        return []
