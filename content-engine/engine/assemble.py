"""Turn the edited draft into the public article: insert CTAs and FAQ,
resolve fact markers into footnotes (only where an entry has a public
evidence URL), render HTML, build JSON-LD.
"""
from __future__ import annotations

import re
from typing import Any

import markdown as md_lib

from .knowledge import KnowledgeSelection
from .models import Article, CtaPlan, FactPack, SeoGeoPlan
from .quality import MARKER, word_count

SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(text: str) -> str:
    s = SLUG_RE.sub("-", text.lower()).strip("-")
    return s[:80].rstrip("-") or "article"


def _clean_title(raw: str) -> str:
    """Drop leading markdown heading marks and surrounding whitespace."""
    return re.sub(r"^#{1,6}\s*", "", (raw or "").strip()).strip()


def strip_leading_h1(markdown: str) -> tuple[str, str]:
    """The CMS renders the title itself, so a writer-added '# Title' first
    line is removed from the body and returned separately."""
    text = markdown.lstrip("\n")
    m = re.match(r"^#\s+(.+)\n+", text)
    if not m:
        return markdown, ""
    return text[m.end():], m.group(1).strip()


def _cta_block(heading: str, text: str, button: str, url: str) -> str:
    return f"\n\n> **{heading}**\n>\n> {text}\n>\n> [{button}]({url})\n\n"


def insert_ctas(markdown: str, ctas: CtaPlan, url: str, after_section: int) -> str:
    parts = re.split(r"(?=^##\s)", markdown, flags=re.M)
    # parts[0] is the intro; sections start at index 1.
    idx = min(max(after_section, 1), max(len(parts) - 1, 1))
    mid = _cta_block(ctas.mid.heading or "Want this for your business?", ctas.mid.text, ctas.mid.button_label or "Talk to us", url)
    if len(parts) > idx:
        parts[idx] = parts[idx].rstrip() + mid
    body = "".join(parts)
    end = _cta_block(ctas.end.heading or "Ready to talk?", ctas.end.text, ctas.end.button_label or "Start a conversation", url)
    return body.rstrip() + end


def append_faq(markdown: str, plan: SeoGeoPlan, language: str) -> str:
    if not plan.faq:
        return markdown
    heading = "Pertanyaan yang sering diajukan" if language == "id" else "Frequently asked questions"
    lines = [f"\n\n## {heading}\n"]
    for item in plan.faq:
        lines.append(f"\n**{item.question.strip()}**\n\n{item.answer.strip()}\n")
    return markdown.rstrip() + "".join(lines)


def append_internal_links(markdown: str, plan: SeoGeoPlan, language: str) -> str:
    links = [l for l in plan.internal_links if l.url and l.anchor_text]
    if not links:
        return markdown
    heading = "Bacaan terkait" if language == "id" else "Related reading"
    lines = [f"\n\n## {heading}\n"] + [f"\n- [{l.anchor_text}]({l.url})" for l in links[:3]]
    return markdown.rstrip() + "".join(lines) + "\n"


def resolve_markers(markdown: str, pack: FactPack, selection: KnowledgeSelection, language: str) -> tuple[str, list[str], list[str]]:
    """Remove [F#] markers from the public text. Facts whose entry has a
    public evidence URL become numbered footnotes; the rest are simply
    removed (their provenance stays in the run record)."""
    fact_by_id = {f.id: f for f in pack.facts}
    footnotes: list[tuple[int, str, str]] = []
    footnote_index: dict[str, int] = {}
    used_facts: list[str] = []
    used_entries: list[str] = []

    def replace(match: re.Match[str]) -> str:
        fid = f"F{match.group(1)}"
        fact = fact_by_id.get(fid)
        if fid not in used_facts:
            used_facts.append(fid)
        if not fact:
            return ""
        entry = selection.entry_by_alias(fact.knowledge_id) if fact.knowledge_id else None
        if entry and entry.id not in used_entries:
            used_entries.append(entry.id)
        url = entry.evidence_url() if entry else ""
        if not url:
            return ""
        if url not in footnote_index:
            footnote_index[url] = len(footnote_index) + 1
            footnotes.append((footnote_index[url], entry.title if entry else fid, url))
        return f"[^{footnote_index[url]}]"

    text = MARKER.sub(replace, markdown)
    text = re.sub(r"\s+([.,;:!?])", r"\1", text)  # tidy "word [F1]." → "word."
    text = re.sub(r"[ \t]+\n", "\n", text)
    if footnotes:
        heading = "Sumber" if language == "id" else "Sources"
        text += f"\n\n## {heading}\n\n" + "\n".join(f"[^{n}]: [{title}]({url})" for n, title, url in footnotes) + "\n"
    return text, used_facts, used_entries


