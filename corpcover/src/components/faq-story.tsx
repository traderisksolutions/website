"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActionArt } from "./action-art";
import { Drawing, K, line } from "./cover-art";
import { faqs, insurers, type Faq, type Scene } from "@/content/faq";

/**
 * FAQ as a storyboard. Desktop: the picture panel stays pinned on the left and changes as each
 * question reaches the middle of the screen; the question in view is full strength, the rest
 * fade back. Phone and tablet: each question carries its own picture above it.
 */
export function FaqStory() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
    }, { rootMargin: "-45% 0px -45% 0px" });
    refs.current.forEach(el => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const total = String(faqs.length).padStart(2, "0");

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
      {/* Pinned picture panel, desktop only */}
      <div className="hidden lg:block">
        <div className="sticky top-[calc(50svh-min(34svh,290px))]">
          <div className={`relative h-[min(68svh,580px)] overflow-hidden rounded-[28px] transition-colors duration-500 motion-reduce:transition-none ${tone[faqs[active].scene]}`}>
            {faqs.map((f, i) => (
              <div key={f.q} aria-hidden={i !== active}
                className={`absolute inset-0 grid place-items-center p-10 transition-[opacity,transform] duration-500 motion-reduce:transition-none ${i === active ? "opacity-100" : "pointer-events-none translate-y-3 opacity-0"}`}>
                <Visual scene={f.scene} />
              </div>
            ))}
            <div className="absolute inset-x-8 bottom-6 flex items-center justify-between text-sm font-semibold text-ink/70">
              <span>{faqs[active].label}</span>
              <span className="tabular-nums">{String(active + 1).padStart(2, "0")} / {total}</span>
            </div>
          </div>
          <div className="mt-4 flex gap-1.5" aria-hidden>
            {faqs.map((f, i) => <span key={f.q} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= active ? "bg-accent" : "bg-ink/10"}`} />)}
          </div>
        </div>
      </div>

      {/* Scenes */}
      <ol className="lg:py-[18svh]">
        {faqs.map((f, i) => (
          <li key={f.q} ref={el => { refs.current[i] = el; }} data-i={i}
            className={`flex flex-col justify-center py-10 transition-opacity duration-500 motion-reduce:transition-none lg:min-h-[64svh] lg:py-0 ${i === active ? "lg:opacity-100" : "lg:opacity-30"}`}>
            <div className={`mb-6 grid min-h-[240px] place-items-center rounded-3xl px-6 py-8 sm:min-h-[320px] lg:hidden ${tone[f.scene]}`}>
              <Visual scene={f.scene} />
            </div>
            <p className="text-sm font-semibold text-accent">
              <span className="tabular-nums">{String(i + 1).padStart(2, "0")}</span> · {f.label}
            </p>
            <h3 className="mt-3 text-[clamp(1.6rem,2.6vw,2.2rem)] font-bold leading-[1.15] tracking-tight">{f.q}</h3>
            <Answer parts={f.a} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function Answer({ parts }: { parts: Faq["a"] }) {
  return (
    <div className="mt-5 max-w-[56ch] space-y-3.5 text-[1.05rem] leading-relaxed text-ink-2">
      {parts.map((p, i) => typeof p === "string"
        ? <p key={i}>{p}</p>
        : p === insurers ? null // the insurer names are the picture for that scene
        : <ul key={i} className="space-y-1.5">{p.map(x => (
            <li key={x} className="flex gap-2.5"><Tick />{x}</li>
          ))}</ul>)}
    </div>
  );
}

const Tick = () => (
  <svg viewBox="0 0 16 16" aria-hidden className="mt-1.5 size-4 shrink-0 text-accent"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const tone: Record<Scene, string> = {
  advisers: "bg-tile-sage", criteria: "bg-tile-sand", firms: "bg-tile-sky", insurers: "bg-tile-sand", policies: "bg-tile-blush",
  choice: "bg-tile-sage", zero: "bg-tile-sky", commission: "bg-tile-sand", referral: "bg-tile-sage",
};

/* ── Pictures, one per scene ───────────────────────────────────── */

function Visual({ scene }: { scene: Scene }) {
  switch (scene) {
    case "advisers": return <div className="w-full max-w-[340px]"><ActionArt kind="adviser" /></div>;
    case "criteria": return <div className="w-full max-w-[340px]"><ActionArt kind="finder" /></div>;
    case "firms":
      return (
        <svg viewBox="-10 0 170 200" aria-hidden className="h-full max-h-[300px] w-full max-w-[280px]"><Drawing art="building" /></svg>
      );
    case "insurers":
      return (
        <ul className="flex max-w-[460px] flex-wrap justify-center gap-2">
          {insurers.map(n => <li key={n} className="rounded-full border border-ink/15 bg-white px-3.5 py-1.5 text-sm font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:text-[0.95rem]">{n}</li>)}
        </ul>
      );
    case "policies":
      return (
        <ul className="flex max-w-[460px] flex-wrap justify-center gap-2">
          {(faqs.find(f => f.scene === "policies")!.a[0] as string[]).map(n => (
            <li key={n} className="rounded-full border border-ink/15 bg-white px-3.5 py-1.5 text-sm font-semibold sm:text-[0.95rem]">{n}</li>
          ))}
        </ul>
      );
    case "choice":
      return (
        <div className="grid w-full max-w-[360px] gap-3">
          <Pill tick>Compare quotes</Pill>
          <Pill tick>Buy through our partners</Pill>
          <Pill tick>Buy elsewhere</Pill>
        </div>
      );
    case "zero":
      return (
        <div className="text-center">
          <p className="font-[family-name:var(--font-display)] text-[clamp(5rem,9vw,8.5rem)] font-light leading-none tracking-[-0.04em]">S$0</p>
          <p className="mt-3 text-lg font-semibold text-ink-2">Fee to you</p>
        </div>
      );
    case "commission":
      return <Flow steps={[["Insurer", "Pays the commission"], ["Partner", "Earns the commission"]]} footer="Your fee: S$0" />;
    case "referral":
      return <Flow steps={[["Insurer", "Pays commission"], ["Partner", "Shares part of it"], ["Corp Cover", "Referral share"]]} footer="Your premium: unchanged" />;
  }
}

function Pill({ children, tick }: { children: ReactNode; tick?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-lg font-semibold shadow-[0_2px_10px_rgba(6,30,20,0.06)]">
      {tick && <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-white"><svg viewBox="0 0 16 16" className="size-4"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>}
      {children}
    </div>
  );
}

/** Money flow drawn as stacked cards joined by arrows. */
function Flow({ steps, footer }: { steps: [string, string][]; footer?: string }) {
  return (
    <div className="flex w-full max-w-[320px] flex-col items-stretch">
      {steps.map(([who, what], i) => (
        <div key={who} className="flex flex-col items-center">
          {i > 0 && (
            <svg viewBox="0 0 24 40" aria-hidden className="h-8 w-6 sm:h-10"><path d="M12 2v32M5 27l7 8 7-8" fill="none" stroke={K} strokeWidth={line.strokeWidth - 1} strokeLinecap="round" strokeLinejoin="round" /></svg>
          )}
          <div className="w-full rounded-2xl border-2 border-ink bg-white px-5 py-3.5 text-center shadow-[4px_4px_0_rgba(26,26,26,0.9)]">
            <p className="text-lg font-bold">{who}</p>
            <p className="text-sm text-ink-2">{what}</p>
          </div>
        </div>
      ))}
      {footer && <p className="mt-5 text-center font-semibold">{footer}</p>}
    </div>
  );
}
