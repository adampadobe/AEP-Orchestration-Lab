import logging

from ai.provider import generate_json
from ai.prompts import IMAGE_CLASSIFICATION_SYSTEM, IMAGE_CLASSIFICATION_USER

logger = logging.getLogger(__name__)

BATCH_SIZE = 40


def classify_images(assets, brand_name, url):
    """
    Use AI to classify images into categories.
    Falls back to the URL-based heuristic category if AI fails.
    Processes in batches to stay within token limits.
    """
    if not assets:
        return assets

    # Split into batches
    batches = [assets[i:i + BATCH_SIZE] for i in range(0, len(assets), BATCH_SIZE)]
    url_to_category = {}

    for batch in batches:
        image_urls_text = "\n".join(a["url"] for a in batch)
        user_prompt = IMAGE_CLASSIFICATION_USER.format(
            brand_name=brand_name,
            url=url,
            image_urls=image_urls_text,
        )

        try:
            result = generate_json(IMAGE_CLASSIFICATION_SYSTEM, user_prompt)
            classifications = result.get("classifications", [])
            for c in classifications:
                img_url = c.get("url", "")
                category = c.get("category", "other")
                if category in ("logo", "favicon", "icon", "banner", "product_image", "hero_image", "other"):
                    url_to_category[img_url] = category
        except Exception as e:
            logger.warning("AI classification failed for batch, keeping heuristic categories: %s", e)

    # Apply AI classifications, keeping heuristic as fallback
    for asset in assets:
        if asset["url"] in url_to_category:
            asset["category"] = url_to_category[asset["url"]]

    return assets
