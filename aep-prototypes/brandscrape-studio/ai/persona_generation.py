import logging

from ai.provider import generate_json
from ai.prompts import PERSONA_GENERATION_SYSTEM, PERSONA_GENERATION_USER, PERSONA_GENERATION_B2B_EXTRA
from utils.helpers import truncate_text, generate_id

logger = logging.getLogger(__name__)


def generate_personas(brand_name, combined_text, url, campaigns,
                      country="Germany", business_type="b2c"):
    """Generate customer personas using AI analysis of brand content and campaigns."""
    content = truncate_text(combined_text, 10000)

    campaign_summaries = []
    for c in campaigns[:8]:
        campaign_summaries.append(f"- {c.get('name', 'Unknown')}: {c.get('summary', '')}")
    campaigns_text = "\n".join(campaign_summaries) if campaign_summaries else "No campaigns detected"

    b2b_instructions = PERSONA_GENERATION_B2B_EXTRA if business_type == "b2b" else ""

    system_prompt = PERSONA_GENERATION_SYSTEM.format(
        country=country,
        b2b_instructions=b2b_instructions,
    )

    user_prompt = PERSONA_GENERATION_USER.format(
        brand_name=brand_name,
        url=url,
        content=content,
        campaigns=campaigns_text,
        country=country,
        business_type=business_type.upper(),
    )

    try:
        result = generate_json(system_prompt, user_prompt)
        personas = result.get("personas", [])

        for p in personas:
            if "id" not in p:
                p["id"] = generate_id()
            p.setdefault("name", "Unknown")
            p.setdefault("age", 30)
            p.setdefault("location", "")
            p.setdefault("occupation", "")
            p.setdefault("income_range", "")
            p.setdefault("bio", "")
            p.setdefault("goals", [])
            p.setdefault("pain_points", [])
            p.setdefault("behaviors", [])
            p.setdefault("preferred_channels", [])
            p.setdefault("brand_affinity", "")
            p.setdefault("suggested_segments", [])

        return personas
    except Exception as e:
        logger.error("Persona generation failed: %s", e)
        return []
