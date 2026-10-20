"use client";

import { useMemo, useState, type FormEvent } from "react";
import { site } from "@/site";
import { CC } from "@/lib/find/questions";
import { COVER_GROUPS, EMAIL_RE, ROLES, UEN_RE } from "@/lib/quote";

type Step = 0 | 1 | 2;
const STEPS = ["Your company", "Who to contact", "Timing"];
const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

/** Three-step quote request: company and cover, contact, timing. Sends to /api/quote. */
export function QuoteForm({ preset = [] as string[] }: { preset?: string[] }) {
  const [step, setStep] = useState<Step>(0);
  const [id] = useState(() => crypto.randomUUID());
  const [f, setF] = useState({ company: "", uen: "", cover: preset, firstName: "", lastName: "", role: "", email: "", cc: "+65", phone: "", neededBy: "", details: "", consent: false, website: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF(p => ({ ...p, [k]: v })); setErr(null); };
  const toggle = (c: string) => set("cover", f.cover.includes(c) ? f.cover.filter(x => x !== c) : [...f.cover, c]);
  const ph = useMemo(() => (CC.find(c => c[1] === f.cc) ?? CC[0])[2], [f.cc]);

  const check = (s: Step): string | null => {
    if (s === 0) {
      if (f.company.trim().length < 2) return "Enter the company name.";
      if (f.uen.trim() && !UEN_RE.test(f.uen.trim())) return "UEN is 9 or 10 letters and digits.";
      if (!f.cover.length) return "Choose at least one cover, or Something else.";
    }
    if (s === 1) {
      if (!f.firstName.trim() || !f.lastName.trim()) return "Enter your first and last name.";
      if (!f.role) return "Choose your role.";
      if (!EMAIL_RE.test(f.email.trim())) return "Enter a valid work email.";
      const d = f.phone.replace(/\D/g, "").length;
      if (d < 7 || d > 12) return "Enter the phone number without the country code.";
    }
    if (s === 2) {
      if (!f.neededBy) return "Choose the date you need cover from.";
      if (!f.consent) return "Tick the consent box to send.";
    }
    return null;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = check(step);
    if (problem) { setErr(problem); return; }
    if (step < 2) { setStep((step + 1) as Step); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...f, id, sourceUrl: location.href }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error && r.status === 400 ? j.error : `Could not send. Please try again, or call ${site.phone}.`);
      setDone(true);
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Could not send."); }
    finally { setBusy(false); }
  };

  if (done) return (
    <div className="qf-card" role="status">
      <p className="text-[1.5rem] font-semibold tracking-[-0.02em]">Request received</p>
      <p className="mt-2 max-w-[48ch] text-ink-2">An adviser will contact {f.firstName} at {f.email} within 1 working day. A request is not a commitment to buy.</p>
    </div>
  );

  return (
    <form onSubmit={submit} className="qf-card" noValidate aria-label="Request quotes">
      <ol className="qf-steps" aria-label="Steps">
        {STEPS.map((s, i) => <li key={s} aria-current={i === step ? "step" : undefined} data-done={i < step}><span>{i + 1}</span>{s}</li>)}
      </ol>

      {step === 0 && (
        <div className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <label className="field">Company name<input value={f.company} onChange={e => set("company", e.target.value)} autoComplete="organization" maxLength={160} required /></label>
            <label className="field">UEN (optional)<input value={f.uen} onChange={e => set("uen", e.target.value.toUpperCase())} maxLength={10} placeholder="201912345K" /></label>
          </div>
          <fieldset className="grid gap-3">
            <legend className="mb-1 text-[0.8rem] font-semibold text-ink-2">Cover you need</legend>
            {COVER_GROUPS.map(g => (
              <div key={g.name} className="grid gap-2">
                <p className="text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-ink-3">{g.name}</p>
                <div className="flex flex-wrap gap-2">
                  {g.items.map(c => <button key={c} type="button" aria-pressed={f.cover.includes(c)} onClick={() => toggle(c)} className="qf-chip">{c}</button>)}
                </div>
              </div>
            ))}
          </fieldset>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="field">First name<input value={f.firstName} onChange={e => set("firstName", e.target.value)} autoComplete="given-name" maxLength={80} /></label>
          <label className="field">Last name<input value={f.lastName} onChange={e => set("lastName", e.target.value)} autoComplete="family-name" maxLength={80} /></label>
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-[0.8rem] font-semibold text-ink-2">Your role</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup">
              {ROLES.map(r => <button key={r} type="button" role="radio" aria-checked={f.role === r} onClick={() => set("role", r)} className="qf-chip">{r}</button>)}
            </div>
          </fieldset>
          <label className="field sm:col-span-2">Work email<input type="email" value={f.email} onChange={e => set("email", e.target.value)} autoComplete="email" maxLength={200} /></label>
          <div className="field sm:col-span-2">
            <label htmlFor="qf-phone">Phone</label>
            <div className="flex gap-2">
              <select aria-label="Country code" value={f.cc} onChange={e => set("cc", e.target.value)} className="qf-select">
                {CC.map(([c, code]) => <option key={c} value={code}>{c} {code}</option>)}
              </select>
              <input id="qf-phone" type="tel" inputMode="tel" value={f.phone} onChange={e => set("phone", e.target.value)} autoComplete="tel-national" placeholder={ph} maxLength={20} className="min-w-0 flex-1" />
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-4">
          <label className="field sm:max-w-[260px]">Cover needed from, or renewal date<input type="date" min={today()} value={f.neededBy} onChange={e => set("neededBy", e.target.value)} /></label>
          <label className="field">Anything the adviser should know (optional)<textarea rows={3} value={f.details} onChange={e => set("details", e.target.value)} maxLength={2000} placeholder="Current insurer, limits a contract asks for, number of staff" /></label>
          <label className="flex items-start gap-2.5 text-sm text-ink-2">
            <input type="checkbox" checked={f.consent} onChange={e => set("consent", e.target.checked)} className="mt-1 size-4 accent-[var(--primary)]" />
            <span>I agree that Corp Cover and its advisers may use these details to contact me about this request, under the Personal Data Protection Act.</span>
          </label>
        </div>
      )}

      <input name="website" value={f.website} onChange={e => set("website", e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      {err && <p role="alert" className="text-sm font-medium text-[#b42318]">{err}</p>}
      <div className="flex flex-wrap items-center gap-3">
        {step > 0 && <button type="button" onClick={() => { setStep((step - 1) as Step); setErr(null); }} className="btn btn-ghost">Back</button>}
        <button type="submit" disabled={busy} className="btn btn-primary">{step < 2 ? "Next" : busy ? "Sending…" : "Request quotes"}</button>
        <span className="text-sm text-ink-3">Step {step + 1} of 3 · No fee · A request is not a commitment to buy</span>
      </div>
    </form>
  );
}
