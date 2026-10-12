"""One structured-output call, with retries and a provider fallback.

Anthropic is primary (adaptive thinking, JSON-schema constrained output,
server-side refusal fallback). OpenAI is the fallback only when Anthropic
fails after its own retries — the nightly pipeline this replaces had no
fallback at all and died whenever one provider had a bad night.
"""
from __future__ import annotations

import json
import time
from typing import Any, TypeVar

import anthropic
from pydantic import BaseModel, ValidationError

from .config import Settings
from .models import Usage

T = TypeVar("T", bound=BaseModel)

# USD per million tokens (input, output). Unknown models fall back to the
# strong-tier price so cost is never silently under-reported.
PRICING: dict[str, tuple[float, float]] = {
    "claude-opus-5": (5.0, 25.0),
    "claude-sonnet-5": (2.0, 10.0),
    # 5.5 list prices not confirmed at the time of writing; carried over from the 5 tier.
    "claude-opus-5-5": (5.0, 25.0),
    "claude-sonnet-5-5": (2.0, 10.0),
    "claude-haiku-4-5": (1.0, 5.0),
    "claude-opus-4-8": (5.0, 25.0),
    "gpt-4o": (2.5, 10.0),
    "gpt-4o-mini": (0.15, 0.6),
    "gemini-2.5-pro": (1.25, 10.0),
    "gemini-3.1-pro-preview": (2.0, 12.0),
    "gemini-2.5-flash": (0.30, 2.5),
    "gemini-3.5-flash": (0.30, 2.5),
    "gemini-3.8-flash": (0.75, 3.75),
    "gemini-flash-latest": (0.30, 2.5),
}


def estimate_cost(model: str, tokens_in: int, tokens_out: int) -> float:
    price_in, price_out = PRICING.get(model, (5.0, 25.0))
    return round((tokens_in * price_in + tokens_out * price_out) / 1_000_000, 6)


class LLMError(RuntimeError):
    pass


