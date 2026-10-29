"use client";

import { useEffect, useState } from "react";
import { INDUSTRIES } from "@/content/industries";
import { LINES } from "@/content/coverage";
import { site } from "@/site";

/* apple.com buy-page form (as built for Alps Wills): four groups, the question held left and the fields right,
   choice tiles, later groups dimmed until the one before is done, one confirm box. Posts to /api/enquiry. */

const PURPOSES = [
  { v: "Programme review", s: "Renewal, second opinion, or a programme that no longer fits." },
  { v: "New placement", s: "A risk with no cover yet, or one the last broker could not place." },
  { v: "Claim", s: "A loss to notify, or a claim already in progress." },
  { v: "Insurer or partner", s: "Capacity, binding arrangements, introductions." },
];
const URGENCY = [
  { v: "Standard timing", s: "120 days out, or 150 for financial lines." },
  { v: "Within 30 days", s: "" },
  { v: "Within 7 days", s: "" },
  { v: "Cover lapsed or same day", s: `Call ${site.phone} as well.` },
];
const REVENUE = ["Under HK$10M", "HK$10M to 50M", "HK$50M to 250M", "HK$250M to 1B", "HK$1B and above"];
const HEARD = ["Referral from a client", "Referral from an insurer", "Search", "LinkedIn", "Event", `Already knew ${site.name}`, "Other"];
const DIAL = ["+852", "+853", "+86", "+65", "+60", "+44", "+1"];

type F = { purpose: string; note: string; company: string; industry: string; revenue: string; territories: string; operations: string; lines: string[]; date: string; incumbent: string; urgency: string; name: string; title: string; email: string; dial: string; phone: string; heard: string; consent: boolean; website: string };
const EMPTY: F = { purpose: "", note: "", company: "", industry: "", revenue: "", territories: "", operations: "", lines: [], date: "", incumbent: "", urgency: "Standard timing", name: "", title: "", email: "", dial: "+852", phone: "", heard: "", consent: false, website: "" };

function Tile({ name, value, sub, on, multi, onChange }: { name: string; value: string; sub?: string; on: boolean; multi: boolean; onChange: () => void }) {
  return (
    <label className="af-tile">
      <input type={multi ? "checkbox" : "radio"} name={name} value={value} checked={on} onChange={onChange} />
      <span className="af-tile-t">{value}</span>{sub && <span className="af-tile-s">{sub}</span>}
    </label>
  );
}

