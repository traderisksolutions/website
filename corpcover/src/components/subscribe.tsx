"use client";

import { useId, useState, type FormEvent } from "react";

type Status = "idle" | "sending" | "done" | "error" | "invalid";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Newsletter sign-up. Posts to /api/subscribe, which forwards to the TRS dashboard list. */
export function Subscribe({ variant = "inline", className = "" }: { variant?: "band" | "inline"; className?: string }) {
  const id = useId();
  const [status, setStatus] = useState<Status>("idle");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const trap = String(form.get("company_website") ?? "");
    if (!email || email.length > 200 || !EMAIL.test(email)) return setStatus("invalid");
    if (trap) return setStatus("done"); // honeypot: bots fill every field
    setStatus("sending");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source_url: window.location.href }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  const band = variant === "band";
  const msgId = `${id}-msg`;

  const form = status === "done" ? (
    <p role="status" className={`font-medium text-ink ${band ? "mt-6 text-lg" : "text-base"}`}>Check your inbox to confirm.</p>
  ) : (
    <form onSubmit={submit} noValidate className={band ? "mt-6 w-full max-w-[520px]" : "w-full max-w-[460px]"}>
      <label htmlFor={`${id}-email`} className="sr-only">Email address</label>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <input
          id={`${id}-email`} name="email" type="email" inputMode="email" autoComplete="email" required maxLength={200}
          placeholder="Email address" aria-invalid={status === "invalid"} aria-describedby={msgId}
          onChange={() => (status === "invalid" || status === "error") && setStatus("idle")}
          className={`min-w-0 flex-1 rounded-[6px] border border-rule px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-steel ${band ? "bg-paper" : "bg-base focus:bg-paper"}`}
        />
        <button type="submit" disabled={status === "sending"} className="btn btn-primary shrink-0 disabled:opacity-70">
          {status === "sending" ? "Subscribing" : "Get the weekly letter"}
        </button>
      </div>
      {/* Honeypot: hidden from people and assistive tech. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-cw`}>Company website</label>
        <input id={`${id}-cw`} name="company_website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <p id={msgId} role="alert" className="mt-2 min-h-5 text-sm font-medium text-[#b42318]">
        {status === "invalid" && "Enter a valid email address."}
        {status === "error" && "Could not subscribe. Please try again."}
      </p>
    </form>
  );

  if (!band) return <div className={`relative ${className}`}>{form}</div>;

  return (
    <section aria-labelledby={`${id}-h`} className={`relative bg-base py-[clamp(56px,8vw,96px)] ${className}`}>
      <div className="wrap flex flex-col items-center text-center">
        <h2 id={`${id}-h`} className="t-h2">The Corp Cover letter</h2>
        <p className="mt-3 t-lede">One email a week. New articles on business insurance in Singapore.</p>
        {form}
      </div>
    </section>
  );
}