def _inline_refs(schema: dict[str, Any]) -> dict[str, Any]:
    """Structured outputs want a self-contained schema: inline $defs, forbid
    extra keys, and require every property (defaults on the pydantic side
    make that harmless)."""
    defs = schema.get("$defs", {})

    def walk(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                name = node["$ref"].split("/")[-1]
                return walk(dict(defs[name]))
            out = {k: walk(v) for k, v in node.items() if k not in ("$defs", "title", "default")}
            if out.get("type") == "object" and "properties" in out:
                out["additionalProperties"] = False
                out["required"] = list(out["properties"].keys())
            return out
        if isinstance(node, list):
            return [walk(v) for v in node]
        return node

    return walk(schema)


def strict_schema(model: type[BaseModel]) -> dict[str, Any]:
    return _inline_refs(model.model_json_schema())


class LLM:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._anthropic: anthropic.Anthropic | None = None
        self._openai: Any = None
        if settings.anthropic_api_key:
            self._anthropic = anthropic.Anthropic(
                api_key=settings.anthropic_api_key,
                timeout=settings.llm_timeout_seconds,
                max_retries=2,
            )
        if settings.openai_api_key:
            try:
                from openai import OpenAI

                self._openai = OpenAI(api_key=settings.openai_api_key, timeout=settings.llm_timeout_seconds, max_retries=2)
            except Exception:  # pragma: no cover - optional dependency path
                self._openai = None
        self._gemini: Any = None
        if settings.gemini_api_key:
            try:
                from google import genai

                self._gemini = genai.Client(api_key=settings.gemini_api_key)
            except Exception:  # pragma: no cover - optional dependency path
                self._gemini = None
        self.provider_order = [p for p in settings.provider_order if p in ("anthropic", "openai", "gemini")] or ["anthropic", "openai", "gemini"]

    # --- public -----------------------------------------------------------

    def structured(
        self,
        *,
        system: str,
        user: str,
        output: type[T],
        model: str,
        effort: str = "high",
        max_tokens: int = 16000,
        label: str = "",
    ) -> tuple[T, Usage]:
        """Return a validated `output` instance plus usage. Tries Anthropic
        (2 attempts), then OpenAI if configured."""
        schema = strict_schema(output)
        errors: list[str] = []
        attempts = 0
        started = time.time()

        def finish(text: str, provider: str, used_model: str, tokens_in: int, tokens_out: int) -> tuple[T, Usage]:
            parsed = output.model_validate_json(text)
            usage = Usage(
                provider=provider, model=used_model, tokens_in=tokens_in, tokens_out=tokens_out,
                cost_usd=estimate_cost(used_model, tokens_in, tokens_out),
                prompt_text=f"SYSTEM:\n{system}\n\nUSER:\n{user}", attempts=attempts,
                latency_ms=int((time.time() - started) * 1000),
            )
            return parsed, usage

        for provider in self.provider_order:
            if provider == "anthropic" and self._anthropic is not None:
                for _ in range(2):
                    attempts += 1
                    try:
                        text, tokens_in, tokens_out, used_model = self._call_anthropic(system, user, schema, model, effort, max_tokens)
                        return finish(text, "anthropic", used_model, tokens_in, tokens_out)
                    except (ValidationError, json.JSONDecodeError) as e:
                        errors.append(f"anthropic:{model} returned JSON that failed validation: {str(e)[:300]}")
                    except anthropic.RateLimitError as e:
                        errors.append(f"anthropic rate limited: {e.message[:200]}")
                        time.sleep(20)
                    except anthropic.APIStatusError as e:
                        errors.append(f"anthropic {e.status_code}: {e.message[:300]}")
                        if e.status_code < 500 and e.status_code != 429:
                            break  # a 400 will not fix itself on retry
                    except anthropic.APIConnectionError as e:
                        errors.append(f"anthropic connection error: {str(e)[:200]}")
                    except LLMError as e:
                        errors.append(str(e)[:300])
            elif provider == "openai" and self._openai is not None:
                attempts += 1
                try:
                    text, tokens_in, tokens_out, used_model = self._call_openai(system, user, schema, output.__name__, max_tokens)
                    return finish(text, "openai", used_model, tokens_in, tokens_out)
                except Exception as e:  # noqa: BLE001 - reported below
                    errors.append(f"openai failed: {str(e)[:300]}")
            elif provider == "gemini" and self._gemini is not None:
                for _ in range(2):
                    attempts += 1
                    try:
                        text, tokens_in, tokens_out, used_model = self._call_gemini(system, user, schema, max_tokens)
                        return finish(text, "gemini", used_model, tokens_in, tokens_out)
                    except (ValidationError, json.JSONDecodeError) as e:
                        errors.append(f"gemini returned JSON that failed validation: {str(e)[:300]}")
                    except Exception as e:  # noqa: BLE001 - reported below
                        errors.append(f"gemini failed: {str(e)[:300]}")
                        if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                            time.sleep(20)

        raise LLMError(f"[{label or output.__name__}] all providers failed: " + " | ".join(errors))

    # --- providers --------------------------------------------------------

    def _call_anthropic(self, system: str, user: str, schema: dict[str, Any], model: str, effort: str, max_tokens: int) -> tuple[str, int, int, str]:
        assert self._anthropic is not None
        kwargs: dict[str, Any] = dict(
            model=model,
            max_tokens=max_tokens,
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": user}],
            output_config={"format": {"type": "json_schema", "schema": schema}, "effort": effort},
        )
        response = None
        if self.settings.server_fallbacks:
            try:
                response = self._anthropic.beta.messages.create(
                    betas=["server-side-fallback-2026-07-01"], fallbacks="default", **kwargs
                )
            except anthropic.BadRequestError as e:
                # The beta may not be available for this org/model; the plain
                # request is identical apart from the fallback.
                if "fallback" not in e.message.lower() and "beta" not in e.message.lower():
                    raise
                response = None
            except TypeError:
                response = None
        if response is None:
            response = self._anthropic.messages.create(**kwargs)

        if response.stop_reason == "refusal":
            raise LLMError(f"anthropic refused the request ({getattr(response, 'stop_details', None)})")
        if response.stop_reason == "max_tokens":
            raise LLMError(f"anthropic hit max_tokens={max_tokens} before finishing the JSON")
        text = next((b.text for b in response.content if getattr(b, "type", "") == "text"), "")
        if not text.strip():
            raise LLMError("anthropic returned no text block")
        used_model = getattr(response, "model", model) or model
        return text, response.usage.input_tokens, response.usage.output_tokens, used_model

    def _call_openai(self, system: str, user: str, schema: dict[str, Any], name: str, max_tokens: int) -> tuple[str, int, int, str]:
        model = self.settings.openai_fallback_model
        completion = self._openai.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format={"type": "json_schema", "json_schema": {"name": name, "schema": schema, "strict": True}},
            max_tokens=min(max_tokens, 16000),
        )
        text = completion.choices[0].message.content or ""
        usage = completion.usage
        return text, int(getattr(usage, "prompt_tokens", 0) or 0), int(getattr(usage, "completion_tokens", 0) or 0), model

    def _call_gemini(self, system: str, user: str, schema: dict[str, Any], max_tokens: int) -> tuple[str, int, int, str]:
        from google.genai import types as gtypes

        model = self.settings.gemini_model
        config_kwargs: dict[str, Any] = dict(system_instruction=system, response_mime_type="application/json", max_output_tokens=max_tokens, temperature=0.4)
        try:
            config = gtypes.GenerateContentConfig(response_json_schema=schema, **config_kwargs)
        except Exception:  # older SDKs: response_schema takes the same JSON
            config = gtypes.GenerateContentConfig(response_schema=schema, **config_kwargs)
        response = self._gemini.models.generate_content(model=model, contents=user, config=config)
        text = response.text or ""
        if not text.strip():
            raise LLMError("gemini returned no text")
        meta = getattr(response, "usage_metadata", None)
        tokens_in = int(getattr(meta, "prompt_token_count", 0) or 0)
        tokens_out = int(getattr(meta, "candidates_token_count", 0) or 0)
        return text, tokens_in, tokens_out, model

    # --- embeddings -------------------------------------------------------

    def embed(self, texts: list[str]) -> list[list[float]] | None:
        """OpenAI embeddings (1536 dims, matching the pgvector column). None
        when no key is configured — callers fall back to keyword scoring."""
        if self._openai is None or not texts:
            return None
        result = self._openai.embeddings.create(model=self.settings.embed_model, input=texts)
        return [d.embedding for d in result.data]
