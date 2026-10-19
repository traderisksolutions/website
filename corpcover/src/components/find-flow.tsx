"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CC, KEYS, QBY, TIMES, dayLabel, dayMonth, dayNum, dayWeekday, presetNeeds, s, sectionOf, titleOf, validate, visible, workingDays,
  type Answers, type Contact, type Question,
} from "@/lib/find/questions";
import { site } from "@/site";

// Find my cover: one question per screen, full-screen modal. Answers save to localStorage ("cc-find")
// so a reload resumes, and post to /api/find: partial after each step, submitted on the last one.

const STORE = "cc-find";
type Saved = { id: string; A: Answers; cur: string; status?: "submitted" };
const fresh = (): Saved => ({ id: crypto.randomUUID(), A: {}, cur: "industry" });

function load(days: string[]): Saved {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORE) || "null");
    const v = raw as Partial<Saved> | null;
    if (v && typeof v.id === "string" && v.A && typeof v.A === "object" && typeof v.cur === "string") {
      const saved: Saved = { id: v.id, A: { ...v.A }, cur: v.cur, status: v.status === "submitted" ? "submitted" : undefined };
      // A preferred time that has passed is dropped, unless the request was already sent.
      if (!saved.status && saved.A.slot && !days.includes(saved.A.slot.day)) {
        delete saved.A.slot;
        if (saved.cur === "done") saved.cur = "slot";
      }
      if (!saved.status && saved.cur === "done") saved.cur = "slot";
      return saved;
    }
  } catch { /* storage blocked or corrupt: start fresh */ }
  return fresh();
}

async function post(status: "partial" | "submitted", id: string, A: Answers) {
  try {
    const res = await fetch("/api/find", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, site: "corpcover", status, source_url: window.location.href, answers: A }),
      keepalive: status === "partial",
    });
    return res.ok;
  } catch {
    return false;
  }
}

const tel = `tel:+65${site.phone.replace(/\s/g, "")}`;

