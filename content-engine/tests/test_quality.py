from engine.llm import strict_schema
from engine.models import Fact, FactCheckReport, FactPack, Strategy
from engine.quality import quality_gate, readability_metrics

PACK = FactPack(facts=[Fact(id="F1", statement="x", knowledge_id="K1", quote="x")])
OK = FactCheckReport(verdict="pass")
LONG_OK = "\n\n".join(["## Section heading?\n\n**Takeaway.** " + "Short sentence here. " * 8] * 4) + "\n\n[Talk](https://wa.me/1)\n\n## Frequently asked questions\n\n**Q?**\n\nA."


def test_gate_blocks_superlatives_and_unmarked_numbers():
    md = LONG_OK + "\n\nWe are the best and save you 40% in 14 days."
    report = quality_gate(title="T" * 40, markdown=md, meta_description="m" * 130, pack=PACK, fact_check=OK, min_words=50, contact_url="https://wa.me/1")
    codes = {f.code for f in report.failures}
    assert "prohibited_superlative" in codes
    assert "unsupported_numeric_claim" in codes
    assert not report.passed


def test_gate_accepts_marked_numbers_and_flags_unknown_markers():
    md = LONG_OK + "\n\nClients see results in 14 days [F1]. Another claim [F9]."
    report = quality_gate(title="T" * 40, markdown=md, meta_description="m" * 130, pack=PACK, fact_check=OK, min_words=50, contact_url="https://wa.me/1")
    codes = {f.code for f in report.failures}
    assert "unsupported_numeric_claim" not in codes
    assert "unknown_fact_marker" in codes


def test_gate_requires_cta_and_min_words():
    report = quality_gate(title="T" * 40, markdown="## A?\n\n**x.** short.", meta_description="m" * 130, pack=PACK, fact_check=OK, min_words=700, contact_url="https://wa.me/1")
    codes = {f.code for f in report.failures}
    assert {"thin_content", "missing_cta", "structure"} <= codes


def test_readability_metrics_find_long_paragraphs():
    md = "## One?\n\n" + "word " * 80 + "\n\n## Two\n\n**Bold.** fine."
    m = readability_metrics(md)
    assert m["long_paragraphs"] == 1
    assert m["sections_with_bold_takeaway"] == 1
    assert any("over 60 words" in p for p in m["problems"])


def test_strict_schema_is_self_contained():
    schema = strict_schema(Strategy)
    text = str(schema)
    assert "$ref" not in text and "$defs" not in text
    assert schema["additionalProperties"] is False
    assert set(schema["required"]) == set(schema["properties"].keys())
    nested = strict_schema(FactCheckReport)
    assert nested["properties"]["claims"]["items"]["additionalProperties"] is False


def test_marker_in_title_blocks():
    from engine.quality import quality_gate, BLOCKING_CODES
    from engine.models import FactPack, FactCheckReport
    r = quality_gate(title="Faster replies for SMEs [F2]", markdown="## A\n\nText.\n", meta_description="x" * 120,
                     pack=FactPack(), fact_check=FactCheckReport(), min_words=0, contact_url="", require_faq=False)
    assert any(f.code == "marker_in_metadata" for f in r.failures)
    assert "marker_in_metadata" in BLOCKING_CODES


def test_site_banned_terms_block_as_whole_words():
    md = LONG_OK + "\n\nCover approved by MAS last year [F1]."
    report = quality_gate(title="T" * 40, markdown=md, meta_description="m" * 130, pack=PACK, fact_check=OK, min_words=50, contact_url="https://wa.me/1", banned_terms=["MAS"])
    assert any(f.code == "prohibited_term" for f in report.failures)
    clean = quality_gate(title="T" * 40, markdown=LONG_OK + "\n\nMastery of the policy wording helps [F1].", meta_description="m" * 130, pack=PACK, fact_check=OK, min_words=50, contact_url="https://wa.me/1", banned_terms=["MAS"])
    assert not any(f.code == "prohibited_term" for f in clean.failures)
