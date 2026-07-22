-- Pricing Matrix — transparent pricing on a calculator.
-- The calculator tab's job is: upload docs -> confirm the pricing is 100% right (with the maths
-- shown) -> approve. This column holds the AI-structured rate tables extracted from the workbook's
-- own rate sheets (full coverage/plan names, every plan, every age band, and how each premium is
-- derived) for transparent display + human editing. Numbers are still RUN via the real workbook at
-- quote time — this is a faithful readout of the embedded rates, not a second pricing source.
-- Run in the Supabase SQL editor (after 20260722_pricing_matrix.sql).

alter table pm_calculators add column if not exists pricing jsonb;