def render_html(markdown_text: str) -> str:
    return md_lib.markdown(markdown_text, extensions=["tables", "fenced_code", "footnotes", "sane_lists"], output_format="html")


def build_json_ld(*, title: str, description: str, url: str, org_name: str, org_domain: str, date_iso: str, faq: list[tuple[str, str]], language: str) -> dict[str, Any]:
    graph: list[dict[str, Any]] = [
        {
            "@type": "BlogPosting",
            "headline": title[:110],
            "description": description,
            "url": url,
            "inLanguage": "id" if language == "id" else "en",
            "mainEntityOfPage": {"@type": "WebPage", "@id": url},
            "datePublished": date_iso,
            "dateModified": date_iso,
            "author": {"@type": "Organization", "name": org_name, "url": f"https://{org_domain}"},
            "publisher": {"@type": "Organization", "name": org_name},
        }
    ]
    if faq:
        graph.append(
            {
                "@type": "FAQPage",
                "mainEntity": [
                    {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": MARKER.sub("", a).strip()}} for q, a in faq
                ],
            }
        )
    return {"@context": "https://schema.org", "@graph": graph}


def assemble(
    *,
    plan: SeoGeoPlan,
    markdown_with_markers: str,
    ctas: CtaPlan,
    pack: FactPack,
    selection: KnowledgeSelection,
    language: str,
    market: str,
    contact_url: str,
    site_base_url: str,
    blog_base_path: str,
    org_name: str,
    org_domain: str,
    date_iso: str,
    mid_cta_after_section: int,
    fallback_title: str = "",
) -> Article:
    body, h1 = strip_leading_h1(markdown_with_markers)
    # Models sometimes return the title already marked up as an H1.
    # The CMS renders the title itself, so strip any leading hashes.
    title = _clean_title(plan.title) or _clean_title(fallback_title) or h1 or "Untitled"
    slug = slugify(plan.slug or title)
    with_ctas = insert_ctas(body, ctas, contact_url, mid_cta_after_section)
    with_faq = append_faq(with_ctas, plan, language)
    with_links = append_internal_links(with_faq, plan, language)
    public_md, used_facts, used_entries = resolve_markers(with_links, pack, selection, language)
    # FAQ answers carry markers too; strip them from the plain FAQ copy.
    faq_pairs = [(f.question.strip(), MARKER.sub("", f.answer).strip()) for f in plan.faq]
    url = f"{site_base_url.rstrip('/')}{blog_base_path}/{slug}"
    html = render_html(public_md)
    excerpt = re.sub(r"\s+", " ", MARKER.sub("", public_md.split("\n\n")[0])).strip()[:280]
    return Article(
        title=title,
        slug=slug,
        meta_description=plan.meta_description.strip(),
        excerpt=excerpt,
        markdown=public_md,
        markdown_with_markers=with_links,
        html=html,
        json_ld=build_json_ld(title=title, description=plan.meta_description.strip(), url=url, org_name=org_name, org_domain=org_domain, date_iso=date_iso, faq=faq_pairs, language=language),
        faq=[type(f)(question=q, answer=a) for f, (q, a) in zip(plan.faq, faq_pairs)],
        language=language,
        market=market,
        word_count=word_count(public_md),
        fact_ids_used=used_facts,
        knowledge_ids_used=used_entries,
    )
