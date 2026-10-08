"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ActionArt, type ActionArtKind } from "./action-art";
import { Modal } from "./modal";
import { questions, recommend, summarise, type Answers } from "@/lib/cover-finder";
import { sendEnquiry, type SendResult } from "@/lib/enquiry";
import { site } from "@/site";

type Flow = "choose" | "review" | "finder" | "callback" | null;

const whatsapp = `https://wa.me/65${site.phone.replace(/\s/g, "")}?text=${encodeURIComponent("Hi, I would like quotes for business insurance.")}`;

const OPEN_EVENT = "corpcover:start";
/** Opens the Start here modal from anywhere on the site. */
export const openStart = () => window.dispatchEvent(new Event(OPEN_EVENT));

/** One modal, mounted once in the layout: pick a way to start, then that flow. */
export function StartModal() {
  const [flow, setFlow] = useState<Flow>(null);
  useEffect(() => {
    const open = () => setFlow("choose");
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);
  const close = () => setFlow(null);

  return (
    <Modal open={flow !== null} onClose={close} label="Start here">
      {flow === "choose" && <Chooser onPick={setFlow} />}
      {flow && flow !== "choose" && (
        <button type="button" onClick={() => setFlow("choose")} className="glass mb-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-ink-2">
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          All options
        </button>
      )}
      {flow === "review" && <ReviewFlow />}
      {flow === "finder" && <FinderFlow />}
      {flow === "callback" && <CallbackFlow />}
    </Modal>
  );
}

/** Button that opens the Start here modal. */
export function StartButton({ className, children = "Start here" }: { className?: string; children?: ReactNode }) {
  return <button type="button" onClick={openStart} className={className}>{children}</button>;
}

const choices: { flow: "review" | "finder" | "callback"; art: ActionArtKind; tone: string; title: string; text: string }[] = [
  { flow: "review", art: "review", tone: "bg-tile-sand", title: "Policy review", text: "Upload your current policy. See the gaps, the overlaps and what is overpriced." },
  { flow: "finder", art: "finder", tone: "bg-tile-sky", title: "Cover finder", text: "Five questions. See which policies a company like yours usually holds, and why." },
  { flow: "callback", art: "adviser", tone: "bg-tile-sage", title: "Talk to an adviser", text: "WhatsApp or a callback. Open every day." },
];

function Chooser({ onPick }: { onPick: (f: Flow) => void }) {
  return (
    <div className="space-y-5">
      <Eyebrow>Start here</Eyebrow>
      <h2 className="text-center text-2xl font-bold tracking-tight">How would you like to start?</h2>
      <ul className="space-y-3">
        {choices.map(c => (
          <li key={c.flow}>
            <button type="button" onClick={() => onPick(c.flow)} className="choice group w-full !items-center !gap-4 !rounded-2xl !p-3 !pr-4">
              <span className={`${c.tone} grid size-20 shrink-0 place-items-center rounded-xl p-1.5 sm:size-24`}><ActionArt kind={c.art} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[1.08rem] font-bold">{c.title}</span>
                <span className="mt-0.5 block text-sm leading-snug text-ink-2">{c.text}</span>
              </span>
              <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-center text-sm text-ink-3">
        Or <a href={whatsapp} target="_blank" rel="noopener" className="font-medium text-ink underline-offset-2 hover:underline">message us on WhatsApp</a> · <a href={`tel:+65${site.phone.replace(/\s/g, "")}`} className="font-medium text-ink underline-offset-2 hover:underline">{site.phone}</a>
      </p>
    </div>
  );
}

/* ── Shared pieces ─────────────────────────────────────────────── */

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="pr-10 text-center text-[0.78rem] font-semibold uppercase tracking-[0.12em] text-ink-2">{children}</p>;
}

function ContactFields({ withCompany = true, withEmail = true }: { withCompany?: boolean; withEmail?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="field">Name<input name="name" required autoComplete="name" /></label>
      {withCompany && <label className="field">Company<input name="company" autoComplete="organization" /></label>}
      <label className="field">Phone<input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="8123 4567" /></label>
      {withEmail && <label className="field">Email<input name="email" type="email" autoComplete="email" /></label>}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
    </div>
  );
}

function Outcome({ result, sentText, attachNote }: { result: SendResult; sentText: string; attachNote?: string }) {
  if (result.ok) return (
    <div className="py-6 text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-full bg-accent text-accent-ink">
        <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
      </div>
      <p className="mt-4 text-xl font-bold">Received</p>
      <p className="mt-1 text-ink-2">{sentText}</p>
    </div>
  );
  return (
    <div className="py-4 text-center">
      <p className="text-xl font-bold">Send by email</p>
      <p className="mx-auto mt-2 max-w-[42ch] text-ink-2">Online sending is not available right now. Your details are filled into an email to {site.email}.{attachNote ? ` ${attachNote}` : ""}</p>
      <a href={result.fallback} className="glass-primary mt-5 inline-block px-6 py-3 font-semibold">Open email</a>
    </div>
  );
}

function useSubmit(subject: string, build: (fd: FormData) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!String(fd.get("phone") || "").trim() && !String(fd.get("email") || "").trim()) { setError("Enter a phone number or an email address."); return; }
    build(fd);
    setBusy(true); setError(null);
    const r = await sendEnquiry(fd, subject);
    setBusy(false);
    if (!r.ok && !r.fallback) { setError(r.message ?? "Something went wrong. Try again."); return; }
    setResult(r);
  };
  return { busy, error, result, onSubmit };
}

/* ── Policy review ─────────────────────────────────────────────── */

function ReviewFlow() {
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { busy, error, result, onSubmit } = useSubmit("Policy review request", fd => {
    fd.set("kind", "policy-review");
    if (file) fd.set("file", file);
  });

  if (result) return <Outcome result={result} sentText="An adviser will review the policy and contact you." attachNote="Attach the policy before sending." />;

  const pick = (f: File | undefined) => f && setFile(f);
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Eyebrow>Policy review</Eyebrow>
      <h2 className="text-center text-2xl font-bold tracking-tight">Upload your current policy</h2>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
        className={`flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors ${drag ? "border-accent bg-accent-soft" : "border-ink/15 bg-ink/[0.03] hover:border-ink/30"}`}
      >
        <svg viewBox="0 0 24 24" className="size-8 text-accent" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>
        {file
          ? <span className="font-semibold">{file.name} <span className="font-normal text-ink-3">· {(file.size / 1024 / 1024).toFixed(1)} MB</span></span>
          : <span className="font-semibold">Drop the policy schedule here, or browse</span>}
        <span className="text-sm text-ink-3">PDF, JPG or PNG, up to 4 MB</span>
      </button>
      <input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,application/pdf,image/*" className="hidden" onChange={e => pick(e.target.files?.[0])} />
      <ContactFields />
      <label className="field">Anything to check in particular<textarea name="details" rows={2} /></label>
      {error && <p role="alert" className="text-sm font-medium text-[#b42318]">{error}</p>}
      <button type="submit" disabled={busy || !file} className="glass-primary w-full py-3 font-semibold disabled:opacity-50">{busy ? "Sending…" : "Send for review"}</button>
    </form>
  );
}

/* ── Cover finder (Kinro-style stepper) ────────────────────────── */

function FinderFlow() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const total = questions.length;
  const done = step >= total;
  const results = done ? recommend(answers) : [];
  const { busy, error, result, onSubmit } = useSubmit("Cover finder: quotes request", fd => {
    fd.set("kind", "cover-finder");
    fd.set("details", summarise(answers, results));
  });

  if (result) return <Outcome result={result} sentText="An adviser will prepare quotes for this cover and contact you." />;

  return (
    <div className="space-y-5">
      <Eyebrow>Find my cover</Eyebrow>
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-xs tabular-nums text-ink-2">{Math.min(step + 1, total)} of {total}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(Math.min(step + 1, total) / total) * 100}%` }} />
        </div>
      </div>

      {!done ? (
        <Step key={step} q={questions[step]} value={answers[questions[step].key]} onPick={v => setAnswers(a => ({ ...a, [questions[step].key]: v }))}
          onBack={step > 0 ? () => setStep(s => s - 1) : undefined} onNext={() => setStep(s => s + 1)} />
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          <h2 className="text-2xl font-bold tracking-tight">Suggested cover</h2>
          <ul className="divide-y divide-rule rounded-2xl border border-rule bg-white/70">
            {results.map(r => (
              <li key={r.policy} className="flex items-start justify-between gap-4 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="font-semibold leading-snug">{r.policy}</p>
                  <p className="mt-0.5 text-sm text-ink-2">{r.why}{r.guide && <> <Link href={`/articles/${r.guide}`} className="font-medium text-accent underline-offset-2 hover:underline">Guide</Link></>}</p>
                </div>
                <span className={`mt-0.5 shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${r.basis === "Required by law" ? "bg-accent text-accent-ink" : r.basis === "Usually required" ? "border border-ink/25 text-ink-2" : "border border-rule text-ink-3"}`}>{r.basis}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm font-semibold">Get quotes for this cover from 18 insurers</p>
          <ContactFields />
          {error && <p role="alert" className="text-sm font-medium text-[#b42318]">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(total - 1)} className="glass px-5 py-3 font-medium">Back</button>
            <button type="submit" disabled={busy} className="glass-primary flex-1 py-3 font-semibold disabled:opacity-50">{busy ? "Sending…" : "Get quotes"}</button>
          </div>
        </form>
      )}
    </div>
  );
}

function Step({ q, value, onPick, onBack, onNext }: { q: (typeof questions)[number]; value?: string; onPick: (v: string) => void; onBack?: () => void; onNext: () => void }) {
  return (
    <div className="space-y-5">
      <h2 className="text-[1.4rem] font-bold leading-snug tracking-tight">{q.text}</h2>
      <div role="radiogroup" aria-label={q.text} className={`grid gap-2.5 ${q.options.length > 3 ? "sm:grid-cols-2" : ""}`}>
        {q.options.map(o => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onPick(o.value)} className="choice">
            <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${value === o.value ? "border-accent bg-accent" : "border-ink/25"}`}>
              {value === o.value && <span className="size-1.5 rounded-full bg-white" />}
            </span>
            {o.label}
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        {onBack && <button type="button" onClick={onBack} className="glass px-5 py-3 font-medium">Back</button>}
        <button type="button" disabled={!value} onClick={onNext} className="glass-primary flex-1 py-3 font-semibold disabled:opacity-50">Continue</button>
      </div>
      <p className="text-center text-xs text-ink-3">No fee. No obligation to buy.</p>
    </div>
  );
}

/* ── Callback ──────────────────────────────────────────────────── */

function CallbackFlow() {
  const [slot, setSlot] = useState("Any time");
  const { busy, error, result, onSubmit } = useSubmit("Callback request", fd => {
    fd.set("kind", "callback");
    fd.set("details", `Best time to call: ${slot}`);
  });
  if (result) return <Outcome result={result} sentText="An adviser will call you back." />;
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Eyebrow>Talk to an adviser</Eyebrow>
      <h2 className="text-center text-2xl font-bold tracking-tight">Request a callback</h2>
      <ContactFields withEmail={false} />
      <div>
        <p className="text-[0.8rem] font-semibold text-ink-2">Best time to call</p>
        <div role="radiogroup" aria-label="Best time to call" className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {["Any time", "Morning", "Afternoon", "Evening"].map(t => (
            <button key={t} type="button" role="radio" aria-checked={slot === t} onClick={() => setSlot(t)} className="choice justify-center !py-2.5 text-sm">{t}</button>
          ))}
        </div>
      </div>
      {error && <p role="alert" className="text-sm font-medium text-[#b42318]">{error}</p>}
      <button type="submit" disabled={busy} className="glass-primary w-full py-3 font-semibold disabled:opacity-50">{busy ? "Sending…" : "Request callback"}</button>
      <p className="text-center text-sm text-ink-3">Or call <a href={`tel:+65${site.phone.replace(/\s/g, "")}`} className="font-medium text-ink underline-offset-2 hover:underline">{site.phone}</a> · <a href={whatsapp} target="_blank" rel="noopener" className="font-medium text-ink underline-offset-2 hover:underline">WhatsApp</a></p>
    </form>
  );
}