export function EnquiryForm() {
  const [f, setF] = useState<F>(EMPTY);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("We reply within one working day.");
  const [ref, setRef] = useState("");
  const set = <K extends keyof F>(k: K, v: F[K]) => setF(p => ({ ...p, [k]: v }));
  // ?purpose=review preselects the Programme review tile (the site-wide primary button lands here).
  useEffect(() => { if (new URLSearchParams(window.location.search).get("purpose") === "review") setF(p => p.purpose ? p : { ...p, purpose: "Programme review" }); }, []);
  const field = (k: keyof F, bad = false) => ({ id: `af-${k}`, name: k, className: "af-input", "aria-invalid": bad || undefined });

  const d1 = !!f.purpose;
  const d2 = d1 && !!(f.company.trim() && f.industry && f.operations.trim());
  const d3 = d2 && f.lines.length > 0;
  const summary = [f.purpose, f.company.trim(), f.lines.length ? `${f.lines.length} line${f.lines.length > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const missing = !d3 || !f.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email) || !f.phone.trim() || !f.consent;
    if (missing) { setState("error"); setMsg("Fill the highlighted fields and tick the consent box."); return; }
    setState("sending"); setMsg("Sending…");
    try {
      const res = await fetch("/api/enquiry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setRef(data.ref ?? ""); setState("sent"); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      setState("error");
      setMsg(res.status === 503 ? `The online form is not connected yet. Email ${site.email} instead.` : data.error && data.error !== "send_failed" ? data.error : `Sending failed. Try again or email ${site.email}.`);
    } catch { setState("error"); setMsg(`No connection. Try again or email ${site.email}.`); }
  }

  if (state === "sent") {
    return (
      <div className="af-sent" role="status">
        <h2 className="af-sent-h">Thank you, {f.name.split(" ")[0] || "there"}.</h2>
        <p className="af-sent-p">We have the file. A named broker replies within one working day with a first read on appetite and structure, and a list of anything the market will ask for.</p>
        <p className="af-sent-ref">{ref && <>Reference {ref} · </>}{site.email} · {site.hours}</p>
      </div>
    );
  }

  const bad = state === "error";
  return (
    <form className="af" onSubmit={submit} noValidate>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="af-hp" aria-hidden value={f.website} onChange={e => set("website", e.target.value)} />

      <section className="af-step">
        <h2 className="af-q">Purpose. <span>What can we help with?</span></h2>
        <div className="af-fields">
          <fieldset className="af-fs"><legend className="af-legend">Select one</legend>
            <div className="af-tiles c2">{PURPOSES.map(p => <Tile key={p.v} name="purpose" value={p.v} sub={p.s} on={f.purpose === p.v} multi={false} onChange={() => set("purpose", p.v)} />)}</div>
          </fieldset>
          <div><label className="af-label" htmlFor="af-note">Anything we should know? <em>optional</em></label><textarea {...field("note")} rows={3} placeholder="The renewal date, the incumbent, the problem." value={f.note} onChange={e => set("note", e.target.value)} /></div>
        </div>
      </section>

      <section className={`af-step ${d1 ? "" : "dim"}`}>
        <h2 className="af-q">The company. <span>Tell us about the insured.</span></h2>
        <div className="af-fields">
          <div className="af-grid">
            <div><label className="af-label" htmlFor="af-company">Company name</label><input {...field("company", bad && !f.company.trim())} type="text" autoComplete="organization" value={f.company} onChange={e => set("company", e.target.value)} /></div>
            <div><label className="af-label" htmlFor="af-industry">Industry</label><select {...field("industry", bad && !f.industry)} value={f.industry} onChange={e => set("industry", e.target.value)}><option value="">Select</option>{INDUSTRIES.map(i => <option key={i.slug}>{i.name}</option>)}<option>Other</option></select></div>
            <div><label className="af-label" htmlFor="af-revenue">Annual revenue <em>optional</em></label><select {...field("revenue")} value={f.revenue} onChange={e => set("revenue", e.target.value)}><option value="">Select range</option>{REVENUE.map(r => <option key={r}>{r}</option>)}</select></div>
            <div><label className="af-label" htmlFor="af-territories">Territories <em>optional</em></label><input {...field("territories")} type="text" placeholder="Where you sell, store or build" value={f.territories} onChange={e => set("territories", e.target.value)} /></div>
          </div>
          <div><label className="af-label" htmlFor="af-operations">Operations</label><textarea {...field("operations", bad && !f.operations.trim())} rows={3} placeholder="Two or three sentences. What the company does, where, and for whom." value={f.operations} onChange={e => set("operations", e.target.value)} /></div>
        </div>
      </section>

      <section className={`af-step ${d2 ? "" : "dim"}`}>
        <h2 className="af-q">Coverage. <span>Which lines, and when?</span></h2>
        <div className="af-fields">
          <fieldset className="af-fs"><legend className="af-legend">Select everything that applies</legend>
            <div className="af-tiles c2 compact">
              {[...LINES.map(l => ({ v: l.name, s: "" })), { v: "Not sure", s: "We will tell you after the review." }].map(l => (
                <Tile key={l.v} name="lines" value={l.v} sub={l.s} on={f.lines.includes(l.v)} multi onChange={() => set("lines", f.lines.includes(l.v) ? f.lines.filter(x => x !== l.v) : [...f.lines, l.v])} />
              ))}
            </div>
          </fieldset>
          <div className="af-grid">
            <div><label className="af-label" htmlFor="af-date">Renewal or inception date <em>optional</em></label><input {...field("date")} type="date" value={f.date} onChange={e => set("date", e.target.value)} /></div>
            <div><label className="af-label" htmlFor="af-incumbent">Incumbent insurer <em>optional</em></label><input {...field("incumbent")} type="text" value={f.incumbent} onChange={e => set("incumbent", e.target.value)} /></div>
          </div>
          <fieldset className="af-fs"><legend className="af-legend">Urgency</legend>
            <div className="af-tiles c2 compact">{URGENCY.map(u => <Tile key={u.v} name="urgency" value={u.v} sub={u.s} on={f.urgency === u.v} multi={false} onChange={() => set("urgency", u.v)} />)}</div>
          </fieldset>
        </div>
      </section>

      <section className={`af-step ${d3 ? "" : "dim"}`}>
        <h2 className="af-q">Your details. <span>Who are we speaking with?</span></h2>
        <div className="af-fields">
          <div className="af-grid">
            <div><label className="af-label" htmlFor="af-name">Name</label><input {...field("name", bad && !f.name.trim())} type="text" autoComplete="name" value={f.name} onChange={e => set("name", e.target.value)} /></div>
            <div><label className="af-label" htmlFor="af-title">Title <em>optional</em></label><input {...field("title")} type="text" autoComplete="organization-title" placeholder="CFO, risk manager, general counsel" value={f.title} onChange={e => set("title", e.target.value)} /></div>
            <div><label className="af-label" htmlFor="af-email">Email</label><input {...field("email", bad && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))} type="email" autoComplete="email" value={f.email} onChange={e => set("email", e.target.value)} /></div>
            <div><label className="af-label" htmlFor="af-phone">Phone</label><div className="af-phone"><select id="af-dial" name="dial" className="af-input" aria-label="Country code" value={f.dial} onChange={e => set("dial", e.target.value)}>{DIAL.map(d => <option key={d}>{d}</option>)}</select><input {...field("phone", bad && !f.phone.trim())} type="tel" inputMode="tel" autoComplete="tel-national" value={f.phone} onChange={e => set("phone", e.target.value)} /></div></div>
            <div><label className="af-label" htmlFor="af-heard">How did you hear about us? <em>optional</em></label><select {...field("heard")} value={f.heard} onChange={e => set("heard", e.target.value)}><option value="">Select</option>{HEARD.map(h => <option key={h}>{h}</option>)}</select></div>
          </div>
          <label className="af-check"><input type="checkbox" name="consent" checked={f.consent} onChange={e => set("consent", e.target.checked)} /><span>I agree to {site.name} holding these details to respond to this enquiry, as set out in the <a href="/privacy">privacy notice</a>. Submissions are routed only to the named team and are not shared with any market until you authorise a release.</span></label>
          <div className="af-confirm">
            <p className="af-summary">{summary || "Purpose, company and lines appear here as you go."}</p>
            <button type="submit" className="btn af-submit" disabled={state === "sending"}>Contact us</button>
            <p className={`af-small ${bad ? "err" : ""}`} role="status">{msg}</p>
          </div>
        </div>
      </section>
    </form>
  );
}
