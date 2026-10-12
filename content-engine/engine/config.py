"""Environment-driven settings. Reads content-engine/.env when present; on
Cloud Run everything comes from the service's env vars and secrets.

Everything site-specific (base URL, blog path, contact URL, brand terms,
approval, nightly count) lives on the marketing_sites row, not here: one
engine serves every site the business owns.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent.parent
load_dotenv(_HERE / ".env", override=False)


def _prefix(raw: str | None) -> str | None:
    """"/" or "none" means bare PostgREST at the root; unset keeps /rest/v1."""
    if raw is None:
        return None
    return "" if raw.strip() in ("", "/", "none") else raw.strip()


def _env(name: str, default: str = "") -> str:
    value = os.environ.get(name, "")
    return value.strip().strip('"') if value else default


@dataclass
class Settings:
    # The dashboard's PostgREST (trs-api on Cloud Run, Caddy strips /rest/v1).
    supabase_url: str = field(default_factory=lambda: _env("SUPABASE_URL") or _env("NEXT_PUBLIC_SUPABASE_URL"))
    supabase_service_key: str = field(default_factory=lambda: _env("SUPABASE_SERVICE_KEY") or _env("SUPABASE_SERVICE_ROLE_KEY"))
    # None = /rest/v1 (what trs-api serves); "" = bare PostgREST at the root.
    supabase_api_prefix: str | None = field(default_factory=lambda: _prefix(os.environ.get("SUPABASE_API_PREFIX")))
    anthropic_api_key: str = field(default_factory=lambda: _env("ANTHROPIC_API_KEY"))
    openai_api_key: str = field(default_factory=lambda: _env("OPENAI_API_KEY"))
    gemini_api_key: str = field(default_factory=lambda: _env("GEMINI_API_KEY"))
    gemini_model: str = field(default_factory=lambda: _env("ENGINE_GEMINI_MODEL", "gemini-3.8-flash"))
    # Providers in the order they are tried. Anthropic writes; Gemini is the
    # fallback so one provider's bad night does not stop the article.
    provider_order: list[str] = field(default_factory=lambda: [p.strip() for p in (_env("ENGINE_PROVIDER_ORDER", "anthropic,gemini,openai")).split(",") if p.strip()])
    # Strong model carries the judgement-heavy stages (strategy, research,
    # writing, fact checking); the fast model handles editing passes.
    model_strong: str = field(default_factory=lambda: _env("ENGINE_MODEL_STRONG", "claude-opus-5-5"))
    model_fast: str = field(default_factory=lambda: _env("ENGINE_MODEL_FAST", "claude-sonnet-5-5"))
    openai_fallback_model: str = field(default_factory=lambda: _env("ENGINE_OPENAI_FALLBACK_MODEL", "gpt-4o"))
    embed_model: str = field(default_factory=lambda: _env("ENGINE_EMBED_MODEL", "text-embedding-3-small"))
    effort_strong: str = field(default_factory=lambda: _env("ENGINE_EFFORT_STRONG", "high"))
    effort_fast: str = field(default_factory=lambda: _env("ENGINE_EFFORT_FAST", "medium"))
    server_fallbacks: bool = field(default_factory=lambda: _env("ENGINE_SERVER_FALLBACKS", "1") not in ("0", "false"))
    # Upper bound on articles per site per night; each site's own count is
    # on its marketing_sites row.
    nightly_max: int = field(default_factory=lambda: max(1, min(12, int(_env("ENGINE_NIGHTLY_MAX", "4") or "4"))))
    engine_secret: str = field(default_factory=lambda: _env("CONTENT_ENGINE_SECRET"))
    poll_seconds: int = field(default_factory=lambda: int(_env("ENGINE_POLL_SECONDS", "15") or "15"))
    max_stage_attempts: int = field(default_factory=lambda: int(_env("ENGINE_MAX_STAGE_ATTEMPTS", "3") or "3"))
    max_revisions: int = field(default_factory=lambda: int(_env("ENGINE_MAX_REVISIONS", "2") or "2"))
    llm_timeout_seconds: float = field(default_factory=lambda: float(_env("ENGINE_LLM_TIMEOUT", "600") or "600"))
    min_words: int = field(default_factory=lambda: int(_env("ENGINE_MIN_WORDS", "700") or "700"))
    # CLI convenience only: the site a `generate` targets when --site-id is omitted.
    default_site_id: str = field(default_factory=lambda: _env("ENGINE_DEFAULT_SITE_ID"))

    def require_supabase(self) -> None:
        if not self.supabase_url or not self.supabase_service_key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY are required")


def get_settings() -> Settings:
    return Settings()
