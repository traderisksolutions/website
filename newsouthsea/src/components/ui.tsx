import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/** Hedge label: "/ 01 · The difference". */
export function Eyebrow({ num, children, className = "" }: { num?: string; children: ReactNode; className?: string }) {
  return <p className={`eyebrow ${className}`}>{num && <span className="eyebrow-num">{num}&nbsp;&nbsp;</span>}{children}</p>;
}

/** Hedge section head: label in the first three columns, headline and lede from column four.
 *  Put the second clause of the headline in <Accent> for the two-tone treatment. */
export function SplitHead({ num, label, title, lede }: { num?: string; label: string; title: ReactNode; lede?: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:gap-0">
      <Eyebrow num={num} className="pt-3 lg:col-span-3">{label}</Eyebrow>
      <div className="flex min-w-0 flex-col gap-5 lg:col-span-9">
        <h2 className="display h2 max-w-[22ch] text-ink">{title}</h2>
        {lede && <p className="lede">{lede}</p>}
      </div>
    </div>
  );
}

export function Accent({ children, tone = "ultra" }: { children: ReactNode; tone?: "ultra" | "muted" }) {
  return <em className={tone === "ultra" ? "accent-i" : "font-normal not-italic text-muted"}>{children}</em>;
}

const COLS: Record<number, string> = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-2 lg:grid-cols-4", 5: "md:grid-cols-2 lg:grid-cols-5" };

/** Hedge numbered cells: big accent number, title, body, hairline, mono footer. */
export function NumberCells({ items }: { items: { title: string; body: string; tag: string }[] }) {
  return (
    <div className={`cells grid-cols-1 ${COLS[items.length] ?? "md:grid-cols-3"}`}>
      {items.map((it, i) => (
        <div key={it.title} className="flex flex-col pt-8">
          <span className={`display text-[48px] leading-none ${i % 2 ? "text-bronze" : "text-ultra"}`}>{String(i + 1).padStart(2, "0")}</span>
          <h3 className="display mt-8 text-[26px] text-ink">{it.title}</h3>
          <p className="mt-4 text-[16px] leading-relaxed text-muted">{it.body}</p>
          <span className="min-h-8 flex-1" aria-hidden />
          <p className="border-t border-rule pt-5 font-mono text-[12.5px] text-muted">{it.tag}</p>
        </div>
      ))}
    </div>
  );
}

/** Mono risk ticker under the hero. */
export function Ticker({ items }: { items: string[] }) {
  const row = items.map(t => (
    <span key={t} className="flex items-center gap-3 whitespace-nowrap px-6 font-mono text-[12.5px] uppercase tracking-[0.04em] text-ink-2">
      <span className="size-1.5 bg-ultra" aria-hidden />{t}
    </span>
  ));
  return (
    <div className="overflow-hidden border-y border-rule bg-white py-4" aria-label="Lines we place">
      <div className="ticker-track flex w-max">{row}<span aria-hidden className="flex">{row}</span></div>
    </div>
  );
}

