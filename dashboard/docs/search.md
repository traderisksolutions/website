# Email search

One search for the whole dashboard (20 Nov 2026): ⌘K in the top bar (`src/components/nav/Spotlight.tsx`) and Today › Add email threads (`AddThreads.tsx`) both call `GET /api/search?q=`. A person types a name, an address, a subject, a file name or any word; the answer is grouped Threads · People · Companies · Files, newest first. Every connected inbox and Operations is searched for everyone.

## The index

`thread_search` (`supabase/migrations/20261120_thread_search.sql`, additive, **not applied on 20 Nov 2026**): one row per email thread.

| Column | What it holds |
| --- | --- |
| `thread_id` | `email_threads.id`, primary key, deleted with the thread |
| `company_id`, `mailboxes`, `last_message_at` | the filing, the Gmail accounts that hold it (for the ring-fence), the order |
| `subject` | the thread's title |
| `people` | every participant and sender, `Name <email>; …`, names from the email or the contact |
| `attachments` | file names, one per line (signature images left out) |
| `body` | `body_text` of the newest messages (never `body_html`), quoted history removed, capped at 4,000 characters |
| `names` | generated: subject + people + attachments |
| `doc` | generated: `to_tsvector('simple', subject || people || attachments || body)` |

Indexes: GIN on `doc` (whole and prefix words), trigram GIN (`pg_trgm`) on `names` only (partial words such as "jiaq"; never on the body), b-tree on `last_message_at` and `company_id`.

## Query

`src/lib/search/query.ts` (pure, tested in `search-query.test.ts`): the words (addresses kept whole, at most eight), a `to_tsquery` with every word as a quoted prefix (`'deluge':* & 'travel':*`), and the longest word for the trigram filter. `thread-search-server.ts` runs two indexed reads (`doc=fts(simple).…` and `names=ilike.*word*`, 80 rows each, newest first), merges them, then reads company names, owner names and, for the hits only, the message headers that split a joined thread into its conversations.

Ring-fence (`src/lib/mail/ring-fence.ts`, the rule in `visibility.ts`): a thread the viewer may not open is listed only when the words are in its subject, people or file names, never because of the text of its mail. It shows whose inbox holds it; opening it shows "This email lives in <First name>'s inbox." The server still refuses its mail.

Before the table exists, `/api/search` answers `{ index: false }` and both callers use the Inbox search (`/api/engagement/conversations?q=`): ⌘K without the email text (the body scan times out on the small database, 57014), Add email threads as before.

## Refresh

`refreshThreadSearch(threadId)` rebuilds one thread's row: five bounded reads for that thread (thread, newest 12 messages, participants, file names, mailboxes) plus contact names, one upsert. Ingest (`/api/email/ingest`, step 3c, one separate block) calls it after a message and its people are stored, in `waitUntil`, never blocking ingest. Before the table exists it does nothing (one probe every five minutes per server).

## Backfill

`scripts/backfill-thread-search.ts`, by hand only; nothing runs it:

```
set -a; source .env.local; set +a
npx tsx --tsconfig tsconfig.json scripts/backfill-thread-search.ts            # dry run: builds batch 1, writes nothing
npx tsx --tsconfig tsconfig.json scripts/backfill-thread-search.ts --apply    # writes
  --limit 300   --pause 3000   --missing                                      # first 300 / 3 s between batches / only threads with no row
```

100 threads per batch, newest first (keyset on `last_message_at`; threads with the same timestamp at a page edge can be skipped, and ingest picks them up on their next message), a pause between batches (default 2 s). No model is called.

## Cost on the small database (db-f1-micro)

Estimated counts, 20 Nov 2026: 2,904 threads, 10,378 messages, 16,062 attachments, 54,871 participants.

| | Size or load |
| --- | --- |
| Rows | ~2,900, one per thread |
| Text per row | ≤4,000 body + subject, people, files: under 10 KB; ~15 MB of table at most, plus indexes of the same order |
| Backfill | 30 batches; each reads ≤1,200 messages' `body_text`, ≤8,000 participant rows, ≤6,000 file rows, then one upsert of 100 rows; about a minute in all with the pauses |
| Ingest | one thread per stored message: 6 small reads by thread id and one upsert |
| Search | two index reads of ≤80 rows, a company read, one header read for ≤40 threads |

The generated `doc` column is computed on write, so a search never runs `to_tsvector` over the table. If memory stays at 100%, apply the migration and run the backfill outside working hours with `--pause 5000`.
