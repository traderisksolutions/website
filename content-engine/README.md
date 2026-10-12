# TRS content engine

A staged, multi-agent article generator in Python for every website the
business owns: corpcover.com, benefixe.com, newsouthsea.com and
traderisksolutions.com.sg. It writes only from each site's knowledge bank,
checks every claim, edits for search and AI answer engines, makes the piece
scannable, adds calls to action, and holds the result for approval in the
dashboard (Marketing → Articles).

One engine, many sites. Every run carries a `site_id` (`marketing_sites.id`);
the site row supplies the base URL, blog path, contact URL, brand terms,
pillar pages, banned terms, the approval switch and the nightly count.

## The twelve steps

| # | Node | What it does |
|---|------|--------------|
| 1 | load_knowledge | Loads the site's business facts, products, case studies, claims and market notes whole; retrieves the most relevant documents. Assigns K-ids. |
| 2 | strategist | Picks one reader, one question, one thesis. Lists SEO keywords, GEO entities and question phrasings, and the knowledge gaps. |
| 3 | researcher | Builds a numbered fact pack. Every fact cites a K-id and quotes it. Lists what must not be claimed. |
| 4 | outliner | Answer-first summary, question headings, one bold takeaway per section, format hints, FAQ questions. |
| 5 | writer | Writes the Markdown. Every specific sentence ends with a fact marker like `[F3]`. |
| 6 | fact_checker | Classifies every claim: supported, needs verification, unsupported, contradicted. Sends the draft back to the writer (up to 2 rounds). |
| 7 | seo_geo_editor | Title, meta, slug, question headings, FAQ, internal links. Light edits only; markers preserved. |
| 8 | readability_editor | Measures paragraphs, sentence length, bold takeaways, lists; fixes only what is measured. Skipped when clean. |
| 9 | cta_composer | A contextual mid-article CTA and a closing CTA, grounded in the fact pack. |
| 10 | quality_gate | Deterministic: superlatives, the site's banned terms, numbers without markers, unknown markers, length, duplicates, scannability, CTA present. |
| 11 | assemble | Inserts CTAs, FAQ and related reading; turns markers into footnotes where an entry has a public evidence URL; renders HTML and JSON-LD. |
| 12 | publish | Saves to `cms_articles` as `pending` (or `published` when the gate passed and the site's approval switch is off). Records which entries each fact came from. |

Every stage's output is saved before the next starts, so a crash or redeploy
resumes from the last completed stage. Each stage retries three times.
Providers are tried in `ENGINE_PROVIDER_ORDER` (default Anthropic, then
Gemini, then OpenAI).

## Run it

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

# Offline tests (no network, no keys)
pytest -q

# One article, written to ./out, no database
python -m engine.cli generate --no-db --knowledge-file knowledge.json \
  --market SG --focus-type product --focus-label "Work injury compensation" --topic "..."

# One article against the real database (run rows + pending article)
python -m engine.cli generate --site-id <marketing_sites.id> --market SG --focus-type product --focus-label "..."

# Serve (the dashboard calls this; it also polls for queued runs)
uvicorn engine.server:app --port 8080
```

## Dashboard wiring

- `CONTENT_ENGINE_URL` and `CONTENT_ENGINE_SECRET` in the dashboard's Vercel env.
- Runs created from **Marketing → Generate** insert a `blog_generation_runs`
  row with `site_id` and `setup.engine = "python"` plus twelve node rows,
  then call `POST /runs/{id}/start`. If the engine is unreachable, its poll
  loop claims the queued run within `ENGINE_POLL_SECONDS`.
- The run page reads `blog_generation_nodes` (prompt, input, output, model,
  tokens, `metadata.cost_usd`, `metadata.knowledge_entry_ids`,
  `metadata.fact_ids`) and `blog_generation_sources`.
- `POST /nightly` creates each site's batch (`marketing_sites.nightly_count`);
  Cloud Scheduler calls it once a night.

## Deploy to Cloud Run

```bash
./deploy.sh
```

Secrets expected in Secret Manager (project trs-ai-project):
`TRS_SUPABASE_SERVICE_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`,
`CONTENT_ENGINE_SECRET`. `OPENAI_API_KEY` is optional (embeddings and the
last-resort fallback writer).
