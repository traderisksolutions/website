# Placement

A client asks for one or more policies. Each line goes to every insurer on file for that product
line. Replies are read into quotes. Any change to the ask opens a new round and every insurer is
asked again. The company keeps a log of what happened and what is owed. Built 27 Oct 2026.

## Where it lives

- Company page → **Quotes** tab: placements, their lines and insurers, the log, and the
  Employment benefits quotes below.
- Tables: `placements`, `placement_lines`, `placement_rounds`, `placement_dispatches`,
  `placement_quotes`, `placement_log` (`supabase/migrations/20261027_placement.sql`).
- Library: `src/lib/placement/` — `types`, `spec` (diff and money parsing), `position` (where each
  line stands, chase dates), `store` (PostgREST), `agent` (model calls), `workflow` (the loop).
- Routes: `src/app/api/placements/**`, `src/app/api/companies/[id]/placements`,
  `src/app/api/cron/placement-chase` (09:30 SGT daily).
- Agent: `placement` in `src/lib/ai-agents.ts`, key `GEMINI_API_KEY_PLACEMENT` (falls back to the
  shared keys), model `gemini-3.8-flash`. Six features: intake, dispatch draft, reply read, client
  change, chase draft, client summary. Spend shows under Placement on Analytics → AI usage.

## The loop

1. **New placement.** Pick the client thread, press *Read from thread*: the agent lists the
   policies asked for with the spec it can read (limit, excess, period, scope). Correct it, press
   *Create*. Round 1 opens on every line and a draft to each insurer contact on file for that
   product line is written. One underwriter who handles two of the lines gets one email.
2. **Drafts to approve.** Each draft is read, edited if needed, and sent from the broker's own
   session through `/api/email/send`. Nothing is sent by the agent. On send, the dispatch records
   the Gmail thread and a chase date (3 working days).
3. **Replies.** Ingest calls `/api/placements/inbound` for every stored message. A message on a
   dispatch thread is read as quote / decline / info request / acknowledgement. A quote is stored
   verbatim with a per-field excerpt from the source, plus a normalised amount. A figure without
   an excerpt is marked *check*. A message on the client thread is read for a change of ask; a
   change is logged with the proposed spec and the line shows *Client change to confirm*.
4. **Chase.** The cron drafts a follow-up for every dispatch past its chase date, up to three,
   into the same approval queue.
5. **New round.** *New round* on a line (or *Open round* on a pending client change): the diff
   is shown, a change summary is written, previous-round dispatches without an answer are
   withdrawn, and every insurer is asked again with "what changed" in the email.
6. **Email client.** When the quotes are in, *Email client* drafts the comparison (one table per
   line, declines and still-waiting named) into the queue. The placement moves to *presented*.
7. **Mark bound / Close.** Status on the placement; the log records the decision.

## Insurer routing

`insurer_contacts.product_line` (slugs from `src/lib/product-lines.ts`). A line with no contact
on file is logged and skipped — add the contact under Settings → Insurers, then open the round
again. Insurers are never copied on each other's threads.

## The log

`placement_log` is the company memory: opened, sent, reply, quote, declined, ask, change,
chase, decision, note. The agent reads the last 40 entries before it writes anything, so a
round-3 email knows why round 2 happened. Staff add notes and decisions from the tab.

## Local run

```
API_GATE_MODE=log-only CRON_SECRET=dogfood-local npx next dev -p 3111
```
The tables must exist on the database first (`~/trs-dn-migration/apply-sql.sh
supabase/migrations/20261027_placement.sql`, needs `gcloud auth login developer@trade-risksol.com`).
Model calls need a Gemini key in `.env.local`.

## Not built yet

- Attachments on the insurer request (proposal forms, financials). Add `attachments` on
  `placement_rounds.spec` and pass them to `createDraft`.
- Insurer quote validity expiry → automatic *expiry* round.
- A placements list across companies (today: per company only).

## Company spine (phase 2, 27 Oct 2026)

The policy row (`policies`) is the record. A placement line creates it at *quoting*; *Choose* on a
quote binds it; the first debit note makes it live. `src/lib/policies/spine.ts` holds the
lifecycle moves. Employment benefits lines price through the rate engine (`src/lib/placement/eb.ts`:
`priceLine`, `coversFromSpec`, `openTierC`), take their employee list from an upload or an HR
link keyed on the policy, and after bind keep members, movements, insurer notes and the weekly
position (`src/lib/policies/{members,transactions,position,inbound,agent,queue}.ts`). The
inbound hook falls through from the placement handler to `handlePolicyInbound` for live EB
policies. Weekly cron: `/api/cron/policy-position`, Monday 01:30 SGT.
