"use client";

import { useEffect, useState } from "react";
import { site } from "@/site";
import { CC } from "@/lib/find/questions";
import { CLAIM_KEY, CLAIM_TYPES, DOCS, EMPTY_CLAIM, PLANS, SLA_HOURS, STATUSES, claimStepError, paymentUrl, type ClaimState, type Plan } from "@/lib/claim";
import { MARKETS, type MarketKey } from "@/lib/market";

const CCS = CC.map(c => c[1]);
const HEADS = ["Whose claim is it?", "Where should we send the report?", "About the claim", "What you have"];

type Saved = { id: string; s: ClaimState };
const load = (): Saved | null => { try { return JSON.parse(localStorage.getItem(CLAIM_KEY) || "null"); } catch { return null; } };

/**
 * Claim review intake, pay first (22 Oct 2026).
 * mode "start" (on /claims): plan → contact → saved → Stripe.
 * mode "details" (on /claims/paid): about the claim → documents, on the same intake id.
 * With no Stripe link configured, "start" carries straight on to the details.
 */
export function ClaimFlow({ market = "sg", mode = "start" }: { market?: MarketKey; mode?: "start" | "details" }) {
  const M = MARKETS[market];
  const [s, setS] = useState<ClaimState>({ ...EMPTY_CLAIM, cc: M.cc });
  const [id, setId] = useState(() => crypto.randomUUID());
  const [steps, setSteps] = useState<number[]>(mode === "start" ? [0, 1] : [0, 1, 2, 3]);
  const [i, setI] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [unpaid, setUnpaid] = useState(false);
  const [hp, setHp] = useState("");

  // After Stripe, pick up the plan and contact saved before payment.
  useEffect(() => {
    if (mode !== "details") return;
    const saved = load();
    if (saved?.s?.plan) queueMicrotask(() => { setS({ ...EMPTY_CLAIM, ...saved.s }); setId(saved.id); setSteps([2, 3]); });
  }, [mode]);

  const step = steps[i];
  const set = <K extends keyof ClaimState>(k: K, v: ClaimState[K]) => { setS(p => ({ ...p, [k]: v })); setErr(""); };
  const toggleDoc = (d: string) => { setS(p => ({ ...p, docs: p.docs.includes(d) ? p.docs.filter(x => x !== d) : [...p.docs, d] })); setErr(""); };

  const post = async (stage: "start" | "details") => {
    const r = await fetch("/api/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...s, id, market, stage, website: hp, sourceUrl: location.href }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 400 && j.error ? j.error : `Could not send. Please try again, or call +65 ${site.phone}.`);
  };

  const next = async () => {
    const e = claimStepError(step, s, CCS);
    if (e) { setErr(e); return; }
    const last = i === steps.length - 1;
    if (!last && step !== 1) { setI(i + 1); setErr(""); return; }
    setBusy(true); setErr("");
    try {
      if (step === 1) {
        await post("start");
        try { localStorage.setItem(CLAIM_KEY, JSON.stringify({ id, s })); } catch { /* storage blocked */ }
        const pay = s.plan ? paymentUrl(s.plan, s.email.trim(), id) : null;
        if (pay) { location.assign(pay); return; }
        setUnpaid(true); setSteps([0, 1, 2, 3]); setI(2);
      } else {
        await post("details");
        try { localStorage.removeItem(CLAIM_KEY); } catch { /* ignore */ }
        setDone(true);
      }
    } catch (x) { setErr(x instanceof Error ? x.message : "Could not send."); }
    finally { setBusy(false); }
  };

  if (done) return (
    <div className="qf" role="status">
      <h3 className="qf-q">Details received</h3>
      <p className="qf-help">Reply to our email at {s.email} with the policy schedule, the wording and the insurer&apos;s letter. Your PDF report arrives in the same thread within {SLA_HOURS} hours of receiving the documents, and a broker follows up there.</p>
    </div>
  );

  const price = s.plan ? PLANS[s.plan].price : "";
  const label = busy ? "Saving…" : step === 1 ? `Pay ${price} with Stripe` : i < steps.length - 1 ? "Continue" : "Send details";

  return (
    <form className="qf" noValidate onSubmit={e => { e.preventDefault(); void next(); }}>
      <p className="qf-count">{s.plan && step > 0 ? `${PLANS[s.plan].label} · ${price}` : "Claim review"}</p>
      <h3 className="qf-q">{HEADS[step]}</h3>
      {unpaid && step === 2 && <p className="qf-help">Payment link follows by email. Answer these now so the review starts once payment is in.</p>}

      {step === 0 && (
        <div className="qf-opts qf-opts--stack" role="radiogroup" aria-label="Plan">
          {(Object.keys(PLANS) as Plan[]).map(p => (
            <button key={p} type="button" role="radio" aria-checked={s.plan === p} onClick={() => setS(x => ({ ...x, plan: p, type: x.plan === p ? x.type : "" }))} className="qf-opt qf-opt--wide">
              <span className="qf-opt-main"><b>{PLANS[p].label}</b><span>{PLANS[p].note}</span></span>
              <span className="qf-price">{PLANS[p].price}</span>
            </button>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="qf-fields">
          <p className="qf-help">You pay first, and payment secures your review. Then you tell us about the claim and send the documents.</p>
          <label className="qf-field">Name<input value={s.name} onChange={e => set("name", e.target.value)} autoComplete="name" maxLength={120} placeholder="Your full name" /></label>
          <label className="qf-field">{s.plan === "business" ? "Work email" : "Email"}<input type="email" value={s.email} onChange={e => set("email", e.target.value)} autoComplete="email" maxLength={200} placeholder="name@company.com" /></label>
          <div className="qf-field">
            <label htmlFor="cl-phone">Mobile</label>
            <div className="qf-phone">
              <select aria-label="Country code" value={s.cc} onChange={e => set("cc", e.target.value)}>{CC.map(([c, code]) => <option key={c} value={code}>{c} {code}</option>)}</select>
              <input id="cl-phone" type="tel" inputMode="tel" value={s.phone} onChange={e => set("phone", e.target.value)} autoComplete="tel-national" placeholder={(CC.find(c => c[1] === s.cc) ?? CC[0])[2]} maxLength={20} />
            </div>
          </div>
          <label className="qf-check"><input type="checkbox" checked={s.ack} onChange={e => set("ack", e.target.checked)} /><span>I understand the review is a reading of my policy and claim, checked by a person after an AI read. It is not legal advice, does not act for me with the insurer, and cannot promise a different outcome.</span></label>
          <label className="qf-check"><input type="checkbox" checked={s.consent} onChange={e => set("consent", e.target.checked)} /><span>I agree that Corp Cover and its advisers may use these details and my documents to review this claim and contact me, under {M.privacyLaw}.</span></label>
        </div>
      )}

      {step === 2 && s.plan && (
        <div className="qf-fields">
          <fieldset className="qf-field"><legend>Type of claim</legend>
            <div className="qf-opts" role="radiogroup">{CLAIM_TYPES[s.plan].map(t => <button key={t} type="button" role="radio" aria-checked={s.type === t} onClick={() => set("type", t)} className="qf-opt">{t}</button>)}</div>
          </fieldset>
          <fieldset className="qf-field"><legend>Where the claim is now</legend>
            <div className="qf-opts" role="radiogroup">{STATUSES.map(t => <button key={t} type="button" role="radio" aria-checked={s.status === t} onClick={() => set("status", t)} className="qf-opt">{t}</button>)}</div>
          </fieldset>
          <label className="qf-field">Insurer<input value={s.insurer} onChange={e => set("insurer", e.target.value)} maxLength={120} placeholder="The insurer named on the policy" /></label>
          <div className="qf-row">
            <label className="qf-field">Amount claimed ({M.currency}, optional)<input inputMode="decimal" value={s.amount} onChange={e => set("amount", e.target.value)} maxLength={40} placeholder="e.g. 186,000" /></label>
            <label className="qf-field">Date of the insurer&apos;s decision (optional)<input type="date" value={s.decisionDate} onChange={e => set("decisionDate", e.target.value)} /></label>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="qf-fields">
          <fieldset className="qf-field"><legend>Documents you have, sent by email after this</legend>
            <div className="qf-opts">{DOCS.map(d => <button key={d} type="button" aria-pressed={s.docs.includes(d)} onClick={() => toggleDoc(d)} className="qf-opt">{d}</button>)}</div>
          </fieldset>
          <label className="qf-field">What happened, in a few sentences<textarea rows={3} value={s.story} onChange={e => set("story", e.target.value)} maxLength={4000} placeholder="What you claimed for, what the insurer decided, and the reason it gave" /></label>
        </div>
      )}

      <input value={hp} onChange={e => setHp(e.target.value)} name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      {err && <p role="alert" className="qf-err">{err}</p>}
      <div className="qf-actions">
        {i > 0 && <button type="button" onClick={() => { setI(i - 1); setErr(""); }} className="qf-back">Back</button>}
        <span className="qf-hint">press <b>Enter</b></span>
        <button type="submit" disabled={busy} className="qf-ok">{label}</button>
      </div>
    </form>
  );
}
