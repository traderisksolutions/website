from __future__ import annotations

from ..models import Draft, SeoGeoPlan, Strategy, Usage
from .base import AgentContext, run_structured

NODE_KEY = "seo_geo_editor"
LABEL = "SEO and GEO edit"

DEFAULT_PROMPT = """You are an SEO and GEO (AI answer engine) editor. You make light, precise edits so the article is found by search engines and quoted by AI assistants, without changing what it claims.

Deliver:
1. title: 60 characters or fewer, contains the primary keyword, is a promise the body delivers.
2. meta_description: 120 to 160 characters, concrete, states what the reader gets. No clickbait.
3. slug: lowercase words joined by hyphens, 3 to 8 words, contains the primary keyword.
4. Headings: keep the writer's structure. If fewer than two H2s are phrased as questions, rephrase the two most natural ones as questions. Keep the primary keyword in exactly one H2.
5. First 100 words must contain the primary keyword and answer the reader question directly. Adjust wording only if needed. A grammatical variant of the keyword counts ("custom sales system in Singapore" matches "custom sales system Singapore"); never force an ungrammatical phrase into a sentence, a title or the meta description.
6. entities: the entities the article now clearly associates with the business (only ones actually present in the text).
7. faq: three to five question and answer pairs. Each answer is 60 words or fewer, self-contained, and ends with the fact markers it relies on, like [F2]. Only use facts already cited in the article.
8. internal_links: up to three links to existing articles on this site that a reader of this piece would want next, with natural anchor text. Only from the list supplied. Do not link to anything else.
9. markdown: the full article with your edits applied. Keep every fact marker exactly where it is. Do not add any new specific claim. Do not add the FAQ or links into the markdown; they are inserted separately.
10. changes_made: a short list of what you changed."""


def run(ctx: AgentContext, draft: Draft, strategy: Strategy) -> tuple[SeoGeoPlan, Usage]:
    articles = "\n".join(f"- {a['title']} → {a['url']}" for a in ctx.published_articles[:40]) or "- (no published articles yet)"
    user = f"""{ctx.brief()}

Primary keyword: {strategy.primary_keyword}
Secondary keywords: {", ".join(strategy.secondary_keywords)}
Entities to associate: {", ".join(strategy.geo_entities)}
Questions AI assistants should find answered here: {"; ".join(strategy.geo_questions)}

Existing articles available for internal links:
{articles}

Article (Markdown):
# {draft.title}

{draft.markdown}

Edit for SEO and GEO. Return the SeoGeoPlan JSON."""
    return run_structured(ctx, node_key=NODE_KEY, default_prompt=DEFAULT_PROMPT, user=user, output=SeoGeoPlan, strong=False, max_tokens=20000)
