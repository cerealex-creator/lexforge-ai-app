"""RouterAI / OpenAI-compatible LLM client."""

import json
import re
from openai import AsyncOpenAI, AuthenticationError

from apps.api.config import settings


def _client() -> AsyncOpenAI:
    if settings.llm_provider == "openai" and settings.openai_api_key:
        return AsyncOpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url)
    return AsyncOpenAI(api_key=settings.routerai_api_key, base_url=settings.routerai_base_url)


def _model() -> str:
    if settings.llm_provider == "openai" and settings.openai_api_key:
        return settings.openai_fallback_model
    return settings.routerai_model


def _auth_hint() -> str:
    if settings.llm_provider == "openai":
        return "Проверьте OPENAI_API_KEY в .env и перезапустите API (make api)."
    return (
        "Неверный или просроченный ROUTERAI_API_KEY. "
        "Создайте новый ключ в личном кабинете RouterAI: Настройки → API-ключи "
        "(не мастер-ключ), вставьте в .env и выполните make api."
    )


def _extract_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


async def chat_json(system: str, user: str) -> dict:
    client = _client()
    try:
        response = await client.chat.completions.create(
            model=_model(),
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )
    except AuthenticationError as e:
        raise ValueError(_auth_hint()) from e
    content = response.choices[0].message.content or "{}"
    return _extract_json(content)
