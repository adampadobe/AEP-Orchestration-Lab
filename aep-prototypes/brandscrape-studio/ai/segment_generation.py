import json
import logging

from ai.provider import generate_json
from ai.prompts import SEGMENT_GENERATION_SYSTEM, SEGMENT_GENERATION_USER
from utils.helpers import truncate_text, generate_id

logger = logging.getLogger(__name__)


def generate_segments(brand_name, combined_text, campaigns, personas):
    """Generate Adobe Real-Time CDP audience segments using AI."""
    content = truncate_text(combined_text, 10000)

    campaign_summaries = []
    for c in campaigns[:8]:
        campaign_summaries.append(f"- {c.get('name', 'Unknown')}: {c.get('summary', '')}")
    campaigns_text = "\n".join(campaign_summaries) if campaign_summaries else "No campaigns detected"

    persona_summaries = []
    for p in personas[:5]:
        persona_summaries.append(
            f"- {p.get('name', 'Unknown')} (age {p.get('age', '?')}, {p.get('occupation', '?')}): "
            f"{p.get('bio', '')}"
        )
    personas_text = "\n".join(persona_summaries) if persona_summaries else "No personas generated"

    user_prompt = SEGMENT_GENERATION_USER.format(
        brand_name=brand_name,
        content=content,
        campaigns=campaigns_text,
        personas=personas_text,
    )

    try:
        result = generate_json(SEGMENT_GENERATION_SYSTEM, user_prompt)
        segments = result.get("segments", [])

        for s in segments:
            if "id" not in s:
                s["id"] = generate_id()
            s.setdefault("name", "Unnamed Segment")
            s.setdefault("description", "")
            s.setdefault("evaluation_type", "batch")
            s.setdefault("criteria", [])
            s.setdefault("estimated_size", "")
            s.setdefault("suggested_campaigns", [])
            s.setdefault("use_cases", [])

        return segments
    except Exception as e:
        logger.error("Segment generation failed: %s", e)
        return []
