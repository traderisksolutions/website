-- Conversation grouping (thread-selector feature).
--
-- A claim/enquiry often spans several parties — e.g. the handler emails the employee for a
-- medical test AND the client separately. Gmail makes those separate threads (different
-- recipients), but the workspace should show them as ONE conversation and let the handler
-- pick which party they're replying to.
--
-- Model: anchor to the primary client thread. The primary thread has conversation_root_id
-- NULL (it IS the root). Forked sub-threads (created when the handler replies to a new party)
-- set conversation_root_id = the primary thread's id. Resolve a group as:
--   id = root  OR  conversation_root_id = root.
--
-- Grouping is written at send time (a later phase) when a reply goes to a new party.
-- When a conversation grows past a few parties, the UI nudges "Promote to Nexus".
--
-- Run in the Supabase SQL editor.

alter table email_threads
  add column if not exists conversation_root_id uuid references email_threads(id);

create index if not exists idx_threads_conversation_root
  on email_threads using btree (conversation_root_id);
