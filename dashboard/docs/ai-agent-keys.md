# AI agent keys

Three Gemini keys, one per agent, in GCP project **trs-ai-project**.

One key each so spend can be reconciled against Google AI Studio per agent, and so a leaked or
rate-limited key takes down one agent rather than all three.

| Variable | Agent | Model | Cost |
| --- | --- | --- | --- |
| `GEMINI_API_KEY_HOUSEKEEPING` | Files mail to a company, names unknown domains, reads signatures | `gemini-3.5-flash-lite` | $0.0002 per domain decided |
| `GEMINI_API_KEY_CRM` | Reads a thread, the company record and its archive; drafts the next reply | `gemini-3.8-flash` | $0.028 a call |
| `GEMINI_API_KEY_ASKAI` | Answers from the live web and the client's own file, with sources | `gemini-3.8-flash` | $0.0064 a question |

Grounded search is free for the first 5,000 requests a month across all Gemini 3.x models, then
$14 per 1,000. TRS uses roughly 200 a month.

## Where they go

- **Local**: `dashboard/.env.local` — ignored by git, like every other `.env*` file here.
- **Production**: Vercel, Project → Settings → Environment Variables → Production.

Never in a file git tracks. There is deliberately no `.env.*.example` in this repo: `.gitignore`
hides `.env*` precisely so a real value cannot be committed by accident, and a tracked example
file re-opens that hole for the sake of a template.

## A wrong key does not fail loudly

Gemini answers an invalid key with HTTP 400 "API key not valid". The callers read that as "no
result" and fall back to a default, so the dashboard keeps working and quietly produces worse
output.

This is not hypothetical. `.env.local` shipped `GEMINI_API_KEY_DRAFT_EMAIL` as the literal string
`your_gemini_api_key`, and with it the housekeeping sweep named every company after its own
domain — "Fengchen", "Getsolar" — having never called the model at all.

**After deploying, open `/analytics/ai-usage` and check each agent shows calls.** An agent at zero
calls after use has a bad key. It was not idle.

## Falling back

Until all three are set, each agent falls back to the shared keys in this order:

    GEMINI_API_KEY_DRAFT_EMAIL → GEMINI_API_KEY_EMAIL_ANALYSIS → GEMINI_API_KEY_INBOUND → GEMINI_API_KEY

A value shorter than 20 characters or starting with `your_` is treated as absent, so a placeholder
is skipped rather than sent. Spend is still attributed per agent either way, because attribution
is by feature, not by key.

## Changing models without a redeploy

    GEMINI_MODEL_LITE=gemini-3.5-flash-lite
    GEMINI_MODEL_FLASH=gemini-3.6-flash
    GEMINI_MODEL_PRO=gemini-3.1-pro-preview
    GEMINI_MODEL_DEEP=gemini-3.8-flash

`GEMINI_MODEL_DEEP` is the rollback if `gemini-3.8-flash` under-reasons on a hard question: set it
to `gemini-3.1-pro-preview` and the deep path runs on the reasoning tier instead.