/** Fernstone "What we offer you": heading left, stacked items right, hairlines between. */
export function OfferList({ num, label, title, items }: { num?: string; label: string; title: ReactNode; items: { title: string; body: string }[] }) {
  return (
    <div className="grid gap-10 lg:grid-cols-[3fr_9fr] lg:gap-0">
      <div className="flex min-w-0 flex-col gap-4">
        <Eyebrow num={num}>{label}</Eyebrow>
        <h2 className="display h2 text-ink">{title}</h2>
      </div>
      <ul className="flex min-w-0 flex-col">
        {items.map(it => (
          <li key={it.title} className="flex flex-col gap-3 border-b border-rule py-8 first:pt-0 last:border-0 last:pb-0">
            <h3 className="display text-[28px] text-ink md:text-[34px]">{it.title}</h3>
            <p className="text-[17px] leading-relaxed text-muted">{it.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Fernstone fit cards: one solid ultramarine, one outlined. */
export function FitCards({ good, bad }: { good: { label: string; title: string; points: string[] }; bad: { label: string; title: string; points: string[] } }) {
  const card = (c: typeof good, solid: boolean) => (
    <div className={`flex flex-col items-center gap-6 px-8 py-12 text-center md:px-12 ${solid ? "bg-ultra text-white" : "border border-rule"}`}>
      <p className={`font-mono text-[12.5px] uppercase tracking-[0.1em] ${solid ? "text-white/85" : "text-muted"}`}>{c.label}</p>
      <h3 className={`text-[30px] font-semibold leading-tight tracking-[-0.02em] md:text-[40px] ${solid ? "" : "text-ink"}`}>{c.title}</h3>
      <ul className="flex w-full flex-col">
        {c.points.map(p => <li key={p} className={`border-b py-4 text-[16px] leading-relaxed last:border-0 ${solid ? "border-white/20 text-white" : "border-rule text-muted"}`}>{p}</li>)}
      </ul>
    </div>
  );
  return <div className="grid gap-5 md:grid-cols-2">{card(good, true)}{card(bad, false)}</div>;
}

/** Fernstone "The bottom line": serif statement left, paragraphs right. */
export function BottomLine({ label, statement, lead, paras }: { label: string; statement: ReactNode; lead: string; paras: string[] }) {
  return (
    <div className="grid gap-10 md:grid-cols-2 md:gap-16">
      <div className="flex flex-col gap-4">
        <Eyebrow>{label}</Eyebrow>
        <p className="serif text-[44px] text-ink md:text-[60px]">{statement}</p>
      </div>
      <div className="flex flex-col gap-6 md:pt-9">
        <p className="text-[18px] leading-relaxed text-ink">{lead}</p>
        {paras.map(p => <p key={p} className="text-[17px] leading-relaxed text-muted">{p}</p>)}
      </div>
    </div>
  );
}

/** Centred heading for full-width sections. */
export function CenterHead({ num, label, title, lede }: { num?: string; label: string; title: ReactNode; lede?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
      <Eyebrow num={num}>{label}</Eyebrow>
      <h2 className="display h2 text-ink">{title}</h2>
      {lede && <p className="lede mx-auto">{lede}</p>}
    </div>
  );
}

export function Arrow() {
  return <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M3.5 8.5 8.5 3.5M4.5 3.5h4v4" /></svg>;
}

export function ButtonLink({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "ghost" | "on-dark" | "ghost-dark" }) {
  return <Link href={href} className={`btn btn-${variant}`}>{children}{variant !== "ghost" && <Arrow />}</Link>;
}

/** Hairline list: title left, body right, one row per item. */
export function RuleList({ items, numbered = false }: { items: { title: string; body: string }[]; numbered?: boolean }) {
  return (
    <ol className="border-t border-rule">
      {items.map((it, i) => (
        <li key={it.title} className="grid gap-2 border-b border-rule py-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-10">
          <h3 className="display flex gap-4 text-[22px] text-ink">
            {numbered && <span className="font-mono text-[13px] font-normal text-ultra pt-1">{String(i + 1).padStart(2, "0")}</span>}
            {it.title}
          </h3>
          <p className="body">{it.body}</p>
        </li>
      ))}
    </ol>
  );
}

/** Questions as native disclosure rows. */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="border-t border-rule">
      {items.map(f => (
        <details key={f.q} className="group border-b border-rule">
          <summary className="display flex cursor-pointer list-none items-start justify-between gap-6 py-6 text-[22px] text-ink">
            {f.q}
            <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full border border-rule text-ink-2 transition-transform group-open:rotate-45" aria-hidden>
              <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 2v8M2 6h8" /></svg>
            </span>
          </summary>
          <p className="body max-w-3xl pb-6">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

/** Photograph from /public/images (Unsplash, credits in public/images/CREDITS.md).
 *  Without a file it renders a grey frame naming the shot still needed. */
export function Photo({ src, alt, className = "", priority = false }: { src?: string; alt: string; className?: string; priority?: boolean }) {
  if (!src) return <div role="img" aria-label={`Placeholder: ${alt}`} data-label={`Photo: ${alt}`} className={`ph ${className}`} />;
  return (
    <div className={`relative overflow-hidden bg-stone ${className}`}>
      <Image src={`/images/${src}.jpg`} alt={alt} fill priority={priority} sizes="(min-width: 1280px) 1200px, 100vw" className="object-cover" />
    </div>
  );
}
