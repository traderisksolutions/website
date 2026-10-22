"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { site } from "@/site";
import { CC, dayLabel, workingDays } from "@/lib/find/questions";
import { BIZ, BIZ_BY_ID, COVER_GROUPS, EMPTY, FORMATS, HEADCOUNT, NOT_SURE, ROLES, SLOTS, extraFor, stepError, type QuoteState } from "@/lib/quote";
import { RailsMark } from "./logo";
import { MARKETS, mpath, type MarketKey } from "@/lib/market";

const CCS = CC.map(c => c[1]);
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(new Date());

/* ── Searchable, grouped business-type picker (combobox + listbox) ── */
export function BizPicker({ value, onChange, autoFocus = false }: { value: string; onChange: (id: string) => void; autoFocus?: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const hit = t ? BIZ.filter(b => `${b.label} ${b.k} ${b.group}`.toLowerCase().includes(t)) : BIZ;
    return hit.some(b => b.id === "other") ? hit : [...hit, BIZ_BY_ID.other];
  }, [q]);
  useEffect(() => {
    const off = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, []);
  useEffect(() => { if (autoFocus) input.current?.focus({ preventScroll: true }); }, [autoFocus]);
  const pick = (bid: string) => { onChange(bid); setOpen(false); setQ(""); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, list.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open && list[active]) { e.preventDefault(); pick(list[active].id); }
    else if (e.key === "Escape") setOpen(false);
  };
  const chosen = BIZ_BY_ID[value];
  return (
    <div ref={box} className="relative">
      <label htmlFor={`${id}-in`} className="gc-label">Business type</label>
      <div className="gc-combo" data-open={open}>
        <input
          ref={input} id={`${id}-in`} role="combobox" aria-expanded={open} aria-controls={`${id}-lb`} aria-autocomplete="list"
          aria-activedescendant={open && list[active] ? `${id}-o-${list[active].id}` : undefined}
          value={open ? q : chosen ? chosen.label : q} placeholder="Search business types" autoComplete="off"
          onFocus={() => { setOpen(true); setQ(""); setActive(0); }} onChange={e => { setQ(e.target.value); setOpen(true); setActive(0); }} onKeyDown={onKey}
        />
        <svg viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0 text-ink-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
      </div>
      {chosen && !open && <p className="mt-1.5 text-[13px] text-ink-3">{chosen.group}</p>}
      {open && (
        <ul id={`${id}-lb`} role="listbox" className="gc-list">
          {list.map((b, i) => {
            const head = i === 0 || list[i - 1].group !== b.group ? b.group : null;
            return (
              <li key={b.id} role="presentation">
                {head && <p className="gc-group">{head}</p>}
                <div id={`${id}-o-${b.id}`} role="option" aria-selected={b.id === value} data-active={i === active}
                  onMouseEnter={() => setActive(i)} onMouseDown={e => { e.preventDefault(); pick(b.id); }} className="gc-opt">{b.label}</div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ── Step 1 alone, for the home page: picks a type, then hands over to /get-covered ── */
export function GetCoveredStart({ market = "sg" }: { market?: MarketKey }) {
  const router = useRouter();
  const [biz, setBiz] = useState("");
  return (
    <div className="gc-card">
      <div className="gc-head"><h3>What type of business are you?</h3><RailsMark id="gc-home-mark" className="gc-mark" /></div>
      <div className="gc-body">
        <BizPicker value={biz} onChange={setBiz} />
        <button type="button" disabled={!biz} onClick={() => router.push(`${mpath(market, "/get-covered")}?biz=${biz}`)} className="btn-press w-full">Continue <span aria-hidden>→</span></button>
      </div>
    </div>
  );
}

/* ── The full flow ── */
// Corgi order: business type → contact (the lead is saved here) → questions for the cover chosen → call.
const STAGES = [{ name: "Business", steps: [0] }, { name: "Contact", steps: [1] }, { name: "Details", steps: [2, 3] }, { name: "Call", steps: [4] }];
const HEADS = ["What type of business are you?", "Who should the adviser speak to?", "What insurance do you need?", "A few questions about your business", "When should the adviser call?"];

export function GetCovered({ initialBiz = "", market = "sg" }: { initialBiz?: string; market?: MarketKey }) {
  const M = MARKETS[market];
  const KEY = `cc-get-covered-${market}`;
  const [s, setS] = useState<QuoteState>({ ...EMPTY, cc: M.cc });
  const [step, setStep] = useState(0);
  const [id] = useState(() => crypto.randomUUID());
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [hp, setHp] = useState("");
  const loaded = useRef(false);
  const days = useMemo(() => workingDays(), []);

  // Resume a saved draft; a type passed from the home page starts at the cover step.
  useEffect(() => {
    let saved: { s: QuoteState; step: number } | null = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { /* storage blocked */ }
    const fromHome = BIZ_BY_ID[initialBiz] ? initialBiz : "";
    queueMicrotask(() => {
      if (saved?.s) { setS({ ...EMPTY, ...saved.s, extra: saved.s.extra ?? {}, cc: saved.s.cc || M.cc, ...(fromHome && fromHome !== saved.s.biz ? { biz: fromHome, covers: BIZ_BY_ID[fromHome].c } : {}) }); setStep(fromHome && fromHome !== saved.s.biz ? 1 : Math.min(saved.step ?? 0, 4)); }
      else if (fromHome) { setS({ ...EMPTY, cc: M.cc, biz: fromHome, covers: BIZ_BY_ID[fromHome].c }); setStep(1); }
      loaded.current = true;
    });
  }, [initialBiz, KEY, M.cc]);
  useEffect(() => { if (loaded.current && !done) try { localStorage.setItem(KEY, JSON.stringify({ s, step })); } catch { /* ignore */ } }, [s, step, done, KEY]);

  const set = <K extends keyof QuoteState>(k: K, v: QuoteState[K]) => { setS(p => ({ ...p, [k]: v })); setErr(""); };
  const setExtra = (k: string, v: string) => setS(p => ({ ...p, extra: { ...p.extra, [k]: v } }));
  const chooseBiz = (b: string) => setS(p => ({ ...p, biz: b, covers: p.biz === b && p.covers.length ? p.covers : BIZ_BY_ID[b].c })) ;
  const toggle = (c: string) => setS(p => {
    if (c === NOT_SURE) return { ...p, covers: p.covers.includes(NOT_SURE) ? [] : [NOT_SURE] };
    const rest = p.covers.filter(x => x !== NOT_SURE);
    return { ...p, covers: rest.includes(c) ? rest.filter(x => x !== c) : [...rest, c] };
  });
  const biz = BIZ_BY_ID[s.biz];

  const save = async (stage: "contact" | "final") => {
    const r = await fetch("/api/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...s, id, market, stage, website: hp, sourceUrl: location.href }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 400 && j.error ? j.error : `Could not send. Please try again, or call ${site.phone}.`);
  };
  const next = async () => {
    const e = stepError(step, s, CCS, market);
    if (e) { setErr(e); return; }
    if (step === 1 || step === 4) {
      setBusy(true); setErr("");
      try { await save(step === 1 ? "contact" : "final"); }
      catch (x) { setErr(x instanceof Error ? x.message : "Could not send."); setBusy(false); return; }
      setBusy(false);
      if (step === 4) { setDone(true); try { localStorage.removeItem(KEY); } catch { /* ignore */ } return; }
    }
    setStep(step + 1); setErr(""); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const back = () => { setStep(Math.max(0, step - 1)); setErr(""); };
  const stage = STAGES.findIndex(g => g.steps.includes(step));

  if (done) return (
    <div className="gc-card" role="status">
      <div className="gc-head"><h3>Request sent</h3><RailsMark id="gc-done-mark" className="gc-mark" /></div>
      <div className="gc-body">
        <p className="text-ink-2">An adviser will confirm a {s.slot.toLowerCase()} call on {dayLabel(s.day)} by email to {s.email}, within 1 working day.</p>
        <div><p className="gc-label">Cover to discuss</p><div className="flex flex-wrap gap-2">{s.covers.map(c => <span key={c} className="gc-chip" aria-pressed="true">{c === "Work injury compensation" ? M.workInjury : c}</span>)}</div></div>
        <Link href={mpath(market, "/articles")} className="btn btn-ghost justify-self-start">Read the guides while you wait</Link>
      </div>
    </div>
  );

  return (
    <div className="grid gap-5">
      <ol className="gc-stepper" aria-label="Progress">
        {STAGES.map((g, i) => <li key={g.name} aria-current={i === stage ? "step" : undefined} data-done={i < stage}><span>{i + 1}</span>{g.name}</li>)}
      </ol>
      <form className="gc-card" noValidate onSubmit={e => { e.preventDefault(); void next(); }}>
        <div className="gc-head">
          <div><h3>{HEADS[step]}</h3>{step > 0 && biz && <p className="mt-1 text-[14px] text-ink-3">{biz.label}</p>}</div>
          <RailsMark id="gc-mark" className="gc-mark" />
        </div>
        <div className="gc-body">
          {step === 0 && <BizPicker value={s.biz} onChange={b => { chooseBiz(b); setErr(""); }} />}

          {step === 1 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <p className="text-[14px] text-ink-2 sm:col-span-2">An adviser calls with options from several insurers. Insurers pay the adviser; your business pays no fee.</p>
              <label className="field sm:col-span-2">Company name<input value={s.company} onChange={e => set("company", e.target.value)} autoComplete="organization" maxLength={160} /></label>
              <label className="field">First name<input value={s.firstName} onChange={e => set("firstName", e.target.value)} autoComplete="given-name" maxLength={80} /></label>
              <label className="field">Last name<input value={s.lastName} onChange={e => set("lastName", e.target.value)} autoComplete="family-name" maxLength={80} /></label>
              <fieldset className="sm:col-span-2"><legend className="gc-label">Your role</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup">{ROLES.map(r => <button key={r} type="button" role="radio" aria-checked={s.role === r} onClick={() => set("role", r)} className="gc-chip">{r}</button>)}</div>
              </fieldset>
              <label className="field sm:col-span-2">Work email<input type="email" value={s.email} onChange={e => set("email", e.target.value)} autoComplete="email" maxLength={200} /></label>
              <div className="field sm:col-span-2">
                <label htmlFor="gc-phone">Mobile</label>
                <div className="flex gap-2">
                  <select aria-label="Country code" value={s.cc} onChange={e => set("cc", e.target.value)} className="qf-select">{CC.map(([c, code]) => <option key={c} value={code}>{c} {code}</option>)}</select>
                  <input id="gc-phone" type="tel" inputMode="tel" value={s.phone} onChange={e => set("phone", e.target.value)} autoComplete="tel-national" placeholder={(CC.find(c => c[1] === s.cc) ?? CC[0])[2]} maxLength={20} className="min-w-0 flex-1" />
                </div>
              </div>
              <label className="flex items-start gap-2.5 text-sm text-ink-2 sm:col-span-2">
                <input type="checkbox" checked={s.consent} onChange={e => set("consent", e.target.checked)} className="mt-1 size-4 accent-[var(--primary)]" />
                <span>I agree that Corp Cover and its advisers may use these details to contact me about this request, under {M.privacyLaw}.</span>
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4">
              <p className="text-[14px] text-ink-2">Choose all that apply.{biz && biz.c.length > 0 && <> Pre-selected: cover common for {biz.label.toLowerCase()}. Change anything.</>}</p>
              {COVER_GROUPS.map(g => (
                <div key={g.name} className="grid gap-2">
                  <p className="gc-group !px-0">{g.name}</p>
                  <div className="flex flex-wrap gap-2">{g.items.map(c => <button key={c} type="button" aria-pressed={s.covers.includes(c)} onClick={() => { toggle(c); setErr(""); }} className="gc-chip">{c === "Work injury compensation" ? M.workInjury : c}</button>)}</div>
                </div>
              ))}
              <div><button type="button" aria-pressed={s.covers.includes(NOT_SURE)} onClick={() => { toggle(NOT_SURE); setErr(""); }} className="gc-chip">{NOT_SURE}</button></div>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-4">
              <label className="field sm:max-w-[320px]">{M.regNo} (optional)<input value={s.uen} onChange={e => set("uen", e.target.value.toUpperCase())} maxLength={20} placeholder={market === "sg" ? "201912345K" : ""} /></label>
              <fieldset><legend className="gc-label">Staff, including directors</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup">{HEADCOUNT.map(h => <button key={h} type="button" role="radio" aria-checked={s.headcount === h} onClick={() => set("headcount", h)} className="gc-chip">{h}</button>)}</div>
              </fieldset>
              <label className="field sm:max-w-[280px]">Cover needed from, or renewal date<input type="date" min={today()} value={s.neededBy} onChange={e => set("neededBy", e.target.value)} /></label>
              <fieldset><legend className="gc-label">Any insurance claims in the last 5 years?</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup">{[["no", "No"], ["yes", "Yes"]].map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={s.claims === v} onClick={() => set("claims", v)} className="gc-chip">{l}</button>)}</div>
              </fieldset>
              {extraFor(s.covers).map(q => q.opts ? (
                <fieldset key={q.id}><legend className="gc-label">{q.id === "turnover" ? `${q.label} (${M.currency})` : q.label} <span className="font-normal text-ink-3">(optional)</span></legend>
                  <div className="flex flex-wrap gap-2" role="radiogroup">{q.opts.map(o => <button key={o} type="button" role="radio" aria-checked={s.extra[q.id] === o} onClick={() => setExtra(q.id, s.extra[q.id] === o ? "" : o)} className="gc-chip">{o}</button>)}</div>
                </fieldset>
              ) : (
                <label key={q.id} className="field sm:max-w-[320px]">{q.label} ({M.currency}, optional)<input inputMode="decimal" value={s.extra[q.id] ?? ""} onChange={e => setExtra(q.id, e.target.value)} maxLength={40} placeholder={q.ph} /></label>
              ))}
              <label className="field">Does a lease, contract or tender ask for specific cover? (optional)<textarea rows={2} value={s.contract} onChange={e => set("contract", e.target.value)} maxLength={1000} placeholder="e.g. Mall lease asks for S$2m public liability" /></label>
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-4">
              <fieldset><legend className="gc-label">How to meet</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup">{FORMATS.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={s.format === v} onClick={() => set("format", v)} className="gc-chip">{l}</button>)}</div>
              </fieldset>
              <fieldset><legend className="gc-label">Preferred day</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup">{days.map(d => <button key={d} type="button" role="radio" aria-checked={s.day === d} onClick={() => set("day", d)} className="gc-chip tabular-nums">{dayLabel(d)}</button>)}</div>
              </fieldset>
              <fieldset><legend className="gc-label">Time of day (local time)</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup">{SLOTS.map(t => <button key={t} type="button" role="radio" aria-checked={s.slot === t} onClick={() => set("slot", t)} className="gc-chip">{t}</button>)}</div>
              </fieldset>
              <label className="field">Anything to help the adviser prepare (optional)<textarea rows={2} value={s.notes} onChange={e => set("notes", e.target.value)} maxLength={2000} placeholder="Current insurer, limits you hold, what prompted the review" /></label>
              <p className="text-[13px] text-ink-3">This is a request, not a booking. An adviser confirms the time by email. A request is not a commitment to buy.</p>
            </div>
          )}

          <input value={hp} onChange={e => setHp(e.target.value)} name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
          {err && <p role="alert" className="text-sm font-medium text-[#b42318]">{err}</p>}
          <div className="flex gap-3">
            {step > 0 && <button type="button" onClick={back} className="btn-press btn-press--white">← Back</button>}
            <button type="submit" disabled={busy} className="btn-press flex-1">{busy ? "Saving…" : step < 4 ? <>Continue <span aria-hidden>→</span></> : "Send request"}</button>
          </div>
        </div>
      </form>
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-[14px] text-ink-3">
        <Link href={mpath(market)} className="hover:text-ink">Back to website</Link>
        {M.find && <Link href={mpath(market, "/find")} className="hover:text-ink">Prefer the detailed questions?</Link>}
      </div>
    </div>
  );
}
