"use client";

import { useState } from "react";
import { site } from "@/site";

type Kind = "review" | "claim" | "general";
const KIND_LABEL: Record<Kind, string> = { review: "Programme review", claim: "A claim", general: "Something else" };

/** Contact form. Posts to /api/enquiry; when the inbox is not connected it says so and shows the address. */
export function EnquiryForm({ kind: initial = "review", dark = false }: { kind?: Kind; dark?: boolean }) {
  const [kind, setKind] = useState<Kind>(initial);
  const [state, setState] = useState<{ status: "idle" | "sending" | "sent" | "error"; message?: string }>({ status: "idle" });

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState({ status: "sending" });
    const data = new FormData(e.currentTarget);
    data.set("kind", kind);
    try {
      const res = await fetch("/api/enquiry", { method: "POST", body: data });
      if (res.ok) return setState({ status: "sent" });
      const body = await res.json().catch(() => ({}));
      if (res.status === 503) return setState({ status: "error", message: `The online form is not connected yet. Email ${site.email} instead.` });
      setState({ status: "error", message: body.error && body.error !== "send_failed" ? body.error : `Sending failed. Try again or email ${site.email}.` });
    } catch {
      setState({ status: "error", message: `No connection. Try again or email ${site.email}.` });
    }
  }

  const field = `h-12 w-full rounded-none border px-4 text-[15px] outline-none transition-colors ${dark ? "border-white/20 bg-white/5 text-white placeholder:text-white/40 focus:border-white/60" : "border-transparent bg-field text-ink placeholder:text-muted focus:border-ultra"}`;
  const label = `mb-1.5 block text-[13px] ${dark ? "text-white/70" : "text-ink-2"}`;

  if (state.status === "sent") {
    return (
      <div className={`rounded-none border p-8 ${dark ? "border-white/15 text-white" : "border-rule"}`} role="status">
        <p className="display h3">Received.</p>
        <p className={`mt-3 ${dark ? "text-white/70" : "body"}`}>A broker will reply within one working day.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div role="radiogroup" aria-label="Enquiry type" className={`grid grid-cols-3 gap-1 rounded-none border p-1 ${dark ? "border-white/20" : "border-rule"}`}>
        {(Object.keys(KIND_LABEL) as Kind[]).map(k => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
            className={`h-10 rounded-none text-[14px] transition-colors ${kind === k ? "bg-ultra text-white" : dark ? "text-white/70 hover:text-white" : "text-ink-2 hover:text-ink"}`}>
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="eq-name" className={label}>Name</label><input id="eq-name" name="name" autoComplete="name" required className={field} /></div>
        <div><label htmlFor="eq-role" className={label}>Role</label><input id="eq-role" name="role" autoComplete="organization-title" placeholder="CFO, risk manager, GC" className={field} /></div>
        <div><label htmlFor="eq-company" className={label}>Company</label><input id="eq-company" name="company" autoComplete="organization" required className={field} /></div>
        <div><label htmlFor="eq-email" className={label}>Work email</label><input id="eq-email" name="email" type="email" autoComplete="email" required className={field} /></div>
        <div><label htmlFor="eq-phone" className={label}>Telephone</label><input id="eq-phone" name="phone" type="tel" autoComplete="tel" className={field} /></div>
        {kind === "review" && <div><label htmlFor="eq-renewal" className={label}>Next renewal</label><input id="eq-renewal" name="renewal" placeholder="Month and year" className={field} /></div>}
      </div>
      <div>
        <label htmlFor="eq-message" className={label}>{kind === "claim" ? "What happened, and the policy it falls under" : "What you would like reviewed"}</label>
        <textarea id="eq-message" name="message" rows={4} className={`${field} h-auto py-3`} />
      </div>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {state.status === "error" && <p role="alert" className={`text-[14px] ${dark ? "text-white" : "text-umber"}`}>{state.message}</p>}
      <button type="submit" disabled={state.status === "sending"} className={`btn w-full ${dark ? "btn-on-dark" : "btn-primary"} disabled:opacity-60`}>
        {state.status === "sending" ? "Sending" : kind === "claim" ? "Send to the claims team" : "Send to a broker"}
      </button>
    </form>
  );
}
