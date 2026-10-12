"""Target markets. Only stable, uncontroversial facts live here (currency,
language, spelling). Anything regulatory, grant-related or price-related must
come from a 'market' knowledge entry the business owner has written and can
edit — the engine never invents it.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Market:
    code: str
    name: str
    currency: str
    language: str  # ISO 639-1 of the default article language
    language_name: str
    spelling: str
    timezone: str
    reader_hint: str


MARKETS: dict[str, Market] = {
    "SG": Market("SG", "Singapore", "SGD", "en", "English", "British English", "Asia/Singapore",
                 "Singapore SME owners and managers. Direct, practical, no fluff."),
    "HK": Market("HK", "Hong Kong", "HKD", "en", "English", "British English", "Asia/Hong_Kong",
                 "Hong Kong SME owners and operations leads. Fast-moving, cost-aware, bilingual environment."),
    "ID": Market("ID", "Indonesia", "IDR", "id", "Bahasa Indonesia", "Bahasa Indonesia (formal, baku)", "Asia/Jakarta",
                 "Indonesian business owners and operations managers. Write in formal Bahasa Indonesia."),
    "MY": Market("MY", "Malaysia", "MYR", "en", "English", "British English", "Asia/Kuala_Lumpur",
                 "Malaysian SME owners and managers. Practical and cost-conscious."),
}

DEFAULT_MARKET = "SG"


def get_market(code: str | None) -> Market:
    return MARKETS.get((code or DEFAULT_MARKET).upper(), MARKETS[DEFAULT_MARKET])


def language_for(market_code: str | None, override: str | None = None) -> str:
    if override in ("en", "id"):
        return override
    return get_market(market_code).language
