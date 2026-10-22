"use client";

import { useState } from "react";
import { site } from "@/site";
import { CC } from "@/lib/find/questions";
import { CLAIM_TYPES, DOCS, EMPTY_CLAIM, PLANS, SLA_HOURS, STATUSES, claimStepError, paymentUrl, type ClaimState, type Plan } from "@/lib/claim";
import { MARKETS, type MarketKey } from "@/lib/market";
import { RailsMark } from "./logo";

const CCS = CC.map(c => c[1]);
const HEADS = ["Whose claim is it?", "About the claim", "What you have", "Where to send the review"];
const STAGES = ["Claim", "Documents", "Contact"];
const stageOf = (step: number) => (step <= 1 ? 0 : step === 2 ? 1 : 2);

/** Claim second opinion intake, one card per step (Corgi pattern). */
export function ClaimFlow({ market = "sg" }: { market?: MarketKey }) {
  const M = MARKETS[market];
  const [s, setS] = useState<ClaimState>({ ...EMPTY_CLAIM, cc: M.cc });
  const [step, setStep] = useState(0);
  const [id] = useState(() => crypto.randomUUID());
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [hp, setHp] = useState("");
  const set = <K extends keyof ClaimState>(k: K, v: ClaimState[K]) => { setS(p => ({ ...p, [k]: v })); setErr(""); };
  const toggleDoc = (d: string) => setS(p => ({ ...p, docs: p.docs.includes(d) ? p.docs.filter(x => x !== d) : [...p.docs, d] }));

  const next = async () => {
    const e = claimStepError(step, s, CCS);
    if (e) { setErr(e); return; }
    if (step < 3) { setStep(step + 1); setErr(""); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...s, id, market, website: hp, sourceUrl: location.href }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(r.status === 400 && j.error ? j.error : `Could not send. Please try again, or call +65 ${site.phone}.`);
      const pay = s.plan ? paymentUrl(s.plan, s.email.trim(), id) : null;
      if (pay) { location.assign(pay); return; }
      setDone(true);
    } catch (x) { setErr(x instanceof Error ? x.message : "Could not send."); }
    finally { setBusy(false); }
  };

  if (done) return (
    <div className="gc-card" role="status">
      <div className="gc-head"><h3>Request received</h3><RailsMark id="cl-done-mark" className="gc-mark" /></div>
      <div className="gc-body">
        <p className="text-ink-2">We email {s.email} a payment link for {s.plan ? PLANS[s.plan].price : ""}. Reply to that email with the policy and the insurer&apos;s letter. Your PDF report arrives in the same thread within {SLA_HOURS} hours of receiving the documents, and a broker follows up there.</p>
      </div>
    </div>
  );

  return (
    <div className="grid gap-5">
      <ol className="gc-stepper" aria-label="Progress">
        {STAGES.map((g, i) => <li key={g} aria-current={i === stageOf(step) ? "step" : undefined} data-done={i < stageOf(step)}><span>{i + 1}</span>{g}</li>)}
      </ol>
      <form className="gc-card" noValidate onSubmit={e => { e.preventDefault(); void next(); }}>
        <div className="gc-head">
          <div><h3>{HEADS[step]}</h3>{step > 0 && s.plan && <p className="mt-1 text-[14px] text-ink-3">{PLANS[s.plan].label} · {PLANS[s.plan].price}</p>}</div>
          <RailsMark id="cl-mark" className="gc-mark" />
        </div>
        <div className="gc-body">
          {step === 0 && (
            <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
              {(Object.keys(PLANS) as Plan[]).map(p => (
                <button key={p} type="button" role="radio" aria-checked={s.plan === p} onClick={() => setS(x => ({ ...x, plan: p, type: x.plan === p ? x.type : "" }))} className="gc-chip !grid gap-1 !p-4 text-left">
                  <span className="flex items-baseline justify-between gap-3"><b className="text-[1.05rem]">{PLANS[p].label}</b><span className="tabular-nums">{PLANS[p].price}</span></span>
                  <span className="text-[14px] text-ink-2">{PLANS[p].note}</span>
                </button>
              ))}
            </div>
          )}

          {step === 1 && s.plan && (
            <div className="grid gap-4">
              <fieldset><legend className="gc-label">Type of claim</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup">{CLAIM_TYPES[s.plan].map(t => <button key={t} type="button" role="radio" aria-checked={s.type === t} onClick={() => set("type", t)} className="gc-chip">{t}</button>)}</div>
              </fieldset>
              <fieldset><legend className="gc-label">Where the claim is now</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup">{STATUSES.map(t => <button key={t} type="button" role="radio" aria-checked={s.status === t} onClick={() => set("status", t)} className="gc-chip">{t}</button>)}</div>
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="field sm:col-span-1">Insurer<input value={s.insurer} onChange={e => set("insurer", e.target.value)} maxLength={120} /></label>
                <label className="field">Amount claimed ({M.currency}, optional)<input inputMode="decimal" value={s.amount} onChange={e => set("amount", e.target.value)} maxLength={40} /></label>
                <label className="field">Date of the insurer&apos;s decision (optional)<input type="date" value={s.decisionDate} onChange={e => set("decisionDate", e.target.value)} /></label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4">
              <fieldset><legend className="gc-label">Documents you have (you upload them after this form)</legend>
                <div className="flex flex-wrap gap-2">{DOCS.map(d => <button key={d} type="button" aria-pressed={s.docs.includes(d)} onClick={() => { toggleDoc(d); setErr(""); }} className="gc-chip">{d}</button>)}</div>
              </fieldset>
              <label className="field">What happened, in a few sentences<textarea rows={4} value={s.story} onChange={e => set("story", e.target.value)} maxLength={4000} placeholder="What you claimed for, what the insurer decided, and the reason it gave" /></label>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="field sm:col-span-2">Name<input value={s.name} onChange={e => set("name", e.target.value)} autoComplete="name" maxLength={120} /></label>
              <label className="field sm:col-span-2">{s.plan === "business" ? "Work email" : "Email"}<input type="email" value={s.email} onChange={e => set("email", e.target.value)} autoComplete="email" maxLength={200} /></label>
              <div className="field sm:col-span-2">
                <label htmlFor="cl-phone">Mobile</label>
                <div className="flex gap-2">
                  <select aria-label="Country code" value={s.cc} onChange={e => set("cc", e.target.value)} className="qf-select">{CC.map(([c, code]) => <option key={c} value={code}>{c} {code}</option>)}</select>
                  <input id="cl-phone" type="tel" inputMode="tel" value={s.phone} onChange={e => set("phone", e.target.value)} autoComplete="tel-national" placeholder={(CC.find(c => c[1] === s.cc) ?? CC[0])[2]} maxLength={20} className="min-w-0 flex-1" />
                </div>
              </div>
              <label className="flex items-start gap-2.5 text-sm text-ink-2 sm:col-span-2">
                <input type="checkbox" checked={s.ack} onChange={e => set("ack", e.target.checked)} className="mt-1 size-4 accent-[var(--primary)]" />
                <span>I understand the review is a reading of my policy and claim, checked by a person after an AI read. It is not legal advice, does not act for me with the insurer, and cannot promise a different outcome.</span>
              </label>
              <label className="flex items-start gap-2.5 text-sm text-ink-2 sm:col-span-2">
                <input type="checkbox" checked={s.consent} onChange={e => set("consent", e.target.checked)} className="mt-1 size-4 accent-[var(--primary)]" />
                <span>I agree that Corp Cover and its advisers may use these details and my documents to review this claim and contact me, under {M.privacyLaw}.</span>
              </label>
            </div>
          )}

          <input value={hp} onChange={e => setHp(e.target.value)} name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
          {err && <p role="alert" className="text-sm font-medium text-[#b42318]">{err}</p>}
          <div className="flex gap-3">
            {step > 0 && <button type="button" onClick={() => { setStep(step - 1); setErr(""); }} className="btn-press btn-press--white">← Back</button>}
            <button type="submit" disabled={busy} className="btn-press flex-1">{step < 3 ? <>Continue <span aria-hidden>→</span></> : busy ? "Sending…" : s.plan ? `Continue to payment, ${PLANS[s.plan].price}` : "Continue to payment"}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