/** Full-screen Find my cover modal. Mounted while open; plays its own close animation, then calls onClose. */
export function FindModal({ onClose }: { onClose: () => void }) {
  const [init] = useState(() => { const days = workingDays(); return { days, saved: load(days) }; });
  const days = init.days;
  const [id, setId] = useState(init.saved.id);
  const [A, setA] = useState<Answers>(init.saved.A);
  const [cur, setCur] = useState(init.saved.cur);
  const [status, setStatus] = useState<"submitted" | undefined>(init.saved.status);
  const [dir, setDir] = useState<"up" | "down">("up");
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [bookDay, setBookDay] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const [shown, setShown] = useState(false);

  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const advance = useRef<number | undefined>(undefined);
  const closing = useRef(false);
  const latest = useRef({ id, A, status });
  const onKeyRef = useRef<(e: KeyboardEvent) => void>(() => {});

  const list = visible(A);
  let i = list.findIndex(q => q.id === cur);
  if (i < 0) i = 0;
  const q = list[i];

  /* ── Open: show the dialog, lock page scroll, fade in ── */
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (!d.open) d.showModal();
    const html = document.documentElement, prev = html.style.overflow;
    html.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => setShown(true));
    return () => { cancelAnimationFrame(raf); html.style.overflow = prev; window.clearTimeout(advance.current); };
  }, []);

  /* ── Keep the latest answers for timers and the close flush; persist for reloads ── */
  useEffect(() => {
    latest.current = { id, A, status };
    try { localStorage.setItem(STORE, JSON.stringify({ id, A, cur, status })); } catch { /* storage unavailable */ }
  }, [id, A, cur, status]);

  /* ── Partial save after each step, once the industry is known. Failures are silent. ── */
  useEffect(() => {
    if (status === "submitted") return;
    const t = window.setTimeout(() => {
      const l = latest.current;
      if (l.status !== "submitted" && s(l.A, "industry")) void post("partial", l.id, l.A);
    }, 800);
    return () => window.clearTimeout(t);
  }, [cur, id, status]);

  /* ── Focus: the input on text steps; otherwise keep focus inside the dialog without picking an option ── */
  useEffect(() => {
    stage.current?.scrollTo({ top: 0 });
    const root = panel.current;
    if (!root) return;
    const field = root.querySelector<HTMLElement>("[data-in]");
    if (field) { field.focus({ preventScroll: true }); return; }
    if (q.type === "contact" && !A.contact?.company) { root.querySelector<HTMLElement>("[data-c]")?.focus({ preventScroll: true }); return; }
    if (!root.contains(document.activeElement)) root.querySelector<HTMLElement>("[data-q]")?.focus({ preventScroll: true });
    // Only on step change: typing must not move focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur]);

  /* ── Keyboard: letters pick options, Enter continues, Shift+Enter is a new line in long text ── */
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKeyRef.current(e);
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  const requestClose = () => {
    if (closing.current) return;
    closing.current = true;
    window.clearTimeout(advance.current);
    const l = latest.current;
    if (l.status !== "submitted" && s(l.A, "industry")) void post("partial", l.id, l.A);
    setShown(false);
    window.setTimeout(() => { dialog.current?.close(); onClose(); }, 280);
  };

  const goFrom = (a: Answers, from: string, delta: number) => {
    const l = visible(a);
    let k = l.findIndex(x => x.id === from);
    if (k < 0) k = 0;
    if (delta > 0) { const e = validate(l[k], a); if (e) { setErr(e); return; } }
    const j = Math.max(0, Math.min(l.length - 1, k + delta));
    if (j === k) return;
    const nid = l[j].id;
    if (nid === "done") return; // reached only through submit()
    const next = nid === "needs" && !Array.isArray(a.needs) ? { ...a, needs: presetNeeds(s(a, "industry")) } : a;
    if (next !== a) setA(next);
    setDir(delta > 0 ? "up" : "down");
    setErr("");
    setCur(nid);
  };

  const submit = async () => {
    if (sending) return;
    const e = validate(QBY.slot, A);
    if (e) { setErr(e); return; }
    setErr(""); setSending(true); setSendFailed(false);
    const ok = await post("submitted", id, A);
    setSending(false);
    if (!ok) { setSendFailed(true); return; }
    setStatus("submitted"); setDir("up"); setCur("done");
  };

  const next = () => { window.clearTimeout(advance.current); if (q.type === "booking") void submit(); else goFrom(A, q.id, 1); };
  const prev = () => { window.clearTimeout(advance.current); goFrom(A, q.id, -1); };

  const set = (k: string, v: Answers[string]) => { setA(a => ({ ...a, [k]: v })); if (err) setErr(""); };
  const setContact = (k: keyof Contact, v: string | boolean) => { setA(a => ({ ...a, contact: { cc: "+65", ...a.contact, [k]: v } })); if (err) setErr(""); };

  const choose = (question: Question, v: string) => {
    if (question.type === "multi") {
      const arr = Array.isArray(A[question.id]) ? [...(A[question.id] as string[])] : [];
      set(question.id, arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
      setErr("");
      return;
    }
    const nextA: Answers = { ...A, [question.id]: v };
    if (question.id === "industry") delete nextA.needs;
    setA(nextA); setErr(""); setFlash(v);
    window.clearTimeout(advance.current);
    advance.current = window.setTimeout(() => { setFlash(null); goFrom(nextA, question.id, 1); }, 320);
  };

  const reset = () => {
    const f = fresh();
    setId(f.id); setA(f.A); setStatus(undefined); setDir("down"); setErr(""); setBookDay(null); setSendFailed(false); setCur(f.cur);
  };

  useEffect(() => {
    onKeyRef.current = (e: KeyboardEvent) => {
      if (closing.current || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null, tag = (t?.tagName || "").toLowerCase();
      if (e.key === "Enter") {
        if (tag === "textarea" && e.shiftKey) return;
        if (tag === "button" && !t?.matches("[data-ok]")) return;
        if (tag === "input" && (t as HTMLInputElement).type === "checkbox") return;
        if (tag === "select") return;
        if (q.type === "end") return;
        e.preventDefault(); next(); return;
      }
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if ((q.type === "choice" || q.type === "multi") && /^[a-z]$/i.test(e.key)) {
        const op = q.opts?.[KEYS.indexOf(e.key.toUpperCase())];
        if (op) { e.preventDefault(); choose(q, op.v); }
      }
    };
  });

  /* ── Render ── */
  const title = titleOf(q, A);
  const isEnd = q.type === "end";
  const pct = Math.round((i / (list.length - 1)) * 100);
  const optional = !!q.optional?.(A);
  const errEl = err ? <span className="tf-err" role="alert">{err}</span> : null;
  const ok = (label: ReactNode = "OK", hint: ReactNode = <>press <b>Enter ↵</b></>) => (
    <div className="tf-okrow">
      <button type="button" className="tf-ok" data-ok onClick={next} disabled={sending}>{label} <span aria-hidden>✓</span></button>
      <span className="tf-hint tf-keyhint">{hint}</span>
    </div>
  );

  let body: ReactNode = null;
  if (q.type === "scale") {
    body = <>
      <div className="tf-scale" role="radiogroup" aria-label={title}>
        {q.opts!.map(op => (
          <button key={op.v} type="button" role="radio" aria-checked={A[q.id] === op.v} onClick={() => choose(q, op.v)}
            className={`tf-opt tf-scl${flash === op.v ? " tf-flash" : ""}`}>{op.l}</button>
        ))}
      </div>
      <div className="tf-scale-ends"><span>{q.lo}</span><span>{q.hi}</span></div>
      {errEl}
    </>;
  } else if (q.type === "choice" || q.type === "multi") {
    const multi = q.type === "multi";
    const sel = A[q.id];
    body = <>
      <div className={`tf-opts${q.wide ? " tf-opts--wide" : ""}`} role={multi ? "group" : "radiogroup"} aria-label={title}>
        {q.opts!.map((op, k) => {
          const on = multi ? Array.isArray(sel) && sel.includes(op.v) : sel === op.v;
          return (
            <button key={op.v} type="button" onClick={() => choose(q, op.v)} className={`tf-opt${flash === op.v ? " tf-flash" : ""}`}
              {...(multi ? { "aria-pressed": on } : { role: "radio", "aria-checked": on })}>
              <span className="tf-k" aria-hidden>{KEYS[k]}</span><span className="tf-l">{op.l}</span><span className="tf-tick" aria-hidden>✓</span>
            </button>
          );
        })}
      </div>
      {multi && <><p className="tf-hint">Choose as many as you like</p>{ok()}</>}
      {errEl}
    </>;
  } else if (q.type === "text" || q.type === "number") {
    body = <>
      <input data-in type={q.type === "number" ? "number" : "text"} inputMode={q.type === "number" ? "numeric" : "text"} className="tf-input"
        placeholder={q.ph} aria-label={title} value={s(A, q.id) ?? ""} onChange={e => set(q.id, e.target.value)} maxLength={300} />
      {errEl}{ok()}
    </>;
  } else if (q.type === "long") {
    body = <>
      <textarea data-in rows={3} className="tf-input tf-textarea" placeholder={q.ph} aria-label={title} value={s(A, q.id) ?? ""}
        onChange={e => set(q.id, e.target.value)} maxLength={4000} />
      {errEl}{ok("OK", <><b>Shift + Enter ↵</b> for a new line{optional ? " · optional" : ""}</>)}
    </>;
  } else if (q.type === "upload") {
    body = <UploadStep file={A.upload} onFile={f => set("upload", f)} errEl={errEl} ok={ok(A.upload ? "OK" : "Skip")} />;
  } else if (q.type === "contact") {
    const c = A.contact || {}, cc = c.cc || "+65";
    body = <>
      <div className="tf-fields">
        <label>Your name<input data-c className="tf-input" type="text" autoComplete="name" placeholder="Tan Wei Ming" maxLength={120} value={c.name ?? ""} onChange={e => setContact("name", e.target.value)} /></label>
        <label>Company name<input className="tf-input" type="text" autoComplete="organization" placeholder="Acme Pte Ltd" maxLength={160} value={c.company ?? ""} onChange={e => setContact("company", e.target.value)} /></label>
        <label>Email<input className="tf-input" type="email" autoComplete="email" placeholder="name@company.com" maxLength={200} value={c.email ?? ""} onChange={e => setContact("email", e.target.value)} /></label>
        <div className="tf-phone">
          <span id="tf-phone-label">Phone</span>
          <div className="tf-phone-row">
            <select aria-label="Country code" value={cc} onChange={e => setContact("cc", e.target.value)}>
              {CC.map(([code, dial]) => <option key={code} value={dial}>{code} {dial}</option>)}
            </select>
            <input className="tf-input" type="tel" autoComplete="tel-national" aria-label="Phone number" maxLength={30}
              placeholder={(CC.find(x => x[1] === cc) || CC[0])[2]} value={c.phone ?? ""} onChange={e => setContact("phone", e.target.value)} />
          </div>
        </div>
        <label className="tf-consent">
          <input type="checkbox" checked={!!c.consent} onChange={e => setContact("consent", e.target.checked)} />
          I agree that Corp Cover and its advisers may use these details to contact me about this request, under the Personal Data Protection Act.
        </label>
      </div>
      {errEl}{ok()}
    </>;
  } else if (q.type === "booking") {
    const pick = A.slot;
    const day = bookDay ?? (pick && days.includes(pick.day) ? pick.day : days[0]);
    body = <>
      <div className="tf-days" role="radiogroup" aria-label="Day">
        {days.map(d => (
          <button key={d} type="button" role="radio" aria-checked={d === day} className="tf-day" onClick={() => setBookDay(d)} aria-label={dayLabel(d)}>
            <small>{dayWeekday(d)}</small><b>{dayNum(d)}</b><small>{dayMonth(d)}</small>
          </button>
        ))}
      </div>
      <div className="tf-slots" role="radiogroup" aria-label="Time">
        {TIMES.map(t => (
          <button key={t} type="button" role="radio" aria-checked={pick?.day === day && pick?.time === t} className="tf-slot"
            onClick={() => { set("slot", { day, time: t }); setSendFailed(false); }}>{t}</button>
        ))}
      </div>
      {errEl}
      {sendFailed && <span className="tf-err" role="alert">Could not send. Please try again, or call <a href={tel} className="underline underline-offset-2">{site.phone}</a>.</span>}
      {ok(sending ? "Sending…" : sendFailed ? "Try again" : "Send request")}
    </>;
  } else if (isEnd) {
    const sl = A.slot, c = A.contact || {};
    body = (
      <div className="tf-end">
        <h2 className="tf-big">Requested: {sl ? dayLabel(sl.day) : ""}, {sl?.time ?? ""} SGT</h2>
        <p className="tf-help">An adviser will confirm by email within 1 working day.</p>
        {s(A, "format") === "whatsapp" && <p className="tf-help">The adviser will call {c.cc || "+65"} {c.phone} on WhatsApp.</p>}
        <div className="tf-okrow">
          <button type="button" className="tf-ok" onClick={requestClose}>Close</button>
          <button type="button" className="tf-link" onClick={reset}>Start again</button>
        </div>
      </div>
    );
  }

  return (
    <dialog ref={dialog} className="tf-dialog" data-shown={shown} aria-label="Find my cover"
      onCancel={e => { e.preventDefault(); requestClose(); }}
      onClose={() => { if (!closing.current) { closing.current = true; onClose(); } }}>
      <div className="tf-backdrop" onClick={requestClose} aria-hidden />
      <div ref={panel} className="tf">
        <div className="tf-bar" aria-hidden><i style={{ width: `${isEnd ? 100 : pct}%` }} /></div>
        <p className="tf-sec">{isEnd ? "" : sectionOf(q)}</p>
        <button type="button" onClick={requestClose} aria-label="Close" className="tf-close">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
        <div ref={stage} className="tf-stage">
          <div key={cur} data-q tabIndex={-1} className={`tf-q tf-in-${dir}`}>
            {!isEnd && (
              <>
                <h2 className="tf-title"><span className="tf-n">{i + 1} <span aria-hidden>→</span></span><span>{title}</span></h2>
                {q.help && <p className="tf-help">{q.help}</p>}
              </>
            )}
            <div className="tf-body">{body}</div>
          </div>
        </div>
        <div className="tf-nav">
          <button type="button" onClick={prev} disabled={i === 0 || isEnd} aria-label="Previous question">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m18 15-6-6-6 6" /></svg>
          </button>
          <button type="button" onClick={next} disabled={isEnd || sending} aria-label="Next question">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** Policy schedule: only the file name and size are recorded in v1; the file itself is not sent. */
function UploadStep({ file, onFile, errEl, ok }: { file?: { name: string; size: number }; onFile: (f: { name: string; size: number }) => void; errEl: ReactNode; ok: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  return <>
    <button type="button" className="tf-drop" onClick={() => input.current?.click()}>
      <b>{file ? file.name : "Choose file"}</b>
      <span>{file ? `${(file.size / 1048576).toFixed(1)} MB · click to replace` : "PDF or photo"}</span>
    </button>
    <input ref={input} type="file" accept=".pdf,image/*" hidden aria-label="Policy schedule"
      onChange={e => { const f = e.target.files?.[0]; if (f) onFile({ name: f.name, size: f.size }); }} />
    {errEl}{ok}
  </>;
}
