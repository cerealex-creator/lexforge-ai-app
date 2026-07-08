#!/usr/bin/env python3
"""Проверка LLM-ключа из .env (без вывода полного ключа)."""

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from apps.api.config import settings  # noqa: E402


def fingerprint(key: str) -> str:
    if len(key) < 12:
        return f"(слишком короткий, {len(key)} симв.)"
    return f"{key[:8]}…{key[-4:]} (длина {len(key)})"


def request(method: str, url: str, key: str, body: dict | None = None) -> tuple[int, str]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {key}")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, resp.read(300).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read(300).decode("utf-8", "replace")
    except Exception as e:
        return 0, str(e)


def main() -> int:
    env_path = ROOT / ".env"
    if env_path.exists():
        import datetime

        mtime = datetime.datetime.fromtimestamp(env_path.stat().st_mtime)
        print(f".env на диске: изменён {mtime:%Y-%m-%d %H:%M:%S}")

    provider = settings.llm_provider
    if provider == "openai" and settings.openai_api_key:
        key = settings.openai_api_key
        base = settings.openai_base_url.rstrip("/")
        model = settings.openai_fallback_model
        label = "OPENAI_API_KEY"
    else:
        key = settings.routerai_api_key
        base = settings.routerai_base_url.rstrip("/")
        model = settings.routerai_model
        label = "ROUTERAI_API_KEY"

    print(f"Провайдер: {provider}")
    print(f"{label}: {fingerprint(key)}")

    if not key:
        print("Ошибка: ключ пустой. Заполните .env и сохраните файл (Cmd+S).")
        return 1

    keys_code, _ = request("GET", f"{base}/keys", key)
    chat_code, chat_body = request(
        "POST",
        f"{base}/chat/completions",
        key,
        {
            "model": model,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 5,
        },
    )

    if keys_code == 200 and chat_code == 401:
        print()
        print("Похоже, в .env указан МАСТЕР-КЛЮЧ (работает /keys, не работает /chat/completions).")
        print("Нужен ключ из: Настройки → API-ключи (не «Мастер-ключи»).")
        return 1

    if chat_code == 200:
        print(f"OK: LLM отвечает (модель {model})")
        return 0

    print(f"Ошибка LLM (HTTP {chat_code}): {chat_body[:200]}")
    print()
    print("Если вы только что вставили ключ в Cursor — нажмите Cmd+S (Сохранить)")
    print("и снова выполните make test-llm. Отпечаток ключа должен измениться.")
    print()
    print("Проверьте:")
    print("  1. Файл .env сохранён на диск (Cmd+S в редакторе)")
    print("  2. Ключ скопирован целиком, без пробелов и кавычек")
    print("  3. Раздел «Настройки → API-ключи», не «Мастер-ключи»")
    print("  4. Ключ активен в личном кабинете RouterAI")
    print("  5. После смены ключа: make api-stop && make api")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
