import logging

from ai.provider import generate_json
from ai.prompts import ACCOUNT_GENERATION_SYSTEM, ACCOUNT_GENERATION_USER
from utils.helpers import truncate_text, generate_id

logger = logging.getLogger(__name__)


def generate_accounts(brand_name, combined_text, url,
                      campaigns, personas, segments, country="Germany"):
    """Generate B2B account profiles using AI."""
    content = truncate_text(combined_text, 8000)

    camp_text = "\n".join(
        f"- {c.get('name', '?')}: {c.get('summary', '')}" for c in campaigns[:8]
    ) or "No campaigns"

    persona_text = "\n".join(
        f"- {p.get('name', '?')} ({p.get('occupation', '?')})" for p in personas[:10]
    ) or "No personas"

    seg_text = "\n".join(
        f"- {s.get('name', '?')} [{s.get('evaluation_type', 'batch')}]" for s in segments[:12]
    ) or "No segments"

    user_prompt = ACCOUNT_GENERATION_USER.format(
        brand_name=brand_name,
        url=url,
        country=country,
        content=content,
        campaigns=camp_text,
        personas=persona_text,
        segments=seg_text,
    )

    try:
        result = generate_json(ACCOUNT_GENERATION_SYSTEM, user_prompt)
        accounts = result.get("accounts", [])

        for a in accounts:
            if "id" not in a:
                a["id"] = generate_id()
            a.setdefault("company_name", "Unknown Company")
            a.setdefault("industry", "")
            a.setdefault("employee_count", "")
            a.setdefault("annual_revenue", "")
            a.setdefault("hq_location", "")
            a.setdefault("tech_stack", [])
            a.setdefault("pain_points", [])
            a.setdefault("buying_stage", "Consideration")
            a.setdefault("decision_makers", [])
            a.setdefault("target_campaigns", [])
            a.setdefault("target_segments", [])

        return accounts
    except Exception as e:
        logger.error("Account generation failed: %s", e)
        return []
