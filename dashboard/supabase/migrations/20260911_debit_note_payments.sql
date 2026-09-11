-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Finance reconciliation: a receipts ledger for debit notes.
--
-- Until now the only record of a payment was three columns on debit_notes (paid_amount,
-- paid_direct_amount, status) typed by hand in the debit-note drawer. Nobody used them, so
-- every note ever imported still reads as outstanding and the dashboard reports the whole
-- import as money owed.
--
-- This adds the missing half: one row per payment actually received, and a trigger that keeps
-- the debit_notes columns in step with the ledger. After this, the amounts are the single
-- source of truth and the stored status can never disagree with them.
--
-- Channels:
--   trs      — the client paid TRS
--   insurer  — the client settled directly with the insurer
--   writeoff — written off or credited; clears the balance but was never collected
-- ═══════════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.debit_note_payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debit_note_id uuid NOT NULL REFERENCES public.debit_notes(id) ON DELETE CASCADE,
  amount        numeric(14,2) NOT NULL CHECK (amount > 0),
  received_on   date NOT NULL DEFAULT CURRENT_DATE,
  channel       text NOT NULL DEFAULT 'trs' CHECK (channel IN ('trs', 'insurer', 'writeoff')),
  reference     text,
  note          text,
  recorded_by   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS debit_note_payments_note_idx ON public.debit_note_payments (debit_note_id);
CREATE INDEX IF NOT EXISTS debit_note_payments_date_idx ON public.debit_note_payments (received_on DESC);

-- ── Keep debit_notes in step with the ledger ────────────────────────────────────────────────
-- Recomputes the three payment columns from scratch on every insert, update or delete, so a
-- correction is just as safe as a first entry.
CREATE OR REPLACE FUNCTION public.sync_debit_note_payment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target  uuid := COALESCE(NEW.debit_note_id, OLD.debit_note_id);
  v_trs   numeric(14,2);
  v_other numeric(14,2);
  v_total numeric(14,2);
BEGIN
  SELECT COALESCE(SUM(amount) FILTER (WHERE channel = 'trs'), 0),
         COALESCE(SUM(amount) FILTER (WHERE channel <> 'trs'), 0)
    INTO v_trs, v_other
    FROM public.debit_note_payments
   WHERE debit_note_id = target;

  SELECT COALESCE(net_amount, gross_amount, 0)
    INTO v_total
    FROM public.debit_notes
   WHERE id = target;

  UPDATE public.debit_notes
     SET paid_amount        = v_trs,
         paid_direct_amount = v_other,
         status             = CASE WHEN v_trs + v_other <= 0      THEN 'unpaid'
                                   WHEN v_trs + v_other >= v_total THEN 'paid'
                                   ELSE 'partially_paid' END,
         paid_direct_status = CASE WHEN v_other <= 0      THEN 'unpaid'
                                   WHEN v_other >= v_total THEN 'paid'
                                   ELSE 'partially_paid' END,
         updated_at         = now()
   WHERE id = target;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_debit_note_payments_sync ON public.debit_note_payments;
CREATE TRIGGER trg_debit_note_payments_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.debit_note_payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_debit_note_payment();

-- ── Access ──────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.debit_note_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_debit_note_payments ON public.debit_note_payments;
CREATE POLICY staff_debit_note_payments ON public.debit_note_payments
  USING (auth.role() = 'authenticated');

GRANT ALL ON TABLE public.debit_note_payments TO anon;
GRANT ALL ON TABLE public.debit_note_payments TO authenticated;
GRANT ALL ON TABLE public.debit_note_payments TO service_role;

COMMENT ON TABLE public.debit_note_payments IS
  'One row per payment received against a debit note. The trigger keeps debit_notes.paid_amount, paid_direct_amount and status derived from these rows, so the ledger is the source of truth.';
