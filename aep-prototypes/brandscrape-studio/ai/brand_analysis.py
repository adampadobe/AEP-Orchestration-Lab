import logging

from ai.provider import generate_json
from ai.prompts import BRAND_ANALYSIS_SYSTEM, BRAND_ANALYSIS_USER
from utils.helpers import truncate_text

logger = logging.getLogger(__name__)

FALLBACK_GUIDELINES = {
    "_is_fallback": True,
    "about": "Brand information could not be fully analyzed.",
    "tone_of_voice": [
        {"rule": "Be professional and approachable", "example": "We're here to help you succeed."},
        {"rule": "Use clear, concise language", "example": "Simple words over jargon."},
    ],
    "brand_values": [
        {"value": "Quality", "description": "Commitment to excellence in all offerings."},
        {"value": "Innovation", "description": "Continuously improving to meet customer needs."},
    ],
    "editorial_guidelines": [
        {"rule": "Write in active voice", "example": "We deliver results (not: Results are delivered by us)."},
    ],
    "image_guidelines": [
        {"rule": "Use high-quality, well-lit photography", "example": ""},
    ],
    "channel_guidelines": [
        {
            "channel": "Email",
            "subject_line": "Discover what's new",
            "preheader": "Fresh updates just for you",
            "headline": "What's New This Season",
            "body": "Check out our latest offerings designed with you in mind.",
            "cta": "Shop Now",
        }
    ],
}


def analyze_brand(brand_name, combined_text, url):
    """Generate brand guidelines using AI analysis of website content."""
    content = truncate_text(combined_text, 15000)

    user_prompt = BRAND_ANALYSIS_USER.format(
        brand_name=brand_name,
        url=url,
        content=content,
    )

    try:
        result = generate_json(BRAND_ANALYSIS_SYSTEM, user_prompt)
        # Validate the expected structure
        if not isinstance(result.get("tone_of_voice"), list):
            raise ValueError("Missing tone_of_voice in AI response")
        return result
    except Exception as e:
        logger.error("Brand analysis failed, using fallback: %s", e)
        return FALLBACK_GUIDELINES
