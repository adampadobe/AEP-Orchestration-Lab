import json
import logging

import config

logger = logging.getLogger(__name__)


def _call_openai(system_prompt, user_prompt):
    from openai import OpenAI
    client = OpenAI(api_key=config.AI_API_KEY)
    response = client.chat.completions.create(
        model=config.AI_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    return response.choices[0].message.content


def _call_anthropic(system_prompt, user_prompt):
    from anthropic import Anthropic
    client = Anthropic(api_key=config.AI_API_KEY)
    message = client.messages.create(
        model=config.AI_MODEL,
        max_tokens=4096,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
        temperature=0.3,
    )
    return message.content[0].text


def _call_gemini(system_prompt, user_prompt):
    """Gemini via the OpenAI-compatible endpoint."""
    from openai import OpenAI
    client = OpenAI(
        api_key=config.AI_API_KEY,
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
    )
    response = client.chat.completions.create(
        model=config.AI_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    return response.choices[0].message.content


def _call_ollama(system_prompt, user_prompt):
    """Ollama via the OpenAI-compatible local API."""
    from openai import OpenAI
    client = OpenAI(
        api_key="ollama",
        base_url=f"{config.OLLAMA_HOST}/v1",
    )
    response = client.chat.completions.create(
        model=config.AI_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
        response_format={"type": "json_object"},
    )
    return response.choices[0].message.content


_PROVIDERS = {
    "openai": _call_openai,
    "anthropic": _call_anthropic,
    "gemini": _call_gemini,
    "ollama": _call_ollama,
}


def generate(system_prompt, user_prompt):
    """
    Unified AI generation interface.
    Calls the configured provider and returns the raw response text.
    """
    provider = config.AI_PROVIDER.lower()
    if provider not in _PROVIDERS:
        raise ValueError(f"Unknown AI provider: {provider}. Choose from: {list(_PROVIDERS.keys())}")

    logger.info("Calling AI provider: %s (model: %s)", provider, config.AI_MODEL)
    raw = _PROVIDERS[provider](system_prompt, user_prompt)
    return raw


def generate_json(system_prompt, user_prompt):
    """
    Call the AI provider and parse the response as JSON.
    Handles markdown-wrapped JSON (```json ... ```) gracefully.
    """
    raw = generate(system_prompt, user_prompt)

    # Strip markdown code fences if present
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove first and last lines (fences)
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        logger.error("Failed to parse AI JSON response: %s\nRaw: %s", e, text[:500])
        raise
