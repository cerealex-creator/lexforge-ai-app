import sys
from pathlib import Path

# Add project root to path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ROOT / ".env"), env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    app_secret_key: str = "dev-secret"
    app_debug: bool = True
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    web_url: str = "http://localhost:3000"
    # Comma-separated extra origins for production (e.g. https://lexforge.example.com,http://85.239.40.180)
    cors_origins: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        origins = [self.web_url, "http://localhost:3000", "http://127.0.0.1:3000"]
        for part in self.cors_origins.split(","):
            value = part.strip()
            if value:
                origins.append(value)
        # Preserve order, drop duplicates
        return list(dict.fromkeys(origins))

    database_url: str = "postgresql+asyncpg://lexforge:lexforge@localhost:5432/lexforge"
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret_key: str = "jwt-dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 1440

    routerai_api_key: str = ""
    routerai_base_url: str = "https://routerai.ru/api/v1"
    routerai_model: str = "qwen/qwen3-235b-a22b-instruct-2507"

    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_fallback_model: str = "gpt-4o-mini"
    llm_provider: str = "routerai"

    # Embeddings for pgvector RAG. RouterAI may not support OpenAI embedding model names.
    embedding_model: str = "text-embedding-3-small"
    embedding_dimension: int = 1024

    upload_dir: str = "./uploads"
    max_upload_size_mb: int = 50

    seed_admin_email: str = "admin@lexforge.ru"
    seed_admin_password: str = "admin123"

    @property
    def upload_path(self) -> Path:
        p = Path(self.upload_dir)
        if not p.is_absolute():
            p = ROOT / p
        return p.resolve()


settings = Settings()
