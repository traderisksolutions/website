-- Two-axis evaluation (self-improvement loop upgrade).
--
-- The draft evaluator now scores two things separately instead of one "closeness" number:
--   substance_score — did the AI draft have the right facts / completeness / recommended action
--   style_score     — tone / wording / personalisation
-- and classifies the human's edit (none | style | substance | both) so learning focuses on
-- substantive misses rather than one AE's personal tone. The legacy `score` column is kept
-- (mirrors substance for existing UI / few-shot thresholds).
--
-- Run in the Supabase SQL editor.

alter table draft_evaluations
  add column if not exists substance_score integer check (substance_score between 1 and 5),
  add column if not exists style_score     integer check (style_score     between 1 and 5),
  add column if not exists edit_type        text;
